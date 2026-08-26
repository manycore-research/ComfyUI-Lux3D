import {
  LogLevel,
  PlyLoader,
  SceneFormat,
  Viewer,
} from "@mkkellogg/gaussian-splats-3d";

const CAMERA_UP = Object.freeze([0, -1, -0.6]);
const CAMERA_UP_LENGTH = Math.hypot(...CAMERA_UP);
const NORMALIZED_CAMERA_UP = Object.freeze(
  CAMERA_UP.map((component) => component / CAMERA_UP_LENGTH),
);
const INITIAL_CAMERA_POSITION = Object.freeze([0, 0, -5.5]);
const REFERENCE_CAMERA_NEAR = 0.1;
const REFERENCE_CAMERA_FAR = 1000;
const SCENE_SCALE = 4;
const INDEXED_QUAD_DRAW_COUNT = 6;
const SCENE_OPTIONS = Object.freeze({
  position: Object.freeze([0, 0, 0]),
  rotation: Object.freeze([0, 0, 0, 1]),
  scale: Object.freeze([SCENE_SCALE, SCENE_SCALE, SCENE_SCALE]),
  splatAlphaRemovalThreshold: 1,
});

const PRODUCTION_DEPENDENCIES = Object.freeze({
  LogLevel,
  PlyLoader,
  SceneFormat,
  Viewer,
});

export class GaussianPlyAdapterError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = "GaussianPlyAdapterError";
    this.code = code;
  }
}

export async function createGaussianPlyAdapter(
  {host, arrayBuffer, validation, viewport, reducedMotion},
  dependencies = PRODUCTION_DEPENDENCIES,
) {
  assertDependencies(dependencies);
  assertInputs(host, arrayBuffer, validation, reducedMotion);
  let currentViewport = normalizeViewport(viewport);
  const referenceCamera = buildReferenceCamera(validation);
  const documentObject = host.ownerDocument ?? globalThis.document;
  if (!documentObject?.body || typeof documentObject.createElement !== "function") {
    throw adapterError("INVALID_DOCUMENT", "host must belong to a document with a body");
  }

  const root = documentObject.createElement("div");
  root.className = "lux3d-gaussian-viewer-root";
  root.style.width = "100%";
  root.style.height = "100%";
  root.style.position = "relative";
  root.style.overflow = "hidden";
  host.appendChild(root);

  let viewer = null;
  let splatMesh = null;
  let removeDrawRangeGuard = () => {};
  let running = false;
  let disposed = false;
  let disposePromise = null;
  let appliedViewport = null;

  const configureBuiltInControls = () => {
    const controls = viewer?.controls;
    assertOrbitControlsApi(controls);
    controls.rotateSpeed = 0.5;
    controls.enableDamping = !reducedMotion;
    controls.dampingFactor = 0.05;
    // Keep the previously requested unrestricted 360-degree orbit behavior.
    controls.minPolarAngle = 0;
    controls.maxPolarAngle = Math.PI;
    controls.minAzimuthAngle = -Infinity;
    controls.maxAzimuthAngle = Infinity;
    return controls;
  };

  const applyReferenceCamera = () => {
    const camera = viewer.camera;
    assertCameraApi(camera);
    setVector3(camera.position, referenceCamera.position);
    setVector3(camera.up, NORMALIZED_CAMERA_UP);
    camera.aspect = currentViewport.width / currentViewport.height;
    camera.fov = 50;
    camera.near = REFERENCE_CAMERA_NEAR;
    camera.far = REFERENCE_CAMERA_FAR;
    camera.lookAt(...referenceCamera.target);
    const controls = configureBuiltInControls();
    setVector3(controls.target, referenceCamera.target);
    flushControlMomentum(controls, camera, referenceCamera);
    camera.updateProjectionMatrix();
    viewer.forceRenderNextFrame?.();
  };

  const applyViewport = () => {
    const {width, height, dpr} = currentViewport;
    viewer.devicePixelRatio = dpr;
    if (splatMesh) splatMesh.devicePixelRatio = dpr;
    if (viewer.renderer) {
      assertFunction(viewer.renderer.setPixelRatio, "renderer.setPixelRatio");
      assertFunction(viewer.renderer.setSize, "renderer.setSize");
      viewer.renderer.setPixelRatio(dpr);
      viewer.renderer.setSize(width, height);
    }
    if (viewer.camera) {
      viewer.camera.aspect = width / height;
      viewer.camera.updateProjectionMatrix();
    }
    viewer.forceRenderNextFrame?.();
    appliedViewport = currentViewport;
  };

  const terminalDispose = async () => {
    if (!viewer) {
      root.remove();
      return;
    }
    viewer.stop();
    running = false;
    removeDrawRangeGuard();

    // Viewer 0.4.6 unconditionally removes a non-external root from body.
    // Move the custom root there first so its disposer can follow that contract.
    if (root.parentNode !== documentObject.body) documentObject.body.appendChild(root);
    try {
      await viewer.dispose();
    } finally {
      root.remove();
      viewer = null;
      splatMesh = null;
    }
  };

  try {
    viewer = new dependencies.Viewer({
      cameraUp: [...CAMERA_UP],
      initialCameraPosition: [...referenceCamera.position],
      initialCameraLookAt: [...referenceCamera.target],
      selfDrivenMode: true,
      useBuiltInControls: true,
      rootElement: root,
      ignoreDevicePixelRatio: false,
      sharedMemoryForWorkers: false,
      gpuAcceleratedSort: false,
      integerBasedSort: false,
      sphericalHarmonicsDegree: 0,
      antialiased: true,
      logLevel: dependencies.LogLevel.None,
    });
    assertViewerApi(viewer);

    splatMesh = viewer.getSplatMesh();
    assertSplatMeshApi(splatMesh);
    removeDrawRangeGuard = installIndexedQuadDrawRangeGuard(splatMesh);

    const splatBuffer = await dependencies.PlyLoader.loadFromFileData(
      arrayBuffer,
      1,
      0,
      false,
      0,
    );
    await viewer.addSplatBuffers(
      [splatBuffer],
      [SCENE_OPTIONS],
      true,
      false,
      false,
      false,
      false,
      false,
    );

    const loadedSplatMesh = viewer.getSplatMesh();
    if (loadedSplatMesh !== splatMesh) {
      removeDrawRangeGuard();
      splatMesh = loadedSplatMesh;
      assertSplatMeshApi(splatMesh);
      removeDrawRangeGuard = installIndexedQuadDrawRangeGuard(splatMesh);
    }
    enforceIndexedQuadDrawRange(splatMesh);
    applyViewport();
    applyReferenceCamera();
    viewer.start();
    running = true;
  } catch (error) {
    await terminalDispose();
    throw error;
  }

  return Object.freeze({
    async resize(nextViewport) {
      if (disposed) return;
      const normalizedViewport = normalizeViewport(nextViewport);
      if (sameViewport(appliedViewport, normalizedViewport)) return;
      currentViewport = normalizedViewport;
      applyViewport();
    },

    async reset() {
      if (disposed) return;
      const wasRunning = running;
      if (wasRunning) viewer.stop();
      applyReferenceCamera();
      if (wasRunning) viewer.start();
    },

    async suspend() {
      if (disposed || !running) return;
      viewer.stop();
      running = false;
    },

    async resume() {
      if (disposed || running) return;
      viewer.start();
      running = true;
    },

    async dispose() {
      if (disposePromise) return disposePromise;
      disposed = true;
      disposePromise = terminalDispose();
      return disposePromise;
    },
  });
}

function installIndexedQuadDrawRangeGuard(splatMesh) {
  const originalUpdateRenderIndexes = splatMesh.updateRenderIndexes;
  const guardedUpdateRenderIndexes = function (...args) {
    try {
      return originalUpdateRenderIndexes.apply(this, args);
    } finally {
      enforceIndexedQuadDrawRange(this);
    }
  };
  splatMesh.updateRenderIndexes = guardedUpdateRenderIndexes;
  return () => {
    if (splatMesh.updateRenderIndexes === guardedUpdateRenderIndexes) {
      splatMesh.updateRenderIndexes = originalUpdateRenderIndexes;
    }
  };
}

function enforceIndexedQuadDrawRange(splatMesh) {
  const geometry = splatMesh.geometry;
  if (!geometry) return;
  if (geometry.index?.count !== INDEXED_QUAD_DRAW_COUNT) {
    throw adapterError("INVALID_INDEXED_QUAD", "pinned splat geometry must contain six quad indices");
  }
  assertFunction(geometry.setDrawRange, "splat geometry setDrawRange");
  geometry.setDrawRange(0, INDEXED_QUAD_DRAW_COUNT);
}

function assertDependencies(dependencies) {
  if (!dependencies || typeof dependencies !== "object") {
    throw adapterError("MISSING_DEPENDENCIES", "Gaussian adapter dependencies are required");
  }
  assertFunction(dependencies.PlyLoader?.loadFromFileData, "PlyLoader.loadFromFileData");
  assertFunction(dependencies.Viewer, "Viewer");
  if (dependencies.LogLevel?.None === undefined) {
    throw adapterError("MISSING_PINNED_API", "LogLevel.None is required");
  }
  if (dependencies.SceneFormat?.Ply === undefined) {
    throw adapterError("MISSING_PINNED_API", "SceneFormat.Ply is required");
  }
}

function assertInputs(host, arrayBuffer, validation, reducedMotion) {
  if (!host || typeof host.appendChild !== "function") {
    throw adapterError("INVALID_HOST", "host must be a DOM element");
  }
  if (!(arrayBuffer instanceof ArrayBuffer)) {
    throw adapterError("INVALID_ARRAY_BUFFER", "arrayBuffer must be an ArrayBuffer");
  }
  if (!validation?.stats || !Number.isSafeInteger(validation.stats.retainedSplatCount)
      || validation.stats.retainedSplatCount <= 0
      || !Array.isArray(validation.splats)
      || validation.splats.length !== validation.stats.retainedSplatCount) {
    throw adapterError(
      "INVALID_VALIDATION",
      "validation must contain splats matching a positive retainedSplatCount",
    );
  }
  if (typeof reducedMotion !== "boolean") {
    throw adapterError("INVALID_REDUCED_MOTION", "reducedMotion must be a boolean");
  }
}

function assertViewerApi(viewer) {
  for (const method of ["addSplatBuffers", "getSplatMesh", "start", "stop", "dispose"]) {
    assertFunction(viewer?.[method], `Viewer.${method}`);
  }
}

function assertOrbitControlsApi(controls) {
  assertVectorApi(controls?.target, "OrbitControls.target");
  for (const method of ["update"]) {
    assertFunction(controls?.[method], `OrbitControls.${method}`);
  }
}

function assertSplatMeshApi(splatMesh) {
  assertFunction(splatMesh?.updateRenderIndexes, "SplatMesh.updateRenderIndexes");
}

function assertCameraApi(camera) {
  if (!camera) throw adapterError("MISSING_PINNED_API", "Viewer.camera is required");
  assertVectorApi(camera.position, "camera.position");
  assertVectorApi(camera.up, "camera.up");
  assertFunction(camera.lookAt, "camera.lookAt");
  assertFunction(camera.updateProjectionMatrix, "camera.updateProjectionMatrix");
}

function assertVectorApi(vector, name) {
  assertFunction(vector?.set, `${name}.set`);
}

function assertFunction(value, name) {
  if (typeof value !== "function") {
    throw adapterError("MISSING_PINNED_API", `${name} is required by @mkkellogg/gaussian-splats-3d@0.4.6`);
  }
}

function setVector3(vector, values) {
  vector.set(values[0], values[1], values[2]);
}

function buildReferenceCamera(validation) {
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < validation.splats.length; index += 1) {
    const center = validation.splats[index]?.center;
    if (!Array.isArray(center) || center.length !== 3 || !center.every(Number.isFinite)) {
      throw adapterError(
        "INVALID_VALIDATION",
        `validated splat ${index} must contain a finite three-component center`,
      );
    }
    for (let axis = 0; axis < 3; axis += 1) {
      minimum[axis] = Math.min(minimum[axis], center[axis]);
      maximum[axis] = Math.max(maximum[axis], center[axis]);
    }
  }

  const target = minimum.map((lower, axis) => {
    const localCenter = stableMidpoint(lower, maximum[axis]);
    return SCENE_OPTIONS.position[axis] + localCenter * SCENE_OPTIONS.scale[axis];
  });
  const position = target.map((component, axis) => component + INITIAL_CAMERA_POSITION[axis]);
  if (!target.every(Number.isFinite) || !position.every(Number.isFinite)
      || position.every((component, axis) => component === target[axis])) {
    throw adapterError(
      "UNREPRESENTABLE_REFERENCE_CAMERA",
      "Gaussian bounds cannot establish a distinct finite reference camera",
    );
  }
  return Object.freeze({
    target: Object.freeze(target),
    position: Object.freeze(position),
  });
}

function stableMidpoint(lower, upper) {
  return lower / 2 + upper / 2;
}

function flushControlMomentum(controls, camera, referenceCamera) {
  const enableDamping = controls.enableDamping;
  controls.enableDamping = false;
  controls.update();
  setVector3(camera.position, referenceCamera.position);
  setVector3(controls.target, referenceCamera.target);
  camera.lookAt(...referenceCamera.target);
  controls.update();
  controls.enableDamping = enableDamping;
}

function normalizeViewport(viewport) {
  if (!viewport || typeof viewport !== "object") {
    throw adapterError("INVALID_VIEWPORT", "viewport is required");
  }
  const width = positiveFinite(viewport.width, "width");
  const height = positiveFinite(viewport.height, "height");
  const dpr = positiveFinite(viewport.dpr, "dpr");
  return Object.freeze({width, height, dpr});
}

function positiveFinite(value, name) {
  if (!Number.isFinite(value) || !(value > 0)) {
    throw adapterError("INVALID_VIEWPORT", `${name} must be finite and positive`);
  }
  return value;
}

function sameViewport(left, right) {
  return left !== null
    && left.width === right.width
    && left.height === right.height
    && left.dpr === right.dpr;
}

function adapterError(code, message) {
  return new GaussianPlyAdapterError(code, message);
}
