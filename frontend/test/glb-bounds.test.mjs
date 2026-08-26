import assert from "node:assert/strict";
import test from "node:test";

import {
  GlbBoundsError,
  buildModelPreviewOrbitEnvelope,
  fitBoundingBox,
  fitModelPreviewBoundingBox,
} from "../src/viewer/math/glb-bounds.js";

test("fits a conservative sphere in portrait and landscape viewports", () => {
  const box = {min: [-2, -1, -3], max: [4, 5, 1]};
  for (const aspect of [16 / 9, 9 / 16, 1]) {
    const fit = fitBoundingBox(box, {aspect});
    const alphaV = (fit.fovYDegrees * Math.PI) / 360;
    const alphaH = Math.atan(Math.tan(alphaV) * aspect);
    assert.ok(fit.distance * Math.sin(Math.min(alphaV, alphaH)) >= fit.radius);
    assert.ok(fit.near > 0);
    assert.ok(fit.near <= fit.distance - fit.radius);
    assert.ok(fit.far >= fit.distance + fit.radius);
    assert.deepEqual(fit.position.slice(0, 2), fit.center.slice(0, 2));
  }
});

test("rejects empty, non-finite, inverted, and invalid camera contracts", () => {
  const invalid = [
    [{min: [0, 0, 0], max: [0, 0, 0]}, {aspect: 1}, "DEGENERATE_BOUNDS"],
    [{min: [1, 0, 0], max: [0, 1, 1]}, {aspect: 1}, "INVALID_BOUNDS"],
    [{min: [0, 0, 0], max: [1, 1, Infinity]}, {aspect: 1}, "INVALID_BOUNDS"],
    [{min: [0, 0, 0], max: [1, 1, 1]}, {aspect: 0}, "INVALID_VIEWPORT"],
    [{min: [0, 0, 0], max: [1, 1, 1]}, {aspect: 1, fovYDegrees: 180}, "INVALID_FOV"],
  ];
  for (const [box, options, code] of invalid) {
    assert.throws(() => fitBoundingBox(box, options), (error) => error instanceof GlbBoundsError && error.code === code);
  }
});

test("rounds the sphere, distance, position, and clip planes conservatively", () => {
  const box = {min: [10, 20, 30], max: [11, 22, 33]};
  const fit = fitBoundingBox(box, {aspect: 16 / 9, fovYDegrees: 45});
  const exactCornerDistance = Math.hypot(0.5, 1, 1.5);
  const alpha = Math.min(
    (45 * Math.PI) / 360,
    Math.atan(Math.tan((45 * Math.PI) / 360) * (16 / 9)),
  );

  assert.ok(fit.radius > exactCornerDistance);
  assert.ok(fit.distance >= fit.radius / Math.sin(alpha));
  assert.ok(fit.position[2] > fit.center[2]);
  assert.ok(fit.near <= fit.distance - fit.radius);
  assert.ok(fit.far >= fit.distance + fit.radius);
});

test("rejects bounds whose camera position cannot be represented", () => {
  assert.throws(
    () => fitBoundingBox(
      {min: [0, 0, Number.MAX_VALUE], max: [1, 1, Number.MAX_VALUE]},
      {aspect: 1},
    ),
    (error) => error instanceof GlbBoundsError && error.code === "UNREPRESENTABLE_CAMERA",
  );
});

test("matches the Lux3D model preview orbit and keeps its complete zoom envelope inside clip planes", () => {
  const box = {min: [-1, -1, -1], max: [1, 1, 1]};
  for (const aspect of [16 / 9, 9 / 16, 1]) {
    const fit = fitModelPreviewBoundingBox(box, {aspect});
    const orbit = buildModelPreviewOrbitEnvelope(fit);

    assert.ok(Math.abs(orbit.idealDistance / orbit.radius - 1 / Math.sin(Math.PI / 12)) < 1e-12);
    assert.ok(orbit.initialDistance >= orbit.idealDistance * 1.25);
    assert.ok(orbit.minDistance >= orbit.radius * 2.2);
    assert.ok(orbit.maxDistance >= orbit.idealDistance * 4);
    assert.ok(orbit.near <= orbit.minDistance - orbit.targetRadius - orbit.radius);
    assert.ok(orbit.far >= orbit.maxDistance + orbit.targetRadius + orbit.radius);

    const verticalHalfFov = (fit.fovYDegrees * Math.PI) / 360;
    const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * aspect);
    assert.ok(orbit.idealDistance * Math.sin(Math.min(verticalHalfFov, horizontalHalfFov)) >= orbit.radius);
  }
});
