import {
  downloadAsset,
  sanitizeAssetUrl,
  validateHttpAssetUrl,
  ViewerDownloadError,
} from "./download.js";
import {parseGaussianPly, GaussianPlyValidationError} from "./format/gaussian-ply.js";
import {parseGlbContract, GlbContractError} from "./format/glb-contract.js";

export const VIEWER_MIN_VIEWPORT_SIZE = 300;
const REUSABLE_EXECUTION_STATES = new Set([
  "waiting-visible",
  "fetching",
  "validating",
  "building",
  "ready",
  "suspended",
]);

export class ViewerControllerError extends Error {
  constructor(code, message, details = {}) {
    super(`${code}: ${message}`);
    this.name = "ViewerControllerError";
    this.code = code;
    this.details = Object.freeze({...details});
  }
}

export function createResidentViewerPool(options = {}) {
  const maximum = options.maximum;
  if (!Number.isSafeInteger(maximum) || maximum <= 0) {
    throw controllerError("MISSING_MAX_RESIDENT_VIEWERS", "a positive safe integer resident limit is required");
  }
  if (options.limitBehavior !== "reject") {
    throw controllerError(
      "MISSING_RESIDENT_LIMIT_BEHAVIOR",
      "an explicit supported resident-limit behavior is required",
    );
  }
  const owners = new Set();
  return Object.freeze({
    get activeCount() {
      return owners.size;
    },
    get maximum() {
      return maximum;
    },
    acquire(owner) {
      if (owners.has(owner)) throw controllerError("DUPLICATE_RESIDENT_LEASE", "viewer already owns a resident lease");
      if (owners.size >= maximum) {
        throw controllerError("RESIDENT_VIEWER_LIMIT", `configured resident viewer limit ${maximum} is reached`);
      }
      owners.add(owner);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        owners.delete(owner);
      };
    },
  });
}

export function createLux3DViewerController(options = {}) {
  const host = requireHost(options.host);
  const maxAssetBytes = requireConfigInteger(options.maxAssetBytes, "MISSING_MAX_ASSET_BYTES");
  const fetchTimeoutMs = requireConfigInteger(options.fetchTimeoutMs, "MISSING_FETCH_TIMEOUT_MS");
  const residentPool = requireResidentPool(options.residentPool);
  const pagehideTarget = options.pagehideTarget ?? globalThis.window;
  if (!pagehideTarget || typeof pagehideTarget.addEventListener !== "function"
    || typeof pagehideTarget.removeEventListener !== "function") {
    throw controllerError("MISSING_PAGEHIDE_CAPABILITY", "pagehide EventTarget is unavailable");
  }
  const loadGlbAdapterModule = options.loadGlbAdapterModule
    ?? (() => import("./adapters/glb-adapter.js"));
  const loadGaussianPlyAdapterModule = options.loadGaussianPlyAdapterModule
    ?? (() => import("./adapters/gaussian-ply-adapter.js"));
  const ui = options.ui ?? createDefaultControllerUi(host);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const assetBaseUrl = options.assetBaseUrl ?? globalThis.location?.href;
  const getDevicePixelRatio = options.getDevicePixelRatio
    ?? (() => globalThis.devicePixelRatio ?? 1);
  const getReducedMotion = options.getReducedMotion
    ?? (() => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false);

  let state = "idle";
  let generation = 0;
  let visible = false;
  let currentUrl = null;
  let currentSanitizedUrl = null;
  let currentError = null;
  let activeAbortController = null;
  let adapter = null;
  let releaseResidentLease = null;
  let loadingGeneration = null;
  let disposalBarrier = Promise.resolve();
  let visibilityTask = Promise.resolve();
  let terminalDisposePromise = null;

  const intersectionObserver = createObserver(
    options.intersectionObserverFactory,
    "IntersectionObserver",
    (entries) => {
      const entry = entries.find((candidate) => candidate.target === host) ?? entries[0];
      if (entry) {
        const layoutVisible = inferHostLayoutVisibility(host);
        void setVisible(Boolean(entry.isIntersecting) || layoutVisible === true);
      }
    },
  );
  const resizeObserver = createObserver(
    options.resizeObserverFactory,
    "ResizeObserver",
    () => {
      promoteHostLayoutVisibility();
      void resize();
    },
  );

  intersectionObserver.observe(host);
  resizeObserver.observe(host);
  const onPageHide = () => {
    void dispose();
  };
  const visibilityTarget = host.ownerDocument;
  const onDocumentVisibilityChange = () => {
    if (visibilityTarget?.visibilityState === "hidden") {
      void setVisible(false);
    } else {
      promoteHostLayoutVisibility();
    }
  };
  pagehideTarget.addEventListener("pagehide", onPageHide, {once: true});
  if (supportsEventTarget(visibilityTarget)) {
    visibilityTarget.addEventListener("visibilitychange", onDocumentVisibilityChange);
  }
  setState("idle");

  function onExecuted(message) {
    if (terminalDisposePromise) {
      return Promise.reject(controllerError("VIEWER_DISPOSED", "disposed viewer cannot execute again"));
    }
    let nextUrl;
    try {
      nextUrl = extractExecutedUrl(message);
    } catch (error) {
      setState("error", normalizeError(error));
      return Promise.resolve(getSnapshot());
    }
    let sourceLinkUrl = null;
    try {
      sourceLinkUrl = validateHttpAssetUrl(nextUrl, assetBaseUrl).href;
    } catch {
      // The download path reports the named protocol/URL error after old resources are released.
    }
    ui.setSourceLink?.(sourceLinkUrl);
    if (nextUrl === currentUrl && REUSABLE_EXECUTION_STATES.has(state)) {
      return Promise.resolve(getSnapshot());
    }

    const nextGeneration = ++generation;
    promoteHostLayoutVisibility();
    currentUrl = nextUrl;
    currentSanitizedUrl = sanitizeAssetUrl(nextUrl, assetBaseUrl);
    activeAbortController?.abort();
    activeAbortController = null;
    loadingGeneration = null;
    const releasePromise = detachAndDisposeAdapter();
    disposalBarrier = Promise.allSettled([disposalBarrier, releasePromise]).then((results) => {
      const failures = results.flatMap((result) => result.status === "rejected" ? [result.reason] : []);
      if (failures.length) throw new AggregateError(failures, "viewer generation disposal failed");
    });
    setState("disposing");

    return disposalBarrier.then(async () => {
      if (nextGeneration !== generation || terminalDisposePromise) return getSnapshot();
      if (visible) return loadGeneration(nextGeneration, nextUrl);
      setState("waiting-visible");
      return getSnapshot();
    }).catch((error) => handleGenerationError(nextGeneration, error));
  }

  function onSourceChanged(value, errorCode = null) {
    if (terminalDisposePromise) return terminalDisposePromise;
    const source = typeof value === "string" ? value.trim() : "";
    const nextGeneration = ++generation;
    activeAbortController?.abort();
    activeAbortController = null;
    loadingGeneration = null;
    currentUrl = null;
    currentSanitizedUrl = source === "" ? null : sanitizeAssetUrl(source, assetBaseUrl);
    let sourceLinkUrl = null;
    try {
      sourceLinkUrl = source === "" ? null : validateHttpAssetUrl(source, assetBaseUrl).href;
    } catch {
      // Invalid and local text sources are resolved only by a queued node execution.
    }
    ui.setSourceLink?.(sourceLinkUrl);

    const releasePromise = detachAndDisposeAdapter();
    disposalBarrier = Promise.allSettled([disposalBarrier, releasePromise]).then((results) => {
      const failures = results.flatMap((result) => result.status === "rejected" ? [result.reason] : []);
      if (failures.length) throw new AggregateError(failures, "viewer source-change disposal failed");
    });
    if (source === "") {
      setState("idle");
    } else if (errorCode !== null) {
      setState("error", sourceInputError(errorCode));
    } else {
      setState("loading");
    }
    return disposalBarrier.then(() => getSnapshot()).catch((error) => (
      handleGenerationError(nextGeneration, error)
    ));
  }

  function setVisible(nextVisible) {
    if (terminalDisposePromise) return terminalDisposePromise;
    const normalized = Boolean(nextVisible);
    if (visible === normalized) return visibilityTask.then(() => getSnapshot());
    visible = normalized;
    visibilityTask = visibilityTask.then(async () => {
      const operationGeneration = generation;
      try {
        if (terminalDisposePromise) return;
        if (state === "waiting-visible" && visible && currentUrl !== null) {
          await loadGeneration(operationGeneration, currentUrl);
          return;
        }
        const currentAdapter = adapter;
        if (!currentAdapter) return;
        if (!visible && state === "ready") {
          await invokeAdapter(currentAdapter, "suspend");
          if (adapter === currentAdapter && generation === operationGeneration) setState("suspended");
        } else if (visible && state === "suspended") {
          await invokeAdapter(currentAdapter, "resume");
          if (adapter === currentAdapter && generation === operationGeneration) setState("ready");
        }
      } catch (error) {
        await handleGenerationError(operationGeneration, error);
      }
    });
    return visibilityTask;
  }

  function promoteHostLayoutVisibility() {
    if (inferHostLayoutVisibility(host) === true) void setVisible(true);
  }

  async function loadGeneration(targetGeneration, url) {
    if (loadingGeneration === targetGeneration || targetGeneration !== generation || terminalDisposePromise) {
      return getSnapshot();
    }
    loadingGeneration = targetGeneration;
    const abortController = new AbortController();
    activeAbortController = abortController;
    try {
      setState("fetching");
      const downloaded = await downloadAsset(url, {
        fetchImpl,
        maxAssetBytes,
        timeoutMs: fetchTimeoutMs,
        signal: abortController.signal,
        baseUrl: assetBaseUrl,
      });
      assertCurrentGeneration(targetGeneration);
      currentSanitizedUrl = downloaded.sanitizedUrl;
      setState("validating");
      const detected = validateDownloadedAsset(downloaded.arrayBuffer, maxAssetBytes, options.onWarning);
      assertCurrentGeneration(targetGeneration);
      setState("building");
      const module = await (detected.format === "glb"
        ? loadGlbAdapterModule()
        : loadGaussianPlyAdapterModule());
      assertCurrentGeneration(targetGeneration);
      const factoryName = detected.format === "glb" ? "createGlbAdapter" : "createGaussianPlyAdapter";
      const factory = module?.[factoryName];
      if (typeof factory !== "function") {
        throw controllerError("MISSING_ADAPTER_FACTORY", `${factoryName} is unavailable`);
      }

      const leaseOwner = Object.freeze({targetGeneration});
      const releaseLease = residentPool.acquire(leaseOwner);
      let builtAdapter;
      try {
        builtAdapter = await factory({
          host,
          arrayBuffer: downloaded.arrayBuffer,
          validation: detected.validation,
          viewport: readViewport(),
          reducedMotion: Boolean(getReducedMotion()),
          assetUrlResolver: options.assetUrlResolver,
          ...(detected.format === "glb" ? {visualConfig: options.glbVisualConfig} : {}),
        });
        validateAdapter(builtAdapter);
      } catch (error) {
        let cleanupError = null;
        try {
          if (typeof builtAdapter?.dispose === "function") {
            await invokeAdapter(builtAdapter, "dispose");
          }
        } catch (caught) {
          cleanupError = caught;
        } finally {
          releaseLease();
        }
        if (cleanupError) {
          throw new AggregateError([error, cleanupError], "adapter validation and cleanup failed");
        }
        throw error;
      }
      if (targetGeneration !== generation || terminalDisposePromise) {
        try {
          await invokeAdapter(builtAdapter, "dispose");
        } finally {
          releaseLease();
        }
        return getSnapshot();
      }
      adapter = builtAdapter;
      releaseResidentLease = releaseLease;
      await invokeAdapter(builtAdapter, "resize", readViewport());
      if (!visible) {
        await invokeAdapter(builtAdapter, "suspend");
        if (adapter === builtAdapter && generation === targetGeneration) setState("suspended");
      } else if (adapter === builtAdapter && generation === targetGeneration) {
        setState("ready");
      }
      return getSnapshot();
    } catch (error) {
      return handleGenerationError(targetGeneration, error);
    } finally {
      if (activeAbortController === abortController) activeAbortController = null;
      if (loadingGeneration === targetGeneration) loadingGeneration = null;
    }
  }

  function resize() {
    const currentAdapter = adapter;
    const currentGeneration = generation;
    if (!currentAdapter || terminalDisposePromise) return Promise.resolve(getSnapshot());
    return Promise.resolve()
      .then(() => invokeAdapter(currentAdapter, "resize", readViewport()))
      .then(() => getSnapshot())
      .catch((error) => handleGenerationError(currentGeneration, error));
  }

  function reset() {
    const currentAdapter = adapter;
    const currentGeneration = generation;
    if (!currentAdapter || terminalDisposePromise) return Promise.resolve(getSnapshot());
    return Promise.resolve()
      .then(() => invokeAdapter(currentAdapter, "reset"))
      .then(() => getSnapshot())
      .catch((error) => handleGenerationError(currentGeneration, error));
  }

  function dispose() {
    if (terminalDisposePromise) return terminalDisposePromise;
    const disposeGeneration = ++generation;
    activeAbortController?.abort();
    activeAbortController = null;
    loadingGeneration = null;
    intersectionObserver.disconnect();
    resizeObserver.disconnect();
    pagehideTarget.removeEventListener("pagehide", onPageHide, {once: true});
    if (supportsEventTarget(visibilityTarget)) {
      visibilityTarget.removeEventListener("visibilitychange", onDocumentVisibilityChange);
    }
    options.disposeHostBoundary?.();
    setState("disposing");
    const releasePromise = detachAndDisposeAdapter();
    disposalBarrier = Promise.allSettled([disposalBarrier, releasePromise]).then((results) => {
      const failures = results.flatMap((result) => result.status === "rejected" ? [result.reason] : []);
      if (failures.length) throw new AggregateError(failures, "viewer terminal disposal failed");
    });
    terminalDisposePromise = disposalBarrier.then(() => {
      if (generation === disposeGeneration) setState("disposed");
      host.remove?.();
      return getSnapshot();
    }).catch((error) => {
      setState("disposed", normalizeError(error));
      host.remove?.();
      return getSnapshot();
    });
    return terminalDisposePromise;
  }

  function detachAndDisposeAdapter() {
    const oldAdapter = adapter;
    const oldRelease = releaseResidentLease;
    adapter = null;
    releaseResidentLease = null;
    return Promise.resolve()
      .then(() => oldAdapter ? invokeAdapter(oldAdapter, "dispose") : undefined)
      .finally(() => oldRelease?.());
  }

  async function handleGenerationError(targetGeneration, error) {
    if (targetGeneration !== generation || terminalDisposePromise) return getSnapshot();
    const normalized = normalizeError(error);
    const releasePromise = detachAndDisposeAdapter();
    disposalBarrier = Promise.allSettled([disposalBarrier, releasePromise]).then((results) => {
      const failures = results.flatMap((result) => result.status === "rejected" ? [result.reason] : []);
      if (failures.length) throw new AggregateError(failures, "failed viewer generation cleanup failed");
    });
    try {
      await disposalBarrier;
    } catch {
      // Preserve the initiating operation error; a subsequent generation will observe the failed barrier.
    }
    if (targetGeneration !== generation || terminalDisposePromise) return getSnapshot();
    setState("error", normalized);
    return getSnapshot();
  }

  function assertCurrentGeneration(targetGeneration) {
    if (targetGeneration !== generation || terminalDisposePromise) {
      throw controllerError("STALE_GENERATION", "viewer generation was superseded");
    }
  }

  function readViewport() {
    const rect = host.getBoundingClientRect?.();
    const width = Math.max(VIEWER_MIN_VIEWPORT_SIZE, finiteDimension(host.clientWidth ?? rect?.width));
    const height = Math.max(VIEWER_MIN_VIEWPORT_SIZE, finiteDimension(host.clientHeight ?? rect?.height));
    const dpr = Number(getDevicePixelRatio());
    if (!Number.isFinite(dpr) || dpr <= 0) {
      throw controllerError("INVALID_DEVICE_PIXEL_RATIO", "device pixel ratio must be finite and positive");
    }
    return Object.freeze({width, height, dpr});
  }

  function setState(nextState, error = null) {
    state = nextState;
    currentError = error;
    const snapshot = getSnapshot();
    try {
      ui.setState?.(snapshot);
      options.onStateChange?.(snapshot);
    } catch {
      // Consumer UI callbacks cannot invalidate resource ownership transitions.
    }
  }

  function getSnapshot() {
    return Object.freeze({
      state,
      generation,
      visible,
      asset: currentSanitizedUrl,
      error: currentError,
    });
  }

  return Object.freeze({
    onExecuted,
    onSourceChanged,
    setVisible,
    resize,
    reset,
    dispose,
    getSnapshot,
  });
}

function validateDownloadedAsset(arrayBuffer, maxAssetBytes, onWarning) {
  const bytes = new Uint8Array(arrayBuffer);
  if (bytes.length >= 4 && bytes[0] === 0x67 && bytes[1] === 0x6c
    && bytes[2] === 0x54 && bytes[3] === 0x46) {
    return {
      format: "glb",
      validation: parseGlbContract(arrayBuffer, {maxAssetBytes, onWarning}),
    };
  }
  if (bytes.length >= 3 && bytes[0] === 0x70 && bytes[1] === 0x6c && bytes[2] === 0x79) {
    return {format: "gaussian-ply", validation: parseGaussianPly(arrayBuffer)};
  }
  throw controllerError("UNSUPPORTED_ASSET_FORMAT", "asset content is neither GLB 2 nor G1 Gaussian PLY");
}

function extractExecutedUrl(message) {
  const value = Array.isArray(message?.model_url) ? message.model_url[0] : undefined;
  if (typeof value !== "string" || value.trim() === "") {
    throw controllerError("INVALID_EXECUTION_PAYLOAD", "onExecuted requires ui.model_url[0] as a non-empty string");
  }
  return value;
}

function sourceInputError(code) {
  if (code === "INVALID_MODEL_URL") {
    return Object.freeze({
      code,
      message: "model URL must be an HTTP(S) .glb or .ply URL",
    });
  }
  if (code === "LOCAL_MODEL_REQUIRES_EXECUTION") {
    return Object.freeze({
      code,
      message: "run the workflow to resolve a typed local model path",
    });
  }
  return Object.freeze({
    code: "INVALID_MODEL_SOURCE",
    message: "model source is invalid",
  });
}

function validateAdapter(value) {
  if (!value || typeof value !== "object") throw controllerError("INVALID_ADAPTER", "adapter factory returned no adapter");
  for (const method of ["resize", "reset", "suspend", "resume", "dispose"]) {
    if (typeof value[method] !== "function") {
      throw controllerError("INVALID_ADAPTER", `adapter is missing ${method}()`);
    }
  }
}

async function invokeAdapter(adapter, method, argument) {
  return argument === undefined ? adapter[method]() : adapter[method](argument);
}

function createObserver(factory, name, callback) {
  let observer;
  if (typeof factory === "function") {
    observer = factory(callback);
  } else {
    const Constructor = globalThis[name];
    if (typeof Constructor === "function") observer = new Constructor(callback);
  }
  if (!observer || typeof observer.observe !== "function" || typeof observer.disconnect !== "function") {
    throw controllerError(`MISSING_${name.toUpperCase()}_CAPABILITY`, `${name} is unavailable`);
  }
  return observer;
}

function createDefaultControllerUi(host) {
  const document = host.ownerDocument ?? globalThis.document;
  if (!document || typeof document.createElement !== "function") {
    throw controllerError("MISSING_DOM_CAPABILITY", "viewer UI requires a DOM document");
  }
  const status = document.createElement("div");
  const sourceLink = document.createElement("a");
  status.className = "lux3d-viewer-status";
  sourceLink.className = "lux3d-viewer-source";
  Object.assign(status.style, {
    position: "absolute",
    inset: "0",
    zIndex: "2",
    boxSizing: "border-box",
    padding: "8px",
    background: "#050505",
    pointerEvents: "none",
  });
  Object.assign(sourceLink.style, {
    position: "absolute",
    right: "8px",
    top: "8px",
    zIndex: "3",
  });
  sourceLink.textContent = "打开原文件";
  sourceLink.target = "_blank";
  sourceLink.rel = "noopener noreferrer";
  sourceLink.referrerPolicy = "no-referrer";
  sourceLink.hidden = true;
  host.append(status, sourceLink);
  return Object.freeze({
    setSourceLink(url) {
      if (typeof url !== "string" || url === "") {
        sourceLink.removeAttribute?.("href");
        sourceLink.hidden = true;
        return;
      }
      sourceLink.href = url;
      sourceLink.hidden = false;
    },
    setState(snapshot) {
      host.dataset.viewerState = snapshot.state;
      status.hidden = snapshot.state === "ready" || snapshot.state === "suspended";
      status.textContent = snapshot.error
        ? `${snapshot.error.code}: ${snapshot.error.message}${snapshot.asset ? ` (${snapshot.asset})` : ""}`
        : snapshot.state;
    },
  });
}

function normalizeError(error) {
  if (error instanceof ViewerControllerError
    || error instanceof ViewerDownloadError
    || error instanceof GlbContractError
    || error instanceof GaussianPlyValidationError) {
    return Object.freeze({code: error.code, message: stripCodePrefix(error.message, error.code)});
  }
  if (typeof error?.code === "string" && /^[A-Z][A-Z0-9_]+$/.test(error.code)) {
    return Object.freeze({code: error.code, message: "viewer adapter operation failed"});
  }
  return Object.freeze({code: "VIEWER_OPERATION_FAILED", message: "viewer operation failed"});
}

function stripCodePrefix(message, code) {
  const prefix = `${code}: `;
  return message.startsWith(prefix) ? message.slice(prefix.length) : message;
}

function requireHost(host) {
  if (!host || typeof host !== "object") throw controllerError("MISSING_VIEWER_HOST", "viewer host is required");
  return host;
}

function requireConfigInteger(value, code) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw controllerError(code, "a positive safe integer configuration value is required");
  }
  return value;
}

function requireResidentPool(pool) {
  if (!pool || typeof pool.acquire !== "function") {
    throw controllerError("MISSING_RESIDENT_CAPACITY_POLICY", "an explicit resident capacity policy is required");
  }
  return pool;
}

function finiteDimension(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw controllerError("INVALID_VIEWPORT", "viewer viewport dimensions must be finite and non-negative");
  }
  return number;
}

function inferHostLayoutVisibility(host) {
  if (host?.isConnected === false) return false;
  const document = host?.ownerDocument;
  if (document?.visibilityState === "hidden") return false;

  const rect = host?.getBoundingClientRect?.();
  if (!rect) return null;
  const width = finiteOrNull(rect.width ?? host.clientWidth);
  const height = finiteOrNull(rect.height ?? host.clientHeight);
  if (width === null || height === null) return null;
  if (width <= 0 || height <= 0) return false;

  const view = document?.defaultView ?? globalThis.window;
  const viewportWidth = positiveFiniteOrNull(view?.innerWidth)
    ?? positiveFiniteOrNull(document?.documentElement?.clientWidth);
  const viewportHeight = positiveFiniteOrNull(view?.innerHeight)
    ?? positiveFiniteOrNull(document?.documentElement?.clientHeight);
  const left = finiteOrNull(rect.left ?? rect.x);
  const top = finiteOrNull(rect.top ?? rect.y);
  const right = finiteOrNull(rect.right) ?? (left === null ? null : left + width);
  const bottom = finiteOrNull(rect.bottom) ?? (top === null ? null : top + height);

  if (viewportWidth === null || viewportHeight === null
      || left === null || top === null || right === null || bottom === null) {
    return null;
  }
  return right > 0 && bottom > 0 && left < viewportWidth && top < viewportHeight;
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveFiniteOrNull(value) {
  const number = finiteOrNull(value);
  return number !== null && number > 0 ? number : null;
}

function supportsEventTarget(value) {
  return value && typeof value.addEventListener === "function"
    && typeof value.removeEventListener === "function";
}

function controllerError(code, message, details) {
  return new ViewerControllerError(code, message, details);
}
