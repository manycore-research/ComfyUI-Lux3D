import assert from "node:assert/strict";
import test from "node:test";

import {
  createLux3DViewerController,
  createResidentViewerPool,
  ViewerControllerError,
} from "../src/viewer/controller.js";
import {
  deferred,
  FakeEventTarget,
  makeGlb,
  makeGaussianPly,
  makeObserverFactory,
  makeStreamingResponse,
} from "./viewer-test-helpers.mjs";

test("first visibility loads once, then ready and suspended reuse the same adapter and URL", async () => {
  const fixture = createControllerFixture();
  const executed = await fixture.controller.onExecuted({model_url: [fixture.url]});
  assert.equal(executed.state, "waiting-visible");
  assert.equal(fixture.fetchCalls.length, 0);

  await fixture.controller.setVisible(true);
  assert.equal(fixture.controller.getSnapshot().state, "ready");
  assert.equal(fixture.fetchCalls.length, 1);
  assert.deepEqual(fixture.factoryOptions.viewport, {width: 300, height: 300, dpr: 1.25});
  assert.strictEqual(fixture.factoryOptions.validation.json.asset.version, "2.0");
  assert.strictEqual(fixture.factoryOptions.visualConfig, fixture.visualConfig);
  assert.equal(fixture.adapter.calls.resize.length, 1);

  await fixture.controller.setVisible(false);
  assert.equal(fixture.controller.getSnapshot().state, "suspended");
  assert.equal(fixture.adapter.calls.suspend, 1);
  await fixture.controller.onExecuted({model_url: [fixture.url]});
  assert.equal(fixture.fetchCalls.length, 1);
  await fixture.controller.setVisible(true);
  assert.equal(fixture.adapter.calls.resume, 1);
  assert.equal(fixture.controller.getSnapshot().state, "ready");
  await fixture.controller.dispose();
});

test("a typed source change immediately hides and disposes the old generation before debounce loading", async () => {
  const host = makeDomHost();
  const fixture = createControllerFixture({host, useDefaultUi: true});
  await fixture.controller.setVisible(true);
  await fixture.controller.onExecuted({model_url: [fixture.url]});
  assert.equal(fixture.controller.getSnapshot().state, "ready");
  const status = host.children.find((child) => child.tagName === "DIV");
  assert.equal(status.hidden, true);

  const changed = fixture.controller.onSourceChanged("https://assets.example/changed.glb");
  assert.equal(fixture.controller.getSnapshot().state, "loading");
  assert.equal(status.hidden, false);
  assert.equal(status.style.inset, "0");
  assert.equal(status.style.background, "#050505");
  await changed;
  assert.equal(fixture.adapter.calls.dispose, 1);

  await fixture.controller.onExecuted({model_url: ["https://assets.example/changed.glb"]});
  assert.equal(fixture.controller.getSnapshot().state, "ready");
  assert.equal(fixture.fetchCalls.length, 2);
  await fixture.controller.dispose();
});

test("stable invalid and typed local sources clear the old adapter and expose named errors", async () => {
  const fixture = createControllerFixture();
  await fixture.controller.setVisible(true);
  await fixture.controller.onExecuted({model_url: [fixture.url]});

  await fixture.controller.onSourceChanged("https://assets.example/model.obj", "INVALID_MODEL_URL");
  let snapshot = fixture.controller.getSnapshot();
  assert.equal(snapshot.state, "error");
  assert.equal(snapshot.error.code, "INVALID_MODEL_URL");
  assert.equal(fixture.adapter.calls.dispose, 1);

  await fixture.controller.onSourceChanged("lux3d/local.glb", "LOCAL_MODEL_REQUIRES_EXECUTION");
  snapshot = fixture.controller.getSnapshot();
  assert.equal(snapshot.state, "error");
  assert.equal(snapshot.error.code, "LOCAL_MODEL_REQUIRES_EXECUTION");
  await fixture.controller.onSourceChanged("");
  assert.equal(fixture.controller.getSnapshot().state, "idle");
  await fixture.controller.dispose();
});

test("a queued execution reuses an identical live-preview generation while it is building", async () => {
  const gate = deferred();
  const started = deferred();
  const fixture = createControllerFixture({
    adapterFactory: async () => {
      started.resolve();
      await gate.promise;
      return fixture.adapter;
    },
  });
  await fixture.controller.setVisible(true);
  const livePreview = fixture.controller.onExecuted({model_url: [fixture.url]});
  await started.promise;
  assert.equal(fixture.controller.getSnapshot().state, "building");
  const queued = await fixture.controller.onExecuted({model_url: [fixture.url]});
  assert.equal(queued.state, "building");
  assert.equal(fixture.fetchCalls.length, 1);
  gate.resolve();
  await livePreview;
  assert.equal(fixture.controller.getSnapshot().state, "ready");
  assert.equal(fixture.fetchCalls.length, 1);
  await fixture.controller.dispose();
});

test("a rendered host loads without waiting for an IntersectionObserver callback", async () => {
  const host = makeHost();
  host.isConnected = true;
  host.ownerDocument = {
    visibilityState: "visible",
    defaultView: {innerWidth: 1280, innerHeight: 720},
  };
  host.getBoundingClientRect = () => ({
    width: 320,
    height: 360,
    left: 100,
    top: 80,
    right: 420,
    bottom: 440,
  });
  const fixture = createControllerFixture({host});

  const executed = await fixture.controller.onExecuted({model_url: [fixture.url]});

  assert.equal(executed.state, "ready");
  assert.equal(executed.visible, true);
  assert.equal(fixture.fetchCalls.length, 1);
  assert.equal(fixture.adapter.calls.suspend, 0);

  fixture.observers[0].callback([{target: host, isIntersecting: false}]);
  await Promise.resolve();
  assert.equal(fixture.controller.getSnapshot().state, "ready");
  assert.equal(fixture.controller.getSnapshot().visible, true);
  await fixture.controller.dispose();
});

test("ResizeObserver recovers a host attached after execution when intersection never reports", async () => {
  const host = makeHost();
  host.isConnected = false;
  host.ownerDocument = {
    visibilityState: "visible",
    defaultView: {innerWidth: 1280, innerHeight: 720},
  };
  host.getBoundingClientRect = () => ({
    width: 320,
    height: 360,
    left: 100,
    top: 80,
    right: 420,
    bottom: 440,
  });
  const fixture = createControllerFixture({host});

  const executed = await fixture.controller.onExecuted({model_url: [fixture.url]});
  assert.equal(executed.state, "waiting-visible");
  assert.equal(fixture.fetchCalls.length, 0);

  host.isConnected = true;
  fixture.observers[1].callback([{target: host}]);
  await waitForState(fixture.controller, "ready");

  assert.equal(fixture.controller.getSnapshot().visible, true);
  assert.equal(fixture.fetchCalls.length, 1);
  await fixture.controller.dispose();
});

test("returning to a visible document recovers without an observer transition", async () => {
  const host = makeHost();
  const document = new FakeEventTarget();
  document.visibilityState = "hidden";
  document.defaultView = {innerWidth: 1280, innerHeight: 720};
  host.isConnected = true;
  host.ownerDocument = document;
  host.getBoundingClientRect = () => ({
    width: 320,
    height: 360,
    left: 100,
    top: 80,
    right: 420,
    bottom: 440,
  });
  const fixture = createControllerFixture({host});

  const executed = await fixture.controller.onExecuted({model_url: [fixture.url]});
  assert.equal(executed.state, "waiting-visible");
  assert.equal(fixture.fetchCalls.length, 0);

  document.visibilityState = "visible";
  document.dispatch("visibilitychange");
  await waitForState(fixture.controller, "ready");

  assert.equal(fixture.fetchCalls.length, 1);
  await fixture.controller.dispose();
  assert.equal(document.listeners.get("visibilitychange")?.length, 0);
});

test("original asset link is an explicit no-referrer user action", async () => {
  const host = makeDomHost();
  const fixture = createControllerFixture({host, useDefaultUi: true});
  await fixture.controller.onExecuted({model_url: [fixture.url]});
  const sourceLink = host.children.find((child) => child.tagName === "A");
  assert.equal(sourceLink.href, fixture.url);
  assert.equal(sourceLink.target, "_blank");
  assert.equal(sourceLink.rel, "noopener noreferrer");
  assert.equal(sourceLink.referrerPolicy, "no-referrer");
  await fixture.controller.dispose();
});

test("detects G1 PLY from bytes rather than URL extension and passes its plain validation", async () => {
  const fixture = createControllerFixture();
  fixture.responseBytes = makeGaussianPly();
  await fixture.controller.setVisible(true);
  await fixture.controller.onExecuted({model_url: ["https://assets.example/intentionally-wrong.glb"]});
  assert.equal(fixture.glbModuleCalls, 0);
  assert.equal(fixture.gaussianModuleCalls, 1);
  assert.equal(fixture.factoryOptions.validation.stats.retainedSplatCount, 1);
  assert.deepEqual(fixture.factoryOptions.validation.splats[0].center, [0, 0, 0]);
  assert.deepEqual(fixture.factoryOptions.viewport, {width: 300, height: 300, dpr: 1.25});
  await fixture.controller.dispose();
});

test("uses untransformed host layout dimensions for the renderer viewport", async () => {
  const host = makeHost();
  host.clientWidth = 640;
  host.clientHeight = 480;
  host.getBoundingClientRect = () => ({width: 320, height: 240});
  const fixture = createControllerFixture({host});

  await fixture.controller.setVisible(true);
  await fixture.controller.onExecuted({model_url: [fixture.url]});

  assert.deepEqual(fixture.factoryOptions.viewport, {width: 640, height: 480, dpr: 1.25});
  assert.deepEqual(fixture.adapter.calls.resize.at(-1), {width: 640, height: 480, dpr: 1.25});
  await fixture.controller.dispose();
});

test("loading continues offscreen and mounts directly as suspended without refetching", async () => {
  const gate = deferred();
  const started = deferred();
  const adapter = makeAdapter();
  const fixture = createControllerFixture({
    adapterFactory: async () => {
      started.resolve();
      await gate.promise;
      return adapter;
    },
  });
  await fixture.controller.setVisible(true);
  const execution = fixture.controller.onExecuted({model_url: [fixture.url]});
  await started.promise;
  await fixture.controller.setVisible(false);
  gate.resolve();
  await execution;

  assert.equal(fixture.controller.getSnapshot().state, "suspended");
  assert.equal(adapter.calls.suspend, 1);
  assert.equal(fixture.fetchCalls.length, 1);
  await fixture.controller.setVisible(true);
  assert.equal(fixture.fetchCalls.length, 1);
  assert.equal(adapter.calls.resume, 1);
  await fixture.controller.dispose();
});

test("a superseded noninterruptible build is disposed and cannot overwrite the new generation", async () => {
  const firstGate = deferred();
  const firstStarted = deferred();
  const firstAdapter = makeAdapter();
  const secondAdapter = makeAdapter();
  let factoryCalls = 0;
  const fixture = createControllerFixture({
    maximumResidents: 2,
    adapterFactory: async () => {
      factoryCalls += 1;
      if (factoryCalls === 1) {
        firstStarted.resolve();
        await firstGate.promise;
        return firstAdapter;
      }
      return secondAdapter;
    },
  });
  await fixture.controller.setVisible(true);
  const oldExecution = fixture.controller.onExecuted({model_url: ["https://assets.example/old.glb?token=old"]});
  await firstStarted.promise;
  const newExecution = fixture.controller.onExecuted({model_url: ["https://assets.example/new.glb?token=new"]});
  await newExecution;
  assert.equal(fixture.controller.getSnapshot().asset, "https://assets.example/new.glb");
  assert.equal(fixture.controller.getSnapshot().state, "ready");
  firstGate.resolve();
  await oldExecution;

  assert.equal(firstAdapter.calls.dispose, 1);
  assert.equal(secondAdapter.calls.dispose, 0);
  assert.equal(fixture.controller.getSnapshot().state, "ready");
  assert.equal(fixture.fetchCalls.length, 2);
  await fixture.controller.dispose();
  assert.equal(secondAdapter.calls.dispose, 1);
});

test("a stale adapter releases its lease even when disposal fails", async () => {
  const firstGate = deferred();
  const firstStarted = deferred();
  const firstAdapter = makeAdapter();
  firstAdapter.dispose = async () => {
    firstAdapter.calls.dispose += 1;
    throw new Error("stale disposal failed");
  };
  const secondAdapter = makeAdapter();
  let factoryCalls = 0;
  const fixture = createControllerFixture({
    maximumResidents: 2,
    adapterFactory: async () => {
      factoryCalls += 1;
      if (factoryCalls === 1) {
        firstStarted.resolve();
        await firstGate.promise;
        return firstAdapter;
      }
      return secondAdapter;
    },
  });
  await fixture.controller.setVisible(true);
  const oldExecution = fixture.controller.onExecuted({model_url: ["https://assets.example/old.glb"]});
  await firstStarted.promise;
  await fixture.controller.onExecuted({model_url: ["https://assets.example/new.glb"]});
  firstGate.resolve();
  await oldExecution;

  assert.equal(firstAdapter.calls.dispose, 1);
  assert.equal(fixture.pool.activeCount, 1);
  await fixture.controller.dispose();
  assert.equal(fixture.pool.activeCount, 0);
});

test("an invalid adapter surface is disposed before its lease is released", async () => {
  const invalidAdapter = makeAdapter();
  delete invalidAdapter.resume;
  const fixture = createControllerFixture({adapterFactory: async () => invalidAdapter});
  await fixture.controller.setVisible(true);
  await fixture.controller.onExecuted({model_url: [fixture.url]});

  assert.equal(fixture.controller.getSnapshot().state, "error");
  assert.equal(invalidAdapter.calls.dispose, 1);
  assert.equal(fixture.pool.activeCount, 0);
  await fixture.controller.dispose();
});

test("a late visibility failure from an old generation cannot poison the new ready asset", async () => {
  const suspendGate = deferred();
  const oldAdapter = makeAdapter();
  oldAdapter.suspend = async () => suspendGate.promise;
  const newAdapter = makeAdapter();
  let factoryCalls = 0;
  const fixture = createControllerFixture({
    maximumResidents: 2,
    adapterFactory: async () => (++factoryCalls === 1 ? oldAdapter : newAdapter),
  });
  await fixture.controller.setVisible(true);
  await fixture.controller.onExecuted({model_url: ["https://assets.example/old.glb"]});
  const oldVisibility = fixture.controller.setVisible(false);
  await Promise.resolve();
  const nextExecution = fixture.controller.onExecuted({model_url: ["https://assets.example/new.glb"]});
  const newVisibility = fixture.controller.setVisible(true);
  await nextExecution;
  suspendGate.reject(Object.assign(new Error("old failure"), {code: "OLD_SUSPEND_FAILED"}));
  await oldVisibility;
  await newVisibility;

  assert.equal(fixture.controller.getSnapshot().state, "ready");
  assert.equal(fixture.controller.getSnapshot().asset, "https://assets.example/new.glb");
  await fixture.controller.dispose();
});

test("protocol and format failures enter error without leaking signed query data", async () => {
  const host = makeDomHost();
  const fixture = createControllerFixture({host, useDefaultUi: true});
  await fixture.controller.setVisible(true);
  await fixture.controller.onExecuted({model_url: ["data:application/octet-stream,SECRET_TOKEN"]});
  let snapshot = fixture.controller.getSnapshot();
  assert.equal(snapshot.state, "error");
  assert.equal(snapshot.error.code, "UNSUPPORTED_PROTOCOL");
  assert.equal(snapshot.asset, "<unsupported-protocol>");
  assert.equal(JSON.stringify(snapshot).includes("SECRET_TOKEN"), false);
  assert.equal(fixture.fetchCalls.length, 0);
  const sourceLink = host.children.find((child) => child.tagName === "A");
  assert.equal(sourceLink.hidden, true);
  assert.equal(sourceLink.href, undefined);

  fixture.responseBytes = new Uint8Array([1, 2, 3]);
  await fixture.controller.onExecuted({model_url: ["https://assets.example/not-model?signature=SECRET"]});
  snapshot = fixture.controller.getSnapshot();
  assert.equal(snapshot.error.code, "UNSUPPORTED_ASSET_FORMAT");
  assert.equal(JSON.stringify(snapshot).includes("SECRET"), false);
  await fixture.controller.dispose();
});

test("an adapter that fails initial resize is disposed and releases its resident lease", async () => {
  const adapter = makeAdapter();
  adapter.resize = async () => {
    throw Object.assign(new Error("resize failed"), {code: "ADAPTER_RESIZE_FAILED"});
  };
  const fixture = createControllerFixture({adapter});
  await fixture.controller.setVisible(true);
  await fixture.controller.onExecuted({model_url: [fixture.url]});

  const snapshot = fixture.controller.getSnapshot();
  assert.equal(snapshot.state, "error");
  assert.equal(snapshot.error.code, "ADAPTER_RESIZE_FAILED");
  assert.equal(adapter.calls.dispose, 1);
  assert.equal(fixture.pool.activeCount, 0);
  await fixture.controller.dispose();
});

test("preserves named adapter configuration errors while suppressing untrusted error text", async () => {
  const fixture = createControllerFixture({
    adapterFactory: async () => {
      const error = new Error("signed=https://assets.example/model?SECRET");
      error.code = "GLB_VISUAL_CONFIG_REQUIRED";
      throw error;
    },
  });
  await fixture.controller.setVisible(true);
  await fixture.controller.onExecuted({model_url: [fixture.url]});
  const snapshot = fixture.controller.getSnapshot();
  assert.equal(snapshot.state, "error");
  assert.equal(snapshot.error.code, "GLB_VISUAL_CONFIG_REQUIRED");
  assert.equal(snapshot.error.message, "viewer adapter operation failed");
  assert.equal(JSON.stringify(snapshot).includes("SECRET"), false);
  await fixture.controller.dispose();
});

test("terminal dispose aborts ownership, disconnects observers, removes host, and is idempotent", async () => {
  let boundaryDisposeCalls = 0;
  const fixture = createControllerFixture({
    disposeHostBoundary: () => {
      boundaryDisposeCalls += 1;
    },
  });
  await fixture.controller.setVisible(true);
  await fixture.controller.onExecuted({model_url: [fixture.url]});
  const first = fixture.controller.dispose();
  const second = fixture.controller.dispose();
  assert.strictEqual(first, second);
  await first;
  assert.equal(fixture.controller.getSnapshot().state, "disposed");
  assert.equal(fixture.adapter.calls.dispose, 1);
  assert.equal(fixture.pool.activeCount, 0);
  assert.equal(boundaryDisposeCalls, 1);
  assert.equal(fixture.host.removeCalls, 1);
  assert.ok(fixture.observers.every((observer) => observer.disconnected));
});

test("size, timeout, observers, pagehide, and resident policy are named required capabilities", () => {
  const base = {
    host: makeHost(),
    maxAssetBytes: 10,
    fetchTimeoutMs: 10,
    residentPool: createResidentViewerPool({maximum: 1, limitBehavior: "reject"}),
    intersectionObserverFactory: makeObserverFactory([]),
    resizeObserverFactory: makeObserverFactory([]),
    pagehideTarget: new FakeEventTarget(),
    ui: {setState() {}, setSourceLink() {}},
  };
  assert.throws(() => createLux3DViewerController({...base, maxAssetBytes: undefined}), {
    code: "MISSING_MAX_ASSET_BYTES",
  });
  assert.throws(() => createLux3DViewerController({...base, fetchTimeoutMs: undefined}), {
    code: "MISSING_FETCH_TIMEOUT_MS",
  });
  assert.throws(() => createLux3DViewerController({...base, residentPool: undefined}), {
    code: "MISSING_RESIDENT_CAPACITY_POLICY",
  });
  assert.throws(() => createResidentViewerPool({maximum: 1}), {
    code: "MISSING_RESIDENT_LIMIT_BEHAVIOR",
  });
  assert.throws(() => createResidentViewerPool({limitBehavior: "reject"}), {
    code: "MISSING_MAX_RESIDENT_VIEWERS",
  });
  assert.ok(ViewerControllerError);
});

function createControllerFixture(overrides = {}) {
  const bytes = makeGlb();
  const host = overrides.host ?? makeHost();
  const pagehideTarget = new FakeEventTarget();
  const observers = [];
  const fetchCalls = [];
  const pool = createResidentViewerPool({
    maximum: overrides.maximumResidents ?? 1,
    limitBehavior: "reject",
  });
  const adapter = overrides.adapter ?? makeAdapter();
  const fixture = {
    adapter,
    fetchCalls,
    host,
    observers,
    pool,
    responseBytes: bytes,
    url: "https://assets.example/model.glb?signature=SECRET",
    visualConfig: Object.freeze({exposure: 1}),
    factoryOptions: null,
    glbModuleCalls: 0,
    gaussianModuleCalls: 0,
  };
  const adapterFactory = overrides.adapterFactory ?? (async (options) => {
    fixture.factoryOptions = options;
    return adapter;
  });
  const controllerOptions = {
    host,
    maxAssetBytes: 64 * 1024,
    fetchTimeoutMs: 1000,
    residentPool: pool,
    pagehideTarget,
    intersectionObserverFactory: makeObserverFactory(observers),
    resizeObserverFactory: makeObserverFactory(observers),
    fetchImpl: async (url, init) => {
      fetchCalls.push({url, init});
      const responseBytes = fixture.responseBytes;
      return makeStreamingResponse(responseBytes, {
        url,
        headers: {"content-length": responseBytes.byteLength},
      });
    },
    loadGlbAdapterModule: async () => {
      fixture.glbModuleCalls += 1;
      return {createGlbAdapter: async (options) => {
        fixture.factoryOptions = options;
        return adapterFactory(options);
      }};
    },
    loadGaussianPlyAdapterModule: async () => {
      fixture.gaussianModuleCalls += 1;
      return {createGaussianPlyAdapter: async (options) => {
        fixture.factoryOptions = options;
        return adapterFactory(options);
      }};
    },
    getDevicePixelRatio: () => 1.25,
    getReducedMotion: () => true,
    glbVisualConfig: fixture.visualConfig,
    disposeHostBoundary: overrides.disposeHostBoundary,
  };
  if (!overrides.useDefaultUi) controllerOptions.ui = {setState() {}, setSourceLink() {}};
  fixture.controller = createLux3DViewerController(controllerOptions);
  return fixture;
}

function makeHost() {
  return {
    clientWidth: 200,
    clientHeight: 250,
    removeCalls: 0,
    getBoundingClientRect: () => ({width: 200, height: 250}),
    remove() {
      this.removeCalls += 1;
    },
  };
}

function makeDomHost() {
  const host = makeHost();
  host.dataset = {};
  host.children = [];
  host.ownerDocument = {
    createElement(tagName) {
      return {
        tagName: tagName.toUpperCase(),
        className: "",
        textContent: "",
        hidden: false,
        style: {},
      };
    },
  };
  host.append = (...children) => host.children.push(...children);
  return host;
}

function makeAdapter() {
  const calls = {resize: [], reset: 0, suspend: 0, resume: 0, dispose: 0};
  return {
    calls,
    async resize(viewport) {
      calls.resize.push(viewport);
    },
    async reset() {
      calls.reset += 1;
    },
    async suspend() {
      calls.suspend += 1;
    },
    async resume() {
      calls.resume += 1;
    },
    async dispose() {
      calls.dispose += 1;
    },
  };
}

async function waitForState(controller, expected) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (controller.getSnapshot().state === expected) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail(`controller did not reach ${expected}: ${controller.getSnapshot().state}`);
}
