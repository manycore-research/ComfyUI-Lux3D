import assert from "node:assert/strict";
import {createReadStream, existsSync} from "node:fs";
import {mkdir, readFile} from "node:fs/promises";
import {createServer} from "node:http";
import {extname, join, resolve, sep} from "node:path";
import {runInNewContext} from "node:vm";
import {transform} from "esbuild";
import {chromium} from "playwright";
import {SphereGeometry, TorusKnotGeometry} from "three";
import {makeGlb} from "./viewer-test-helpers.mjs";
import {viewerAssetUrl} from "../src/generated/viewer-assets.js";
import {LOCAL_MODEL_VIEWER_PRESET} from "../src/viewer/local-model-viewer-preset.js";

const root = resolve(import.meta.dirname, "../..");
const manifest = JSON.parse(await readFile(join(root, "viewer_assets/manifest.json"), "utf8"));
const assets = new Map(manifest.assets.map((entry) => [entry.logical_key, entry]));
const modelBytes = makeMaterialFixture();
const animatedModelBytes = makeMaterialFixture(true);
const server = createServer((request, response) => {
  const pathname = new URL(request.url, "http://127.0.0.1").pathname;
  if (pathname === "/") {
    response.setHeader("Content-Type", "text/html");
    response.end(`<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,">
      <style>body{margin:0;background:#000;display:flex;gap:16px}#host,#reference{width:400px;height:360px;position:relative;border:0}</style>
      <div id="host"></div><iframe id="reference"></iframe>`);
    return;
  }
  if (pathname === "/fixture.glb" || pathname === "/animated.glb") {
    response.setHeader("Content-Type", "model/gltf-binary");
    response.end(pathname === "/animated.glb" ? animatedModelBytes : modelBytes);
    return;
  }
  const assetKey = pathname.match(/^\/comfyui-lux3d\/viewer-assets\/v1\/[^/]+\/(.+)$/)?.[1];
  const asset = assets.get(assetKey);
  const path = asset ? join(root, "viewer_assets", asset.path) : resolve(root, `.${decodeURIComponent(pathname)}`);
  if (!path.startsWith(root + sep) || (!asset && !pathname.startsWith("/js/assets/"))) {
    response.writeHead(404).end();
    return;
  }
  const stream = createReadStream(path);
  stream.on("error", () => { if (!response.headersSent) response.writeHead(404); response.end(); });
  response.setHeader("Content-Type", asset?.mime ?? ([".mjs", ".js"].includes(extname(path)) ? "text/javascript" : "application/octet-stream"));
  stream.pipe(response);
});
await new Promise((ready) => server.listen(0, "127.0.0.1", ready));
const origin = `http://127.0.0.1:${server.address().port}`;
const environmentUrl = new URL(viewerAssetUrl("model-viewer/environment.hdr"), origin).href;
const dracoBaseUrl = new URL(
  viewerAssetUrl("draco/draco_wasm_wrapper.js"),
  origin,
).href.replace(/[^/]+$/, "");
const basisBaseUrl = new URL(
  viewerAssetUrl("basis/basis_transcoder.js"),
  origin,
).href.replace(/[^/]+$/, "");
const candidates = [
  process.env.LUX3D_BROWSER_EXECUTABLE,
  chromium.executablePath(),
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/chromium", "/usr/bin/google-chrome",
];
const executablePath = candidates.find((candidate) => candidate && existsSync(candidate));
assert.ok(executablePath, "Set LUX3D_BROWSER_EXECUTABLE to an installed Chromium browser");
const browser = await chromium.launch({executablePath, headless: true, args: ["--enable-unsafe-swiftshader"]});
const page = await browser.newPage({viewport: {width: 816, height: 360}, deviceScaleFactor: 1});
const errors = [];
const externalRequests = [];
page.on("pageerror", (error) => { errors.push(error.message); console.error("Browser:", error.message); });
page.on("console", (message) => { if (message.type() === "error") console.error("Browser console:", message.text()); });
await page.route("**/*", (route) => {
  const url = route.request().url();
  if (url.startsWith(origin) || url.startsWith("blob:")) return route.continue();
  externalRequests.push(url);
  return route.abort();
});
try {
  await page.goto(origin);
  await page.evaluate(async () => {
    const {createGlbAdapter} = await import("/js/assets/lux3d-glb-adapter.mjs");
    window.adapter = await createGlbAdapter({
      host: document.getElementById("host"),
      arrayBuffer: await (await fetch("/fixture.glb")).arrayBuffer(),
      viewport: {width: 400, height: 360, dpr: 1},
    });
  });
  const frame = page.frames().find((candidate) => candidate.parentFrame() && candidate.url() === "about:srcdoc");
  assert.ok(frame);
  const settings = await frame.evaluate(() => {
    const viewer = document.getElementById("viewer");
    const ModelViewerElement = customElements.get("model-viewer");
    viewer.jumpCameraToGoal();
    return {loaded: viewer.loaded, exposure: viewer.exposure, toneMapping: viewer.toneMapping,
      fov: viewer.getFieldOfView(), shadow: viewer.shadowIntensity, orbit: viewer.getCameraOrbit(),
      environment: viewer.environmentImage, environmentAttribute: viewer.getAttribute("environment-image"),
      skyboxAttribute: viewer.getAttribute("skybox-image"), autoRotate: viewer.autoRotate, timeScale: viewer.timeScale,
      dracoDecoderLocation: ModelViewerElement.dracoDecoderLocation,
      ktx2TranscoderLocation: ModelViewerElement.ktx2TranscoderLocation};
  });
  assert.equal(settings.loaded, true);
  assert.equal(settings.exposure, 0.95);
  assert.equal(settings.toneMapping, "auto");
  assert.ok(Math.abs(settings.fov - 30) < 1e-10);
  assert.equal(settings.shadow, 0);
  assert.equal(settings.autoRotate, false);
  assert.equal(settings.timeScale, 1);
  assert.equal(settings.environment, environmentUrl);
  assert.equal(settings.environmentAttribute, environmentUrl);
  assert.equal(settings.skyboxAttribute, null);
  assert.equal(settings.dracoDecoderLocation, dracoBaseUrl);
  assert.equal(settings.ktx2TranscoderLocation, basisBaseUrl);
  assert.deepEqual(externalRequests, []);

  const reference = await buildWebReference(origin, environmentUrl);
  if (reference) {
    await page.evaluate((srcdoc) => { document.getElementById("reference").srcdoc = srcdoc; }, reference);
    const referenceFrame = page.frames().find((candidate) => candidate !== frame && candidate.parentFrame());
    await referenceFrame.waitForFunction(() => document.getElementById("viewer")?.loaded === true);
    await referenceFrame.evaluate(() => document.getElementById("viewer").jumpCameraToGoal());
    // Let both renderers finish their requested camera and environment updates.
    await settle(frame);
    await settle(referenceFrame);
    const actual = await capture(frame);
    const expected = await capture(referenceFrame);
    const comparison = await page.evaluate(async ([left, right]) => {
      async function pixels(url) {
        const image = new Image(); image.src = url; await image.decode();
        const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
        const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
        return {width: image.width, height: image.height, data: ctx.getImageData(0, 0, image.width, image.height).data};
      }
      const a = await pixels(left), b = await pixels(right);
      let sum = 0, max = 0, nonblack = 0;
      for (let index = 0; index < a.data.length; index++) {
        const delta = Math.abs(a.data[index] - b.data[index]);
        sum += delta; max = Math.max(max, delta);
        if (index % 4 !== 3 && a.data[index] > 10) nonblack++;
      }
      return {actual: [a.width, a.height], expected: [b.width, b.height], mean: sum / a.data.length, max, nonblack};
    }, [actual, expected]);
    assert.deepEqual(comparison.actual, comparison.expected);
    assert.ok(comparison.nonblack > 1000, `Expected a visible rendered model: ${JSON.stringify(comparison)}`);
    assert.ok(comparison.mean < 0.1, `Web rendering differs: ${JSON.stringify(comparison)}`);
    console.log("Web rendering comparison:", JSON.stringify(comparison));
    if (process.env.LUX3D_GLB_SCREENSHOT) {
      await mkdir(resolve(process.env.LUX3D_GLB_SCREENSHOT, ".."), {recursive: true});
      await page.screenshot({path: process.env.LUX3D_GLB_SCREENSHOT});
    }
  } else console.log("Sibling lux3d-web is unavailable; skipped Web screenshot comparison.");

  const before = await frame.evaluate(() => document.getElementById("viewer").getCameraOrbit().toString());
  await page.mouse.move(200, 180);
  await page.mouse.down(); await page.mouse.move(290, 220, {steps: 8}); await page.mouse.up();
  await settle(frame);
  const dragged = await frame.evaluate(() => document.getElementById("viewer").getCameraOrbit().toString());
  assert.notEqual(dragged, before, "Dragging should rotate the model");
  const radiusBefore = await frame.evaluate(() => document.getElementById("viewer").getCameraOrbit().radius);
  await page.mouse.wheel(0, -180);
  await settle(frame);
  const radiusAfter = await frame.evaluate(() => document.getElementById("viewer").getCameraOrbit().radius);
  assert.ok(radiusAfter < radiusBefore, "Wheel should zoom in");
  await page.evaluate(() => window.adapter.reset());
  await settle(frame);
  const reset = await frame.evaluate(() => document.getElementById("viewer").getCameraOrbit());
  assert.ok(Math.abs(reset.radius - settings.orbit.radius) < 1e-8);
  assert.ok(Math.abs(reset.theta - settings.orbit.theta) < 1e-8);
  await page.evaluate(() => window.adapter.suspend());
  await frame.waitForFunction(() => document.getElementById("viewer").style.display === "none");
  await page.evaluate(() => window.adapter.resume());
  await frame.waitForFunction(() => document.getElementById("viewer").style.display === "block");
  await page.evaluate(() => { document.getElementById("host").style.width = "300px"; return window.adapter.resize({width: 300, height: 360, dpr: 1}); });
  await frame.waitForFunction(() => document.getElementById("viewer").clientWidth === 300);
  await page.evaluate(() => window.adapter.dispose());
  await page.evaluate(async () => {
    await window.adapter.resume();
    await window.adapter.suspend();
    await window.adapter.reset();
    await window.adapter.resize(null);
    await window.adapter.dispose();
  });
  assert.equal(await page.locator("#host iframe").count(), 0);
  await page.evaluate(async () => {
    const {createGlbAdapter} = await import("/js/assets/lux3d-glb-adapter.mjs");
    window.adapter = await createGlbAdapter({
      host: document.getElementById("host"),
      arrayBuffer: await (await fetch("/animated.glb")).arrayBuffer(),
      viewport: {width: 300, height: 360, dpr: 1},
    });
  });
  const animatedFrame = await (await page.locator("#host iframe").elementHandle()).contentFrame();
  await animatedFrame.waitForFunction(() => document.getElementById("viewer").currentTime > 0.05);
  assert.deepEqual(await animatedFrame.evaluate(() => document.getElementById("viewer").availableAnimations), ["Float"]);
  await page.evaluate(() => window.adapter.suspend());
  await animatedFrame.waitForFunction(() => document.getElementById("viewer").paused);
  const pausedAt = await animatedFrame.evaluate(() => document.getElementById("viewer").currentTime);
  await settle(page.mainFrame());
  assert.equal(await animatedFrame.evaluate(() => document.getElementById("viewer").currentTime), pausedAt);
  await page.evaluate(() => window.adapter.resume());
  await animatedFrame.waitForFunction((previous) => document.getElementById("viewer").currentTime !== previous, pausedAt);
  await page.evaluate(() => window.adapter.dispose());
  assert.equal(await page.locator("#host iframe").count(), 0);
  assert.deepEqual(externalRequests, []);
  assert.deepEqual(errors, []);
  console.log("GLB browser checks passed: offline rendering, Web parity, orbit, zoom, reset, resize, animation, suspend/resume, disposal.");
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}

async function settle(frame) {
  await frame.evaluate(async () => {
    for (let index = 0; index < 40; index++) await new Promise(requestAnimationFrame);
  });
}

function capture(frame) {
  return frame.evaluate(() => document.getElementById("viewer").toDataURL("image/png"));
}

async function buildWebReference(origin, environment) {
  const path = resolve(root, "../lux3d-web/src/site-impl/shared/viewers/LocalModelViewer.tsx");
  if (!existsSync(path)) return null;
  const source = await readFile(path, "utf8");
  const functionSource = source.slice(source.indexOf("function buildModelViewerDocument({"), source.indexOf("function getViewerContainerClassName("));
  const {code} = await transform(functionSource, {loader: "ts"});
  const runtimeEntry = assets.get("model-viewer/model-viewer.min.js");
  const digest = environment.match(/\/v1\/([^/]+)\//)[1];
  const preset = structuredClone(LOCAL_MODEL_VIEWER_PRESET);
  preset.lighting.environmentUrl = environment;
  return runInNewContext(`${code}\nbuildModelViewerDocument({modelUrl: '/fixture.glb', modelName: 'Reference', viewerId: 'reference', captureCover: false, presentation: 'default', framing: 'standard'})`, {
    LOCAL_MODEL_VIEWER_PRESET: preset,
    MODEL_VIEWER_CDN: `${origin}/comfyui-lux3d/viewer-assets/v1/${digest}/${runtimeEntry.path}`,
    STANDARD_MAX_CAMERA_ORBIT: "auto auto 300%", ROOMY_MAX_CAMERA_ORBIT: "auto auto 400%",
    getLocalModelViewerCopy: () => ({localViewer: {altLocalPreview: "Reference"}}),
    getViewerBackground: () => "#000000",
  });
}

function makeMaterialFixture(animated = false) {
  const buffers = [], bufferViews = [], accessors = [], meshes = [];
  let byteLength = 0;
  function add(array, type, componentType, min, max) {
    const bytes = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
    const aligned = Buffer.alloc(Math.ceil(bytes.length / 4) * 4); bytes.copy(aligned);
    const bufferView = bufferViews.length;
    bufferViews.push({buffer: 0, byteOffset: byteLength, byteLength: bytes.length});
    buffers.push(aligned); byteLength += aligned.length;
    const components = type === "VEC3" ? 3 : type === "VEC2" ? 2 : 1;
    const index = accessors.length;
    accessors.push({bufferView, componentType, count: array.length / components, type, ...(min ? {min, max} : {})});
    return index;
  }
  const materials = [
    {pbrMetallicRoughness: {baseColorFactor: [0.8, 0.32, 0.12, 1], metallicFactor: 1, roughnessFactor: 0.22}},
    {pbrMetallicRoughness: {baseColorFactor: [0.12, 0.32, 0.9, 1], metallicFactor: 0, roughnessFactor: 0.7}},
  ];
  for (const [index, geometry] of [new TorusKnotGeometry(0.65, 0.2, 100, 16), new SphereGeometry(0.55, 48, 24)].entries()) {
    geometry.computeBoundingBox();
    meshes.push({primitives: [{attributes: {
      POSITION: add(geometry.attributes.position.array, "VEC3", 5126, geometry.boundingBox.min.toArray(), geometry.boundingBox.max.toArray()),
      NORMAL: add(geometry.attributes.normal.array, "VEC3", 5126),
    }, indices: add(geometry.index.array, "SCALAR", geometry.index.array instanceof Uint16Array ? 5123 : 5125), material: index}]});
    geometry.dispose();
  }
  const animations = animated ? [{
    name: "Float",
    samplers: [{
      input: add(new Float32Array([0, 1, 2]), "SCALAR", 5126, [0], [2]),
      output: add(new Float32Array([1, 0, 0, 1, 0.5, 0, 1, 0, 0]), "VEC3", 5126),
      interpolation: "LINEAR",
    }],
    channels: [{sampler: 0, target: {node: 1, path: "translation"}}],
  }] : [];
  return Buffer.from(makeGlb({
    buffers: [{byteLength}], bufferViews, accessors, materials, meshes,
    animations,
    nodes: [{mesh: 0, translation: [-0.9, 0, 0]}, {mesh: 1, translation: [1, 0, 0]}],
    scenes: [{nodes: [0, 1]}], scene: 0,
  }, Buffer.concat(buffers)));
}
