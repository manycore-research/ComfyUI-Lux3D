const DEFAULT_FOV_Y_DEGREES = 45;
const MODEL_PREVIEW_FOV_Y_DEGREES = 30;
const MODEL_PREVIEW_INITIAL_DISTANCE_RATIO = 1.25;
const MODEL_PREVIEW_MINIMUM_RADIUS_RATIO = 2.2;
const MODEL_PREVIEW_MAXIMUM_DISTANCE_RATIO = 4;
const MODEL_PREVIEW_CLIP_DEPTH_RATIO = 1000;

export class GlbBoundsError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "GlbBoundsError";
    this.code = code;
  }
}

export function fitBoundingBox(box, options = {}) {
  const min = finiteVector3(box?.min, "box.min");
  const max = finiteVector3(box?.max, "box.max");
  const aspect = finitePositive(options.aspect, "aspect");
  const fovYDegrees = options.fovYDegrees ?? DEFAULT_FOV_Y_DEGREES;
  if (!Number.isFinite(fovYDegrees) || fovYDegrees <= 0 || fovYDegrees >= 180) {
    throw new GlbBoundsError("INVALID_FOV", "fovYDegrees must be finite and in (0, 180)");
  }

  for (let index = 0; index < 3; index += 1) {
    if (max[index] < min[index]) {
      throw new GlbBoundsError("INVALID_BOUNDS", "box.max must not be smaller than box.min");
    }
  }

  const center = min.map((value, index) => midpoint(value, max[index]));
  const half = max.map((value, index) => Math.max(
    Math.abs(value - center[index]),
    Math.abs(min[index] - center[index]),
  ));
  const computedRadius = Math.hypot(half[0], half[1], half[2]);
  if (!Number.isFinite(computedRadius) || computedRadius <= 0) {
    throw new GlbBoundsError("DEGENERATE_BOUNDS", "renderable bounds must have a finite positive radius");
  }
  const radius = nextUp(computedRadius);

  const alphaV = (fovYDegrees * Math.PI) / 360;
  const alphaH = Math.atan(Math.tan(alphaV) * aspect);
  const alpha = Math.min(alphaV, alphaH);
  const requiredDistance = nextUp(radius / Math.sin(alpha));
  const positionZ = nextUp(center[2] + requiredDistance);
  const distance = positionZ - center[2];
  if (!Number.isFinite(distance) || distance < requiredDistance || distance <= radius) {
    throw new GlbBoundsError("UNREPRESENTABLE_CAMERA", "bounds cannot be represented by the fixed perspective camera");
  }

  const nearLimit = distance - radius;
  let near = nextDown(nearLimit);
  if (!(near > 0)) near = nextUp(0);
  const far = nextUp(distance + radius);
  if (![near, far].every(Number.isFinite) || !(near > 0 && near <= nearLimit && far >= distance + radius && far > near)) {
    throw new GlbBoundsError("UNREPRESENTABLE_CLIP_PLANES", "strict outward clip planes cannot be represented");
  }

  return Object.freeze({
    center: Object.freeze(center),
    radius,
    distance,
    near,
    far,
    position: Object.freeze([center[0], center[1], positionZ]),
    fovYDegrees,
    aspect,
  });
}

export function fitModelPreviewBoundingBox(box, options = {}) {
  const aspect = finitePositive(options.aspect, "aspect");
  const halfFov = (MODEL_PREVIEW_FOV_Y_DEGREES * Math.PI) / 360;
  const adjustedFovYDegrees = aspect >= 1
    ? MODEL_PREVIEW_FOV_Y_DEGREES
    : (2 * Math.atan(Math.tan(halfFov) / aspect) * 180) / Math.PI;
  return fitBoundingBox(box, {aspect, fovYDegrees: adjustedFovYDegrees});
}

export function buildModelPreviewOrbitEnvelope(fit) {
  const center = finiteVector3(fit?.center, "fit.center");
  const radius = finitePositive(fit?.radius, "fit.radius");
  const idealDistance = finitePositive(fit?.distance, "fit.distance");
  if (!(idealDistance > radius)) {
    throw new GlbBoundsError("INVALID_CAMERA_FIT", "fit.distance must place the camera outside fit.radius");
  }

  const initialDistance = nextUp(idealDistance * MODEL_PREVIEW_INITIAL_DISTANCE_RATIO);
  const minDistance = nextUp(radius * MODEL_PREVIEW_MINIMUM_RADIUS_RATIO);
  const maxDistance = nextUp(idealDistance * MODEL_PREVIEW_MAXIMUM_DISTANCE_RATIO);
  const targetRadius = radius;
  if (![initialDistance, minDistance, maxDistance].every(Number.isFinite)
      || !(radius < minDistance && minDistance < initialDistance && initialDistance < maxDistance)) {
    throw new GlbBoundsError("UNREPRESENTABLE_ORBIT", "model preview orbit distances cannot be represented");
  }

  const closestDepth = minDistance - targetRadius - radius;
  const farthestDepth = maxDistance + targetRadius + radius;
  let far = nextUp(2 * Math.max(radius, maxDistance));
  if (far < farthestDepth) far = nextUp(farthestDepth);
  let near = nextDown(Math.min(far / MODEL_PREVIEW_CLIP_DEPTH_RATIO, closestDepth));
  if (!(near > 0)) near = nextUp(0);
  if (![near, far].every(Number.isFinite)
      || !(near > 0 && near <= closestDepth && far >= farthestDepth && far > near)) {
    throw new GlbBoundsError("UNREPRESENTABLE_CLIP_PLANES", "model preview orbit clip planes cannot be represented");
  }

  return Object.freeze({
    center: Object.freeze(center),
    radius,
    idealDistance,
    initialDistance,
    minDistance,
    maxDistance,
    targetRadius,
    near,
    far,
  });
}

function midpoint(a, b) {
  return a / 2 + b / 2;
}

function finiteVector3(value, name) {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)) {
    throw new GlbBoundsError("INVALID_BOUNDS", `${name} must contain three finite numbers`);
  }
  return [...value];
}

function finitePositive(value, name) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new GlbBoundsError("INVALID_VIEWPORT", `${name} must be finite and positive`);
  }
  return value;
}

function nextUp(value) {
  if (Number.isNaN(value) || value === Infinity) return value;
  if (value === 0) return Number.MIN_VALUE;
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value, false);
  let bits = view.getBigUint64(0, false);
  bits += value > 0 ? 1n : -1n;
  view.setBigUint64(0, bits, false);
  return view.getFloat64(0, false);
}

function nextDown(value) {
  return -nextUp(-value);
}
