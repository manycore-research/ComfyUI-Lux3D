import assert from "node:assert/strict";
import {test} from "node:test";
import * as REAL_THREE from "three";

import {
  GlbAdapterError,
  createGlbAdapter,
} from "../src/viewer/adapters/glb-adapter.js";

const VIEWPORT = Object.freeze({width: 300, height: 200, dpr: 2});
const VISUAL_CONFIG = Object.freeze({
  environment: "legacy",
  exposure: 0.95,
  toneMapping: "Neutral",
  clearColor: 0x000000,
  clearAlpha: 1.0,
});

test("requires an explicit valid visual configuration", async () => {
  const harness = createHarness();
  await assert.rejects(
    () => createAdapter(harness, {visualConfig: undefined}),
    (error) => error instanceof GlbAdapterError && error.code === "GLB_VISUAL_CONFIG_REQUIRED",
  );
  await assert.rejects(
    () => createAdapter(harness, {visualConfig: {...VISUAL_CONFIG, exposure: 0}}),
    (error) => error instanceof GlbAdapterError && error.code === "INVALID_GLB_VISUAL_CONFIG",
  );
  assert.equal(harness.rendererInstances.length, 0);
});

test("keeps the browser frame scheduler bound to the global object", async () => {
  const harness = createHarness();
  const originalRequestFrame = globalThis.requestAnimationFrame;
  const originalCancelFrame = globalThis.cancelAnimationFrame;
  const requestedFrames = [];
  const cancelledFrames = [];
  globalThis.requestAnimationFrame = function (callback) {
    assert.strictEqual(this, globalThis);
    requestedFrames.push(callback);
    return 37;
  };
  globalThis.cancelAnimationFrame = function (frameId) {
    assert.strictEqual(this, globalThis);
    cancelledFrames.push(frameId);
  };

  try {
    const adapter = await createGlbAdapter({
      host: harness.host,
      arrayBuffer: harness.arrayBuffer,
      validation: harness.validation,
      viewport: VIEWPORT,
      visualConfig: VISUAL_CONFIG,
      reducedMotion: false,
      dependencies: harness.dependencies,
      now: () => harness.nowValue,
    });

    assert.equal(requestedFrames.length, 1);
    await adapter.dispose();
    assert.deepEqual(cancelledFrames, [37]);
  } finally {
    if (originalRequestFrame === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = originalRequestFrame;
    if (originalCancelFrame === undefined) delete globalThis.cancelAnimationFrame;
    else globalThis.cancelAnimationFrame = originalCancelFrame;
  }
});

test("detects KTX support before parsing and uses only manifest decoder URLs", async () => {
  const harness = createHarness();
  const adapter = await createAdapter(harness);

  assert.ok(harness.timeline.indexOf("ktx-detect") < harness.timeline.indexOf("parse"));
  assert.deepEqual(harness.parseCalls, [[harness.arrayBuffer, ""]]);
  assert.equal(harness.dracoInstances[0].decoderPath, "/local/draco/");
  assert.deepEqual(harness.dracoInstances[0].decoderConfig, {type: "wasm"});
  assert.equal(harness.ktxInstances[0].transcoderPath, "/local/basis/");
  assert.equal(harness.gltfInstances[0].meshoptDecoder, harness.dependencies.MeshoptDecoder);
  assert.deepEqual(harness.revokedUrls, ["blob:embedded-image"]);
  assert.throws(
    () => harness.gltfInstances[0].manager.resolveURL("https://cdn.example/decoder.wasm"),
    (error) => error instanceof GlbAdapterError && error.code === "EXTERNAL_RESOURCE_BLOCKED",
  );
  assert.equal(harness.modelRoot.children.includes(harness.embeddedCamera), false);
  assert.equal(harness.modelRoot.children.includes(harness.embeddedLight), false);
  assert.ok(harness.modelRoot.parent);
  assert.equal(harness.modelRoot.parent.children.includes(harness.modelRoot), true);
  assert.equal(harness.alternateScene.parent, null);
  await adapter.dispose();
});

test("applies exact Box3 sphere fitting and ignores model camera and lights", async () => {
  const harness = createHarness();
  const adapter = await createAdapter(harness);
  const camera = harness.cameraInstances[0];
  const controls = harness.controlsInstances[0];

  assert.equal(harness.boxSetCalls, 1);
  assert.equal(harness.lastBoxPrecise, true);
  assert.equal(camera.fov, 30);
  assert.equal(camera.aspect, 1.5);
  assert.ok(camera.near > 0);
  assert.ok(camera.far > camera.near);
  assert.deepEqual(controls.target.toArray(), [0.5, 0.5, 0.5]);
  assert.deepEqual(controls.cursor.toArray(), [0.5, 0.5, 0.5]);
  assert.ok(controls.minDistance > 0);
  assert.ok(controls.maxDistance > controls.minDistance);
  assert.equal(controls.minPolarAngle, 0);
  assert.equal(controls.maxPolarAngle, Math.PI);
  assert.equal(controls.minAzimuthAngle, -Infinity);
  assert.equal(controls.maxAzimuthAngle, Infinity);
  assert.equal(controls.maxTargetRadius > 0, true);
  assert.deepEqual(camera.position.toArray().slice(0, 2), [0.5, 0.5]);
  assert.ok(camera.position.z > 4);
  assert.deepEqual(camera.up.toArray(), [0, 1, 0]);
  assert.equal(harness.rendererInstances[0].toneMapping, REAL_THREE.NeutralToneMapping);
  assert.equal(harness.rendererInstances[0].toneMappingExposure, 0.95 * 1.3);
  assert.deepEqual(harness.rendererInstances[0].clearColor, [0x000000, 1.0]);
  assert.equal(harness.pmremCalls.length, 1);
  const [environmentScene, sigma, near, far, options] = harness.pmremCalls[0];
  assert.equal(environmentScene.position.y, -3.5);
  assert.equal(environmentScene.children.length, 14);
  assert.equal(environmentScene.children[0].isPointLight, true);
  assert.equal(environmentScene.children[0].intensity, 500);
  assert.deepEqual(environmentScene.children[0].position.toArray(), [0.418, 16.199, 0.3]);
  assert.equal(sigma, 0.04);
  assert.equal(near, 0.1);
  assert.equal(far, 100);
  assert.deepEqual(options, {size: 256});
  assert.equal(harness.pmremCaptureState.toneMapping, REAL_THREE.NoToneMapping);
  assert.equal(harness.pmremCaptureState.outputColorSpace, REAL_THREE.LinearSRGBColorSpace);
  assert.strictEqual(harness.modelRoot.parent.environment, harness.environmentTarget.texture);
  assert.equal(harness.modelRoot.parent.children.some((child) => child.isAmbientLight || child.isDirectionalLight), false);
  await adapter.dispose();
});

test("rejects forged non-self-contained validation and unsupported extensions before rendering", async () => {
  const invalidJsonValues = [
    {buffers: [{byteLength: 4, uri: "data:application/octet-stream;base64,AA=="}]},
    {buffers: [{byteLength: 5}]},
    {buffers: [{byteLength: 4}], images: [{uri: "texture.png"}]},
    {buffers: [{byteLength: 4}], extensionsRequired: ["UNKNOWN_required"]},
    {buffers: [{byteLength: 4}], extensionsRequired: ["KHR_lights_punctual"]},
    {buffers: [{byteLength: 4}], extensionsUsed: ["EXT_mesh_gpu_instancing"]},
  ];
  for (const json of invalidJsonValues) {
    const harness = createHarness({json});
    await assert.rejects(() => createAdapter(harness), GlbAdapterError);
    assert.equal(harness.rendererInstances.length, 0);
  }
});

test("resize refits before interaction, preserves model-preview controls, and never auto-rotates", async () => {
  const harness = createHarness();
  const adapter = await createAdapter(harness);
  const controls = harness.controlsInstances[0];
  const renderer = harness.rendererInstances[0];

  harness.runFrame(0);
  assert.equal(controls.autoRotate, false);
  harness.nowValue = 12_999;
  harness.runFrame(1_000);
  assert.equal(controls.autoRotate, false);
  harness.nowValue = 13_000;
  harness.runFrame(2_000);
  assert.equal(controls.autoRotate, false);

  await adapter.resize({width: 480, height: 270, dpr: 1});
  assert.equal(harness.boxSetCalls, 2);
  assert.deepEqual(renderer.size, [480, 270, true]);
  assert.equal(harness.cameraInstances[0].fov, 30);
  controls.dispatch("start");
  await adapter.resize({width: 270, height: 480, dpr: 1});
  assert.equal(harness.boxSetCalls, 3);
  assert.equal(harness.cameraInstances[0].aspect, 270 / 480);
  assert.ok(harness.cameraInstances[0].fov > 30);
  await adapter.reset();
  assert.equal(harness.boxSetCalls, 4);

  await adapter.suspend();
  const pendingAfterSuspend = harness.frames.size;
  await adapter.suspend();
  assert.equal(harness.frames.size, pendingAfterSuspend);
  await adapter.resume();
  await adapter.resume();
  assert.equal(harness.frames.size, 1);
  await adapter.dispose();
});

test("reduced motion prevents auto-rotation while retaining manual controls", async () => {
  const harness = createHarness();
  const adapter = await createAdapter(harness, {reducedMotion: true});
  const controls = harness.controlsInstances[0];

  harness.nowValue = 1_000_000;
  harness.runFrame(1_000);
  assert.equal(controls.autoRotate, false);
  assert.equal(controls.listenerCount("start"), 1);
  await adapter.dispose();
});

test("disposes shared model resources exactly once and releases the WebGL owner", async () => {
  const harness = createHarness();
  const adapter = await createAdapter(harness);
  const renderer = harness.rendererInstances[0];
  const controls = harness.controlsInstances[0];

  await Promise.all([adapter.dispose(), adapter.dispose()]);

  for (const resource of [
    "geometry", "material", "texture", "bitmap", "skeleton", "bone-texture",
    "draco", "ktx", "environment-target", "pmrem-generator", "render-lists", "context-loss", "renderer",
  ]) {
    assert.equal(harness.disposeCalls.filter((value) => value === resource).length, 1, resource);
  }
  assert.equal(harness.textureSource.data, null);
  assert.equal(harness.skeleton.boneTexture, null);
  assert.equal(controls.listenerCount("start"), 0);
  assert.equal(controls.disposeCount, 1);
  assert.equal(renderer.domElement.parentNode, null);

  await adapter.resize(VIEWPORT);
  await adapter.reset();
  await adapter.suspend();
  await adapter.resume();
  assert.equal(harness.disposeCalls.filter((value) => value === "renderer").length, 1);
});

function createAdapter(harness, overrides = {}) {
  return createGlbAdapter({
    host: harness.host,
    arrayBuffer: harness.arrayBuffer,
    validation: harness.validation,
    viewport: VIEWPORT,
    visualConfig: VISUAL_CONFIG,
    reducedMotion: false,
    dependencies: harness.dependencies,
    requestFrame: harness.requestFrame,
    cancelFrame: harness.cancelFrame,
    now: () => harness.nowValue,
    ...overrides,
  });
}

function createHarness({json = {buffers: [{byteLength: 4}]} } = {}) {
  const document = new FakeDocument();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const arrayBuffer = new ArrayBuffer(24);
  const timeline = [];
  const parseCalls = [];
  const revokedUrls = [];
  const disposeCalls = [];
  const rendererInstances = [];
  const controlsInstances = [];
  const cameraInstances = [];
  const dracoInstances = [];
  const ktxInstances = [];
  const gltfInstances = [];
  const pmremCalls = [];
  const frames = new Map();
  let nextFrameId = 0;

  const geometry = new REAL_THREE.BufferGeometry();
  geometry.setAttribute("position", new REAL_THREE.Float32BufferAttribute([
    -1, -2, -3,
    2, 3, 4,
    0, 1, 0,
  ], 3));
  geometry.dispose = () => disposeCalls.push("geometry");
  const bitmap = {close: () => disposeCalls.push("bitmap")};
  const texture = new REAL_THREE.Texture(bitmap);
  const textureSource = texture.source;
  texture.dispose = () => disposeCalls.push("texture");
  const material = new REAL_THREE.MeshStandardMaterial({map: texture});
  material.dispose = () => disposeCalls.push("material");
  const mesh = new REAL_THREE.Mesh(geometry, material);
  const boneTexture = new REAL_THREE.Texture();
  boneTexture.dispose = () => disposeCalls.push("bone-texture");
  const skeleton = {
    boneTexture,
    dispose() {
      disposeCalls.push("skeleton");
      this.boneTexture?.dispose();
      this.boneTexture = null;
    },
  };
  mesh.skeleton = skeleton;

  const modelRoot = new REAL_THREE.Scene();
  modelRoot.add(mesh);
  const embeddedCamera = new REAL_THREE.PerspectiveCamera();
  const embeddedLight = new REAL_THREE.PointLight();
  modelRoot.add(embeddedCamera, embeddedLight);
  const alternateScene = new REAL_THREE.Scene();

  const harness = {
    document,
    host,
    arrayBuffer,
    timeline,
    parseCalls,
    revokedUrls,
    disposeCalls,
    rendererInstances,
    controlsInstances,
    cameraInstances,
    dracoInstances,
    ktxInstances,
    gltfInstances,
    pmremCalls,
    frames,
    modelRoot,
    embeddedCamera,
    embeddedLight,
    alternateScene,
    textureSource,
    skeleton,
    nowValue: 10_000,
    boxSetCalls: 0,
    lastBoxPrecise: null,
  };

  const environmentTarget = {
    texture: {name: ""},
    dispose() { disposeCalls.push("environment-target"); },
  };
  harness.environmentTarget = environmentTarget;

  class FakeRenderer {
    constructor(options) {
      this.options = options;
      this.domElement = document.createElement("canvas");
      this.renderLists = {dispose: () => disposeCalls.push("render-lists")};
      rendererInstances.push(this);
    }

    setPixelRatio(value) { this.pixelRatio = value; }
    setSize(...values) { this.size = values; }
    setClearColor(...values) { this.clearColor = values; }
    render(scene) { harness.rendererScene = scene; }
    forceContextLoss() { disposeCalls.push("context-loss"); }
    dispose() { disposeCalls.push("renderer"); }
  }

  class FakePmremGenerator {
    constructor(renderer) {
      this.renderer = renderer;
    }

    fromScene(...args) {
      pmremCalls.push(args);
      harness.pmremCaptureState = {
        toneMapping: this.renderer.toneMapping,
        outputColorSpace: this.renderer.outputColorSpace,
      };
      return environmentTarget;
    }

    dispose() { disposeCalls.push("pmrem-generator"); }
  }

  class CountingBox3 extends REAL_THREE.Box3 {
    setFromObject(root, precise) {
      harness.boxSetCalls += 1;
      harness.lastBoxPrecise = precise;
      return super.setFromObject(root, precise);
    }
  }

  class TrackingCamera extends REAL_THREE.PerspectiveCamera {
    constructor(...args) {
      super(...args);
      cameraInstances.push(this);
    }
  }

  class FakeControls {
    constructor(camera) {
      this.camera = camera;
      this.target = new REAL_THREE.Vector3();
      this.cursor = new REAL_THREE.Vector3();
      this.listeners = new Map();
      this.disposeCount = 0;
      controlsInstances.push(this);
    }

    addEventListener(type, listener) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(listener);
    }

    removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
    dispatch(type) { for (const listener of this.listeners.get(type) ?? []) listener(); }
    listenerCount(type) { return this.listeners.get(type)?.size ?? 0; }
    update(delta) { this.lastDelta = delta; }
    dispose() { this.disposeCount += 1; }
  }

  class FakeDracoLoader {
    constructor(manager) { this.manager = manager; dracoInstances.push(this); }
    setDecoderPath(value) { this.decoderPath = value; return this; }
    setDecoderConfig(value) { this.decoderConfig = value; return this; }
    dispose() { disposeCalls.push("draco"); }
  }

  class FakeKtxLoader {
    constructor(manager) { this.manager = manager; ktxInstances.push(this); }
    setTranscoderPath(value) { this.transcoderPath = value; return this; }
    detectSupport(renderer) { this.detectedRenderer = renderer; timeline.push("ktx-detect"); return this; }
    dispose() { disposeCalls.push("ktx"); }
  }

  class FakeGltfLoader {
    constructor(manager) { this.manager = manager; gltfInstances.push(this); }
    setDRACOLoader(value) { this.draco = value; return this; }
    setKTX2Loader(value) { this.ktx = value; return this; }
    setMeshoptDecoder(value) { this.meshoptDecoder = value; return this; }
    async parseAsync(...args) {
      timeline.push("parse");
      parseCalls.push(args);
      this.manager.resolveURL("blob:embedded-image");
      this.manager.resolveURL("/local/draco/draco_decoder.wasm");
      return {scene: modelRoot, scenes: [alternateScene, modelRoot]};
    }
  }

  harness.dependencies = {
    THREE: {
      ...REAL_THREE,
      WebGLRenderer: FakeRenderer,
      PMREMGenerator: FakePmremGenerator,
      Box3: CountingBox3,
      PerspectiveCamera: TrackingCamera,
    },
    OrbitControls: FakeControls,
    DRACOLoader: FakeDracoLoader,
    GLTFLoader: FakeGltfLoader,
    KTX2Loader: FakeKtxLoader,
    MeshoptDecoder: {decodeGltfBuffer() {}},
    viewerAssetUrl: (key) => `/local/${key}`,
    URL: {revokeObjectURL: (url) => revokedUrls.push(url)},
  };
  harness.validation = {format: "glb", json, binByteLength: 4};
  harness.requestFrame = (callback) => {
    nextFrameId += 1;
    frames.set(nextFrameId, callback);
    return nextFrameId;
  };
  harness.cancelFrame = (id) => frames.delete(id);
  harness.runFrame = (timestamp) => {
    const entry = frames.entries().next().value;
    assert.ok(entry, "a frame must be scheduled");
    const [id, callback] = entry;
    frames.delete(id);
    callback(timestamp);
  };
  return harness;
}

class FakeDocument {
  constructor() {
    this.body = new FakeElement(this, "body");
  }

  createElement(tagName) {
    return new FakeElement(this, tagName);
  }
}

class FakeElement {
  constructor(ownerDocument, tagName) {
    this.ownerDocument = ownerDocument;
    this.tagName = tagName;
    this.parentNode = null;
    this.children = [];
    this.tabIndex = -1;
  }

  appendChild(child) {
    child.parentNode?.removeChild(child);
    this.children.push(child);
    child.parentNode = this;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentNode = null;
  }

  remove() {
    this.parentNode?.removeChild(this);
  }
}
