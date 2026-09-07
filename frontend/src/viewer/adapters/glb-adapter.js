import {viewerAssetUrl} from "../../generated/viewer-assets.js";
import {parseGlbContract} from "../format/glb-contract.js";
import {LOCAL_MODEL_VIEWER_PRESET} from "../local-model-viewer-preset.js";

const FRAME_MESSAGE = "lux3d-glb-frame";
const LOAD_TIMEOUT_MS = 120_000;
let frameSequence = 0;

export class GlbAdapterError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? {cause} : undefined);
    this.name = "GlbAdapterError";
    this.code = code;
  }
}

export async function createGlbAdapter(options = {}) {
  const {host, arrayBuffer} = options;
  const document = host?.ownerDocument;
  const window = document?.defaultView;
  if (!host?.appendChild || !document?.createElement || !window?.addEventListener) {
    throw new GlbAdapterError("INVALID_HOST", "GLB adapter requires a browser DOM host");
  }
  if (!(arrayBuffer instanceof ArrayBuffer) || arrayBuffer.byteLength === 0) {
    throw new GlbAdapterError("INVALID_ASSET_BYTES", "GLB adapter requires a non-empty ArrayBuffer");
  }
  // Validate the actual bytes before giving a browser renderer access to them.
  const validation = parseGlbContract(arrayBuffer, {maxAssetBytes: arrayBuffer.byteLength});
  validateViewport(options.viewport);
  const resolveAsset = options.assetUrlResolver ?? viewerAssetUrl;
  const asset = (key) => new URL(resolveAsset(key), document.baseURI).href;
  const assets = {
    runtime: asset("model-viewer/model-viewer.min.js"),
    frame: asset("model-viewer/frame.mjs"),
    environment: asset("model-viewer/environment.hdr"),
    draco: asset("draco/draco_wasm_wrapper.js").replace(/[^/]+$/, ""),
    basis: asset("basis/basis_transcoder.js").replace(/[^/]+$/, ""),
    meshopt: asset("meshopt/meshopt_decoder.js"),
  };
  const modelUrl = window.URL.createObjectURL(new window.Blob([arrayBuffer], {type: "model/gltf-binary"}));
  const frame = document.createElement("iframe");
  frame.title = "Lux3D GLB Viewer";
  frame.setAttribute("allow", "autoplay");
  Object.assign(frame.style, {
    display: "block", border: "0", width: "100%", height: "100%",
    background: LOCAL_MODEL_VIEWER_PRESET.stage.backgroundColor,
  });
  // Frame identity is checked by event.source; this ID also works on HTTP LAN deployments.
  const id = `lux3d-glb-${++frameSequence}`;
  let disposed = false;
  let timeout;
  let rejectLoad;
  let finishLoad;
  const post = (action) => {
    if (!disposed) frame.contentWindow?.postMessage({type: FRAME_MESSAGE, id, action}, window.location.origin);
  };
  const onMessage = (event) => {
    if (event.source !== frame.contentWindow || event.origin !== window.location.origin
        || event.data?.type !== FRAME_MESSAGE || event.data.id !== id) return;
    if (event.data.state === "ready") finishLoad();
    if (event.data.state === "error") {
      rejectLoad(new GlbAdapterError("GLB_BUILD_FAILED", "GLB model or viewer resources failed to load"));
    }
  };
  const loaded = new Promise((resolve, reject) => {
    finishLoad = resolve;
    rejectLoad = reject;
    timeout = window.setTimeout(() => reject(new GlbAdapterError(
      "GLB_LOAD_TIMEOUT", "GLB model or viewer resources timed out",
    )), LOAD_TIMEOUT_MS);
  });
  const cleanupLoad = () => {
    window.clearTimeout(timeout);
    window.removeEventListener("message", onMessage);
  };
  const dispose = async () => {
    if (disposed) return;
    post("dispose");
    disposed = true;
    cleanupLoad();
    // Removing the isolated browsing context releases its renderer and decoder workers.
    frame.remove();
    frame.srcdoc = "";
    window.URL.revokeObjectURL(modelUrl);
  };
  window.addEventListener("message", onMessage);
  try {
    frame.srcdoc = buildGlbViewerDocument({
      id, modelUrl, assets, parentOrigin: window.location.origin,
      meshopt: (validation.json.extensionsUsed ?? []).includes("EXT_meshopt_compression")
        || (validation.json.extensionsRequired ?? []).includes("EXT_meshopt_compression"),
    });
    host.appendChild(frame);
    await loaded;
    cleanupLoad();
  } catch (error) {
    await dispose();
    throw error;
  }
  return Object.freeze({
    async resize(viewport) {
      if (disposed) return;
      validateViewport(viewport);
      // model-viewer observes the actual iframe viewport, including ComfyUI node resizing.
    },
    async reset() {
      if (disposed) return;
      post("reset");
    },
    async suspend() {
      if (disposed) return;
      post("pause");
      frame.style.visibility = "hidden";
    },
    async resume() {
      if (disposed) return;
      frame.style.visibility = "visible";
      post("play");
    },
    dispose,
  });
}

export function buildGlbViewerDocument(config) {
  const data = JSON.stringify(config).replace(/</g, "\\u003c");
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  html,body{width:100%;height:100%;margin:0;overflow:hidden;background:${LOCAL_MODEL_VIEWER_PRESET.stage.backgroundColor};color-scheme:dark}
  model-viewer{display:block;width:100%;height:100%;background:transparent;--poster-color:transparent;--progress-bar-color:rgba(121,183,255,.92);--progress-mask:transparent}
</style></head><body><script type="module">
  const config = ${data};
  try {
    const {mountGlbViewerFrame} = await import(config.assets.frame);
    await mountGlbViewerFrame(config);
  } catch {
    parent.postMessage({type:${JSON.stringify(FRAME_MESSAGE)},id:config.id,state:"error"},config.parentOrigin);
  }
</script></body></html>`;
}

function validateViewport(viewport) {
  if (![viewport?.width, viewport?.height, viewport?.dpr].every((value) => Number.isFinite(value) && value > 0)) {
    throw new GlbAdapterError("INVALID_VIEWPORT", "viewport width, height and dpr must be finite and positive");
  }
}
