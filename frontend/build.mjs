import {createHash} from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import {tmpdir} from "node:os";
import {dirname, isAbsolute, join, relative, resolve, sep} from "node:path";
import {pathToFileURL} from "node:url";

import {build as esbuild} from "esbuild";

const repositoryRoot = resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(await readFile(join(repositoryRoot, "package.json"), "utf8"));
const EXPECTED_VERSIONS = Object.freeze({
  "@mkkellogg/gaussian-splats-3d": "0.4.6",
  esbuild: "0.28.2",
  playwright: "1.62.1",
  three: "0.183.2",
});
const DECODER_KEYS = Object.freeze([
  "basis/basis_transcoder.js",
  "basis/basis_transcoder.wasm",
  "draco/draco_decoder.wasm",
  "draco/draco_wasm_wrapper.js",
]);
const MIME_BY_EXTENSION = Object.freeze({
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".wasm": "application/wasm",
});

export async function buildViewerDistribution(options = {}) {
  const outputRoot = resolve(options.outputRoot ?? repositoryRoot);
  const entryPoints = {
    inputSources: resolve(options.entryPoints?.inputSources
      ?? join(repositoryRoot, "frontend/src/lux3d-input-source-extension.mjs")),
    controller: resolve(options.entryPoints?.controller
      ?? join(repositoryRoot, "frontend/src/lux3d-viewer-extension.js")),
    glb: resolve(options.entryPoints?.glb
      ?? join(repositoryRoot, "frontend/src/viewer/adapters/glb-adapter.js")),
    gaussian: resolve(options.entryPoints?.gaussian
      ?? join(repositoryRoot, "frontend/src/viewer/adapters/gaussian-ply-adapter.js")),
  };
  await validateBuildInputs(entryPoints);

  const stageRoot = await mkdtemp(join(tmpdir(), "comfyui-lux3d-viewer-build-"));
  try {
    const stageViewerAssets = join(stageRoot, "viewer_assets");
    const stageBundles = join(stageRoot, "js/assets");
    await mkdir(stageViewerAssets, {recursive: true});
    await mkdir(stageBundles, {recursive: true});
    await cp(
      entryPoints.inputSources,
      join(stageBundles, "lux3d-input-source-extension.mjs"),
    );

    const manifest = await emitViewerAssets(stageViewerAssets);
    const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    const manifestDigest = sha256(manifestBytes);
    await writeFile(join(stageViewerAssets, "manifest.json"), manifestBytes);
    const generatedModule = renderGeneratedAssetModule(manifestDigest, manifest.assets);
    const generatedModuleSource = join(repositoryRoot, "frontend/src/generated/viewer-assets.js");
    const generatedModuleTarget = join(outputRoot, "frontend/src/generated/viewer-assets.js");

    const controllerBuild = await buildBundle({
      entryPoint: entryPoints.controller,
      outfile: join(stageBundles, "lux3d-viewer-controller.mjs"),
      graph: "controller",
      generatedModule,
      generatedModuleSource,
    });
    const glbBuild = await buildBundle({
      entryPoint: entryPoints.glb,
      outfile: join(stageBundles, "lux3d-glb-adapter.mjs"),
      graph: "glb",
      generatedModule,
      generatedModuleSource,
    });
    const gaussianBuild = await buildBundle({
      entryPoint: entryPoints.gaussian,
      outfile: join(stageBundles, "lux3d-gaussian-adapter.mjs"),
      graph: "gaussian",
      generatedModule,
      generatedModuleSource,
    });
    assertThreeIsolation(controllerBuild.metafile, glbBuild.metafile, gaussianBuild.metafile);
    await assertSelfContainedBundles(stageBundles);

    await replaceDirectory(stageViewerAssets, join(outputRoot, "viewer_assets"), outputRoot);
    await replaceDirectory(stageBundles, join(outputRoot, "js/assets"), outputRoot);
    await replaceFile(generatedModuleTarget, Buffer.from(generatedModule, "utf8"), outputRoot);

    return Object.freeze({
      manifestDigest,
      manifest,
      bundles: Object.freeze({
        inputSources: join(outputRoot, "js/assets/lux3d-input-source-extension.mjs"),
        controller: join(outputRoot, "js/assets/lux3d-viewer-controller.mjs"),
        glb: join(outputRoot, "js/assets/lux3d-glb-adapter.mjs"),
        gaussian: join(outputRoot, "js/assets/lux3d-gaussian-adapter.mjs"),
      }),
      generatedModule: generatedModuleTarget,
    });
  } finally {
    await rm(stageRoot, {recursive: true, force: true});
  }
}

async function validateBuildInputs(entryPoints) {
  if (packageJson.private !== true) {
    throw new Error("package.json must remain private");
  }
  for (const [name, expected] of Object.entries(EXPECTED_VERSIONS)) {
    const manifest = JSON.parse(await readFile(
      join(repositoryRoot, "node_modules", ...name.split("/"), "package.json"),
      "utf8",
    ));
    if (manifest.version !== expected) {
      throw new Error(`${name} must resolve to ${expected}, received ${manifest.version}`);
    }
  }
  for (const [graph, entryPoint] of Object.entries(entryPoints)) {
    try {
      const entryStat = await stat(entryPoint);
      if (!entryStat.isFile()) throw new Error("not a file");
    } catch (error) {
      throw new Error(`Missing ${graph} adapter entry: ${entryPoint}`, {cause: error});
    }
  }
  await assertPinnedGaussianApi();
}

async function assertPinnedGaussianApi() {
  const module = await import("@mkkellogg/gaussian-splats-3d");
  if (typeof module.PlyLoader?.loadFromFileData !== "function"
      || typeof module.Viewer?.prototype?.getSplatMesh !== "function") {
    throw new Error("Pinned Gaussian package exports do not match the adapter contract");
  }
  const source = await readFile(
    join(repositoryRoot, "node_modules/@mkkellogg/gaussian-splats-3d/build/gaussian-splats-3d.module.js"),
    "utf8",
  );
  for (const marker of [
    "addSplatBuffers = function()",
    "getSplatCount(",
    "getSplatCenter(",
    "getSplatScaleAndRotation = function()",
  ]) {
    if (!source.includes(marker)) {
      throw new Error(`Pinned Gaussian API marker is missing: ${marker}`);
    }
  }
}

async function emitViewerAssets(outputDirectory) {
  const threeRoot = join(repositoryRoot, "node_modules/three");
  const gaussianRoot = join(repositoryRoot, "node_modules/@mkkellogg/gaussian-splats-3d");
  const playwrightRoot = join(repositoryRoot, "node_modules/playwright");
  const apacheLicense = extractApacheTerms(await readFile(join(playwrightRoot, "LICENSE"), "utf8"));
  const generatedAssets = new Map([
    ["licenses/Apache-2.0.txt", Buffer.from(apacheLicense, "utf8")],
    ["licenses/meshoptimizer-MIT.txt", Buffer.from(meshoptimizerLicense(), "utf8")],
    ["licenses/THIRD_PARTY_NOTICES.txt", Buffer.from(thirdPartyNotices(), "utf8")],
  ]);
  const specs = [
    assetSpec("draco/draco_wasm_wrapper.js", "three", "0.183.2", "examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js", "Apache-2.0", join(threeRoot, "examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js")),
    assetSpec("draco/draco_decoder.wasm", "three", "0.183.2", "examples/jsm/libs/draco/gltf/draco_decoder.wasm", "Apache-2.0", join(threeRoot, "examples/jsm/libs/draco/gltf/draco_decoder.wasm")),
    assetSpec("basis/basis_transcoder.js", "three", "0.183.2", "examples/jsm/libs/basis/basis_transcoder.js", "Apache-2.0", join(threeRoot, "examples/jsm/libs/basis/basis_transcoder.js")),
    assetSpec("basis/basis_transcoder.wasm", "three", "0.183.2", "examples/jsm/libs/basis/basis_transcoder.wasm", "Apache-2.0", join(threeRoot, "examples/jsm/libs/basis/basis_transcoder.wasm")),
    assetSpec("licenses/three-MIT.txt", "three", "0.183.2", "LICENSE", "MIT", join(threeRoot, "LICENSE")),
    assetSpec("licenses/gaussian-splats-3d-MIT.txt", "@mkkellogg/gaussian-splats-3d", "0.4.6", "LICENSE", "MIT", join(gaussianRoot, "LICENSE")),
    assetSpec("licenses/draco-NOTICE.md", "three", "0.183.2", "examples/jsm/libs/draco/README.md", "Apache-2.0", join(threeRoot, "examples/jsm/libs/draco/README.md")),
    assetSpec("licenses/basis-NOTICE.md", "three", "0.183.2", "examples/jsm/libs/basis/README.md", "Apache-2.0", join(threeRoot, "examples/jsm/libs/basis/README.md")),
    generatedSpec("licenses/Apache-2.0.txt", "Apache-2.0", "2.0", "license terms", "Apache-2.0"),
    generatedSpec("licenses/meshoptimizer-MIT.txt", "meshoptimizer via three", "0.22", "examples/jsm/libs/meshopt_decoder.module.js", "MIT"),
    generatedSpec("licenses/THIRD_PARTY_NOTICES.txt", "ComfyUI-Lux3D", packageJson.version, "frontend/build.mjs", "NOTICE"),
  ];

  const entries = [];
  for (const spec of specs.sort((left, right) => left.logicalKey.localeCompare(right.logicalKey))) {
    const bytes = spec.sourceFile
      ? await readFile(spec.sourceFile)
      : generatedAssets.get(spec.logicalKey);
    if (!bytes) throw new Error(`No generated bytes for ${spec.logicalKey}`);
    const destination = safeOutputPath(outputDirectory, spec.logicalKey);
    await mkdir(dirname(destination), {recursive: true});
    await writeFile(destination, bytes);
    entries.push({
      logical_key: spec.logicalKey,
      source_package: spec.sourcePackage,
      source_version: spec.sourceVersion,
      source_path: spec.sourcePath,
      path: spec.logicalKey,
      size: bytes.byteLength,
      mime: mimeFor(spec.logicalKey),
      license: spec.license,
      sha256: sha256(bytes),
    });
  }
  for (const decoderKey of DECODER_KEYS) {
    if (!entries.some((entry) => entry.logical_key === decoderKey)) {
      throw new Error(`Required decoder asset is missing: ${decoderKey}`);
    }
  }
  return {schema_version: 1, assets: entries};
}

function assetSpec(logicalKey, sourcePackage, sourceVersion, sourcePath, license, sourceFile) {
  return {logicalKey, sourcePackage, sourceVersion, sourcePath, license, sourceFile};
}

function generatedSpec(logicalKey, sourcePackage, sourceVersion, sourcePath, license) {
  return {logicalKey, sourcePackage, sourceVersion, sourcePath, license};
}

async function buildBundle({entryPoint, outfile, graph, generatedModule, generatedModuleSource}) {
  const standardThree = join(repositoryRoot, "node_modules/three/build/three.module.js");
  return esbuild({
    entryPoints: [entryPoint],
    outfile,
    bundle: true,
    splitting: false,
    format: "esm",
    platform: "browser",
    target: ["es2022"],
    minify: true,
    sourcemap: false,
    legalComments: "none",
    metafile: true,
    charset: "ascii",
    nodePaths: [join(repositoryRoot, "node_modules")],
    plugins: [
      generatedModulePlugin(generatedModuleSource, generatedModule),
      {
        name: `exact-three-${graph}`,
        setup(build) {
          if (graph === "controller") {
            build.onResolve({filter: /^\.\/adapters\/glb-adapter\.js$/}, () => ({
              path: "./lux3d-glb-adapter.mjs",
              external: true,
            }));
            build.onResolve({filter: /^\.\/adapters\/gaussian-ply-adapter\.js$/}, () => ({
              path: "./lux3d-gaussian-adapter.mjs",
              external: true,
            }));
            build.onResolve(
              {filter: /^(?:three(?:\/.*)?|@mkkellogg\/gaussian-splats-3d)$/},
              (args) => ({
                errors: [{text: `Controller build cannot import 3D runtime ${args.path}`}],
              }),
            );
            return;
          }
          build.onResolve({filter: /^three$/}, () => ({path: standardThree}));
          if (graph === "gaussian") {
            build.onResolve({filter: /^three\//}, (args) => ({
              errors: [{text: `Gaussian build cannot import Three subpath ${args.path}`}],
            }));
          }
        },
      },
    ],
  });
}

function generatedModulePlugin(targetPath, contents) {
  const normalizedTarget = resolve(targetPath);
  return {
    name: "generated-viewer-assets",
    setup(build) {
      build.onResolve({filter: /viewer-assets\.js$/}, (args) => {
        if (resolve(args.resolveDir, args.path) !== normalizedTarget) return null;
        return {path: normalizedTarget, namespace: "lux3d-generated"};
      });
      build.onLoad({filter: /.*/, namespace: "lux3d-generated"}, () => ({
        contents,
        loader: "js",
      }));
    },
  };
}

function assertThreeIsolation(controllerMetafile, glbMetafile, gaussianMetafile) {
  const controllerInputs = Object.keys(controllerMetafile.inputs).map(normalizeSlashes);
  const glbInputs = Object.keys(glbMetafile.inputs).map(normalizeSlashes);
  const gaussianInputs = Object.keys(gaussianMetafile.inputs).map(normalizeSlashes);
  if (controllerInputs.some((path) => path.includes("node_modules/three")
      || path.includes("node_modules/@mkkellogg/gaussian-splats-3d"))) {
    throw new Error("Controller bundle must not contain a Three or Gaussian runtime");
  }
  if (!glbInputs.some((path) => path.endsWith("node_modules/three/build/three.module.js"))) {
    throw new Error("GLB bundle did not resolve exclusively to Three 0.183.2");
  }
  if (!gaussianInputs.some((path) => path.endsWith("node_modules/three/build/three.module.js"))) {
    throw new Error("Gaussian bundle did not resolve exclusively to Three 0.183.2");
  }
}

async function assertSelfContainedBundles(directory) {
  for (const file of [
    "lux3d-input-source-extension.mjs",
    "lux3d-viewer-controller.mjs",
    "lux3d-glb-adapter.mjs",
    "lux3d-gaussian-adapter.mjs",
  ]) {
    const source = await readFile(join(directory, file), "utf8");
    if (/\b(?:from\s*|import\s*\()\s*["'](?:three|https?:\/\/)/.test(source)) {
      throw new Error(`${file} is not a self-contained local bundle`);
    }
  }
}

function renderGeneratedAssetModule(manifestDigest, assets) {
  const keys = assets.map((asset) => asset.logical_key);
  return `// Generated by frontend/build.mjs. Do not edit.\n`
    + `export const VIEWER_ASSET_MANIFEST_DIGEST = ${JSON.stringify(manifestDigest)};\n`
    + `export const VIEWER_ASSET_KEYS = Object.freeze(${JSON.stringify(keys, null, 2)});\n`
    + "const VIEWER_ASSET_KEY_SET = new Set(VIEWER_ASSET_KEYS);\n"
    + "export function viewerAssetUrl(logicalKey) {\n"
    + "  if (typeof logicalKey !== \"string\" || !VIEWER_ASSET_KEY_SET.has(logicalKey)) {\n"
    + "    throw new Error(`Unknown Lux3D viewer asset key: ${String(logicalKey)}`);\n"
    + "  }\n"
    + "  const encodedKey = logicalKey.split(\"/\").map(encodeURIComponent).join(\"/\");\n"
    + "  return `/comfyui-lux3d/viewer-assets/v1/${VIEWER_ASSET_MANIFEST_DIGEST}/${encodedKey}`;\n"
    + "}\n";
}

async function replaceDirectory(source, target, root) {
  assertWithinRoot(target, root);
  await rm(target, {recursive: true, force: true});
  await mkdir(dirname(target), {recursive: true});
  await cp(source, target, {recursive: true, errorOnExist: true});
}

async function replaceFile(target, bytes, root) {
  assertWithinRoot(target, root);
  await mkdir(dirname(target), {recursive: true});
  const temporary = `${target}.tmp`;
  await writeFile(temporary, bytes);
  await rm(target, {force: true});
  await rename(temporary, target);
}

function assertWithinRoot(target, root) {
  const relativePath = relative(resolve(root), resolve(target));
  if (!relativePath || relativePath.startsWith(`..${sep}`) || relativePath === ".." || isAbsolute(relativePath)) {
    throw new Error(`Refusing to replace path outside the build root: ${target}`);
  }
}

function safeOutputPath(root, logicalKey) {
  if (!isNormalizedLogicalKey(logicalKey)) {
    throw new Error(`Invalid viewer asset logical key: ${logicalKey}`);
  }
  const output = resolve(root, ...logicalKey.split("/"));
  assertWithinRoot(output, root);
  return output;
}

function isNormalizedLogicalKey(value) {
  return typeof value === "string"
    && value.length > 0
    && !value.startsWith("/")
    && !value.includes("\\")
    && !value.includes("\0")
    && value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function mimeFor(logicalKey) {
  const extension = logicalKey.slice(logicalKey.lastIndexOf("."));
  const mime = MIME_BY_EXTENSION[extension];
  if (!mime) throw new Error(`No fixed MIME for ${logicalKey}`);
  return mime;
}

function extractApacheTerms(text) {
  const marker = "END OF TERMS AND CONDITIONS";
  const markerOffset = text.indexOf(marker);
  if (markerOffset < 0) throw new Error("Installed Apache license text is malformed");
  const lineEnd = text.indexOf("\n", markerOffset);
  return `${text.slice(0, lineEnd < 0 ? text.length : lineEnd).trimEnd()}\n`;
}

function meshoptimizerLicense() {
  return `MIT License

Copyright (c) 2016-2024 Arseny Kapoulkine

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;
}

function thirdPartyNotices() {
  return `ComfyUI-Lux3D Viewer third-party notices

Three.js 0.183.2 - MIT - https://github.com/mrdoob/three.js
GaussianSplats3D 0.4.6 - MIT - https://github.com/mkkellogg/GaussianSplats3D
@google/model-viewer 4.2.0 legacy environment scene - Apache-2.0 - https://github.com/google/model-viewer
Draco decoder distributed by Three.js 0.183.2 - Apache-2.0 - https://github.com/google/draco
Basis Universal transcoder distributed by Three.js 0.183.2 - Apache-2.0 - https://github.com/BinomialLLC/basis_universal
meshoptimizer decoder 0.22 distributed by Three.js 0.183.2 - MIT - https://github.com/zeux/meshoptimizer

The corresponding license texts are included in this directory.
`;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function normalizeSlashes(path) {
  return path.replaceAll("\\", "/");
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const result = await buildViewerDistribution();
  console.log(`Built Lux3D viewer assets with manifest ${result.manifestDigest}`);
}
