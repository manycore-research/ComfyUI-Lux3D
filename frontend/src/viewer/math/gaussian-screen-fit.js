const SQRT_EIGHT = Math.sqrt(8);
const SHADER_EIGEN_DISCRIMINANT_FLOOR = 0.1;
const DEFAULT_KERNEL_2D_SIZE = 0.3;
const DEFAULT_MAX_SCREEN_SPACE_SPLAT_SIZE = 1024;
const DEFAULT_VERTICAL_FOV_DEGREES = 50;
const DEFAULT_PIXEL_TOLERANCE = 0.25;
const MINIMUM_ALPHA_BYTE = 1;
const NORMALIZED_EIGENVECTOR_AXIS_SUM_UPPER = 2;
const SHADER_ALPHA_BYTE_SCALE = Math.fround(1 / 255);

const preparedSplatRecords = new WeakSet();
const preparedSplatCollections = new WeakSet();
const normalizedProjectionContracts = new WeakSet();

const floatBuffer = new ArrayBuffer(8);
const floatView = new DataView(floatBuffer);
const float32Buffer = new ArrayBuffer(4);
const float32View = new DataView(float32Buffer);

export class GaussianFitValidationError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = "GaussianFitValidationError";
    this.code = code;
  }
}

export class GaussianFittingError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = "GaussianFittingError";
    this.code = code;
  }
}

export const GAUSSIAN_CAMERA_CONTRACT = Object.freeze({
  directionFromTarget: Object.freeze([0, 0, -1]),
  up: Object.freeze([0, -1, -0.6]),
  verticalFovDegrees: DEFAULT_VERTICAL_FOV_DEGREES,
  kernel2DSize: DEFAULT_KERNEL_2D_SIZE,
  maxScreenSpaceSplatSize: DEFAULT_MAX_SCREEN_SPACE_SPLAT_SIZE,
  splatScale: 1,
  focalAdjustment: 1,
});

export function nextUp(value) {
  assertFiniteOrInfinity(value, "value");
  if (value === Infinity) return Infinity;
  if (Object.is(value, -0) || value === 0) return Number.MIN_VALUE;

  floatView.setFloat64(0, value, false);
  let bits = floatView.getBigUint64(0, false);
  bits += value > 0 ? 1n : -1n;
  floatView.setBigUint64(0, bits, false);
  return floatView.getFloat64(0, false);
}

export function nextDown(value) {
  assertFiniteOrInfinity(value, "value");
  if (value === -Infinity) return -Infinity;
  if (Object.is(value, 0) || Object.is(value, -0)) return -Number.MIN_VALUE;

  floatView.setFloat64(0, value, false);
  let bits = floatView.getBigUint64(0, false);
  bits += value > 0 ? -1n : 1n;
  floatView.setBigUint64(0, bits, false);
  return floatView.getFloat64(0, false);
}

export function prepareGaussianSplats(splats) {
  if (!Array.isArray(splats)) {
    throw validationError("INVALID_SPLAT_COLLECTION", "splats must be an array");
  }

  const prepared = [];
  for (let index = 0; index < splats.length; index += 1) {
    const splat = splats[index];
    if (!splat || typeof splat !== "object") {
      throw validationError("INVALID_SPLAT", `splat ${index} must be an object`);
    }

    const alpha = splat.alpha === undefined ? 255 : splat.alpha;
    if (!Number.isInteger(alpha) || alpha < 0 || alpha > 255) {
      throw validationError("INVALID_ALPHA", `splat ${index} alpha must be an integer in [0, 255]`);
    }
    if (alpha < MINIMUM_ALPHA_BYTE) continue;

    const center = finiteVector(splat.center, 3, `splat ${index} center`).map(Math.fround);
    const scale = finiteVector(splat.scale, 3, `splat ${index} scale`).map(Math.fround);
    for (const value of scale) {
      if (!(value > 0)) {
        throw validationError("INVALID_SCALE", `splat ${index} scale must be positive`);
      }
    }

    const rotation = normalizeQuaternionTwiceLikePinnedLoader(
      finiteVector(splat.rotation, 4, `splat ${index} rotation`),
      index,
    ).map(Math.fround);
    const covariance = covarianceFromScaleAndRotation(scale, rotation).map(Math.fround);
    for (const value of covariance) {
      if (!Number.isFinite(value)) {
        throw validationError("NON_FINITE_COVARIANCE", `splat ${index} covariance is not finite`);
      }
    }

    const preparedSplat = Object.freeze({
      sourceIndex: index,
      center: Object.freeze(center),
      scale: Object.freeze(scale),
      rotation: Object.freeze(rotation),
      covariance: Object.freeze(covariance),
      alpha,
    });
    preparedSplatRecords.add(preparedSplat);
    prepared.push(preparedSplat);
  }

  if (prepared.length === 0) {
    throw validationError("NO_RETAINED_SPLATS", "minimumAlpha=1 retained no splats");
  }
  Object.freeze(prepared);
  preparedSplatCollections.add(prepared);
  return prepared;
}

export function shaderAlphaFromByte(alpha) {
  if (!Number.isInteger(alpha) || alpha < 0 || alpha > 255) {
    throw validationError("INVALID_ALPHA", "alpha must be an integer in [0, 255]");
  }
  return shaderMultiply(alpha, SHADER_ALPHA_BYTE_SCALE);
}

export function computeDeterministicTarget(preparedSplats) {
  assertPreparedSplats(preparedSplats);
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];

  for (const splat of preparedSplats) {
    for (let axis = 0; axis < 3; axis += 1) {
      const variance = splat.covariance[axis * 3 + axis];
      if (!(variance >= 0) || !Number.isFinite(variance)) {
        throw validationError(
          "INVALID_COVARIANCE_DIAGONAL",
          `splat ${splat.sourceIndex} covariance diagonal is invalid`,
        );
      }
      const extent = SQRT_EIGHT * Math.sqrt(variance);
      const low = splat.center[axis] - extent;
      const high = splat.center[axis] + extent;
      if (!Number.isFinite(low) || !Number.isFinite(high)) {
        throw validationError(
          "NON_FINITE_SUPPORT",
          `splat ${splat.sourceIndex} finite support cannot be represented`,
        );
      }
      minimum[axis] = Math.min(minimum[axis], low);
      maximum[axis] = Math.max(maximum[axis], high);
    }
  }

  return minimum.map((low, axis) => stableMidpoint(low, maximum[axis]));
}

export function computeRotationInvariantCameraDistance(preparedSplats, target, options = {}) {
  assertPreparedSplats(preparedSplats);
  const normalizedTarget = finiteVector(target, 3, "target");
  const projection = normalizeProjectionOptions(options);
  let supportRadius = 0;
  for (const splat of preparedSplats) {
    const centerRadius = nextUp(Math.hypot(
      splat.center[0] - normalizedTarget[0],
      splat.center[1] - normalizedTarget[1],
      splat.center[2] - normalizedTarget[2],
    ));
    const gaussianSupportRadius = multiplyUp(
      nextUp(SQRT_EIGHT),
      Math.max(...splat.scale),
    );
    supportRadius = Math.max(supportRadius, addUp(centerRadius, gaussianSupportRadius));
  }
  if (!(supportRadius > 0) || !Number.isFinite(supportRadius)) {
    throw fittingError("INVALID_ROTATION_SUPPORT", "Gaussian support sphere must be finite and positive");
  }

  const asymptoticEigenUpper = 2 * projection.kernel2DSize;
  const asymptoticBasis = projection.splatScale * Math.min(
    SQRT_EIGHT * Math.sqrt(asymptoticEigenUpper),
    projection.maxScreenSpaceSplatSize,
  ) / projection.focalAdjustment;
  const kernelExtent = NORMALIZED_EIGENVECTOR_AXIS_SUM_UPPER * asymptoticBasis;
  const usableHalfWidth = projection.shaderWidth / 2 - kernelExtent;
  const usableHalfHeight = projection.shaderHeight / 2 - kernelExtent;
  if (!(usableHalfWidth > 0) || !(usableHalfHeight > 0)) {
    throw fittingError(
      "VIEWPORT_CANNOT_CONTAIN_SHADER_KERNEL",
      "viewport is too small for rotation-invariant Gaussian containment",
    );
  }
  const halfFovRadians = Math.min(
    Math.atan(usableHalfWidth / projection.focalX),
    Math.atan(usableHalfHeight / projection.focalY),
  );
  const distance = nextUp(supportRadius / Math.sin(halfFovRadians));
  if (!(distance > supportRadius) || !Number.isFinite(distance)) {
    throw fittingError(
      "ROTATION_SAFE_DISTANCE_NOT_FOUND",
      "rotation-invariant camera distance must remain outside the Gaussian support sphere",
    );
  }
  return Object.freeze({distance, supportRadius, halfFovRadians});
}

export function projectGaussianQuad(preparedSplat, distance, target, options = {}) {
  assertPreparedSplat(preparedSplat);
  const projection = normalizeProjectionOptions(options);
  const frame = buildCameraFrame(target, distance);
  const viewCenter = shaderWorldToView(preparedSplat.center, frame);
  const depth = -viewCenter[2];
  if (!(depth > 0) || !Number.isFinite(depth)) {
    throw fittingError(
      "SPLAT_BEHIND_CAMERA",
      `splat ${preparedSplat.sourceIndex} is not strictly in front of the camera`,
    );
  }

  const cameraCovariance = shaderTransformSymmetricMatrix(preparedSplat.covariance, frame.rotation);
  const z = viewCenter[2];
  const zSquared = shaderMultiply(z, z);
  const focalX = shaderMultiply(projection.focalX, projection.focalAdjustment);
  const focalY = shaderMultiply(projection.focalY, projection.focalAdjustment);
  const jacobianX = [
    shaderDivide(focalX, z),
    0,
    shaderDivide(-shaderMultiply(focalX, viewCenter[0]), zSquared),
  ];
  const jacobianY = [
    0,
    shaderDivide(focalY, z),
    shaderDivide(-shaderMultiply(focalY, viewCenter[1]), zSquared),
  ];

  const originalXX = shaderQuadraticForm(jacobianX, cameraCovariance, jacobianX);
  const originalXY = shaderQuadraticForm(jacobianX, cameraCovariance, jacobianY);
  const originalYY = shaderQuadraticForm(jacobianY, cameraCovariance, jacobianY);
  const originalDeterminant = shaderSubtract(
    shaderMultiply(originalXX, originalYY),
    shaderMultiply(originalXY, originalXY),
  );

  const a = shaderAdd(originalXX, projection.kernel2DSize);
  const b = originalXY;
  const d = shaderAdd(originalYY, projection.kernel2DSize);
  const blurredDeterminant = shaderSubtract(shaderMultiply(a, d), shaderMultiply(b, b));
  if (![a, b, d, originalDeterminant, blurredDeterminant].every(Number.isFinite)) {
    throw fittingError(
      "NON_FINITE_PROJECTED_COVARIANCE",
      `splat ${preparedSplat.sourceIndex} projected covariance is not finite`,
    );
  }
  if (!(blurredDeterminant > 0)) {
    throw fittingError(
      "INVALID_PROJECTED_COVARIANCE",
      `splat ${preparedSplat.sourceIndex} blurred covariance is not positive definite`,
    );
  }

  const alphaCompensation = Math.fround(Math.sqrt(Math.max(
    shaderDivide(originalDeterminant, blurredDeterminant),
    0,
  )));
  const shaderAlpha = shaderAlphaFromByte(preparedSplat.alpha);
  if (shaderMultiply(shaderAlpha, alphaCompensation) < SHADER_ALPHA_BYTE_SCALE) {
    return culledProjection(preparedSplat, depth, "ANTIALIAS_ALPHA");
  }

  const determinant = shaderSubtract(shaderMultiply(a, d), shaderMultiply(b, b));
  const traceOverTwo = shaderMultiply(0.5, shaderAdd(a, d));
  const discriminant = shaderSubtract(shaderMultiply(traceOverTwo, traceOverTwo), determinant);
  const term = Math.fround(Math.sqrt(Math.max(
    Math.fround(SHADER_EIGEN_DISCRIMINANT_FLOOR),
    discriminant,
  )));
  const eigenValue1 = shaderAdd(traceOverTwo, term);
  const eigenValue2 = shaderSubtract(traceOverTwo, term);
  if (!(eigenValue2 > 0)) {
    return culledProjection(preparedSplat, depth, "NON_POSITIVE_MINOR_EIGENVALUE");
  }

  const eigenVectorComponentY = shaderSubtract(eigenValue1, a);
  const eigenVectorLength = Math.fround(Math.hypot(b, eigenVectorComponentY));
  if (!(eigenVectorLength > 0) || !Number.isFinite(eigenVectorLength)) {
    throw fittingError(
      "UNDEFINED_SHADER_EIGENVECTOR",
      `splat ${preparedSplat.sourceIndex} reaches normalize(vec2(0)) in the pinned shader`,
    );
  }

  const eigenVector1 = [
    shaderDivide(b, eigenVectorLength),
    shaderDivide(eigenVectorComponentY, eigenVectorLength),
  ];
  const eigenVector2 = [eigenVector1[1], -eigenVector1[0]];
  const inverseFocalAdjustment = shaderDivide(1, projection.focalAdjustment);
  const basisLength1 = shaderMultiply(shaderMultiply(projection.splatScale, Math.min(
    shaderMultiply(SQRT_EIGHT, Math.fround(Math.sqrt(eigenValue1))),
    projection.maxScreenSpaceSplatSize,
  )), inverseFocalAdjustment);
  const basisLength2 = shaderMultiply(shaderMultiply(projection.splatScale, Math.min(
    shaderMultiply(SQRT_EIGHT, Math.fround(Math.sqrt(eigenValue2))),
    projection.maxScreenSpaceSplatSize,
  )), inverseFocalAdjustment);
  const basis1 = [
    shaderMultiply(eigenVector1[0], basisLength1),
    shaderMultiply(eigenVector1[1], basisLength1),
  ];
  const basis2 = [
    shaderMultiply(eigenVector2[0], basisLength2),
    shaderMultiply(eigenVector2[1], basisLength2),
  ];

  const shaderCenterX = shaderAdd(
    projection.shaderWidth / 2,
    shaderDivide(shaderMultiply(projection.focalX, viewCenter[0]), depth),
  );
  const shaderCenterY = shaderAdd(
    projection.shaderHeight / 2,
    shaderDivide(shaderMultiply(projection.focalY, viewCenter[1]), depth),
  );
  const framebufferScaleX = projection.physicalWidth / projection.shaderWidth;
  const framebufferScaleY = projection.physicalHeight / projection.shaderHeight;
  const centerX = shaderCenterX * framebufferScaleX;
  const centerY = shaderCenterY * framebufferScaleY;
  const physicalBasis1 = [basis1[0] * framebufferScaleX, basis1[1] * framebufferScaleY];
  const physicalBasis2 = [basis2[0] * framebufferScaleX, basis2[1] * framebufferScaleY];
  const extentX = Math.abs(physicalBasis1[0]) + Math.abs(physicalBasis2[0]);
  const extentY = Math.abs(physicalBasis1[1]) + Math.abs(physicalBasis2[1]);
  const bounds = {
    minX: centerX - extentX,
    maxX: centerX + extentX,
    minY: centerY - extentY,
    maxY: centerY + extentY,
  };
  if (!Object.values(bounds).every(Number.isFinite)) {
    throw fittingError(
      "NON_FINITE_QUAD",
      `splat ${preparedSplat.sourceIndex} projected quad is not finite`,
    );
  }

  return {
    culled: false,
    sourceIndex: preparedSplat.sourceIndex,
    depth,
    viewCenter,
    center: [centerX, centerY],
    basis1: physicalBasis1,
    basis2: physicalBasis2,
    bounds,
    eigenValues: [eigenValue1, eigenValue2],
    alphaCompensation,
  };
}

export function conservativeOverflowPixels(preparedSplats, distance, target, options = {}) {
  assertPreparedSplats(preparedSplats);
  const projection = normalizeProjectionOptions(options);
  const frame = buildCameraFrame(target, distance);
  const exactHalfWidth = projection.shaderWidth / 2;
  const exactHalfHeight = projection.shaderHeight / 2;
  const halfWidthLower = nextDown(exactHalfWidth);
  const halfHeightLower = nextDown(exactHalfHeight);
  const framebufferScaleX = projection.physicalWidth / projection.shaderWidth;
  const framebufferScaleY = projection.physicalHeight / projection.shaderHeight;
  let worstOverflow = -Infinity;

  for (const splat of preparedSplats) {
    const viewCenter = shaderWorldToView(splat.center, frame);
    const depthLower = -viewCenter[2];
    if (!(depthLower > 0)) return Infinity;

    const focalX = Math.abs(Math.fround(projection.focalX * projection.focalAdjustment));
    const focalY = Math.abs(Math.fround(projection.focalY * projection.focalAdjustment));
    const absX = Math.abs(viewCenter[0]);
    const absY = Math.abs(viewCenter[1]);
    const depthSquaredLower = multiplyDownFloat32(depthLower, depthLower);
    const inverseDepthSquared = divideUpFloat32(1, depthSquaredLower);
    const jacobianX = [
      divideUpFloat32(focalX, depthLower),
      0,
      multiplyUpFloat32(multiplyUpFloat32(focalX, absX), inverseDepthSquared),
    ];
    const jacobianY = [
      0,
      divideUpFloat32(focalY, depthLower),
      multiplyUpFloat32(multiplyUpFloat32(focalY, absY), inverseDepthSquared),
    ];
    const absoluteCovariance = splat.covariance.map((value) => Math.abs(value));
    const projectedXXUpper = absoluteShaderQuadraticUpper(jacobianX, absoluteCovariance);
    const projectedYYUpper = absoluteShaderQuadraticUpper(jacobianY, absoluteCovariance);
    const kernel = Math.fround(projection.kernel2DSize);
    const traceUpper = addUpFloat32(
      addUpFloat32(projectedXXUpper, kernel),
      addUpFloat32(projectedYYUpper, kernel),
    );

    // A shader-visible splat has eigenValue2 = round(trace/2 - term) > 0,
    // hence term < trace/2 and eigenValue1 < trace. Directed float32
    // operations preserve a conservative, monotone upper bound here.
    const halfTraceUpper = multiplyUpFloat32(0.5, traceUpper);
    const eigenUpper = multiplyUpFloat32(2, halfTraceUpper);
    const uncappedBasis = multiplyUpFloat32(
      roundUpFloat32Positive(SQRT_EIGHT),
      sqrtUpFloat32(eigenUpper),
    );
    const cappedBasis = Math.min(uncappedBasis, projection.maxScreenSpaceSplatSize);
    const adjustedBasis = divideUpFloat32(
      multiplyUpFloat32(projection.splatScale, cappedBasis),
      projection.focalAdjustment,
    );

    // The mirrored float32 normalize result is not exactly unit length. Its
    // rounded hypot is at least either float32 input magnitude, so each
    // rounded quotient is at most one; the perpendicular vector shares it.
    const quadExtentUpper = multiplyUpFloat32(
      NORMALIZED_EIGENVECTOR_AXIS_SUM_UPPER,
      adjustedBasis,
    );
    const centerFocalX = Math.abs(Math.fround(projection.focalX));
    const centerFocalY = Math.abs(Math.fround(projection.focalY));
    const centerOffsetX = divideUpFloat32(
      multiplyUpFloat32(centerFocalX, absX),
      depthLower,
    );
    const centerOffsetY = divideUpFloat32(
      multiplyUpFloat32(centerFocalY, absY),
      depthLower,
    );
    const roundedCenterOffsetX = roundedShaderCenterOffsetUpper(exactHalfWidth, centerOffsetX);
    const roundedCenterOffsetY = roundedShaderCenterOffsetUpper(exactHalfHeight, centerOffsetY);
    const overflowX = multiplyUp(
      addUp(roundedCenterOffsetX, quadExtentUpper) - halfWidthLower,
      framebufferScaleX,
    );
    const overflowY = multiplyUp(
      addUp(roundedCenterOffsetY, quadExtentUpper) - halfHeightLower,
      framebufferScaleY,
    );
    worstOverflow = Math.max(worstOverflow, overflowX, overflowY);
  }

  return worstOverflow;
}

export function fitGaussianCamera(splats, options = {}) {
  const preparedSplats = isPreparedCollection(splats) ? splats : prepareGaussianSplats(splats);
  const projection = normalizeProjectionOptions(options);
  const target = options.target === undefined
    ? computeDeterministicTarget(preparedSplats)
    : finiteVector(options.target, 3, "target");

  const frameAtTarget = buildCameraFrame(target, 0);
  let maximumBaseDepth = -Infinity;
  let characteristicLength = 0;
  for (const splat of preparedSplats) {
    const viewCenter = worldToView(splat.center, frameAtTarget);
    maximumBaseDepth = Math.max(maximumBaseDepth, viewCenter[2]);
    characteristicLength = Math.max(
      characteristicLength,
      Math.abs(viewCenter[0]),
      Math.abs(viewCenter[1]),
      Math.abs(viewCenter[2]),
      SQRT_EIGHT * Math.max(...splat.scale),
    );
  }
  if (!(characteristicLength > 0) || !Number.isFinite(characteristicLength)) {
    throw fittingError("INVALID_CHARACTERISTIC_LENGTH", "asset scale cannot establish a finite bracket");
  }

  const asymptoticEigenUpper = 2 * projection.kernel2DSize;
  const asymptoticBasis = projection.splatScale * Math.min(
    SQRT_EIGHT * Math.sqrt(asymptoticEigenUpper),
    projection.maxScreenSpaceSplatSize,
  ) / projection.focalAdjustment;
  const asymptoticExtent = NORMALIZED_EIGENVECTOR_AXIS_SUM_UPPER * asymptoticBasis;
  if (!(projection.shaderWidth / 2 > asymptoticExtent)
      || !(projection.shaderHeight / 2 > asymptoticExtent)) {
    throw fittingError(
      "VIEWPORT_CANNOT_CONTAIN_SHADER_KERNEL",
      "viewport is too small for the pinned shader's asymptotic quad bound",
    );
  }

  let lower = Math.max(0, maximumBaseDepth);
  let upper = Math.max(nextUp(lower), characteristicLength);
  if (!(upper > lower)) upper = nextUp(lower);
  let upperOverflow = conservativeOverflowPixels(preparedSplats, upper, target, projection);
  let bracketExpansions = 0;
  while (!(upperOverflow <= 0)) {
    const expanded = upper * 2;
    if (!Number.isFinite(expanded) || !(expanded > upper)) {
      throw fittingError("FINITE_BRACKET_NOT_FOUND", "camera distance overflowed before containment");
    }
    lower = upper;
    upper = expanded;
    upperOverflow = conservativeOverflowPixels(preparedSplats, upper, target, projection);
    bracketExpansions += 1;
  }

  let lowerOverflow = conservativeOverflowPixels(preparedSplats, lower, target, projection);
  let bisections = 0;
  while (true) {
    if (Number.isFinite(lowerOverflow)
        && lowerOverflow > 0
        && lowerOverflow - upperOverflow <= projection.pixelTolerance) {
      break;
    }
    const midpoint = stableMidpoint(lower, upper);
    if (!(midpoint > lower) || !(midpoint < upper)) break;
    const midpointOverflow = conservativeOverflowPixels(preparedSplats, midpoint, target, projection);
    if (midpointOverflow <= 0) {
      upper = midpoint;
      upperOverflow = midpointOverflow;
    } else {
      lower = midpoint;
      lowerOverflow = midpointOverflow;
    }
    bisections += 1;
  }

  const rotationInvariant = computeRotationInvariantCameraDistance(
    preparedSplats,
    target,
    projection,
  );
  const distance = Math.max(upper, rotationInvariant.distance);
  const finalOverflow = conservativeOverflowPixels(preparedSplats, distance, target, projection);
  const verification = verifyGaussianFit(preparedSplats, distance, target, projection);
  return {
    ...verification,
    preparedSplats,
    target,
    distance,
    cameraPosition: [target[0], target[1], target[2] - distance],
    conservativeOverflowPixels: finalOverflow,
    rotationSupportRadius: rotationInvariant.supportRadius,
    rotationHalfFovRadians: rotationInvariant.halfFovRadians,
    bracketExpansions,
    bisections,
    physicalViewport: [projection.physicalWidth, projection.physicalHeight],
    verticalFovDegrees: projection.verticalFovDegrees,
  };
}

export function verifyGaussianFit(preparedSplats, distance, target, options = {}) {
  assertPreparedSplats(preparedSplats);
  const projection = normalizeProjectionOptions(options);
  let minimumDepth = Infinity;
  let maximumDepth = -Infinity;
  let visibleSplatCount = 0;
  let culledSplatCount = 0;
  let maximumExactOverflow = -Infinity;
  const centerDepths = [];

  for (const splat of preparedSplats) {
    const projected = projectGaussianQuad(splat, distance, target, projection);
    centerDepths.push(projected.depth);
    minimumDepth = Math.min(minimumDepth, projected.depth);
    maximumDepth = Math.max(maximumDepth, projected.depth);
    if (projected.culled) {
      culledSplatCount += 1;
      continue;
    }

    visibleSplatCount += 1;
    const overflow = Math.max(
      -projected.bounds.minX,
      projected.bounds.maxX - projection.physicalWidth,
      -projected.bounds.minY,
      projected.bounds.maxY - projection.physicalHeight,
    );
    maximumExactOverflow = Math.max(maximumExactOverflow, overflow);
    if (overflow > 0) {
      throw fittingError(
        "FINAL_QUAD_OUTSIDE_VIEWPORT",
        `splat ${splat.sourceIndex} exceeds viewport by ${overflow} physical pixels`,
      );
    }
  }

  if (visibleSplatCount === 0) {
    throw fittingError("NO_VISIBLE_SPLATS", "the pinned shader culls every retained splat at the fitted distance");
  }
  if (!(minimumDepth > 0) || !Number.isFinite(maximumDepth)) {
    throw fittingError("INVALID_DEPTH_RANGE", "retained splat center depths are invalid");
  }

  const {near, far} = buildPinnedPerspectiveClipPlanes(
    centerDepths,
    minimumDepth,
    maximumDepth,
  );

  return {
    near,
    far,
    minimumDepth,
    maximumDepth,
    visibleSplatCount,
    culledSplatCount,
    maximumExactOverflowPixels: maximumExactOverflow,
  };
}

export function covarianceFromScaleAndRotation(scale, rotation) {
  const [x, y, z, w] = rotation;
  const xx = x * x;
  const xy = x * y;
  const xz = x * z;
  const xw = x * w;
  const yy = y * y;
  const yz = y * z;
  const yw = y * w;
  const zz = z * z;
  const zw = z * w;
  const rotationMatrix = [
    1 - 2 * (yy + zz), 2 * (xy - zw), 2 * (xz + yw),
    2 * (xy + zw), 1 - 2 * (xx + zz), 2 * (yz - xw),
    2 * (xz - yw), 2 * (yz + xw), 1 - 2 * (xx + yy),
  ];
  const squaredScale = scale.map((value) => value * value);
  const covariance = new Array(9).fill(0);
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      let value = 0;
      for (let axis = 0; axis < 3; axis += 1) {
        value += rotationMatrix[row * 3 + axis]
          * squaredScale[axis]
          * rotationMatrix[column * 3 + axis];
      }
      covariance[row * 3 + column] = value;
    }
  }
  return covariance;
}

function normalizeProjectionOptions(options) {
  if (normalizedProjectionContracts.has(options)) return options;
  const viewportWidth = positiveFinite(options.viewportWidth ?? 300, "viewportWidth");
  const viewportHeight = positiveFinite(options.viewportHeight ?? 300, "viewportHeight");
  const devicePixelRatio = positiveFinite(options.devicePixelRatio ?? 1, "devicePixelRatio");
  const verticalFovDegrees = positiveFinite(
    options.verticalFovDegrees ?? DEFAULT_VERTICAL_FOV_DEGREES,
    "verticalFovDegrees",
  );
  if (!(verticalFovDegrees < 180)) {
    throw validationError("INVALID_FOV", "verticalFovDegrees must be less than 180");
  }

  const kernel2DSize = nonNegativeFinite(
    options.kernel2DSize ?? DEFAULT_KERNEL_2D_SIZE,
    "kernel2DSize",
  );
  const maxScreenSpaceSplatSize = positiveFinite(
    options.maxScreenSpaceSplatSize ?? DEFAULT_MAX_SCREEN_SPACE_SPLAT_SIZE,
    "maxScreenSpaceSplatSize",
  );
  if (!Number.isInteger(maxScreenSpaceSplatSize)) {
    throw validationError(
      "INVALID_MAX_SCREEN_SPACE_SPLAT_SIZE",
      "maxScreenSpaceSplatSize must be an integer because the pinned shader truncates it with parseInt",
    );
  }
  const splatScale = positiveFinite(options.splatScale ?? 1, "splatScale");
  const focalAdjustment = positiveFinite(options.focalAdjustment ?? 1, "focalAdjustment");
  const pixelTolerance = positiveFinite(
    options.pixelTolerance ?? DEFAULT_PIXEL_TOLERANCE,
    "pixelTolerance",
  );
  if (pixelTolerance > 1) {
    throw validationError("INVALID_PIXEL_TOLERANCE", "pixelTolerance must be at most 1 physical pixel");
  }

  const shaderWidth = viewportWidth * devicePixelRatio;
  const shaderHeight = viewportHeight * devicePixelRatio;
  const physicalWidth = Math.floor(shaderWidth);
  const physicalHeight = Math.floor(shaderHeight);
  if (!Number.isFinite(shaderWidth) || !Number.isFinite(shaderHeight)
      || !(physicalWidth > 0) || !(physicalHeight > 0)) {
    throw validationError(
      "INVALID_PHYSICAL_VIEWPORT",
      "Three.js drawing-buffer dimensions must be finite positive integers",
    );
  }
  const focalY = shaderHeight / (2 * Math.tan(verticalFovDegrees * Math.PI / 360));
  const focalX = focalY;
  if (!(focalX > 0) || !Number.isFinite(focalX)) {
    throw validationError("INVALID_FOCAL_LENGTH", "camera focal length is invalid");
  }

  const projection = Object.freeze({
    viewportWidth,
    viewportHeight,
    devicePixelRatio,
    shaderWidth,
    shaderHeight,
    physicalWidth,
    physicalHeight,
    verticalFovDegrees,
    focalX,
    focalY,
    kernel2DSize,
    maxScreenSpaceSplatSize,
    splatScale,
    focalAdjustment,
    pixelTolerance,
  });
  normalizedProjectionContracts.add(projection);
  return projection;
}

function buildCameraFrame(target, distance) {
  const normalizedTarget = finiteVector(target, 3, "target");
  if (!Number.isFinite(distance) || distance < 0) {
    throw validationError("INVALID_CAMERA_DISTANCE", "camera distance must be finite and non-negative");
  }

  // Three.js lookAt with the fixed contract resolves exactly to these axes.
  const rotation = [
    1, 0, 0,
    0, -1, 0,
    0, 0, -1,
  ];
  return {
    target: normalizedTarget,
    position: [normalizedTarget[0], normalizedTarget[1], normalizedTarget[2] - distance],
    rotation,
  };
}

function worldToView(center, frame) {
  const relative = [
    center[0] - frame.position[0],
    center[1] - frame.position[1],
    center[2] - frame.position[2],
  ];
  return multiplyMatrixVector(frame.rotation, relative);
}

function shaderWorldToView(center, frame) {
  const relative = [
    shaderSubtract(center[0], Math.fround(frame.position[0])),
    shaderSubtract(center[1], Math.fround(frame.position[1])),
    shaderSubtract(center[2], Math.fround(frame.position[2])),
  ];
  return shaderMultiplyMatrixVector(frame.rotation, relative);
}

function transformSymmetricMatrix(matrix, rotation) {
  const first = multiplyMatrices(rotation, matrix);
  return multiplyMatrices(first, transposeMatrix(rotation));
}

function shaderTransformSymmetricMatrix(matrix, rotation) {
  const first = shaderMultiplyMatrices(rotation, matrix);
  return shaderMultiplyMatrices(first, transposeMatrix(rotation));
}

function quadraticForm(left, matrix, right) {
  const transformed = multiplyMatrixVector(matrix, right);
  return left[0] * transformed[0] + left[1] * transformed[1] + left[2] * transformed[2];
}

function shaderQuadraticForm(left, matrix, right) {
  const transformed = shaderMultiplyMatrixVector(matrix, right);
  return shaderAdd(
    shaderAdd(
      shaderMultiply(left[0], transformed[0]),
      shaderMultiply(left[1], transformed[1]),
    ),
    shaderMultiply(left[2], transformed[2]),
  );
}

function multiplyMatrices(left, right) {
  const result = new Array(9).fill(0);
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      for (let inner = 0; inner < 3; inner += 1) {
        result[row * 3 + column] += left[row * 3 + inner] * right[inner * 3 + column];
      }
    }
  }
  return result;
}

function shaderMultiplyMatrices(left, right) {
  const result = new Array(9).fill(0);
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      let value = 0;
      for (let inner = 0; inner < 3; inner += 1) {
        value = shaderAdd(
          value,
          shaderMultiply(left[row * 3 + inner], right[inner * 3 + column]),
        );
      }
      result[row * 3 + column] = value;
    }
  }
  return result;
}

function multiplyMatrixVector(matrix, vector) {
  return [
    matrix[0] * vector[0] + matrix[1] * vector[1] + matrix[2] * vector[2],
    matrix[3] * vector[0] + matrix[4] * vector[1] + matrix[5] * vector[2],
    matrix[6] * vector[0] + matrix[7] * vector[1] + matrix[8] * vector[2],
  ];
}

function shaderMultiplyMatrixVector(matrix, vector) {
  return [0, 1, 2].map((row) => shaderAdd(
    shaderAdd(
      shaderMultiply(matrix[row * 3], vector[0]),
      shaderMultiply(matrix[row * 3 + 1], vector[1]),
    ),
    shaderMultiply(matrix[row * 3 + 2], vector[2]),
  ));
}

function transposeMatrix(matrix) {
  return [
    matrix[0], matrix[3], matrix[6],
    matrix[1], matrix[4], matrix[7],
    matrix[2], matrix[5], matrix[8],
  ];
}

function normalizeQuaternionTwiceLikePinnedLoader(rotation, index) {
  let normalized = Array.from(rotation);
  for (let pass = 0; pass < 2; pass += 1) {
    const length = Math.sqrt(
      normalized[0] * normalized[0]
      + normalized[1] * normalized[1]
      + normalized[2] * normalized[2]
      + normalized[3] * normalized[3],
    );
    if (!(length > 0) || !Number.isFinite(length)) {
      throw validationError("INVALID_QUATERNION", `splat ${index} quaternion cannot be normalized`);
    }
    const inverseLength = 1 / length;
    normalized = normalized.map((value) => value * inverseLength);
  }
  if (!normalized.every(Number.isFinite)) {
    throw validationError("NON_FINITE_QUATERNION", `splat ${index} normalized quaternion is not finite`);
  }
  return normalized;
}

function buildPinnedPerspectiveClipPlanes(depths, minimumDepth, maximumDepth) {
  let near = nextDownFloat32(minimumDepth);
  let far = nextUpFloat32(maximumDepth);

  while (true) {
    if (!(near > 0) || !(far > near) || !Number.isFinite(far)
        || depths.some((depth) => !(depth > near) || !(depth < far))) {
      throw fittingError("INVALID_CLIP_PLANES", "near/far do not strictly contain all retained centers");
    }

    const failures = pinnedPerspectiveDepthClipFailures(depths, near, far);
    if (!failures.invalid && !failures.near && !failures.far) return {near, far};

    const expandedNear = failures.invalid || failures.near ? nextDownFloat32(near) : near;
    const expandedFar = failures.far ? nextUpFloat32(far) : far;
    if (!(expandedNear > 0) || !Number.isFinite(expandedFar)
        || (expandedNear === near && expandedFar === far)) {
      throw fittingError(
        "INVALID_PROJECTION_DEPTH",
        "no positive finite float32 clip planes contain every center after pinned projection",
      );
    }
    near = expandedNear;
    far = expandedFar;
  }
}

function pinnedPerspectiveDepthClipFailures(depths, near, far) {
  const denominator = far - near;
  const coefficientC = Math.fround(-(far + near) / denominator);
  const coefficientD = Math.fround((-2 * far * near) / denominator);
  if (![coefficientC, coefficientD].every(Number.isFinite)) {
    return {invalid: true, near: false, far: false};
  }

  let nearFailure = false;
  let farFailure = false;
  for (const depth of depths) {
    const viewZ = -depth;
    const clipZ = shaderAdd(shaderMultiply(coefficientC, viewZ), coefficientD);
    const clipW = shaderMultiply(-1, viewZ);
    if (![clipZ, clipW].every(Number.isFinite) || !(clipW > 0)) {
      return {invalid: true, near: false, far: false};
    }
    if (clipZ < -clipW) nearFailure = true;
    if (clipZ > clipW) farFailure = true;
  }
  return {invalid: false, near: nearFailure, far: farFailure};
}

function culledProjection(splat, depth, reason) {
  return {
    culled: true,
    sourceIndex: splat.sourceIndex,
    depth,
    reason,
  };
}

function finiteVector(value, length, label) {
  if (!Array.isArray(value) && !ArrayBuffer.isView(value)) {
    throw validationError("INVALID_VECTOR", `${label} must be an array-like value`);
  }
  if (value.length !== length) {
    throw validationError("INVALID_VECTOR_LENGTH", `${label} must contain ${length} values`);
  }
  const result = Array.from(value);
  if (!result.every(Number.isFinite)) {
    throw validationError("NON_FINITE_VECTOR", `${label} must contain only finite numbers`);
  }
  return result;
}

function positiveFinite(value, label) {
  if (!Number.isFinite(value) || !(value > 0)) {
    throw validationError("INVALID_POSITIVE_NUMBER", `${label} must be finite and positive`);
  }
  return value;
}

function nonNegativeFinite(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw validationError("INVALID_NON_NEGATIVE_NUMBER", `${label} must be finite and non-negative`);
  }
  return value;
}

function stableMidpoint(low, high) {
  const midpoint = low / 2 + high / 2;
  if (!Number.isFinite(midpoint)) {
    throw fittingError("NON_FINITE_MIDPOINT", "binary64 midpoint cannot be represented");
  }
  return midpoint;
}

function roundUpPositive(value) {
  if (!Number.isFinite(value) || value < 0) return value;
  return value === 0 ? 0 : nextUp(value);
}

function multiplyUp(left, right) {
  const product = left * right;
  if (Number.isNaN(product) || product === Infinity) return product;
  return nextUp(product);
}

function roundUpFloat32Positive(value) {
  if (value < 0 || Number.isNaN(value)) return value;
  return roundUpFloat32(value);
}

function roundDownFloat32Positive(value) {
  if (value < 0 || Number.isNaN(value)) return value;
  return roundDownFloat32(value);
}

function roundUpFloat32(value) {
  const rounded = Math.fround(value);
  if (rounded >= value) return rounded;
  return nextUpFloat32(rounded);
}

function roundDownFloat32(value) {
  const rounded = Math.fround(value);
  if (rounded <= value) return rounded;
  return nextDownFloat32(rounded);
}

function nextUpFloat32(value) {
  const rounded = Math.fround(value);
  if (rounded === Infinity) return Infinity;
  if (rounded === 0) return 2 ** -149;
  float32View.setFloat32(0, rounded, false);
  let bits = float32View.getUint32(0, false);
  bits += rounded > 0 ? 1 : -1;
  float32View.setUint32(0, bits, false);
  return float32View.getFloat32(0, false);
}

function nextDownFloat32(value) {
  const rounded = Math.fround(value);
  if (rounded === -Infinity) return -Infinity;
  if (rounded === Infinity) {
    float32View.setUint32(0, 0x7f7fffff, false);
    return float32View.getFloat32(0, false);
  }
  if (rounded === 0) return -(2 ** -149);
  float32View.setFloat32(0, rounded, false);
  let bits = float32View.getUint32(0, false);
  bits += rounded > 0 ? -1 : 1;
  float32View.setUint32(0, bits, false);
  return float32View.getFloat32(0, false);
}

function addUpFloat32(left, right) {
  return roundUpFloat32Positive(left + right);
}

function multiplyUpFloat32(left, right) {
  return roundUpFloat32Positive(left * right);
}

function multiplyDownFloat32(left, right) {
  return roundDownFloat32Positive(left * right);
}

function divideUpFloat32(numerator, denominator) {
  if (!(denominator > 0)) return Infinity;
  return roundUpFloat32Positive(numerator / denominator);
}

function sqrtUpFloat32(value) {
  return roundUpFloat32Positive(Math.sqrt(value));
}

function roundedShaderCenterOffsetUpper(exactHalfViewport, projectedOffsetUpper) {
  const shaderHalfViewport = Math.fround(exactHalfViewport);
  const lowerCenter = roundDownFloat32(shaderHalfViewport - projectedOffsetUpper);
  const upperCenter = roundUpFloat32(shaderHalfViewport + projectedOffsetUpper);
  return Math.max(
    roundUpPositive(Math.abs(lowerCenter - exactHalfViewport)),
    roundUpPositive(Math.abs(upperCenter - exactHalfViewport)),
  );
}

function absoluteShaderQuadraticUpper(vector, absoluteMatrix) {
  const transformed = [0, 0, 0];
  for (let row = 0; row < 3; row += 1) {
    let value = 0;
    for (let column = 0; column < 3; column += 1) {
      value = addUpFloat32(
        value,
        multiplyUpFloat32(absoluteMatrix[row * 3 + column], vector[column]),
      );
    }
    transformed[row] = value;
  }

  let result = 0;
  for (let row = 0; row < 3; row += 1) {
    result = addUpFloat32(result, multiplyUpFloat32(vector[row], transformed[row]));
  }
  return result;
}

function addUp(left, right) {
  return roundUpPositive(left + right);
}

function shaderAdd(left, right) {
  return Math.fround(Math.fround(left) + Math.fround(right));
}

function shaderSubtract(left, right) {
  return Math.fround(Math.fround(left) - Math.fround(right));
}

function shaderMultiply(left, right) {
  return Math.fround(Math.fround(left) * Math.fround(right));
}

function shaderDivide(numerator, denominator) {
  return Math.fround(Math.fround(numerator) / Math.fround(denominator));
}

function assertPreparedSplats(splats) {
  if (!preparedSplatCollections.has(splats)) {
    throw validationError("INVALID_PREPARED_SPLATS", "prepared splat collection is empty or invalid");
  }
}

function assertPreparedSplat(splat) {
  if (!preparedSplatRecords.has(splat)) {
    throw validationError("INVALID_PREPARED_SPLAT", "splat has not been prepared");
  }
}

function isPreparedCollection(splats) {
  return preparedSplatCollections.has(splats);
}

function assertFiniteOrInfinity(value, label) {
  if (Number.isNaN(value)) {
    throw validationError("INVALID_NUMBER", `${label} must not be NaN`);
  }
}

function validationError(code, message) {
  return new GaussianFitValidationError(code, message);
}

function fittingError(code, message) {
  return new GaussianFittingError(code, message);
}
