import {app} from "../../scripts/app.js";
import {api} from "../../scripts/api.js";

const cacheToken = String(Date.now());
const controllerBundleUrl = new URL(
  "./assets/lux3d-viewer-controller.mjs",
  import.meta.url,
);
controllerBundleUrl.searchParams.set("v", cacheToken);
const inputSourcesBundleUrl = new URL(
  "./assets/lux3d-input-source-extension.mjs",
  import.meta.url,
);
inputSourcesBundleUrl.searchParams.set("v", cacheToken);
const adapterModuleUrls = Object.freeze({
  glb: new URL("./assets/lux3d-glb-adapter.mjs", import.meta.url).href,
  gaussian: new URL("./assets/lux3d-gaussian-adapter.mjs", import.meta.url).href,
});
const viewerConfig = Object.freeze({
  maxAssetBytes: 256 * 1024 * 1024,
  fetchTimeoutMs: 120_000,
  maxResidentViewers: 2,
  residentLimitBehavior: "reject",
  glbVisualConfig: Object.freeze({
    environment: "legacy",
    exposure: 0.95,
    toneMapping: "Neutral",
    clearColor: 0x000000,
    clearAlpha: 1.0,
  }),
});

try {
  const {registerLux3DInputSourceExtension} = await import(inputSourcesBundleUrl.href);
  registerLux3DInputSourceExtension({app, api});
  const {registerLux3DViewerExtension} = await import(controllerBundleUrl.href);
  registerLux3DViewerExtension({
    app,
    config: viewerConfig,
    adapterModuleUrls,
    assetBaseUrl: globalThis.document?.baseURI,
  });
} catch {
  console.error("[Lux3D] RUNTIME_EXTENSION_LOAD_FAILED");
}
