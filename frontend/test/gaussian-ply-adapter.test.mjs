import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";

import {
  GaussianPlyAdapterError,
  createGaussianPlyAdapter,
} from "../src/viewer/adapters/gaussian-ply-adapter.js";

const VIEWPORT = Object.freeze({
  width: 300,
  height: 200,
  dpr: 2,
});

test("production code imports the exact pinned package and has no URL loading path", () => {
  const source = readFileSync(
    new URL("../src/viewer/adapters/gaussian-ply-adapter.js", import.meta.url),
    "utf8",
  );
  const packageJson = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));

  assert.equal(packageJson.dependencies["@mkkellogg/gaussian-splats-3d"], "0.4.6");
  assert.match(source, /from "@mkkellogg\/gaussian-splats-3d"/);
  assert.doesNotMatch(source, /TrackballControls|fitGaussianCamera|prepareGaussianSplats|getSplatCenter/);
  assert.match(source, /useBuiltInControls: true/);
  assert.match(source, /const SCENE_SCALE = 4/);
  assert.match(source, /scale: Object\.freeze\(\[SCENE_SCALE, SCENE_SCALE, SCENE_SCALE\]\)/);
  assert.doesNotMatch(source, /addSplatScene|loadFromURL|\bfetch\s*\(/);
});

test("uses the exact pinned in-memory loader, viewer, and scene options", async () => {
  const harness = createHarness(3);
  const adapter = await createAdapter(harness);

  assert.deepEqual(harness.loaderCalls, [[harness.arrayBuffer, 1, 0, false, 0]]);
  assert.equal(harness.viewerInstances.length, 1);
  assert.deepEqual(harness.viewerInstances[0].options, {
    cameraUp: [0, -1, -0.6],
    initialCameraPosition: [4, -4, 10.5],
    initialCameraLookAt: [4, -4, 16],
    selfDrivenMode: true,
    useBuiltInControls: true,
    rootElement: harness.host.children[0],
    ignoreDevicePixelRatio: false,
    sharedMemoryForWorkers: false,
    gpuAcceleratedSort: false,
    integerBasedSort: false,
    sphericalHarmonicsDegree: 0,
    antialiased: true,
    logLevel: 0,
  });
  assert.deepEqual(harness.viewerInstances[0].addCalls, [[
    [harness.splatBuffer],
    [{
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [4, 4, 4],
      splatAlphaRemovalThreshold: 1,
    }],
    true,
    false,
    false,
    false,
    false,
    false,
  ]]);
  assert.deepEqual(Object.keys(adapter).sort(), ["dispose", "reset", "resize", "resume", "suspend"]);
  await adapter.dispose();
});

test("targets the scaled splat-center bounding box without full-mesh fitting", async () => {
  const harness = createHarness(3);
  const adapter = await createAdapter(harness);
  const viewer = harness.viewerInstances[0];

  assert.deepEqual(viewer.mesh.centerReads, []);
  assert.deepEqual(viewer.mesh.scaleRotationReads, []);
  assert.deepEqual(viewer.mesh.colorReads, []);
  assert.deepEqual(viewer.camera.position.toArray(), [4, -4, 10.5]);
  assert.deepEqual(viewer.camera.up.toArray(), [0, -1 / Math.hypot(1, 0.6), -0.6 / Math.hypot(1, 0.6)]);
  assert.ok(viewer.camera.lookAtCalls.every((target) => target.join() === "4,-4,16"));
  assert.equal(viewer.camera.fov, 50);
  assert.equal(viewer.camera.near, 0.1);
  assert.equal(viewer.camera.far, 1000);
  assert.equal(viewer.camera.aspect, 1.5);
  assert.deepEqual(viewer.controls.target.toArray(), [4, -4, 16]);
  assert.equal(viewer.controls.object, viewer.camera);
  assert.equal(viewer.controls.domElement, viewer.renderer.domElement);
  assert.equal(viewer.controls.rotateSpeed, 0.5);
  assert.equal(viewer.controls.enableDamping, true);
  assert.equal(viewer.controls.dampingFactor, 0.05);
  assert.equal(viewer.controls.minPolarAngle, 0);
  assert.equal(viewer.controls.maxPolarAngle, Math.PI);
  assert.equal(viewer.controls.minAzimuthAngle, -Infinity);
  assert.equal(viewer.controls.maxAzimuthAngle, Infinity);
  assert.ok(viewer.controls.updateCount >= 1);
  assert.equal(viewer.startCount, 1);
  await adapter.dispose();
});

test("keeps indexed quad drawRange at six for one through five splats", async () => {
  for (let splatCount = 1; splatCount <= 5; splatCount += 1) {
    const harness = createHarness(splatCount);
    const adapter = await createAdapter(harness);
    const mesh = harness.viewerInstances[0].mesh;

    assert.deepEqual(mesh.geometry.drawRange, {start: 0, count: 6});
    assert.equal(mesh.geometry.instanceCount, splatCount);
    mesh.updateRenderIndexes(new Uint32Array(splatCount), splatCount);
    assert.deepEqual(mesh.geometry.drawRange, {start: 0, count: 6});
    assert.equal(mesh.geometry.instanceCount, splatCount);
    await adapter.dispose();
  }
});

test("resize preserves the centered camera and reset clears damping momentum", async () => {
  const harness = createHarness(2);
  const adapter = await createAdapter(harness);
  const viewer = harness.viewerInstances[0];
  const resized = {width: 480, height: 270, dpr: 1};

  await adapter.resize(VIEWPORT);

  await adapter.resize(resized);
  assert.deepEqual(viewer.renderer.size, [480, 270]);
  assert.equal(viewer.renderer.pixelRatio, 1);
  assert.equal(viewer.camera.aspect, 480 / 270);
  assert.deepEqual(viewer.camera.position.toArray(), [4, 16, -1.5]);
  assert.deepEqual(viewer.controls.target.toArray(), [4, 16, 4]);

  viewer.camera.position.set(90, 80, 70);
  viewer.controls.target.set(60, 50, 40);
  viewer.controls.queueMomentum([9, 8, 7], [6, 5, 4]);
  await adapter.reset();
  assert.deepEqual(viewer.camera.position.toArray(), [4, 16, -1.5]);
  assert.deepEqual(viewer.controls.target.toArray(), [4, 16, 4]);
  assert.deepEqual(viewer.controls.pendingPositionDelta, [0, 0, 0]);
  assert.deepEqual(viewer.controls.pendingTargetDelta, [0, 0, 0]);
  assert.equal(viewer.controls.enableDamping, true);
  await adapter.resize({width: 320, height: 320, dpr: 1.5});
  await adapter.dispose();
});

test("suspend, resume, and dispose are idempotent and dispose reparents to body", async () => {
  const harness = createHarness(2);
  const adapter = await createAdapter(harness);
  const viewer = harness.viewerInstances[0];
  const root = harness.host.children[0];

  await adapter.suspend();
  await adapter.suspend();
  assert.equal(viewer.stopCount, 1);
  assert.ok(viewer.controls);
  const controls = viewer.controls;
  await adapter.resume();
  await adapter.resume();
  assert.equal(viewer.startCount, 2);
  assert.equal(viewer.controls, controls);

  await Promise.all([adapter.dispose(), adapter.dispose()]);
  assert.equal(viewer.disposeCount, 1);
  assert.equal(viewer.stopCount, 2);
  assert.equal(root.parentNode, null);
  assert.equal(harness.document.body.children.includes(root), false);

  await adapter.resize(VIEWPORT);
  await adapter.reset();
  await adapter.suspend();
  await adapter.resume();
  assert.equal(viewer.disposeCount, 1);
});

test("a build failure disposes the viewer and removes its custom root", async () => {
  const harness = createHarness(2, {addError: new Error("build failed")});
  await assert.rejects(() => createAdapter(harness), /build failed/);

  const viewer = harness.viewerInstances[0];
  assert.equal(viewer.disposeCount, 1);
  assert.equal(harness.host.children.length, 0);
  assert.deepEqual(harness.document.body.children, [harness.host]);
});

test("rejects a missing pinned API instead of using a fallback", async () => {
  const harness = createHarness(1);
  harness.dependencies.PlyLoader.loadFromFileData = undefined;
  await assert.rejects(
    () => createAdapter(harness),
    (error) => error instanceof GaussianPlyAdapterError && error.code === "MISSING_PINNED_API",
  );
  assert.equal(harness.host.children.length, 0);
});

test("rejects forged or unrepresentable validated centers before creating DOM state", async () => {
  for (const [center, code] of [
    [[Number.POSITIVE_INFINITY, 0, 0], "INVALID_VALIDATION"],
    [[Number.MAX_VALUE, 0, 0], "UNREPRESENTABLE_REFERENCE_CAMERA"],
  ]) {
    const harness = createHarness(1);
    harness.validation.splats[0] = {center};
    await assert.rejects(
      () => createAdapter(harness),
      (error) => error instanceof GaussianPlyAdapterError && error.code === code,
    );
    assert.equal(harness.host.children.length, 0);
    assert.equal(harness.viewerInstances.length, 0);
  }
});

async function createAdapter(harness) {
  return createGaussianPlyAdapter({
    host: harness.host,
    arrayBuffer: harness.arrayBuffer,
    validation: harness.validation,
    viewport: VIEWPORT,
    reducedMotion: false,
  }, harness.dependencies);
}

function createHarness(splatCount, {addError = null} = {}) {
  const document = new FakeDocument();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const arrayBuffer = new ArrayBuffer(16);
  const splatBuffer = Object.freeze({kind: "splat-buffer"});
  const loaderCalls = [];
  const viewerInstances = [];
  const splats = makeValidationSplats(splatCount);

  class FakeViewer {
    constructor(options) {
      this.options = options;
      this.mesh = new FakeSplatMesh(splatCount);
      this.camera = new FakeCamera();
      this.perspectiveControls = null;
      this.orthographicControls = null;
      this.renderer = new FakeRenderer(options.rootElement.ownerDocument);
      this.controls = new FakeControls();
      this.controls.object = this.camera;
      this.controls.domElement = this.renderer.domElement;
      this.addCalls = [];
      this.startCount = 0;
      this.stopCount = 0;
      this.disposeCount = 0;
      this.devicePixelRatio = 1;
      viewerInstances.push(this);
    }

    getSplatMesh() {
      return this.mesh;
    }

    async addSplatBuffers(...args) {
      this.addCalls.push(args);
      if (addError) throw addError;
      this.mesh.updateRenderIndexes(new Uint32Array(splatCount), splatCount);
    }

    start() {
      this.startCount += 1;
    }

    stop() {
      this.stopCount += 1;
    }

    forceRenderNextFrame() {}

    async dispose() {
      this.disposeCount += 1;
      this.options.rootElement.ownerDocument.body.removeChild(this.options.rootElement);
    }
  }

  const dependencies = {
    LogLevel: {None: 0},
    PlyLoader: {
      async loadFromFileData(...args) {
        loaderCalls.push(args);
        return splatBuffer;
      },
    },
    SceneFormat: {Ply: 2},
    Viewer: FakeViewer,
  };

  return {
    splatCount,
    document,
    host,
    arrayBuffer,
    splatBuffer,
    loaderCalls,
    viewerInstances,
    validation: {splats, stats: {retainedSplatCount: splats.length}},
    dependencies,
  };
}

class FakeSplatMesh {
  constructor(splatCount) {
    this.splatCount = splatCount;
    this.geometry = new FakeGeometry();
    this.centerReads = [];
    this.scaleRotationReads = [];
    this.colorReads = [];
    this.devicePixelRatio = 1;
  }

  getSplatCount() {
    return this.splatCount;
  }

  getSplatCenter(index, outCenter) {
    this.centerReads.push(index);
    outCenter.set(index, index + 0.5, -index);
  }

  getSplatScaleAndRotation(index, outScale, outRotation) {
    this.scaleRotationReads.push(index);
    outScale.set(index + 1, index + 2, index + 3);
    outRotation.set(0.1, 0.2, 0.3, 0.9);
  }

  getSplatColor(index, outColor) {
    this.colorReads.push(index);
    outColor.set(10, 20, 30, index + 1);
  }

  updateRenderIndexes(_indexes, renderSplatCount) {
    this.geometry.instanceCount = renderSplatCount;
    this.geometry.setDrawRange(0, renderSplatCount);
  }
}

class FakeGeometry {
  constructor() {
    this.index = {count: 6};
    this.instanceCount = 0;
    this.drawRange = null;
  }

  setDrawRange(start, count) {
    this.drawRange = {start, count};
  }
}

class FakeVector3 {
  constructor() {
    this.set(0, 0, 0);
  }

  set(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  toArray() {
    return [this.x, this.y, this.z];
  }

  copy(other) {
    return this.set(other.x, other.y, other.z);
  }
}

class FakeQuaternion {
  constructor() {
    this.set(0, 0, 0, 1);
  }

  set(x, y, z, w) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
    return this;
  }
}

class FakeVector4 extends FakeQuaternion {}

class FakeCamera {
  constructor() {
    this.position = new FakeVector3();
    this.up = new FakeVector3();
    this.lookAtCalls = [];
    this.projectionUpdates = 0;
    this.zoom = 1;
    this.fov = 0;
    this.near = 0;
    this.far = 0;
    this.aspect = 0;
  }

  lookAt(...target) {
    this.lookAtCalls.push(target);
  }

  updateProjectionMatrix() {
    this.projectionUpdates += 1;
  }
}

class FakeControls {
  constructor() {
    this.target = new FakeVector3();
    this.listeners = new Map();
    this.updateCount = 0;
    this.rotateSpeed = 0;
    this.enableDamping = false;
    this.dampingFactor = 0;
    this.minPolarAngle = 0;
    this.maxPolarAngle = Math.PI;
    this.minAzimuthAngle = -Infinity;
    this.maxAzimuthAngle = Infinity;
    this.pendingPositionDelta = [0, 0, 0];
    this.pendingTargetDelta = [0, 0, 0];
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type) {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }

  listenerCount(type) {
    return this.listeners.get(type)?.size ?? 0;
  }

  update() {
    this.updateCount += 1;
    this.object?.position.set(
      this.object.position.x + this.pendingPositionDelta[0],
      this.object.position.y + this.pendingPositionDelta[1],
      this.object.position.z + this.pendingPositionDelta[2],
    );
    this.target.set(
      this.target.x + this.pendingTargetDelta[0],
      this.target.y + this.pendingTargetDelta[1],
      this.target.z + this.pendingTargetDelta[2],
    );
    const retained = this.enableDamping ? 0.5 : 0;
    this.pendingPositionDelta = this.pendingPositionDelta.map((value) => value * retained);
    this.pendingTargetDelta = this.pendingTargetDelta.map((value) => value * retained);
  }

  queueMomentum(positionDelta, targetDelta) {
    this.pendingPositionDelta = [...positionDelta];
    this.pendingTargetDelta = [...targetDelta];
  }
}

function makeValidationSplats(splatCount) {
  const centers = [
    [-3, 1, 4],
    [5, 7, -2],
    [2, -9, 10],
    [11, 3, 1],
    [-7, 5, 6],
  ];
  return centers.slice(0, splatCount).map((center) => ({center}));
}

class FakeRenderer {
  constructor(document) {
    this.domElement = document.createElement("canvas");
  }

  setPixelRatio(value) {
    this.pixelRatio = value;
  }

  setSize(width, height) {
    this.size = [width, height];
  }
}

class FakeDocument {
  constructor() {
    this.body = new FakeElement(this);
  }

  createElement() {
    return new FakeElement(this);
  }
}

class FakeElement {
  constructor(ownerDocument) {
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.className = "";
    this.listeners = new Map();
  }

  appendChild(child) {
    child.parentNode?.removeChild(child);
    this.children.push(child);
    child.parentNode = this;
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index < 0) throw new Error("child is not attached");
    this.children.splice(index, 1);
    child.parentNode = null;
    return child;
  }

  remove() {
    this.parentNode?.removeChild(this);
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }
}
