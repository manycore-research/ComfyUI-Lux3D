import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {existsSync} from "node:fs";
import {mkdir, mkdtemp, readFile, readdir, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {pathToFileURL} from "node:url";
import test from "node:test";

import {buildViewerDistribution} from "../build.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");

test("builds isolated self-contained controller, GLB and Gaussian bundles", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "lux3d-viewer-build-test-"));
  try {
    const fixtureDirectory = join(temporaryRoot, "entries");
    const outputRoot = join(temporaryRoot, "output");
    await mkdir(fixtureDirectory, {recursive: true});
    const entryPoints = {
      inputSources: join(repositoryRoot, "frontend/src/lux3d-input-source-extension.mjs"),
      controller: join(fixtureDirectory, "controller.js"),
      glb: join(fixtureDirectory, "glb.js"),
      gaussian: join(fixtureDirectory, "gaussian.js"),
    };
    await writeFile(entryPoints.controller, [
      "export function registerLux3DViewerExtension() {",
      "  return \"controller\";",
      "}",
      "export const loadGlb = () => import(\"./adapters/glb-adapter.js\");",
      "export const loadGaussian = () => import(\"./adapters/gaussian-ply-adapter.js\");",
      "",
    ].join("\n"));
    await writeFile(entryPoints.glb, [
      "import * as THREE from \"three\";",
      "import {DRACOLoader} from \"three/examples/jsm/loaders/DRACOLoader.js\";",
      "import {GLTFLoader} from \"three/examples/jsm/loaders/GLTFLoader.js\";",
      "import {KTX2Loader} from \"three/examples/jsm/loaders/KTX2Loader.js\";",
      "import {MeshoptDecoder} from \"three/examples/jsm/libs/meshopt_decoder.module.js\";",
      "export const THREE_REVISION = THREE.REVISION;",
      "export const API_TYPES = [",
      "  typeof DRACOLoader, typeof GLTFLoader, typeof KTX2Loader,",
      "  typeof MeshoptDecoder.decodeGltfBuffer,",
      "];",
      "",
    ].join("\n"));
    await writeFile(entryPoints.gaussian, [
      "import * as THREE from \"three\";",
      "import {PlyLoader, Viewer} from \"@mkkellogg/gaussian-splats-3d\";",
      "export const THREE_REVISION = THREE.REVISION;",
      "export const API_TYPES = [typeof PlyLoader.loadFromFileData, typeof Viewer];",
      "",
    ].join("\n"));

    const result = await buildViewerDistribution({entryPoints, outputRoot});
    const bundleDirectory = join(outputRoot, "js/assets");
    assert.deepEqual(
      (await readdir(bundleDirectory)).sort(),
      [
        "lux3d-gaussian-adapter.mjs",
        "lux3d-glb-adapter.mjs",
        "lux3d-input-source-extension.mjs",
        "lux3d-viewer-controller.mjs",
      ],
    );
    const controller = await importFresh(result.bundles.controller);
    const glb = await importFresh(result.bundles.glb);
    const gaussian = await importFresh(result.bundles.gaussian);
    assert.equal(typeof controller.registerLux3DViewerExtension, "function");
    assert.equal(glb.THREE_REVISION, "183");
    assert.equal(gaussian.THREE_REVISION, "183");
    assert.deepEqual(glb.API_TYPES, ["function", "function", "function", "function"]);
    assert.deepEqual(gaussian.API_TYPES, ["function", "function"]);

    const controllerSource = await readFile(result.bundles.controller, "utf8");
    assert.match(controllerSource, /import\(["']\.\/lux3d-glb-adapter\.mjs["']\)/);
    assert.match(controllerSource, /import\(["']\.\/lux3d-gaussian-adapter\.mjs["']\)/);

    for (const bundlePath of Object.values(result.bundles)) {
      const source = await readFile(bundlePath, "utf8");
      assert.doesNotMatch(source, /(?:from\s*|import\s*\()\s*["']three/);
      assert.doesNotMatch(source, /https?:\/\/(?:cdn|unpkg|esm\.sh|jsdelivr)/i);
    }

    const manifestPath = join(outputRoot, "viewer_assets/manifest.json");
    const manifestBytes = await readFile(manifestPath);
    assert.equal(sha256(manifestBytes), result.manifestDigest);
    const manifest = JSON.parse(manifestBytes);
    assert.equal(manifest.schema_version, 1);
    assert.ok(manifest.assets.length >= 11);
    const keys = new Set();
    for (const asset of manifest.assets) {
      assert.equal(keys.has(asset.logical_key), false);
      keys.add(asset.logical_key);
      assert.equal(typeof asset.source_package, "string");
      assert.equal(typeof asset.source_version, "string");
      assert.equal(typeof asset.source_path, "string");
      assert.equal(typeof asset.license, "string");
      const bytes = await readFile(join(outputRoot, "viewer_assets", ...asset.path.split("/")));
      assert.equal(bytes.byteLength, asset.size);
      assert.equal(sha256(bytes), asset.sha256);
    }
    for (const key of [
      "draco/draco_wasm_wrapper.js",
      "draco/draco_decoder.wasm",
      "basis/basis_transcoder.js",
      "basis/basis_transcoder.wasm",
    ]) {
      assert.equal(keys.has(key), true);
    }
    const thirdPartyNotices = await readFile(
      join(outputRoot, "viewer_assets/licenses/THIRD_PARTY_NOTICES.txt"),
      "utf8",
    );
    assert.match(thirdPartyNotices, /@google\/model-viewer 4\.2\.0 legacy environment scene - Apache-2\.0/);

    const generatedSource = await readFile(result.generatedModule, "utf8");
    const generated = await import(
      `data:text/javascript;base64,${Buffer.from(generatedSource).toString("base64")}`
    );
    assert.equal(generated.VIEWER_ASSET_MANIFEST_DIGEST, result.manifestDigest);
    assert.equal(Object.isFrozen(generated.VIEWER_ASSET_KEYS), true);
    assert.equal(
      generated.viewerAssetUrl("basis/basis_transcoder.wasm"),
      "/comfyui-lux3d/viewer-assets/v1/"
        + result.manifestDigest
        + "/basis/basis_transcoder.wasm",
    );
    assert.throws(() => generated.viewerAssetUrl("../manifest.json"), /Unknown Lux3D viewer asset key/);
  } finally {
    await rm(temporaryRoot, {recursive: true, force: true});
  }
});

test("fails before emitting output when an adapter entry is absent", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "lux3d-viewer-missing-entry-"));
  try {
    const existingEntry = join(temporaryRoot, "entry.js");
    const outputRoot = join(temporaryRoot, "output");
    await writeFile(existingEntry, "export const ok = true;\n");
    await assert.rejects(
      buildViewerDistribution({
        outputRoot,
        entryPoints: {
          controller: existingEntry,
          glb: existingEntry,
          gaussian: join(temporaryRoot, "missing.js"),
        },
      }),
      /Missing gaussian adapter entry/,
    );
    assert.equal(existsSync(join(outputRoot, "viewer_assets")), false);
    assert.equal(existsSync(join(outputRoot, "js/assets")), false);
  } finally {
    await rm(temporaryRoot, {recursive: true, force: true});
  }
});

test("checked-in viewer distribution exactly matches a clean build from current sources", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "lux3d-viewer-reproducible-build-"));
  try {
    const result = await buildViewerDistribution({outputRoot: temporaryRoot});
    const rebuiltGlbSource = await readFile(result.bundles.glb, "utf8");
    assert.match(rebuiltGlbSource, new RegExp(result.manifestDigest));
    const relativeFiles = [
      "frontend/src/generated/viewer-assets.js",
      "js/assets/lux3d-input-source-extension.mjs",
      "js/assets/lux3d-viewer-controller.mjs",
      "js/assets/lux3d-glb-adapter.mjs",
      "js/assets/lux3d-gaussian-adapter.mjs",
      "viewer_assets/manifest.json",
      ...result.manifest.assets.map((asset) => `viewer_assets/${asset.path}`),
    ];
    for (const relativeFile of relativeFiles) {
      const expected = await readFile(join(repositoryRoot, ...relativeFile.split("/")));
      const rebuilt = await readFile(join(temporaryRoot, ...relativeFile.split("/")));
      assert.equal(
        sha256(expected),
        sha256(rebuilt),
        `${relativeFile} is stale; run npm run build:viewer`,
      );
    }
  } finally {
    await rm(temporaryRoot, {recursive: true, force: true});
  }
});

async function importFresh(path) {
  return import(pathToFileURL(path).href + "?test=" + Date.now() + "-" + Math.random());
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
