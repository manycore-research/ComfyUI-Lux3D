import {readFile} from "node:fs/promises";
import {resolve} from "node:path";

import {parseGaussianPly} from "../src/viewer/format/gaussian-ply.js";
import {fitGaussianCamera} from "../src/viewer/math/gaussian-screen-fit.js";

const filePaths = process.argv.slice(2);
if (filePaths.length === 0) {
  throw new Error("At least one Gaussian PLY path is required");
}

const viewports = [
  {viewportWidth: 300, viewportHeight: 300, devicePixelRatio: 1},
  {viewportWidth: 480, viewportHeight: 270, devicePixelRatio: 1},
  {viewportWidth: 270, viewportHeight: 480, devicePixelRatio: 1},
  {viewportWidth: 300, viewportHeight: 300, devicePixelRatio: 2},
];

for (const filePath of filePaths) {
  const absolutePath = resolve(filePath);
  const file = await readFile(absolutePath);
  const parsed = parseGaussianPly(file);
  const fits = [];
  for (const viewport of viewports) {
    const fit = fitGaussianCamera(parsed.splats, viewport);
    fits.push({
      viewport: fit.physicalViewport,
      distance: fit.distance,
      near: fit.near,
      far: fit.far,
      visibleSplatCount: fit.visibleSplatCount,
      shaderCulledSplatCount: fit.culledSplatCount,
      conservativeOverflowPixels: fit.conservativeOverflowPixels,
      maximumExactOverflowPixels: fit.maximumExactOverflowPixels,
      bracketExpansions: fit.bracketExpansions,
      bisections: fit.bisections,
    });
  }
  console.log(JSON.stringify({file: absolutePath, ...parsed.stats, fits}));
}
