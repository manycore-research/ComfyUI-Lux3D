import assert from "node:assert/strict";
import {createReadStream, existsSync} from "node:fs";
import {createServer} from "node:http";
import {extname, join, resolve, sep} from "node:path";

import {chromium} from "playwright";

import {
  fitGaussianCamera,
  prepareGaussianSplats,
  projectGaussianQuad,
} from "../src/viewer/math/gaussian-screen-fit.js";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const browserExecutable = discoverBrowserExecutable();
const fixtures = [
  {
    name: "fitted-square",
    viewportWidth: 300,
    viewportHeight: 300,
    devicePixelRatio: 1,
    useFittedCamera: true,
    splats: [
      {center: [-0.7, 0.4, 0.2], scale: [0.72, 0.31, 0.18], rotation: [0.12, -0.18, 0.31, 0.92], alpha: 254},
      {center: [0.9, -0.6, -0.4], scale: [0.28, 0.61, 0.22], rotation: [-0.22, 0.38, 0.17, 0.87], alpha: 254},
    ],
  },
  {
    name: "landscape",
    viewportWidth: 360,
    viewportHeight: 240,
    devicePixelRatio: 1,
    distance: 12,
    target: [0.4, -0.3, 0.2],
    splats: [
      {center: [-1.1, -0.2, 0.5], scale: [0.65, 0.24, 0.16], rotation: [0.31, 0.16, -0.21, 0.91], alpha: 254},
      {center: [1.3, 0.8, -0.7], scale: [0.19, 0.58, 0.27], rotation: [-0.14, 0.29, 0.33, 0.89], alpha: 254},
    ],
  },
  {
    name: "retina-square",
    viewportWidth: 300,
    viewportHeight: 300,
    devicePixelRatio: 2,
    distance: 10,
    target: [0, 0, 0],
    splats: [
      {center: [-0.5, 0.2, 0.1], scale: [0.55, 0.26, 0.15], rotation: [0.19, -0.25, 0.28, 0.9], alpha: 254},
      {center: [0.8, -0.7, -0.2], scale: [0.22, 0.5, 0.2], rotation: [-0.24, 0.34, 0.13, 0.9], alpha: 254},
    ],
  },
  {
    name: "fractional-dpr-odd-viewport",
    viewportWidth: 301,
    viewportHeight: 199,
    devicePixelRatio: 1.25,
    distance: 9,
    target: [-0.2, 0.1, 0.3],
    splats: [
      {center: [-0.6, 0.5, 0.4], scale: [0.48, 0.29, 0.17], rotation: [0.23, -0.16, 0.27, 0.91], alpha: 254},
    ],
  },
  {
    name: "minimum-alpha-threshold",
    viewportWidth: 320,
    viewportHeight: 260,
    devicePixelRatio: 1,
    distance: 6,
    target: [0, 0, 0],
    splats: [
      {center: [-0.4, 0, 0], scale: [0.5, 0.4, 0.3], rotation: [0, 0, 0, 1], alpha: 1},
      {center: [0.4, 0, 0], scale: [0.5, 0.4, 0.3], rotation: [0, 0, 0, 1], alpha: 2},
    ],
  },
  {
    name: "shader-byte-scale-alpha-counterexample",
    viewportWidth: 320,
    viewportHeight: 260,
    devicePixelRatio: 1,
    distance: 6,
    target: [0, 0, 0],
    provesShaderByteScale: true,
    splats: [{
      center: [0.4, -0.25, 0.1],
      scale: [0.010742172598838806, 0.007841787301003933, 0.004404290113598108],
      rotation: [0.17, -0.24, 0.31, 0.9],
      alpha: 3,
    }],
  },
];

let server;
let browser;
let comparisonCount = 0;
try {
  server = createStaticServer(repositoryRoot);
  await listen(server);
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({
    executablePath: browserExecutable,
    headless: true,
    args: ["--enable-webgl", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
  });

  for (const fixture of fixtures) {
    let context;
    try {
      context = await browser.newContext({
        viewport: {width: 800, height: 600},
        deviceScaleFactor: fixture.devicePixelRatio,
      });
      const page = await context.newPage();
      const browserLogs = [];
      page.on("console", (message) => browserLogs.push(`${message.type()}: ${message.text()}`));
      page.on("pageerror", (error) => browserLogs.push(`pageerror: ${error.message}`));
      page.on("response", (response) => {
        if (response.status() >= 400) {
          browserLogs.push(`response ${response.status()}: ${response.url()}`);
        }
      });
      await page.goto(origin, {waitUntil: "networkidle"});
      await page.waitForFunction(() => window.gaussianFixtureReady === true);

      const camera = resolveCamera(fixture);
      const prepared = prepareGaussianSplats(fixture.splats);
      const projected = prepared.map((splat) => projectGaussianQuad(
        splat,
        camera.distance,
        camera.target,
        fixture,
      ));
      const shaderWidth = fixture.viewportWidth * fixture.devicePixelRatio;
      const shaderHeight = fixture.viewportHeight * fixture.devicePixelRatio;
      const expectedWidth = Math.floor(shaderWidth);
      const expectedHeight = Math.floor(shaderHeight);
      if (fixture.provesShaderByteScale) {
        assert.equal(projected.length, 1);
        assert.equal(projected[0].culled, false);
        assert.equal(oldDirectDivisionCulled(fixture.splats[0], projected[0]), true);
      }

      for (let index = 0; index < fixture.splats.length; index += 1) {
        const expected = projected[index];
        const actual = await page.evaluate(
          (payload) => window.renderGaussianQuadFixture(payload),
          {
            ...fixture,
            ...camera,
            splats: [fixture.splats[index]],
          },
        );

        const diagnostic = {fixture: fixture.name, index, expected, actual, browserLogs};
        assert.equal(actual.threeRevision, "183", JSON.stringify(diagnostic));
        assert.equal(actual.shaderContractPresent, true, JSON.stringify(diagnostic));
        assert.equal(actual.width, expectedWidth, JSON.stringify(diagnostic));
        assert.equal(actual.height, expectedHeight, JSON.stringify(diagnostic));
        assertVectorNear(actual.viewport, [shaderWidth, shaderHeight], 1e-12, diagnostic);
        assertVectorNear(
          actual.basisViewport,
          [1 / shaderWidth, 1 / shaderHeight],
          1e-12,
          diagnostic,
        );
        const expectedFocal = shaderHeight / (2 * Math.tan(50 * Math.PI / 360));
        assertVectorNear(actual.focal, [expectedFocal, expectedFocal], 1e-4, diagnostic);
        assert.ok(
          Math.abs(actual.devicePixelRatio - fixture.devicePixelRatio) < 1e-12,
          JSON.stringify(diagnostic),
        );
        assert.equal(actual.decodedAlpha, fixture.splats[index].alpha, JSON.stringify(diagnostic));
        assert.equal(actual.glError, 0, JSON.stringify(diagnostic));

        if (expected.culled) {
          assert.equal(actual.pixelCount, 0, JSON.stringify(diagnostic));
          assert.equal(actual.bounds, null, JSON.stringify(diagnostic));
        } else {
          assert.ok(actual.pixelCount > 0, JSON.stringify(diagnostic));
          for (const edge of ["minX", "maxX", "minY", "maxY"]) {
            const difference = Math.abs(actual.bounds[edge] - expected.bounds[edge]);
            assert.ok(difference <= 1, JSON.stringify({edge, difference, ...diagnostic}));
          }
        }
        comparisonCount += 1;
      }
    } finally {
      if (context) await context.close();
    }
  }
} finally {
  try {
    if (browser) await browser.close();
  } finally {
    if (server) await closeServer(server);
  }
}

console.log(
  `Pinned shader canvas parity passed for ${comparisonCount} individual splats in ${fixtures.length} fixtures using ${browserExecutable}`,
);

function resolveCamera(fixture) {
  if (fixture.useFittedCamera) {
    const fit = fitGaussianCamera(fixture.splats, fixture);
    return {
      distance: fit.distance,
      target: fit.target,
      near: fit.near,
      far: fit.far,
    };
  }

  const prepared = prepareGaussianSplats(fixture.splats);
  const projected = prepared.map((splat) => projectGaussianQuad(
    splat,
    fixture.distance,
    fixture.target,
    fixture,
  ));
  const depths = projected.map((entry) => entry.depth);
  return {
    distance: fixture.distance,
    target: fixture.target,
    near: Math.min(...depths) / 2,
    far: Math.max(...depths) * 2,
  };
}

function assertVectorNear(actual, expected, tolerance, diagnostic) {
  assert.equal(actual.length, expected.length, JSON.stringify(diagnostic));
  for (let index = 0; index < expected.length; index += 1) {
    assert.ok(
      Math.abs(actual[index] - expected[index]) <= tolerance,
      JSON.stringify({actual, expected, tolerance, diagnostic}),
    );
  }
}

function oldDirectDivisionCulled(splat, projected) {
  const oldShaderAlpha = Math.fround(splat.alpha / 255);
  const oldProduct = Math.fround(oldShaderAlpha * projected.alphaCompensation);
  return oldProduct < Math.fround(1 / 255);
}

function discoverBrowserExecutable() {
  const explicit = process.env.LUX3D_BROWSER_EXECUTABLE;
  if (explicit) {
    const resolvedExplicit = resolve(explicit);
    if (!existsSync(resolvedExplicit)) {
      throw new Error(`LUX3D_BROWSER_EXECUTABLE does not exist: ${resolvedExplicit}`);
    }
    return resolvedExplicit;
  }

  const candidates = [chromium.executablePath()];
  if (process.platform === "win32") {
    for (const base of [environment("ProgramFiles"), environment("ProgramFiles(x86)"), environment("LocalAppData")]) {
      if (base) candidates.push(join(base, "Google", "Chrome", "Application", "chrome.exe"));
    }
  } else if (process.platform === "darwin") {
    candidates.push("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
  } else {
    candidates.push(
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
    );
  }

  const executable = candidates.find((candidate) => candidate && existsSync(candidate));
  if (!executable) {
    throw new Error(
      "No Chromium executable found. Set LUX3D_BROWSER_EXECUTABLE or install Playwright Chromium explicitly.",
    );
  }
  return executable;
}

function environment(name) {
  const entry = Object.entries(process.env).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return entry?.[1];
}

function listen(httpServer) {
  return new Promise((resolveListen, rejectListen) => {
    const onError = (error) => {
      httpServer.off("listening", onListening);
      rejectListen(error);
    };
    const onListening = () => {
      httpServer.off("error", onError);
      resolveListen();
    };
    httpServer.once("error", onError);
    httpServer.once("listening", onListening);
    httpServer.listen(0, "127.0.0.1");
  });
}

function closeServer(httpServer) {
  if (!httpServer.listening) return Promise.resolve();
  return new Promise((resolveClose, rejectClose) => httpServer.close((error) => (
    error ? rejectClose(error) : resolveClose()
  )));
}

function createStaticServer(root) {
  const rootPrefix = `${resolve(root)}${sep}`;
  return createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname === "/") {
      response.writeHead(200, {"Content-Type": "text/html; charset=utf-8"});
      response.end(`<!doctype html>
        <meta charset="utf-8">
        <link rel="icon" href="data:,">
        <script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js"}}</script>
        <script type="module" src="/frontend/test/gaussian-screen-fit-browser-fixture.mjs"></script>`);
      return;
    }

    const filePath = resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (!filePath.startsWith(rootPrefix)
        || (!url.pathname.startsWith("/frontend/") && !url.pathname.startsWith("/node_modules/"))) {
      response.writeHead(403);
      response.end();
      return;
    }
    const contentType = [".js", ".mjs"].includes(extname(filePath))
      ? "text/javascript; charset=utf-8"
      : "application/octet-stream";
    const stream = createReadStream(filePath);
    stream.on("error", () => {
      if (!response.headersSent) response.writeHead(404);
      response.end();
    });
    response.writeHead(200, {"Content-Type": contentType});
    stream.pipe(response);
  });
}
