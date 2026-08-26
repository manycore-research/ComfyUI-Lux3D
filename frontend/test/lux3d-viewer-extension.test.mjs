import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

import {registerLux3DViewerExtension} from "../src/lux3d-viewer-extension.js";
import {FakeEventTarget} from "./viewer-test-helpers.mjs";

test("chains Comfy hooks, budgets a clipped 300px viewport, and supports safe local preview", async () => {
  const document = new FakeDocument();
  const app = makeApp();
  const controllerCalls = {onExecuted: [], visible: [], resize: 0, dispose: 0};
  const controller = makeController(controllerCalls);
  const glbLoader = async () => ({marker: "glb"});
  const gaussianLoader = async () => ({marker: "gaussian"});
  let controllerOptions;
  registerLux3DViewerExtension({
    app,
    documentImpl: document,
    config: {
      maxAssetBytes: 1024,
      fetchTimeoutMs: 5000,
      maxResidentViewers: 2,
      residentLimitBehavior: "reject",
      glbVisualConfig: {exposure: 1},
    },
    controllerFactory: (options) => {
      controllerOptions = options;
      return controller;
    },
    loadGlbAdapterModule: glbLoader,
    loadGaussianPlyAdapterModule: gaussianLoader,
  });
  assert.equal(app.extensions.length, 1);

  class ViewerNode extends FakeNode {}
  await app.extensions[0].beforeRegisterNodeDef(ViewerNode, {name: "Lux3DViewer"});
  const node = new ViewerNode();
  assert.equal(node.onNodeCreated(), "created-result");
  assert.deepEqual(node.originalCalls, ["created"]);
  assert.equal(node.widgets.length, 1);
  assert.equal(node.widgets[0].name, "lux3d_viewer");
  assert.equal(node.widgets[0].options.margin, 10);
  assert.equal(node.widgets[0].options.getMinHeight(), 320);
  assert.equal(
    node.widgets[0].options.getMinHeight() - node.widgets[0].options.margin * 2,
    300,
  );
  assert.equal(node.widgets[0].options.getHeight, undefined);
  assert.equal(node.widgets[0].computeSize, undefined);
  assert.equal(node.widgets[0].element.style.width, "100%");
  assert.equal(node.widgets[0].element.style.height, "100%");
  assert.equal(node.widgets[0].element.style.minWidth, undefined);
  assert.equal(node.widgets[0].element.style.minHeight, undefined);
  assert.equal(node.widgets[0].element.style.overflow, "hidden");
  assert.equal(node.widgets[0].element.style.borderRadius, "6px");
  assert.equal(node.size[0], 320);
  assert.equal(node.size[1], 360);
  assert.strictEqual(controllerOptions.loadGlbAdapterModule, glbLoader);
  assert.strictEqual(controllerOptions.loadGaussianPlyAdapterModule, gaussianLoader);
  assert.deepEqual(controllerOptions.glbVisualConfig, {exposure: 1});

  node.widgets[0].options.onDraw();
  node.widgets[0].options.onDraw();
  await Promise.resolve();
  assert.deepEqual(controllerCalls.visible, [true]);
  node.widgets[0].options.onHide();
  node.widgets[0].options.onHide();
  await Promise.resolve();
  assert.deepEqual(controllerCalls.visible, [true, false]);
  node.widgets[0].options.onDraw();
  await Promise.resolve();
  assert.deepEqual(controllerCalls.visible, [true, false, true]);
  await controller.setVisible(false);
  node.widgets[0].options.onDraw();
  await Promise.resolve();
  assert.deepEqual(controllerCalls.visible, [true, false, true, false, true]);
  node.widgets[0].options.onHide();
  node.widgets[0].options.onDraw();
  node.widgets[0].options.onHide();
  assert.equal(controller.getSnapshot().visible, false);
  assert.deepEqual(controllerCalls.visible, [true, false, true, false, true, false, true, false]);

  assert.equal(node.onConfigure({saved: true}), "configure-result");
  assert.equal(controllerCalls.onExecuted.length, 0);
  const previewLocal = node[Symbol.for("comfyui-lux3d.viewer.preview-local-model")];
  assert.equal(typeof previewLocal, "function");
  previewLocal("https://assets.example/not-a-local-preview.glb");
  await Promise.resolve();
  assert.deepEqual(controllerCalls.onExecuted, []);
  const localMessage = {
    model_url: ["/comfy-prefix/view?filename=chair.ply&type=input&subfolder=lux3d"],
  };
  previewLocal(localMessage.model_url[0]);
  await Promise.resolve();
  assert.deepEqual(controllerCalls.onExecuted, [localMessage]);
  const message = {model_url: ["https://assets.example/model.glb"]};
  assert.equal(node.onExecuted(message), "executed-result");
  await Promise.resolve();
  assert.deepEqual(controllerCalls.onExecuted, [localMessage, message]);
  assert.equal(node.onResize([500, 500]), "resize-result");
  await Promise.resolve();
  assert.equal(controllerCalls.resize, 1);
  node.setSize([100, 500]);
  assert.deepEqual(node.size, [320, 500]);
  node.setSize([800, 100]);
  assert.deepEqual(node.size, [800, 360]);

  controller.resize = () => {
    throw new Error("synchronous resize failure");
  };
  assert.doesNotThrow(() => node.onResize([600, 600]));

  node.widgets[0].onRemove();
  node.onRemoved();
  await Promise.resolve();
  assert.equal(controllerCalls.dispose, 1);
  assert.equal(node[Symbol.for("comfyui-lux3d.viewer.preview-local-model")], undefined);
});

test("missing unresolved limits creates a named configuration error without calling the controller factory", async () => {
  const document = new FakeDocument();
  const app = makeApp();
  let factoryCalls = 0;
  registerLux3DViewerExtension({
    app,
    documentImpl: document,
    config: {},
    controllerFactory: () => {
      factoryCalls += 1;
    },
  });
  class ViewerNode extends FakeNode {}
  await app.extensions[0].beforeRegisterNodeDef(ViewerNode, {name: "Lux3DViewer"});
  const node = new ViewerNode();
  node.onNodeCreated();
  const host = node.widgets[0].element;
  assert.equal(factoryCalls, 0);
  assert.equal(host.dataset.viewerState, "error");
  assert.match(host.children[0].textContent, /^MISSING_MAX_RESIDENT_VIEWERS:/);
  node.onExecuted({model_url: ["https://assets.example/never-fetched.glb"]});
  assert.equal(factoryCalls, 0);
  node.widgets[0].onRemove();
});

test("fallback adapter loaders keep the GLB and Gaussian module URLs in their own argument slots", async () => {
  const document = new FakeDocument();
  const app = makeApp();
  let controllerOptions;
  registerLux3DViewerExtension({
    app,
    documentImpl: document,
    config: {
      maxAssetBytes: 1024,
      fetchTimeoutMs: 5000,
      maxResidentViewers: 2,
      residentLimitBehavior: "reject",
    },
    adapterModuleUrls: {
      glb: "data:text/javascript,export const adapterKind='glb'",
      gaussian: "data:text/javascript,export const adapterKind='gaussian'",
    },
    controllerFactory: (options) => {
      controllerOptions = options;
      return makeController({onExecuted: [], visible: [], resize: 0, dispose: 0});
    },
  });
  class ViewerNode extends FakeNode {}
  await app.extensions[0].beforeRegisterNodeDef(ViewerNode, {name: "Lux3DViewer"});
  const node = new ViewerNode();
  node.onNodeCreated();

  assert.equal((await controllerOptions.loadGlbAdapterModule()).adapterKind, "glb");
  assert.equal((await controllerOptions.loadGaussianPlyAdapterModule()).adapterKind, "gaussian");
  node.onRemoved();
  await Promise.resolve();
});

test("model URL edits clear stale content immediately and debounce one safe remote preview", async () => {
  const document = new FakeDocument();
  const app = makeApp();
  const controllerCalls = {
    onExecuted: [], sourceChanged: [], visible: [], resize: 0, dispose: 0,
  };
  const controller = makeController(controllerCalls);
  const timers = [];
  const setTimeoutImpl = (callback, delay) => {
    const timer = {callback, delay, cancelled: false};
    timers.push(timer);
    return timer;
  };
  const clearTimeoutImpl = (timer) => {
    timer.cancelled = true;
  };
  registerLux3DViewerExtension({
    app,
    documentImpl: document,
    config: {
      maxAssetBytes: 1024,
      fetchTimeoutMs: 5000,
      maxResidentViewers: 2,
      residentLimitBehavior: "reject",
      glbVisualConfig: {exposure: 1},
    },
    controllerFactory: () => controller,
    setTimeoutImpl,
    clearTimeoutImpl,
    livePreviewDebounceMs: 500,
  });

  class EditableViewerNode extends FakeNode {
    constructor() {
      super();
      this.inputs = [{name: "model_url", link: null}];
      this.modelWidget = {
        name: "model_url",
        value: "",
        callback(value) {
          this.value = value;
        },
      };
      this.widgets.push(this.modelWidget);
    }
  }
  await app.extensions[0].beforeRegisterNodeDef(EditableViewerNode, {name: "Lux3DViewer"});
  const node = new EditableViewerNode();
  node.onNodeCreated();

  node.modelWidget.callback("https://qhsmodel.kujiale.com/lux3dPbrEmbedResult/");
  assert.deepEqual(controllerCalls.sourceChanged, [
    ["https://qhsmodel.kujiale.com/lux3dPbrEmbedResult/", null],
  ]);
  assert.equal(controllerCalls.onExecuted.length, 0);
  assert.equal(timers[0].delay, 500);

  const modelUrl = "https://qhsmodel.kujiale.com/lux3dPbrEmbedResult/7eb388cb00514290baae23bbcf1b7e1c/textured.glb";
  node.modelWidget.callback(modelUrl);
  assert.equal(timers[0].cancelled, true);
  assert.deepEqual(controllerCalls.sourceChanged.at(-1), [modelUrl, null]);
  timers[1].callback();
  await Promise.resolve();
  assert.deepEqual(controllerCalls.onExecuted, [{model_url: [modelUrl]}]);

  node.modelWidget.callback("https://assets.example/model.obj");
  timers[2].callback();
  assert.deepEqual(controllerCalls.sourceChanged.at(-1), [
    "https://assets.example/model.obj",
    "INVALID_MODEL_URL",
  ]);
  assert.equal(controllerCalls.onExecuted.length, 1);

  node.modelWidget.callback("lux3d/local.ply");
  timers[3].callback();
  assert.deepEqual(controllerCalls.sourceChanged.at(-1), [
    "lux3d/local.ply",
    "LOCAL_MODEL_REQUIRES_EXECUTION",
  ]);

  node.modelWidget.callback("https://assets.example/pending.glb");
  node.inputs[0].link = 71;
  node.onConnectionsChange();
  assert.equal(timers[4].cancelled, true);
  assert.deepEqual(controllerCalls.sourceChanged.at(-1), ["", null]);

  node.onRemoved();
  await Promise.resolve();
  assert.equal(controllerCalls.dispose, 1);
});

test("DOM draws observe direct widget edits once and accept authoritative local or executed sources", async () => {
  const document = new FakeDocument();
  const app = makeApp();
  const controllerCalls = {
    onExecuted: [], sourceChanged: [], visible: [], resize: 0, dispose: 0,
  };
  const controller = makeController(controllerCalls);
  const timers = [];
  const setTimeoutImpl = (callback, delay) => {
    const timer = {callback, delay, cancelled: false};
    timers.push(timer);
    return timer;
  };
  const clearTimeoutImpl = (timer) => {
    timer.cancelled = true;
  };
  registerLux3DViewerExtension({
    app,
    documentImpl: document,
    config: {
      maxAssetBytes: 1024,
      fetchTimeoutMs: 5000,
      maxResidentViewers: 2,
      residentLimitBehavior: "reject",
      glbVisualConfig: {exposure: 1},
    },
    controllerFactory: () => controller,
    setTimeoutImpl,
    clearTimeoutImpl,
    livePreviewDebounceMs: 500,
  });

  class DirectEditViewerNode extends FakeNode {
    constructor() {
      super();
      this.inputs = [{name: "model_url", link: null}];
      this.modelWidget = {name: "model_url", value: "", callback() {}};
      this.widgets.push(this.modelWidget);
    }
  }
  await app.extensions[0].beforeRegisterNodeDef(DirectEditViewerNode, {name: "Lux3DViewer"});
  const node = new DirectEditViewerNode();
  node.onNodeCreated();
  const viewerWidget = node.widgets.find((widget) => widget.name === "lux3d_viewer");

  const remoteUrl = "https://qhsmodel.kujiale.com/lux3dPbrEmbedResult/7eb388cb00514290baae23bbcf1b7e1c/textured.glb";
  node.modelWidget.value = remoteUrl;
  viewerWidget.options.onDraw();
  assert.deepEqual(controllerCalls.sourceChanged, [[remoteUrl, null]]);
  assert.equal(timers.length, 1);
  viewerWidget.options.onDraw();
  viewerWidget.options.onDraw();
  assert.equal(controllerCalls.sourceChanged.length, 1);
  assert.equal(timers.length, 1);
  timers[0].callback();
  await Promise.resolve();
  assert.deepEqual(controllerCalls.onExecuted, [{model_url: [remoteUrl]}]);
  viewerWidget.options.onDraw();
  assert.equal(timers.length, 1);
  assert.equal(controllerCalls.onExecuted.length, 1);

  const localPreviewUrl = "/api/view?filename=chair.ply&type=input&subfolder=lux3d";
  node.modelWidget.value = "lux3d/chair.ply";
  node[Symbol.for("comfyui-lux3d.viewer.preview-local-model")](localPreviewUrl);
  await Promise.resolve();
  viewerWidget.options.onDraw();
  assert.equal(controllerCalls.sourceChanged.length, 1);
  assert.equal(timers.length, 1);
  assert.deepEqual(controllerCalls.onExecuted.at(-1), {model_url: [localPreviewUrl]});

  const executedUrl = "https://assets.example/executed.glb";
  node.modelWidget.value = executedUrl;
  node.onExecuted({model_url: [executedUrl]});
  await Promise.resolve();
  viewerWidget.options.onDraw();
  assert.equal(controllerCalls.sourceChanged.length, 1);
  assert.equal(timers.length, 1);

  node.modelWidget.value = "https://assets.example/connected.glb";
  node.inputs[0].link = 71;
  node.onConnectionsChange();
  assert.deepEqual(controllerCalls.sourceChanged.at(-1), ["", null]);
  const changedCount = controllerCalls.sourceChanged.length;
  viewerWidget.options.onDraw();
  assert.equal(controllerCalls.sourceChanged.length, changedCount);
  assert.equal(timers.length, 1);

  node.onRemoved();
  await Promise.resolve();
  assert.equal(controllerCalls.dispose, 1);
});

test("thin Comfy entry only resolves local lazy bundles relative to import.meta.url", async () => {
  const source = await readFile(new URL("../../js/lux3d_runtime.js", import.meta.url), "utf8");
  assert.match(source, /new URL\(\s*"\.\/assets\/lux3d-viewer-controller\.mjs"/);
  assert.match(source, /controllerBundleUrl\.searchParams\.set\("v", cacheToken\)/);
  assert.match(source, /new URL\(\s*"\.\/assets\/lux3d-input-source-extension\.mjs"/);
  assert.match(source, /registerLux3DInputSourceExtension\(\{app, api\}\)/);
  assert.match(source, /new URL\("\.\/assets\/lux3d-glb-adapter\.mjs", import\.meta\.url\)/);
  assert.match(source, /new URL\("\.\/assets\/lux3d-gaussian-adapter\.mjs", import\.meta\.url\)/);
  assert.match(source, /import\(controllerBundleUrl\.href\)/);
  assert.match(source, /await import\(controllerBundleUrl\.href\)/);
  assert.match(source, /maxAssetBytes:\s*256\s*\*\s*1024\s*\*\s*1024/);
  assert.match(source, /fetchTimeoutMs:\s*120_000/);
  assert.match(source, /maxResidentViewers:\s*2/);
  assert.match(source, /residentLimitBehavior:\s*"reject"/);
  assert.match(source, /environment:\s*"legacy"/);
  assert.match(source, /exposure:\s*0\.95/);
  assert.match(source, /toneMapping:\s*"Neutral"/);
  assert.match(source, /clearColor:\s*0x000000/);
  assert.match(source, /assetBaseUrl:\s*globalThis\.document\?\.baseURI/);
  assert.doesNotMatch(source, /__LUX3D_VIEWER_CONFIG__/);
  assert.doesNotMatch(source, /iframe|postMessage|createGlbAdapter|createGaussianPlyAdapter/);
});

function makeApp() {
  return {
    extensions: [],
    graph: {dirtyCalls: 0, setDirtyCanvas() { this.dirtyCalls += 1; }},
    registerExtension(extension) {
      this.extensions.push(extension);
    },
  };
}

function makeController(calls) {
  let visible = false;
  return {
    onExecuted: async (message) => {
      calls.onExecuted.push(message);
    },
    onSourceChanged: async (value, errorCode = null) => {
      calls.sourceChanged?.push([value, errorCode]);
    },
    resize: async () => {
      calls.resize += 1;
    },
    setVisible: async (nextVisible) => {
      calls.visible.push(nextVisible);
      visible = Boolean(nextVisible);
    },
    getSnapshot: () => ({visible}),
    dispose: async () => {
      calls.dispose += 1;
    },
  };
}

class FakeNode {
  constructor() {
    this.widgets = [];
    this.size = [100, 100];
    this.originalCalls = [];
  }

  onNodeCreated() {
    this.originalCalls.push("created");
    return "created-result";
  }

  onConfigure() {
    this.originalCalls.push("configure");
    return "configure-result";
  }

  onExecuted() {
    this.originalCalls.push("executed");
    return "executed-result";
  }

  onResize() {
    this.originalCalls.push("resize");
    return "resize-result";
  }

  onRemoved() {
    this.originalCalls.push("removed");
    return "removed-result";
  }

  addDOMWidget(name, type, element, options) {
    const widget = {name, type, element, options, onRemove() {}};
    this.widgets.push(widget);
    return widget;
  }

  computeSize() {
    return [100, 360];
  }

  setSize(size) {
    this.size = size;
  }
}

class FakeDocument {
  createElement(tagName) {
    return new FakeElement(this, tagName);
  }
}

class FakeElement extends FakeEventTarget {
  constructor(ownerDocument, tagName) {
    super();
    this.ownerDocument = ownerDocument;
    this.tagName = tagName.toUpperCase();
    this.style = {};
    this.dataset = {};
    this.children = [];
    this.tabIndex = -1;
    this.removed = false;
  }

  append(...children) {
    this.children.push(...children);
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    this[name] = value;
  }

  focus() {}

  remove() {
    this.removed = true;
  }
}
