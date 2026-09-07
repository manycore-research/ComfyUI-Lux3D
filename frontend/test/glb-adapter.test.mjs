import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {runInNewContext} from "node:vm";

import {createGlbAdapter, buildGlbViewerDocument} from "../src/viewer/adapters/glb-adapter.js";
import {applyModelViewerPreset} from "../src/viewer/model-viewer-frame.js";
import {LOCAL_MODEL_VIEWER_PRESET} from "../src/viewer/local-model-viewer-preset.js";
import {FakeEventTarget, makeGlb} from "./viewer-test-helpers.mjs";

const VIEWPORT = {width: 300, height: 200, dpr: 2};
const ENVIRONMENT_URL = "https://comfy.example/assets/model-viewer/environment.hdr";

test("keeps the complete preset in sync with the local Web reference when available", async (t) => {
  const reference = new URL("../../../lux3d-web/src/site-impl/shared/viewers/local-model-viewer-preset.ts", import.meta.url);
  let source;
  try {
    source = await readFile(reference, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return t.skip("Sibling lux3d-web checkout is not available");
    throw error;
  }
  const web = runInNewContext(source.replace("export const LOCAL_MODEL_VIEWER_PRESET =", "(").replace("} as const;", "})"));
  assert.deepEqual(LOCAL_MODEL_VIEWER_PRESET, JSON.parse(JSON.stringify(web)));
});

test("applies Web lighting, framing, controls, transform and animation attributes", () => {
  const attributes = new Map();
  const viewer = {
    setAttribute(name, value) {
      if (name === "environment-image" || name === "skybox-image") {
        assert.equal(value, ENVIRONMENT_URL, "Every environment assignment must use the bundled HDR");
      }
      attributes.set(name, value);
    },
    toggleAttribute(name, enabled) { if (enabled) attributes.set(name, ""); else attributes.delete(name); },
  };
  applyModelViewerPreset(viewer, ENVIRONMENT_URL);
  assert.equal(attributes.get("environment-image"), ENVIRONMENT_URL);
  assert.equal(attributes.get("tone-mapping"), "auto");
  assert.equal(attributes.get("exposure"), "0.95");
  assert.equal(attributes.get("shadow-intensity"), "0");
  assert.equal(attributes.get("shadow-softness"), "0.88");
  assert.equal(attributes.has("skybox-image"), false);
  assert.equal(attributes.get("camera-orbit"), "0deg 90deg 125%");
  assert.equal(attributes.get("max-camera-orbit"), "auto auto 300%");
  assert.equal(attributes.get("camera-target"), "auto auto auto");
  assert.equal(attributes.get("field-of-view"), "30deg");
  assert.equal(attributes.get("interpolation-decay"), "50");
  assert.equal(attributes.get("scale"), "1 1 1");
  assert.equal(attributes.get("orientation"), "0deg 0deg 0deg");
  assert.equal(attributes.has("auto-rotate"), false);
  assert.equal(attributes.has("disable-zoom"), false);
  assert.equal(attributes.has("disable-pan"), false);
  assert.equal(attributes.has("camera-controls"), true);
  assert.equal(attributes.has("autoplay"), true);
  assert.equal(attributes.get("animation-crossfade-duration"), "300");
  assert.equal(viewer.timeScale, 1);
});

test("requires a bundled environment URL without falling back to the external Web URL", () => {
  for (const environmentUrl of [undefined, null, ""]) {
    assert.throws(() => applyModelViewerPreset({
      setAttribute() { assert.fail("Invalid environment must be rejected before setting attributes"); },
    }, environmentUrl), /Bundled environment URL is required/);
  }
});

test("uses the bundled HDR for a visible skybox too", () => {
  const lighting = LOCAL_MODEL_VIEWER_PRESET.lighting;
  const wasVisible = lighting.skyboxVisible;
  const attributes = new Map();
  try {
    lighting.skyboxVisible = true;
    applyModelViewerPreset({
      setAttribute(name, value) { attributes.set(name, value); },
      toggleAttribute() {},
    }, ENVIRONMENT_URL);
    assert.equal(attributes.get("environment-image"), ENVIRONMENT_URL);
    assert.equal(attributes.get("skybox-image"), ENVIRONMENT_URL);
  } finally {
    lighting.skyboxVisible = wasVisible;
  }
});

test("loads in an isolated iframe and accepts readiness only from that frame", async () => {
  const harness = createHarness();
  let ready = false;
  const pending = createAdapter(harness).then((adapter) => { ready = true; return adapter; });
  harness.message("ready", {source: {}});
  harness.message("ready", {origin: "https://other.example"});
  await Promise.resolve();
  assert.equal(ready, false);
  assert.equal(harness.frame.title, "Lux3D GLB Viewer");
  const config = readConfig(harness.frame.srcdoc);
  assert.equal(config.assets.runtime, "https://comfy.example/assets/model-viewer/model-viewer.min.js");
  assert.equal(config.assets.environment, "https://comfy.example/assets/model-viewer/environment.hdr");
  assert.equal(config.modelUrl, "blob:local-model");
  harness.message("ready");
  const adapter = await pending;
  assert.equal(harness.window.listeners.get("message").length, 0);
  assert.equal(harness.timers.size, 0);
  await adapter.dispose();
});

test("forwards reset, suspend and resume; disposes iframe and blob exactly once", async () => {
  const harness = createHarness();
  const pending = createAdapter(harness);
  harness.message("ready");
  const adapter = await pending;
  await adapter.resize({width: 420, height: 320, dpr: 1});
  await adapter.reset();
  await adapter.suspend();
  assert.equal(harness.frame.style.visibility, "hidden");
  await adapter.resume();
  assert.equal(harness.frame.style.visibility, "visible");
  await adapter.dispose();
  await adapter.dispose();
  await adapter.reset();
  assert.deepEqual(harness.actions, ["reset", "pause", "play", "dispose"]);
  assert.equal(harness.removals, 1);
  assert.deepEqual(harness.revoked, ["blob:local-model"]);
  assert.equal(harness.frame.srcdoc, "");
});

test("all operations after disposal leave the released iframe and resources untouched", async () => {
  const harness = createHarness();
  const pending = createAdapter(harness);
  harness.message("ready");
  const adapter = await pending;
  await adapter.suspend();
  await adapter.dispose();
  for (const property of ["style", "contentWindow"]) {
    Object.defineProperty(harness.frame, property, {
      get() { assert.fail(`Disposed adapter must not access iframe.${property}`); },
    });
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    await adapter.resume();
    await adapter.suspend();
    await adapter.reset();
    await adapter.resize(null);
    await adapter.dispose();
  }
  assert.deepEqual(harness.actions, ["pause", "dispose"]);
  assert.equal(harness.removals, 1);
  assert.deepEqual(harness.revoked, ["blob:local-model"]);
});

test("rejects actual external-resource bytes even if the supplied validation is forged", async () => {
  const harness = createHarness();
  await assert.rejects(createAdapter(harness, {
    arrayBuffer: makeGlb({buffers: [{byteLength: 4, uri: "https://other.example/model.bin"}]}).buffer,
    validation: {format: "glb", json: {buffers: [{byteLength: 4}]}},
  }), {code: "EXTERNAL_BUFFER_URI"});
  assert.equal(harness.blobs.length, 0);
});

test("load errors and timeouts release the frame, listener, timer and blob", async () => {
  for (const timeout of [false, true]) {
    const harness = createHarness();
    const pending = createAdapter(harness);
    if (timeout) [...harness.timers.values()][0]();
    else harness.message("error");
    await assert.rejects(pending, {code: timeout ? "GLB_LOAD_TIMEOUT" : "GLB_BUILD_FAILED"});
    assert.equal(harness.removals, 1);
    assert.equal(harness.timers.size, 0);
    assert.equal(harness.window.listeners.get("message").length, 0);
    assert.deepEqual(harness.revoked, ["blob:local-model"]);
  }
});

test("escapes script delimiters in frame configuration", () => {
  const document = buildGlbViewerDocument({id: "</script><script>unexpected()</script>"});
  assert.equal((document.match(/<script/g) ?? []).length, 1);
  assert.equal((document.match(/<\/script>/g) ?? []).length, 1);
  assert.equal(readConfig(document).id, "</script><script>unexpected()</script>");
});

function createAdapter(harness, overrides = {}) {
  return createGlbAdapter({
    host: harness.host, arrayBuffer: makeGlb().buffer, viewport: VIEWPORT,
    assetUrlResolver: (key) => `/assets/${key}`, ...overrides,
  });
}

function readConfig(source) {
  return JSON.parse(source.match(/const config = (.+);/)[1]);
}

function createHarness() {
  const harness = {actions: [], revoked: [], blobs: [], removals: 0, timers: new Map()};
  const window = new FakeEventTarget();
  Object.assign(window, {
    location: {origin: "https://comfy.example"},
    Blob,
    URL: {
      createObjectURL(blob) { harness.blobs.push(blob); return "blob:local-model"; },
      revokeObjectURL(url) { harness.revoked.push(url); },
    },
    setTimeout(callback) { harness.timers.set(1, callback); return 1; },
    clearTimeout(id) { harness.timers.delete(id); },
  });
  const frame = {
    style: {}, setAttribute() {},
    contentWindow: {postMessage(message, origin) {
      assert.equal(origin, window.location.origin);
      harness.actions.push(message.action);
    }},
    remove() { harness.removals += 1; },
  };
  const document = {baseURI: "https://comfy.example/", defaultView: window, createElement: () => frame};
  harness.host = {ownerDocument: document, appendChild() {}};
  Object.assign(harness, {window, frame});
  harness.message = (state, overrides = {}) => window.dispatch("message", {
    source: frame.contentWindow, origin: window.location.origin,
    data: {type: "lux3d-glb-frame", id: readConfig(frame.srcdoc).id, state}, ...overrides,
  });
  return harness;
}
