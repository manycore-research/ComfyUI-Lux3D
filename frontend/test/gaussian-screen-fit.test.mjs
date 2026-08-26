import assert from "node:assert/strict";
import {test} from "node:test";

import {parseGaussianPly} from "../src/viewer/format/gaussian-ply.js";
import {
  GaussianFitValidationError,
  GaussianFittingError,
  computeDeterministicTarget,
  computeRotationInvariantCameraDistance,
  conservativeOverflowPixels,
  fitGaussianCamera,
  nextDown,
  prepareGaussianSplats,
  projectGaussianQuad,
  shaderAlphaFromByte,
} from "../src/viewer/math/gaussian-screen-fit.js";

const rotatedSplat = (overrides = {}) => ({
  center: [0, 0, 0],
  scale: [1.25, 0.45, 0.2],
  rotation: [0.12, -0.18, 0.31, 0.92],
  alpha: 255,
  ...overrides,
});

test("fits rotated anisotropic and off-axis splats for every viewport contract", () => {
  const splats = [
    rotatedSplat({center: [-1.2, 0.7, -0.3]}),
    rotatedSplat({
      center: [2.1, -1.4, 0.8],
      scale: [0.35, 1.7, 0.6],
      rotation: [-0.22, 0.38, 0.17, 0.87],
    }),
    rotatedSplat({
      center: [0.4, 2.2, -1.1],
      scale: [3.5, 0.25, 0.15],
      rotation: [0.41, 0.11, -0.27, 0.86],
    }),
  ];
  const viewports = [
    {viewportWidth: 300, viewportHeight: 300, devicePixelRatio: 1},
    {viewportWidth: 480, viewportHeight: 270, devicePixelRatio: 1},
    {viewportWidth: 270, viewportHeight: 480, devicePixelRatio: 1},
    {viewportWidth: 300, viewportHeight: 300, devicePixelRatio: 2},
  ];

  for (const viewport of viewports) {
    const fit = fitGaussianCamera(splats, viewport);
    assert.ok(Number.isFinite(fit.distance) && fit.distance > 0);
    assert.ok(fit.conservativeOverflowPixels <= 0);
    assert.ok(fit.maximumExactOverflowPixels <= 0);
    assert.ok(fit.near > 0 && fit.far > fit.near);
    assert.equal(fit.visibleSplatCount + fit.culledSplatCount, splats.length);
  }
});

test("rotation-invariant fit keeps every Gaussian support sphere outside the camera for all axes", () => {
  const viewport = {viewportWidth: 480, viewportHeight: 270, devicePixelRatio: 1.25};
  const prepared = prepareGaussianSplats([
    rotatedSplat({center: [-2.5, 0.4, 1.2], scale: [3.8, 0.22, 0.16]}),
    rotatedSplat({center: [1.7, -1.1, -2.3], scale: [0.18, 2.9, 0.31]}),
  ]);
  const target = computeDeterministicTarget(prepared);
  const invariant = computeRotationInvariantCameraDistance(prepared, target, viewport);
  const fit = fitGaussianCamera(prepared, viewport);

  assert.ok(invariant.distance > invariant.supportRadius);
  assert.ok(fit.distance >= invariant.distance);
  assert.ok(fit.distance > fit.rotationSupportRadius);
  assert.ok(Math.asin(fit.rotationSupportRadius / fit.distance) <= fit.rotationHalfFovRadians);
  for (const axis of [0, 1, 2]) {
    const positiveDepth = fit.distance - fit.rotationSupportRadius;
    const negativeDepth = fit.distance + fit.rotationSupportRadius;
    assert.ok(positiveDepth > 0, `axis ${axis} positive support remains in front of camera`);
    assert.ok(negativeDepth > positiveDepth, `axis ${axis} support interval is ordered`);
  }
});

test("the conservative containment predicate is monotone for a fixed camera axis", () => {
  const prepared = prepareGaussianSplats([
    rotatedSplat({center: [-2, 1, 0.5], scale: [4, 0.3, 0.15]}),
    rotatedSplat({center: [3, -2, -1], scale: [0.2, 2.5, 0.4]}),
  ]);
  const target = computeDeterministicTarget(prepared);
  const overflows = [10, 20, 40, 80, 160].map((distance) => (
    conservativeOverflowPixels(prepared, distance, target, {
      viewportWidth: 300,
      viewportHeight: 300,
      devicePixelRatio: 2,
    })
  ));
  for (let index = 1; index < overflows.length; index += 1) {
    assert.ok(overflows[index] <= overflows[index - 1], `${overflows[index]} <= ${overflows[index - 1]}`);
  }
});

test("the monotone predicate upper-bounds every exact visible shader quad", () => {
  const prepared = prepareGaussianSplats([
    rotatedSplat({center: [-2, 1, 0.5], scale: [4, 0.3, 0.15]}),
    rotatedSplat({center: [3, -2, -1], scale: [0.2, 2.5, 0.4]}),
  ]);
  const target = computeDeterministicTarget(prepared);
  const viewports = [
    {viewportWidth: 300, viewportHeight: 300, devicePixelRatio: 1},
    {viewportWidth: 480, viewportHeight: 270, devicePixelRatio: 1},
    {viewportWidth: 270, viewportHeight: 480, devicePixelRatio: 2},
  ];

  for (const viewport of viewports) {
    let previousConservative = Infinity;
    for (const distance of [10, 20, 40, 80, 160]) {
      const conservative = conservativeOverflowPixels(prepared, distance, target, viewport);
      const exact = prepared
        .map((splat) => projectGaussianQuad(splat, distance, target, viewport))
        .filter((projection) => !projection.culled)
        .reduce((worst, projection) => Math.max(
          worst,
          -projection.bounds.minX,
          projection.bounds.maxX - viewport.viewportWidth * viewport.devicePixelRatio,
          -projection.bounds.minY,
          projection.bounds.maxY - viewport.viewportHeight * viewport.devicePixelRatio,
        ), -Infinity);
      assert.ok(conservative >= exact, `${conservative} >= ${exact}`);
      assert.ok(conservative <= previousConservative, `${conservative} <= ${previousConservative}`);
      previousConservative = conservative;
    }
  }
});

test("the conservative predicate includes float32 center and basis assembly rounding", () => {
  const prepared = prepareGaussianSplats([{
    center: [18763.960165695844, 16458.12625928159, -9.979007119244178],
    scale: [0.014489156631289407, 0.028739535885403837, 0.15379209503311603],
    rotation: [
      0.0037165042012929916,
      0.4502236300613731,
      -0.2761041200719774,
      0.025605164701119065,
    ],
    alpha: 255,
  }]);
  const viewport = {viewportWidth: 300, viewportHeight: 300, devicePixelRatio: 1};
  const distance = 10;
  const projected = projectGaussianQuad(prepared[0], distance, [0, 0, 0], viewport);
  assert.equal(projected.culled, false);
  const exactOverflow = Math.max(
    -projected.bounds.minX,
    projected.bounds.maxX - viewport.viewportWidth,
    -projected.bounds.minY,
    projected.bounds.maxY - viewport.viewportHeight,
  );
  const conservative = conservativeOverflowPixels(
    prepared,
    distance,
    [0, 0, 0],
    viewport,
  );
  assert.ok(conservative >= exactOverflow, `${conservative} >= ${exactOverflow}`);
});

test("max screen-space size participates in the exact pinned-shader quad", () => {
  const prepared = prepareGaussianSplats([
    rotatedSplat({scale: [1e6, 2e5, 1e5]}),
  ]);
  const projected = projectGaussianQuad(prepared[0], 10, [0, 0, 0], {
    viewportWidth: 4096,
    viewportHeight: 4096,
    maxScreenSpaceSplatSize: 128,
  });
  assert.equal(projected.culled, false);
  assert.ok(Math.fround(Math.hypot(...projected.basis1)) <= 128);
  assert.ok(Math.fround(Math.hypot(...projected.basis2)) <= 128);
});

test("shader alpha decoding multiplies the byte by the float32 reciprocal", () => {
  const reciprocal = Math.fround(1 / 255);
  for (const alpha of [3, 6, 7]) {
    const expected = Math.fround(Math.fround(alpha) * reciprocal);
    assert.equal(shaderAlphaFromByte(alpha), expected);
    assert.notEqual(expected, Math.fround(alpha / 255));
  }
});

test("fractional DPR keeps shader dimensions but maps bounds to the floored drawing buffer", () => {
  const viewport = {viewportWidth: 301, viewportHeight: 199, devicePixelRatio: 1.25};
  const fit = fitGaussianCamera([
    rotatedSplat({center: [-0.7, 0.4, 0.2]}),
    rotatedSplat({center: [0.9, -0.6, -0.4], scale: [0.28, 0.61, 0.22]}),
  ], viewport);
  assert.deepEqual(fit.physicalViewport, [376, 248]);
  for (const splat of fit.preparedSplats) {
    const projected = projectGaussianQuad(splat, fit.distance, fit.target, viewport);
    if (projected.culled) continue;
    assert.ok(projected.bounds.minX >= 0 && projected.bounds.maxX <= 376);
    assert.ok(projected.bounds.minY >= 0 && projected.bounds.maxY <= 248);
  }
  assert.throws(
    () => fitGaussianCamera([rotatedSplat()], {
      viewportWidth: 0.5,
      viewportHeight: 1,
      devicePixelRatio: 1,
    }),
    (error) => error instanceof GaussianFitValidationError
      && error.code === "INVALID_PHYSICAL_VIEWPORT",
  );
});

test("max screen-space size rejects values the pinned shader would truncate", () => {
  assert.throws(
    () => fitGaussianCamera([rotatedSplat()], {maxScreenSpaceSplatSize: 128.5}),
    (error) => error instanceof GaussianFitValidationError
      && error.code === "INVALID_MAX_SCREEN_SPACE_SPLAT_SIZE",
  );
});

test("single-depth clip planes are float32-outward and pass the pinned perspective projection", () => {
  const fit = fitGaussianCamera([rotatedSplat({center: [0.3, -0.2, 0.7]})]);
  assert.equal(fit.minimumDepth, fit.maximumDepth);
  assert.equal(Math.fround(fit.near), fit.near);
  assert.equal(Math.fround(fit.far), fit.far);
  assert.ok(fit.near < fit.minimumDepth && fit.far > fit.maximumDepth);
  assert.equal(Math.fround(nextDown(fit.minimumDepth)), fit.minimumDepth);

  const coefficientC = Math.fround(-(fit.far + fit.near) / (fit.far - fit.near));
  const coefficientD = Math.fround((-2 * fit.far * fit.near) / (fit.far - fit.near));
  const clipZ = shaderAddForTest(
    shaderMultiplyForTest(coefficientC, -fit.minimumDepth),
    coefficientD,
  );
  assert.ok(clipZ >= -fit.minimumDepth && clipZ <= fit.minimumDepth);
});

test("minimumAlpha=1 removes only decoded alpha byte zero", () => {
  const prepared = prepareGaussianSplats([
    rotatedSplat({alpha: 0}),
    rotatedSplat({alpha: 1, center: [1, 0, 0]}),
    rotatedSplat({alpha: 255, center: [2, 0, 0]}),
  ]);
  assert.equal(prepared.length, 2);
  assert.deepEqual(prepared.map((splat) => splat.sourceIndex), [1, 2]);
});

test("invalid finite contracts fail without returning a fallback distance", () => {
  const invalidCases = [
    [rotatedSplat({center: [Number.NaN, 0, 0]})],
    [rotatedSplat({scale: [1, 0, 1]})],
    [rotatedSplat({rotation: [0, 0, 0, 0]})],
    [rotatedSplat({alpha: 0})],
  ];
  for (const splats of invalidCases) {
    assert.throws(() => fitGaussianCamera(splats), GaussianFitValidationError);
  }
  assert.throws(
    () => fitGaussianCamera([rotatedSplat()], {viewportWidth: 0}),
    GaussianFitValidationError,
  );
  assert.throws(
    () => fitGaussianCamera([rotatedSplat()], {verticalFovDegrees: 180}),
    GaussianFitValidationError,
  );
  assert.throws(
    () => projectGaussianQuad({
      sourceIndex: 0,
      center: [0, 0, 0],
      covariance: new Array(9).fill(0),
      alpha: 255,
    }, 10, [0, 0, 0]),
    (error) => error instanceof GaussianFitValidationError
      && error.code === "INVALID_PREPARED_SPLAT",
  );
  const prepared = prepareGaussianSplats([rotatedSplat()]);
  assert.throws(
    () => projectGaussianQuad(prepared[0], 10, [0, 0, 0], {
      __normalizedProjectionOptions: true,
      viewportWidth: 0,
      physicalWidth: 300,
      physicalHeight: 300,
      focalX: 1,
      focalY: 1,
    }),
    GaussianFitValidationError,
  );
});

test("the pinned normalize(vec2(0)) eigenvector state is rejected explicitly", () => {
  const prepared = prepareGaussianSplats([{
    center: [0, 0, 0],
    scale: [2, 1, 0.5],
    rotation: [0, 0, 0, 1],
    alpha: 255,
  }]);
  assert.throws(
    () => projectGaussianQuad(prepared[0], 10, [0, 0, 0]),
    (error) => error instanceof GaussianFittingError
      && error.code === "UNDEFINED_SHADER_EIGENVECTOR",
  );
});

test("strict G1 PLY parsing preserves raw quaternion for pinned two-pass preparation", () => {
  const file = buildGaussianPly([
    rotatedSplat({alpha: undefined, opacity: -20}),
    rotatedSplat({center: [1, 2, 3], scale: [2, 3, 4], opacity: 10}),
  ]);
  const parsed = parseGaussianPly(file);
  assert.equal(parsed.stats.vertexCount, 2);
  assert.equal(parsed.stats.retainedSplatCount, 1);
  assert.equal(parsed.stats.removedSplatCount, 1);
  assert.deepEqual(parsed.splats[0].center, [1, 2, 3]);
  assert.deepEqual(parsed.splats[0].scale, [2, 3, 4]);
  assert.equal(parsed.splats[0].alpha, 254);
  assert.deepEqual(parsed.splats[0].rotation, rotatedSplat().rotation.map(Math.fround));
  const prepared = prepareGaussianSplats(parsed.splats);
  assert.deepEqual(
    prepared[0].rotation,
    normalizeQuaternionTwiceForTest(parsed.splats[0].rotation).map(Math.fround),
  );
});

test("strict G1 PLY parsing rejects trailing bytes and unknown properties", () => {
  const valid = new Uint8Array(buildGaussianPly([rotatedSplat({opacity: 10})]));
  const withTrailingByte = new Uint8Array(valid.length + 1);
  withTrailingByte.set(valid);
  assert.throws(() => parseGaussianPly(withTrailingByte), /INVALID_FILE_LENGTH/);

  const text = new TextDecoder().decode(valid.subarray(0, findDataOffset(valid)));
  const changed = text.replace("property float nx", "property float unknown");
  const changedHeader = new TextEncoder().encode(changed);
  const changedFile = new Uint8Array(changedHeader.length + valid.length - findDataOffset(valid));
  changedFile.set(changedHeader);
  changedFile.set(valid.subarray(findDataOffset(valid)), changedHeader.length);
  assert.throws(() => parseGaussianPly(changedFile), /UNKNOWN_PROPERTY/);
});

function buildGaussianPly(splats) {
  const properties = [
    "x", "y", "z", "nx", "ny", "nz", "f_dc_0", "f_dc_1", "f_dc_2", "opacity",
    "scale_0", "scale_1", "scale_2", "rot_0", "rot_1", "rot_2", "rot_3",
  ];
  const header = [
    "ply",
    "format binary_little_endian 1.0",
    `element vertex ${splats.length}`,
    ...properties.map((property) => `property float ${property}`),
    "end_header",
    "",
  ].join("\n");
  const headerBytes = new TextEncoder().encode(header);
  const data = new ArrayBuffer(splats.length * properties.length * 4);
  const view = new DataView(data);
  splats.forEach((splat, row) => {
    const values = {
      x: splat.center[0], y: splat.center[1], z: splat.center[2],
      nx: 0, ny: 0, nz: 0,
      f_dc_0: 0, f_dc_1: 0, f_dc_2: 0,
      opacity: splat.opacity ?? 10,
      scale_0: Math.log(splat.scale[0]),
      scale_1: Math.log(splat.scale[1]),
      scale_2: Math.log(splat.scale[2]),
      rot_0: splat.rotation[3],
      rot_1: splat.rotation[0],
      rot_2: splat.rotation[1],
      rot_3: splat.rotation[2],
    };
    properties.forEach((property, column) => {
      view.setFloat32((row * properties.length + column) * 4, values[property], true);
    });
  });
  const file = new Uint8Array(headerBytes.length + data.byteLength);
  file.set(headerBytes);
  file.set(new Uint8Array(data), headerBytes.length);
  return file.buffer;
}

function findDataOffset(bytes) {
  const marker = new TextEncoder().encode("end_header\n");
  outer: for (let offset = 0; offset <= bytes.length - marker.length; offset += 1) {
    for (let index = 0; index < marker.length; index += 1) {
      if (bytes[offset + index] !== marker[index]) continue outer;
    }
    return offset + marker.length;
  }
  throw new Error("header marker not found");
}

function normalizeQuaternionTwiceForTest(rotation) {
  let result = Array.from(rotation);
  for (let pass = 0; pass < 2; pass += 1) {
    const length = Math.sqrt(
      result[0] * result[0]
      + result[1] * result[1]
      + result[2] * result[2]
      + result[3] * result[3],
    );
    const inverseLength = 1 / length;
    result = result.map((value) => value * inverseLength);
  }
  return result;
}

function shaderAddForTest(left, right) {
  return Math.fround(Math.fround(left) + Math.fround(right));
}

function shaderMultiplyForTest(left, right) {
  return Math.fround(Math.fround(left) * Math.fround(right));
}
