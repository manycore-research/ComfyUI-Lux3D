import {LOCAL_MODEL_VIEWER_PRESET} from "./local-model-viewer-preset.js";

export function applyModelViewerPreset(viewer, environmentUrl) {
  if (typeof environmentUrl !== "string" || !environmentUrl.trim()) {
    throw new Error("Bundled environment URL is required");
  }
  const {lighting, camera, interaction, transform, animation} = LOCAL_MODEL_VIEWER_PRESET;
  const attributes = {
    "camera-orbit": `${camera.theta}deg ${camera.phi}deg ${camera.radius}%`,
    "max-camera-orbit": "auto auto 300%",
    "camera-target": camera.autoTarget ? "auto auto auto" : `${camera.targetX}m ${camera.targetY}m ${camera.targetZ}m`,
    "field-of-view": `${camera.fieldOfView}deg`,
    "touch-action": "none",
    "auto-rotate-delay": interaction.autoRotateDelay * 1000,
    "rotation-per-second": `${interaction.rotationPerSecond}deg`,
    "orbit-sensitivity": interaction.orbitSensitivity,
    "zoom-sensitivity": interaction.zoomSensitivity,
    "pan-sensitivity": interaction.panSensitivity,
    "interpolation-decay": interaction.interpolationDecay,
    "shadow-intensity": lighting.shadowIntensity,
    "shadow-softness": lighting.shadowSoftness,
    "environment-image": environmentUrl,
    exposure: lighting.exposure,
    "tone-mapping": lighting.toneMapping,
    scale: `${transform.scaleX} ${transform.scaleY} ${transform.scaleZ}`,
    orientation: `${transform.orientationX}deg ${transform.orientationY}deg ${transform.orientationZ}deg`,
    "interaction-prompt": "none",
    "animation-crossfade-duration": animation.crossfadeDuration,
    loading: "eager",
    reveal: "auto",
  };
  for (const [name, value] of Object.entries(attributes)) viewer.setAttribute(name, String(value));
  for (const [name, enabled] of Object.entries({
    "camera-controls": interaction.cameraControls,
    "auto-rotate": interaction.autoRotate,
    "disable-zoom": interaction.disableZoom,
    "disable-pan": interaction.disablePan,
    autoplay: animation.autoplay,
  })) viewer.toggleAttribute(name, enabled);
  if (lighting.skyboxVisible) viewer.setAttribute("skybox-image", environmentUrl);
  if (animation.animationName) viewer.setAttribute("animation-name", animation.animationName);
  viewer.timeScale = animation.playbackSpeed;
}

export async function mountGlbViewerFrame(config) {
  const {assets, modelUrl, id, parentOrigin} = config;
  await import(assets.runtime);
  const ModelViewerElement = customElements.get("model-viewer");
  const viewer = document.createElement("model-viewer");
  // model-viewer 4.2 resets decoder locations from its global defaults while
  // constructing each element, so apply the packaged paths after construction.
  ModelViewerElement.dracoDecoderLocation = assets.draco;
  ModelViewerElement.ktx2TranscoderLocation = assets.basis;
  if (config.meshopt) ModelViewerElement.meshoptDecoderLocation = assets.meshopt;
  const allowedResources = new Set([
    assets.environment,
    `${assets.draco}draco_wasm_wrapper.js`, `${assets.draco}draco_decoder.wasm`,
    `${assets.basis}basis_transcoder.js`, `${assets.basis}basis_transcoder.wasm`,
  ]);
  ModelViewerElement.mapURLs((url) => {
    if (url.startsWith("blob:") || allowedResources.has(url)) return url;
    throw new Error("GLB attempted to resolve an external resource");
  });
  viewer.id = "viewer";
  viewer.alt = "Lux3D GLB Viewer";
  // Use the packaged Web HDR from the first attribute assignment, including the skybox.
  applyModelViewerPreset(viewer, assets.environment);
  const report = (state) => parent.postMessage({type: "lux3d-glb-frame", id, state}, parentOrigin);
  viewer.addEventListener("load", () => report("ready"), {once: true});
  viewer.addEventListener("error", () => report("error"));
  window.addEventListener("message", (event) => {
    if (event.source !== parent || event.origin !== parentOrigin
        || event.data?.type !== "lux3d-glb-frame" || event.data.id !== id) return;
    switch (event.data.action) {
      case "reset":
        viewer.cameraOrbit = `${LOCAL_MODEL_VIEWER_PRESET.camera.theta}deg ${LOCAL_MODEL_VIEWER_PRESET.camera.phi}deg ${LOCAL_MODEL_VIEWER_PRESET.camera.radius}%`;
        viewer.cameraTarget = "auto auto auto";
        viewer.fieldOfView = `${LOCAL_MODEL_VIEWER_PRESET.camera.fieldOfView}deg`;
        viewer.jumpCameraToGoal();
        break;
      case "pause":
        viewer.pause();
        viewer.style.display = "none";
        break;
      case "play":
        viewer.style.display = "block";
        if (LOCAL_MODEL_VIEWER_PRESET.animation.autoplay) viewer.play();
        break;
      case "dispose":
        viewer.pause();
        viewer.remove();
        break;
    }
  });
  viewer.src = modelUrl;
  document.body.appendChild(viewer);
}
