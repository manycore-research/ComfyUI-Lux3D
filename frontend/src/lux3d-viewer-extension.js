import {
  createLux3DViewerController,
  createResidentViewerPool,
  ViewerControllerError,
  VIEWER_MIN_VIEWPORT_SIZE,
} from "./viewer/controller.js";
import {installViewerEventBoundary} from "./viewer/comfy/event-boundary.js";

const NODE_NAME = "Lux3DViewer";
const VIEWER_WIDGET_NAME = "lux3d_viewer";
const VIEWER_WIDGET_MARGIN = 10;
const VIEWER_MIN_OUTER_SIZE = VIEWER_MIN_VIEWPORT_SIZE + VIEWER_WIDGET_MARGIN * 2;
const MODEL_URL_WIDGET_NAME = "model_url";
const LIVE_PREVIEW_DEBOUNCE_MS = 500;
const nodeControllers = new WeakMap();
const hookedNodeTypes = new WeakSet();
const LOCAL_MODEL_PREVIEW = Symbol.for("comfyui-lux3d.viewer.preview-local-model");

export function registerLux3DViewerExtension(options = {}) {
  const app = options.app;
  if (!app || typeof app.registerExtension !== "function") {
    throw new ViewerControllerError("MISSING_COMFY_APP", "Comfy app registration capability is unavailable");
  }
  const config = options.config ?? {};
  let residentPool;
  let configurationError = null;
  try {
    residentPool = createResidentViewerPool({
      maximum: config.maxResidentViewers,
      limitBehavior: config.residentLimitBehavior,
    });
    requireConfigInteger(config.maxAssetBytes, "MISSING_MAX_ASSET_BYTES");
    requireConfigInteger(config.fetchTimeoutMs, "MISSING_FETCH_TIMEOUT_MS");
  } catch (error) {
    configurationError = normalizePublicError(error);
    options.onConfigurationError?.(configurationError);
  }

  const extension = {
    name: "Lux.Lux3DViewer",
    async beforeRegisterNodeDef(nodeType, nodeData) {
      if (nodeData?.name !== NODE_NAME) return;
      installNodeHooks(nodeType, {
        ...options,
        app,
        config,
        residentPool,
        configurationError,
      });
    },
  };
  app.registerExtension(extension);
  return extension;
}

function installNodeHooks(nodeType, context) {
  const prototype = nodeType.prototype;
  if (hookedNodeTypes.has(nodeType)) return;
  hookedNodeTypes.add(nodeType);

  chainAfter(prototype, "onNodeCreated", function onViewerNodeCreated() {
    if (nodeControllers.has(this)) return;
    const document = context.documentImpl ?? globalThis.document;
    if (!document || typeof document.createElement !== "function") {
      throw new ViewerControllerError("MISSING_DOM_CAPABILITY", "Lux3DViewer requires a DOM document");
    }
    const host = createViewerHost(document);
    const boundaryDispose = installViewerEventBoundary(host);
    let controller;
    let livePreview = null;
    let widgetVisible = null;
    const updateWidgetVisibility = (nextVisible) => {
      const normalized = Boolean(nextVisible);
      widgetVisible = normalized;
      if (!controller || controller.getSnapshot?.().visible === normalized) return;
      settleImmediate(() => controller.setVisible(normalized));
    };
    const widget = this.addDOMWidget(VIEWER_WIDGET_NAME, "LUX3D_VIEWER", host, {
      serialize: false,
      hideOnZoom: false,
      margin: VIEWER_WIDGET_MARGIN,
      getMinHeight: () => VIEWER_MIN_OUTER_SIZE,
      onDraw: () => {
        updateWidgetVisibility(true);
        livePreview?.observe();
      },
      onHide: () => updateWidgetVisibility(false),
    });

    if (context.configurationError) {
      showHostError(host, context.configurationError);
      controller = createUnavailableController(host, boundaryDispose, context.configurationError);
    } else {
      const controllerFactory = context.controllerFactory ?? createLux3DViewerController;
      try {
        controller = controllerFactory({
          host,
          maxAssetBytes: context.config.maxAssetBytes,
          fetchTimeoutMs: context.config.fetchTimeoutMs,
          residentPool: context.residentPool,
          fetchImpl: context.fetchImpl,
          assetBaseUrl: context.assetBaseUrl,
          pagehideTarget: context.pagehideTarget,
          intersectionObserverFactory: context.intersectionObserverFactory,
          resizeObserverFactory: context.resizeObserverFactory,
          getDevicePixelRatio: context.getDevicePixelRatio,
          getReducedMotion: context.getReducedMotion,
          assetUrlResolver: context.assetUrlResolver,
          glbVisualConfig: context.config.glbVisualConfig,
          loadGlbAdapterModule: makeModuleLoader(
            context.loadGlbAdapterModule,
            context.adapterModuleUrls?.glb,
            "MISSING_GLB_ADAPTER_URL",
          ),
          loadGaussianPlyAdapterModule: makeModuleLoader(
            context.loadGaussianPlyAdapterModule,
            context.adapterModuleUrls?.gaussian,
            "MISSING_GAUSSIAN_ADAPTER_URL",
          ),
          disposeHostBoundary: boundaryDispose,
          onWarning: context.onWarning,
          onStateChange: () => context.app.graph?.setDirtyCanvas?.(true, true),
        });
      } catch (error) {
        const publicError = normalizePublicError(error);
        showHostError(host, publicError);
        controller = createUnavailableController(host, boundaryDispose, publicError);
      }
    }
    if (widgetVisible !== null) updateWidgetVisibility(widgetVisible);
    livePreview = installLiveRemotePreview(this, controller, context);
    const previewLocalModel = (url) => {
      if (!isSafeLocalPreviewUrl(url)) return;
      livePreview.acceptCurrent();
      livePreview.cancel();
      settle(() => controller.onExecuted({model_url: [url]}));
    };
    Object.defineProperty(this, LOCAL_MODEL_PREVIEW, {
      configurable: true,
      value: previewLocalModel,
    });
    nodeControllers.set(this, {controller, widget, host, previewLocalModel, livePreview});
    chainWidgetRemoval(widget, () => disposeNodeController(this));
    constrainNodeSize(this);
    context.app.graph?.setDirtyCanvas?.(true, true);
  });

  chainAfter(prototype, "onExecuted", function onViewerExecuted(message) {
    const entry = nodeControllers.get(this);
    if (entry) {
      entry.livePreview.acceptCurrent();
      entry.livePreview.cancel();
      settle(() => entry.controller.onExecuted(message));
    }
  });

  chainAfter(prototype, "onConnectionsChange", function onViewerConnectionsChange() {
    const entry = nodeControllers.get(this);
    if (!entry) return;
    entry.livePreview.acceptCurrent();
    if (!isModelSourceConnected(this)) return;
    entry.livePreview.cancel();
    settleImmediate(() => entry.controller.onSourceChanged?.(""));
  });

  chainAfter(prototype, "onResize", function onViewerResize() {
    const entry = nodeControllers.get(this);
    if (entry) settle(() => entry.controller.resize());
  });

  chainFinally(prototype, "onRemoved", function onViewerRemoved() {
    settle(() => disposeNodeController(this));
  });
}

function createViewerHost(document) {
  const host = document.createElement("div");
  host.className = "lux3d-viewer-host";
  host.tabIndex = 0;
  host.setAttribute("role", "application");
  host.style.width = "100%";
  host.style.height = "100%";
  host.style.boxSizing = "border-box";
  host.style.position = "relative";
  host.style.overflow = "hidden";
  host.style.borderRadius = "6px";
  host.style.background = "radial-gradient(circle at 50% 18%, rgba(86, 141, 227, 0.12), transparent 30%), linear-gradient(180deg, #050505 0%, #09090b 100%)";
  return host;
}

function constrainNodeSize(node) {
  if (typeof node.setSize !== "function") return;
  const originalSetSize = node.setSize;
  let minimumOuterHeight = 0;
  node.setSize = function setViewerNodeSize(size) {
    if (!Array.isArray(size) || size.length < 2) return originalSetSize.call(this, size);
    return originalSetSize.call(this, [
      Math.max(VIEWER_MIN_OUTER_SIZE, finiteOr(size[0], VIEWER_MIN_OUTER_SIZE)),
      Math.max(minimumOuterHeight, finiteOr(size[1], minimumOuterHeight)),
    ]);
  };
  const computed = typeof node.computeSize === "function" ? node.computeSize() : node.size;
  minimumOuterHeight = Math.max(VIEWER_MIN_OUTER_SIZE, finiteOr(computed?.[1], VIEWER_MIN_OUTER_SIZE));
  const current = node.size ?? computed ?? [VIEWER_MIN_OUTER_SIZE, minimumOuterHeight];
  node.setSize([
    Math.max(VIEWER_MIN_OUTER_SIZE, finiteOr(current[0], VIEWER_MIN_OUTER_SIZE)),
    Math.max(minimumOuterHeight, finiteOr(current[1], minimumOuterHeight)),
  ]);
}

function makeModuleLoader(injectedLoader, url, missingCode) {
  if (typeof injectedLoader === "function") return injectedLoader;
  return async () => {
    if (typeof url !== "string" || url === "") {
      throw new ViewerControllerError(missingCode, "adapter module URL was not explicitly provided");
    }
    return import(url);
  };
}

async function disposeNodeController(node) {
  const entry = nodeControllers.get(node);
  if (!entry) return;
  nodeControllers.delete(node);
  if (node[LOCAL_MODEL_PREVIEW] === entry.previewLocalModel) {
    delete node[LOCAL_MODEL_PREVIEW];
  }
  entry.livePreview.dispose();
  await entry.controller.dispose();
}

function installLiveRemotePreview(node, controller, context) {
  const sourceWidget = node.widgets?.find((widget) => widget?.name === MODEL_URL_WIDGET_NAME);
  const setTimeoutImpl = context.setTimeoutImpl ?? globalThis.setTimeout;
  const clearTimeoutImpl = context.clearTimeoutImpl ?? globalThis.clearTimeout;
  const configuredDelay = context.livePreviewDebounceMs ?? LIVE_PREVIEW_DEBOUNCE_MS;
  if (!sourceWidget || typeof setTimeoutImpl !== "function" || typeof clearTimeoutImpl !== "function"
      || !Number.isFinite(configuredDelay) || configuredDelay < 0
      || typeof controller.onSourceChanged !== "function") {
    return Object.freeze({acceptCurrent() {}, cancel() {}, dispose() {}, observe() {}});
  }

  const originalCallback = sourceWidget.callback;
  let timer = null;
  let disposed = false;
  let lastObservedValue = sourceWidget.value;
  const cancel = () => {
    if (timer !== null) clearTimeoutImpl(timer);
    timer = null;
  };
  const changed = (rawValue) => {
    if (disposed || isModelSourceConnected(node)) return;
    cancel();
    const source = typeof rawValue === "string" ? rawValue.trim() : "";
    settleImmediate(() => controller.onSourceChanged(source));
    if (source === "") return;
    timer = setTimeoutImpl(() => {
      timer = null;
      if (disposed || isModelSourceConnected(node)) return;
      const classification = classifyLivePreviewSource(source);
      if (classification === "remote") {
        settle(() => controller.onExecuted({model_url: [source]}));
      } else {
        const code = classification === "local"
          ? "LOCAL_MODEL_REQUIRES_EXECUTION"
          : "INVALID_MODEL_URL";
        settleImmediate(() => controller.onSourceChanged(source, code));
      }
    }, configuredDelay);
  };
  const wrappedCallback = function lux3dViewerLivePreviewCallback(...args) {
    const result = originalCallback?.apply(this, args);
    const nextValue = typeof args[0] === "string" ? args[0] : sourceWidget.value;
    lastObservedValue = sourceWidget.value;
    changed(nextValue);
    return result;
  };
  sourceWidget.callback = wrappedCallback;

  return Object.freeze({
    acceptCurrent() {
      lastObservedValue = sourceWidget.value;
    },
    cancel,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancel();
      if (sourceWidget.callback === wrappedCallback) sourceWidget.callback = originalCallback;
    },
    observe() {
      if (disposed || Object.is(sourceWidget.value, lastObservedValue)) return;
      lastObservedValue = sourceWidget.value;
      changed(sourceWidget.value);
    },
  });
}

function classifyLivePreviewSource(source) {
  let parsed;
  try {
    parsed = new URL(source);
  } catch {
    return looksLikeLocalModelPath(source) ? "local" : "invalid";
  }
  if (!["http:", "https:"].includes(parsed.protocol)
      || parsed.username !== "" || parsed.password !== "" || parsed.hash !== "") {
    return "invalid";
  }
  return /\.(?:glb|ply)$/i.test(parsed.pathname) ? "remote" : "invalid";
}

function looksLikeLocalModelPath(source) {
  if (source.startsWith("//") || /[?#\0-\x1f\x7f]/.test(source)) return false;
  if (/^[a-z][a-z\d+.-]*:/i.test(source)
      && !/^[a-z]:[\\/]/i.test(source)) return false;
  return /\.(?:glb|ply)(?: \[(?:input|output|temp)\])?$/i.test(source);
}

function isModelSourceConnected(node) {
  const input = node.inputs?.find((candidate) => candidate?.name === MODEL_URL_WIDGET_NAME);
  return input?.link !== null && input?.link !== undefined
    || Array.isArray(input?.links) && input.links.length > 0;
}

function chainWidgetRemoval(widget, cleanup) {
  const original = widget.onRemove;
  widget.onRemove = function removeViewerWidget(...args) {
    try {
      return original?.apply(this, args);
    } finally {
      settle(cleanup);
    }
  };
}

function chainAfter(prototype, name, after) {
  const original = prototype[name];
  prototype[name] = function chainedViewerHook(...args) {
    const result = original?.apply(this, args);
    after.apply(this, args);
    return result;
  };
}

function chainFinally(prototype, name, after) {
  const original = prototype[name];
  prototype[name] = function chainedViewerFinalizer(...args) {
    try {
      return original?.apply(this, args);
    } finally {
      after.apply(this, args);
    }
  };
}

function createUnavailableController(host, boundaryDispose, error) {
  let disposed = false;
  let visible = false;
  const snapshot = () => Object.freeze({state: disposed ? "disposed" : "error", visible, error});
  return Object.freeze({
    onExecuted: async () => snapshot(),
    onSourceChanged: async () => snapshot(),
    resize: async () => snapshot(),
    reset: async () => snapshot(),
    setVisible: async (nextVisible) => {
      visible = Boolean(nextVisible);
      return snapshot();
    },
    async dispose() {
      if (!disposed) {
        disposed = true;
        boundaryDispose();
        host.remove?.();
      }
      return snapshot();
    },
    getSnapshot: snapshot,
  });
}

function showHostError(host, error) {
  const document = host.ownerDocument ?? globalThis.document;
  const status = document.createElement("div");
  status.className = "lux3d-viewer-status lux3d-viewer-error";
  Object.assign(status.style, {
    position: "absolute",
    left: "8px",
    top: "8px",
    right: "8px",
    zIndex: "2",
  });
  status.textContent = `${error.code}: ${error.message}`;
  host.append(status);
  host.dataset.viewerState = "error";
}

function normalizePublicError(error) {
  if (error instanceof ViewerControllerError) {
    const prefix = `${error.code}: `;
    return Object.freeze({
      code: error.code,
      message: error.message.startsWith(prefix) ? error.message.slice(prefix.length) : error.message,
    });
  }
  return Object.freeze({code: "VIEWER_CONFIGURATION_FAILED", message: "viewer configuration failed"});
}

function requireConfigInteger(value, code) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ViewerControllerError(code, "a positive safe integer configuration value is required");
  }
}

function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function isSafeLocalPreviewUrl(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return false;
  try {
    const parsed = new URL(value, "http://lux3d.local");
    if (parsed.origin !== "http://lux3d.local" || !parsed.pathname.endsWith("/view") || parsed.hash) {
      return false;
    }
    const keys = [...parsed.searchParams.keys()];
    if (keys.length !== 3 || new Set(keys).size !== 3
        || !keys.includes("filename") || !keys.includes("type") || !keys.includes("subfolder")) {
      return false;
    }
    const name = parsed.searchParams.get("filename");
    const type = parsed.searchParams.get("type");
    const subfolder = parsed.searchParams.get("subfolder");
    if (!name || name.includes("..") || name.includes("/") || name.includes("\\")
        || /[\0-\x1f\x7f]/.test(name) || !/\.(?:glb|ply)$/i.test(name)) {
      return false;
    }
    if (!["input", "output", "temp"].includes(type)) return false;
    if (subfolder === null || subfolder.includes("\\") || /[\0-\x1f\x7f]/.test(subfolder)) {
      return false;
    }
    return subfolder === "" || subfolder.split("/").every((segment) => (
      segment !== "" && segment !== "." && !segment.includes("..")
    ));
  } catch {
    return false;
  }
}

function settle(operation) {
  Promise.resolve().then(operation).catch(() => {});
}

function settleImmediate(operation) {
  try {
    Promise.resolve(operation()).catch(() => {});
  } catch {
    // Comfy visibility hooks must not fail the canvas draw loop.
  }
}
