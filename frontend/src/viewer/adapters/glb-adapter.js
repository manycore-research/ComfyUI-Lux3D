import * as THREE from "three";
import {OrbitControls} from "three/examples/jsm/controls/OrbitControls.js";
import {DRACOLoader} from "three/examples/jsm/loaders/DRACOLoader.js";
import {GLTFLoader} from "three/examples/jsm/loaders/GLTFLoader.js";
import {KTX2Loader} from "three/examples/jsm/loaders/KTX2Loader.js";
import {MeshoptDecoder} from "three/examples/jsm/libs/meshopt_decoder.module.js";

import {viewerAssetUrl} from "../../generated/viewer-assets.js";
import {
  generateModelViewerLegacyEnvironment,
  MODEL_VIEWER_LEGACY_EXPOSURE_COMPENSATION,
} from "../environments/model-viewer-legacy-environment.js";
import {ResourceRegistry} from "../lifecycle/resource-registry.js";
import {
  buildModelPreviewOrbitEnvelope,
  fitModelPreviewBoundingBox,
} from "../math/glb-bounds.js";

const ALLOWED_REQUIRED_EXTENSIONS = new Set([
  "KHR_draco_mesh_compression",
  "KHR_texture_basisu",
  "EXT_meshopt_compression",
  "KHR_mesh_quantization",
  "KHR_texture_transform",
  "KHR_materials_unlit",
  "KHR_materials_clearcoat",
  "KHR_materials_ior",
  "KHR_materials_specular",
  "KHR_materials_transmission",
  "KHR_materials_volume",
  "KHR_materials_sheen",
  "KHR_materials_iridescence",
  "KHR_materials_emissive_strength",
  "KHR_materials_anisotropy",
  "KHR_materials_dispersion",
]);
const BLOCKED_EXTENSION = "EXT_mesh_gpu_instancing";
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/ktx2",
]);
const DEFAULT_DEPENDENCIES = Object.freeze({
  THREE,
  OrbitControls,
  DRACOLoader,
  GLTFLoader,
  KTX2Loader,
  MeshoptDecoder,
  viewerAssetUrl,
  URL: globalThis.URL,
});

export class GlbAdapterError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? {cause} : undefined);
    this.name = "GlbAdapterError";
    this.code = code;
  }
}

export async function createGlbAdapter(options) {
  const dependencies = options?.dependencies ?? DEFAULT_DEPENDENCIES;
  const host = requireHost(options?.host);
  const arrayBuffer = requireArrayBuffer(options?.arrayBuffer);
  const viewport = normalizeViewport(options?.viewport);
  const visual = normalizeVisualConfig(options?.visualConfig);
  const validation = validateContract(options?.validation, arrayBuffer.byteLength);
  validateDependencySurface(dependencies);
  validateRequiredExtensions(validation.json);
  if (typeof WebAssembly !== "object") {
    throw adapterError("WEBASSEMBLY_UNAVAILABLE", "GLB decoders require WebAssembly support");
  }

  const runtime = new GlbAdapterRuntime({
    dependencies,
    host,
    arrayBuffer,
    validation,
    viewport,
    visual,
    reducedMotion: Boolean(options?.reducedMotion),
    requestFrame: options?.requestFrame
      ?? ((callback) => globalThis.requestAnimationFrame(callback)),
    cancelFrame: options?.cancelFrame
      ?? ((frameId) => globalThis.cancelAnimationFrame(frameId)),
    now: options?.now ?? (() => performance.now()),
  });
  try {
    await runtime.initialize();
    return runtime.publicApi();
  } catch (error) {
    await runtime.dispose().catch(() => {});
    if (error instanceof GlbAdapterError) throw error;
    throw adapterError("GLB_BUILD_FAILED", "GLB adapter failed to initialize", error);
  }
}

class GlbAdapterRuntime {
  constructor(options) {
    Object.assign(this, options);
    this.registry = new ResourceRegistry();
    this.objectUrls = new Set();
    this.disposed = false;
    this.suspended = true;
    this.userInteracted = false;
    this.frameId = null;
    this.previousFrameAt = null;
    this.disposePromise = null;
  }

  async initialize() {
    const D = this.dependencies;
    this.manager = new D.THREE.LoadingManager();
    const allowedAssets = decoderAssets(D.viewerAssetUrl);
    this.manager.setURLModifier((url) => {
      if (url.startsWith("blob:")) {
        this.objectUrls.add(url);
        return url;
      }
      if (allowedAssets.urls.has(url)) return url;
      throw adapterError("EXTERNAL_RESOURCE_BLOCKED", "GLB attempted to resolve a non-manifest resource");
    });

    this.renderer = new D.THREE.WebGLRenderer({antialias: true, alpha: true, powerPreference: "high-performance"});
    this.renderer.setPixelRatio(this.viewport.dpr);
    this.renderer.setSize(this.viewport.width, this.viewport.height, true);
    this.renderer.outputColorSpace = D.THREE.SRGBColorSpace;
    this.renderer.toneMapping = toneMappingValue(D.THREE, this.visual.toneMapping);
    this.renderer.toneMappingExposure = this.visual.exposure * MODEL_VIEWER_LEGACY_EXPOSURE_COMPENSATION;
    this.renderer.setClearColor(this.visual.clearColor, this.visual.clearAlpha);
    this.renderer.domElement.tabIndex = 0;
    this.host.appendChild(this.renderer.domElement);

    this.dracoLoader = new D.DRACOLoader(this.manager)
      .setDecoderPath(allowedAssets.dracoBase)
      .setDecoderConfig({type: "wasm"});
    this.ktx2Loader = new D.KTX2Loader(this.manager).setTranscoderPath(allowedAssets.basisBase);
    this.ktx2Loader.detectSupport(this.renderer);

    const loader = new D.GLTFLoader(this.manager)
      .setDRACOLoader(this.dracoLoader)
      .setKTX2Loader(this.ktx2Loader)
      .setMeshoptDecoder(D.MeshoptDecoder);

    let gltf;
    try {
      gltf = await loader.parseAsync(this.arrayBuffer, "");
    } finally {
      this.revokeObjectUrls();
    }
    this.modelRoot = gltf?.scene;
    if (!this.modelRoot || typeof this.modelRoot.traverse !== "function") {
      throw adapterError("MISSING_DEFAULT_SCENE", "GLB does not contain a loadable default scene");
    }

    stripEmbeddedCamerasAndLights(this.modelRoot);
    this.modelRoot.updateMatrixWorld(true);
    assertRenderableFiniteScene(this.modelRoot);
    this.registry.registerObject3D(this.modelRoot);

    this.scene = new D.THREE.Scene();
    this.scene.add(this.modelRoot);
    this.environmentTarget = generateModelViewerLegacyEnvironment(D.THREE, this.renderer);
    this.registry.register(this.environmentTarget);
    this.scene.environment = this.environmentTarget.texture;

    this.camera = new D.THREE.PerspectiveCamera(30, this.viewport.width / this.viewport.height, 0.1, 1000);
    this.camera.up.set(0, 1, 0);
    this.controls = new D.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.addEventListener("start", this.onInteractionStart);
    this.applyStrictFit();
    this.suspended = false;
    this.startLoop();
  }

  onInteractionStart = () => {
    this.userInteracted = true;
    if (this.controls) this.controls.autoRotate = false;
  };

  applyStrictFit() {
    const {fit, orbit} = this.computeModelPreviewFit();
    this.fit = fit;
    this.orbit = orbit;
    this.camera.fov = fit.fovYDegrees;
    this.camera.aspect = fit.aspect;
    this.camera.near = orbit.near;
    this.camera.far = orbit.far;
    this.camera.position.fromArray([
      fit.center[0],
      fit.center[1],
      fit.center[2] + orbit.initialDistance,
    ]);
    this.controls.target.fromArray(fit.center);
    this.applyModelPreviewControls(orbit);
    this.camera.lookAt(this.controls.target);
    this.camera.updateProjectionMatrix();
    this.flushControlMomentum();
  }

  applyPreservedFit() {
    const {fit, orbit} = this.computeModelPreviewFit();
    this.fit = fit;
    this.orbit = orbit;
    this.camera.fov = fit.fovYDegrees;
    this.camera.aspect = fit.aspect;
    this.camera.near = orbit.near;
    this.camera.far = orbit.far;
    this.applyModelPreviewControls(orbit);
    this.camera.updateProjectionMatrix();
    this.controls.update(0);
  }

  computeModelPreviewFit() {
    this.modelRoot.updateMatrixWorld(true);
    const box = new this.dependencies.THREE.Box3().setFromObject(this.modelRoot, true);
    const fit = fitModelPreviewBoundingBox(
      {min: box.min.toArray(), max: box.max.toArray()},
      {aspect: this.viewport.width / this.viewport.height},
    );
    return {fit, orbit: buildModelPreviewOrbitEnvelope(fit)};
  }

  applyModelPreviewControls(orbit) {
    this.controls.autoRotate = false;
    this.controls.minDistance = orbit.minDistance;
    this.controls.maxDistance = orbit.maxDistance;
    this.controls.minPolarAngle = 0;
    this.controls.maxPolarAngle = Math.PI;
    this.controls.minAzimuthAngle = -Infinity;
    this.controls.maxAzimuthAngle = Infinity;
    this.controls.cursor.fromArray(orbit.center);
    this.controls.minTargetRadius = 0;
    this.controls.maxTargetRadius = orbit.targetRadius;
  }

  flushControlMomentum() {
    const enableDamping = this.controls.enableDamping;
    const position = this.camera.position.clone();
    const target = this.controls.target.clone();
    this.controls.enableDamping = false;
    this.controls.update(0);
    this.camera.position.copy(position);
    this.controls.target.copy(target);
    this.controls.update(0);
    this.controls.enableDamping = enableDamping;
  }

  startLoop() {
    if (this.disposed || this.suspended || this.frameId !== null) return;
    const renderFrame = (timestamp) => {
      if (this.disposed || this.suspended) {
        this.frameId = null;
        return;
      }
      const previous = this.previousFrameAt ?? timestamp;
      const deltaSeconds = Math.max(0, (timestamp - previous) / 1000);
      this.previousFrameAt = timestamp;
      this.controls.autoRotate = false;
      this.controls.update(deltaSeconds);
      this.renderer.render(this.scene, this.camera);
      this.frameId = this.requestFrame(renderFrame);
    };
    this.frameId = this.requestFrame(renderFrame);
  }

  async resize(viewport) {
    if (this.disposed) return;
    this.viewport = normalizeViewport(viewport);
    this.renderer.setPixelRatio(this.viewport.dpr);
    this.renderer.setSize(this.viewport.width, this.viewport.height, true);
    if (!this.userInteracted) this.applyStrictFit();
    else this.applyPreservedFit();
  }

  async reset() {
    if (this.disposed) return;
    this.userInteracted = false;
    this.controls.autoRotate = false;
    this.applyStrictFit();
  }

  async suspend() {
    if (this.disposed || this.suspended) return;
    this.suspended = true;
    if (this.frameId !== null) this.cancelFrame(this.frameId);
    this.frameId = null;
    this.previousFrameAt = null;
    this.controls.autoRotate = false;
  }

  async resume() {
    if (this.disposed || !this.suspended) return;
    this.suspended = false;
    this.startLoop();
  }

  async dispose() {
    if (this.disposePromise) return this.disposePromise;
    this.disposed = true;
    this.disposePromise = this.disposeResources();
    return this.disposePromise;
  }

  async disposeResources() {
    const failures = [];
    const attempt = (operation) => {
      try {
        operation();
      } catch (error) {
        failures.push(error);
      }
    };
    if (this.frameId !== null) this.cancelFrame(this.frameId);
    this.frameId = null;
    attempt(() => this.revokeObjectUrls());
    attempt(() => this.controls?.removeEventListener("start", this.onInteractionStart));
    attempt(() => this.controls?.dispose());
    attempt(() => this.registry.dispose());
    attempt(() => this.dracoLoader?.dispose());
    attempt(() => this.ktx2Loader?.dispose());
    attempt(() => this.renderer?.renderLists?.dispose());
    attempt(() => this.renderer?.forceContextLoss());
    attempt(() => this.renderer?.dispose());
    attempt(() => this.renderer?.domElement?.remove());
    attempt(() => this.scene?.clear());
    this.modelRoot = null;
    this.arrayBuffer = null;
    if (failures.length) throw new AggregateError(failures, "One or more GLB viewer resources failed to dispose");
  }

  revokeObjectUrls() {
    const failures = [];
    for (const url of this.objectUrls) {
      try {
        this.dependencies.URL.revokeObjectURL(url);
      } catch (error) {
        failures.push(error);
      }
    }
    this.objectUrls.clear();
    if (failures.length) throw new AggregateError(failures, "Failed to revoke one or more GLB object URLs");
  }

  publicApi() {
    return Object.freeze({
      resize: (viewport) => this.resize(viewport),
      reset: () => this.reset(),
      suspend: () => this.suspend(),
      resume: () => this.resume(),
      dispose: () => this.dispose(),
    });
  }
}

function validateContract(validation, actualLength) {
  if (!validation || validation.format !== "glb" || !validation.json || typeof validation.json !== "object") {
    throw adapterError("INVALID_GLB_VALIDATION", "GLB adapter requires a validated plain-data contract");
  }
  if (!Number.isSafeInteger(validation.binByteLength) || validation.binByteLength < 0) {
    throw adapterError("INVALID_GLB_VALIDATION", "validated GLB contract is missing binByteLength");
  }
  if (!(actualLength >= 20)) throw adapterError("INVALID_GLB_VALIDATION", "validated GLB bytes are incomplete");
  validateSelfContainedJson(validation.json, validation.binByteLength);
  return validation;
}

function validateRequiredExtensions(json) {
  const required = validateExtensionList(json.extensionsRequired, "extensionsRequired");
  const used = validateExtensionList(json.extensionsUsed, "extensionsUsed");
  if (used.includes(BLOCKED_EXTENSION) || required.includes(BLOCKED_EXTENSION)) {
    throw adapterError("UNSUPPORTED_EXTENSION", `${BLOCKED_EXTENSION} is not supported by v1`);
  }
  if (required.includes("KHR_lights_punctual")) {
    throw adapterError("UNSUPPORTED_REQUIRED_EXTENSION", "required model lights are ignored by v1");
  }
  for (const extension of required) {
    if (!ALLOWED_REQUIRED_EXTENSIONS.has(extension)) {
      throw adapterError("UNSUPPORTED_REQUIRED_EXTENSION", `required GLB extension is unsupported: ${extension}`);
    }
  }
}

function stripEmbeddedCamerasAndLights(root) {
  const remove = [];
  root.traverse((object) => {
    if ((object.isCamera || object.isLight) && object.parent) remove.push(object);
  });
  for (const object of remove) object.parent.remove(object);
}

function assertRenderableFiniteScene(root) {
  let renderableCount = 0;
  root.traverse((object) => {
    if (object.matrixWorld?.elements && !object.matrixWorld.elements.every(Number.isFinite)) {
      throw adapterError("NON_FINITE_TRANSFORM", "GLB contains a non-finite world transform");
    }
    if (!object.isMesh || !object.geometry) return;
    if (object.isInstancedMesh) {
      throw adapterError("UNSUPPORTED_EXTENSION", `${BLOCKED_EXTENSION} is not supported by v1`);
    }
    for (const material of asArray(object.material)) {
      if (material?.displacementMap) {
        throw adapterError("UNSUPPORTED_VERTEX_DISPLACEMENT", "runtime vertex displacement is not supported by v1");
      }
    }
    const position = object.geometry.attributes?.position;
    if (!position || !Number.isInteger(position.count) || position.count <= 0) return;
    for (let index = 0; index < position.count; index += 1) {
      if (![position.getX(index), position.getY(index), position.getZ(index)].every(Number.isFinite)) {
        throw adapterError("NON_FINITE_POSITION", "GLB contains a non-finite vertex position");
      }
    }
    renderableCount += 1;
  });
  if (renderableCount === 0) throw adapterError("NO_RENDERABLE_PRIMITIVES", "GLB default scene has no renderable primitives");
}

function decoderAssets(resolve) {
  const keys = [
    "draco/draco_wasm_wrapper.js",
    "draco/draco_decoder.wasm",
    "basis/basis_transcoder.js",
    "basis/basis_transcoder.wasm",
  ];
  const urls = new Set(keys.map((key) => resolve(key)));
  const wrapper = resolve(keys[0]);
  const basis = resolve(keys[2]);
  return {
    urls,
    dracoBase: wrapper.slice(0, wrapper.lastIndexOf("/") + 1),
    basisBase: basis.slice(0, basis.lastIndexOf("/") + 1),
  };
}

function normalizeVisualConfig(value) {
  if (!value || typeof value !== "object") {
    throw adapterError("GLB_VISUAL_CONFIG_REQUIRED", "GLB lighting and color configuration must be explicitly locked");
  }
  const config = {
    environment: value.environment,
    exposure: value.exposure,
    toneMapping: value.toneMapping,
    clearColor: value.clearColor,
    clearAlpha: value.clearAlpha,
  };
  if (config.environment !== "legacy"
      || !Number.isFinite(config.exposure) || config.exposure <= 0
      || config.toneMapping !== "Neutral"
      || !Number.isInteger(config.clearColor) || config.clearColor < 0 || config.clearColor > 0xffffff
      || !Number.isFinite(config.clearAlpha) || config.clearAlpha < 0 || config.clearAlpha > 1) {
    throw adapterError("INVALID_GLB_VISUAL_CONFIG", "GLB visual configuration contains invalid values");
  }
  return Object.freeze(config);
}

function toneMappingValue(three, name) {
  if (name !== "Neutral") throw adapterError("INVALID_GLB_VISUAL_CONFIG", "unsupported GLB tone mapping");
  return three.NeutralToneMapping;
}

function normalizeViewport(value) {
  const width = value?.width;
  const height = value?.height;
  const dpr = value?.dpr;
  if (![width, height, dpr].every((number) => Number.isFinite(number) && number > 0)) {
    throw adapterError("INVALID_VIEWPORT", "viewport width, height and dpr must be finite and positive");
  }
  return Object.freeze({width, height, dpr});
}

function requireHost(host) {
  if (!host || typeof host.appendChild !== "function") {
    throw adapterError("INVALID_HOST", "GLB adapter requires a DOM host");
  }
  return host;
}

function requireArrayBuffer(value) {
  if (!(value instanceof ArrayBuffer)) throw adapterError("INVALID_ASSET_BYTES", "GLB adapter requires an ArrayBuffer");
  return value;
}

function validateDependencySurface(D) {
  for (const [name, value] of Object.entries(D)) {
    if (value === undefined || value === null) throw adapterError("DEPENDENCY_API_MISMATCH", `missing GLB dependency: ${name}`);
  }
  for (const [name, value] of [
    ["THREE.LoadingManager", D.THREE?.LoadingManager],
    ["THREE.WebGLRenderer", D.THREE?.WebGLRenderer],
    ["THREE.Scene", D.THREE?.Scene],
    ["THREE.Box3", D.THREE?.Box3],
    ["THREE.BoxGeometry", D.THREE?.BoxGeometry],
    ["THREE.Mesh", D.THREE?.Mesh],
    ["THREE.MeshBasicMaterial", D.THREE?.MeshBasicMaterial],
    ["THREE.MeshStandardMaterial", D.THREE?.MeshStandardMaterial],
    ["THREE.PointLight", D.THREE?.PointLight],
    ["THREE.PMREMGenerator", D.THREE?.PMREMGenerator],
    ["THREE.PerspectiveCamera", D.THREE?.PerspectiveCamera],
    ["OrbitControls", D.OrbitControls],
    ["DRACOLoader", D.DRACOLoader],
    ["GLTFLoader", D.GLTFLoader],
    ["KTX2Loader", D.KTX2Loader],
    ["viewerAssetUrl", D.viewerAssetUrl],
    ["URL.revokeObjectURL", D.URL?.revokeObjectURL],
  ]) {
    if (typeof value !== "function") {
      throw adapterError("DEPENDENCY_API_MISMATCH", `missing GLB dependency API: ${name}`);
    }
  }
  if (typeof D.MeshoptDecoder?.decodeGltfBuffer !== "function") {
    throw adapterError("DEPENDENCY_API_MISMATCH", "missing GLB dependency API: MeshoptDecoder.decodeGltfBuffer");
  }
  for (const [name, value] of [
    ["THREE.BackSide", D.THREE?.BackSide],
    ["THREE.LinearSRGBColorSpace", D.THREE?.LinearSRGBColorSpace],
    ["THREE.NeutralToneMapping", D.THREE?.NeutralToneMapping],
    ["THREE.NoToneMapping", D.THREE?.NoToneMapping],
  ]) {
    if (value === undefined || value === null) {
      throw adapterError("DEPENDENCY_API_MISMATCH", `missing GLB dependency API: ${name}`);
    }
  }
}

function validateSelfContainedJson(json, binByteLength) {
  if (!Array.isArray(json.buffers) || json.buffers.length !== 1 || !isPlainObject(json.buffers[0])) {
    throw adapterError("INVALID_GLB_VALIDATION", "self-contained GLB requires exactly one buffer");
  }
  const buffer = json.buffers[0];
  if (Object.hasOwn(buffer, "uri") || !Number.isSafeInteger(buffer.byteLength)
      || buffer.byteLength < 0 || buffer.byteLength > binByteLength) {
    throw adapterError("INVALID_GLB_VALIDATION", "validated GLB buffer is not self-contained");
  }
  if (json.images === undefined) return;
  if (!Array.isArray(json.images)) {
    throw adapterError("INVALID_GLB_VALIDATION", "validated GLB images must be an array");
  }
  for (const image of json.images) {
    if (!isPlainObject(image) || Object.hasOwn(image, "uri")
        || !Number.isSafeInteger(image.bufferView) || image.bufferView < 0
        || !ALLOWED_IMAGE_MIME_TYPES.has(image.mimeType)) {
      throw adapterError("INVALID_GLB_VALIDATION", "validated GLB image is not embedded with a supported MIME type");
    }
  }
}

function validateExtensionList(value, field) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item === "")
      || new Set(value).size !== value.length) {
    throw adapterError("INVALID_GLB_VALIDATION", `${field} must contain unique non-empty strings`);
  }
  return value;
}

function asArray(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function adapterError(code, message, cause) {
  return new GlbAdapterError(code, message, cause);
}
