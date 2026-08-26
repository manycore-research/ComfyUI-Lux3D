const REQUIRED_PROPERTIES = Object.freeze([
  "x", "y", "z",
  "f_dc_0", "f_dc_1", "f_dc_2",
  "opacity",
  "scale_0", "scale_1", "scale_2",
  "rot_0", "rot_1", "rot_2", "rot_3",
]);
const OPTIONAL_NORMAL_PROPERTIES = new Set(["nx", "ny", "nz"]);
const HEADER_END = "end_header";

export class GaussianPlyValidationError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = "GaussianPlyValidationError";
    this.code = code;
  }
}

export function parseGaussianPly(input) {
  const bytes = toUint8Array(input);
  const {headerText, dataOffset} = readHeader(bytes);
  const header = parseHeader(headerText);
  const expectedLength = dataOffset + header.vertexCount * header.stride;
  if (!Number.isSafeInteger(expectedLength) || expectedLength !== bytes.byteLength) {
    throw plyError(
      "INVALID_FILE_LENGTH",
      `expected ${expectedLength} bytes from header, received ${bytes.byteLength}`,
    );
  }

  const dataView = new DataView(bytes.buffer, bytes.byteOffset + dataOffset, bytes.byteLength - dataOffset);
  const propertyOffsets = new Map(
    header.properties.map((property, index) => [property, index * Float32Array.BYTES_PER_ELEMENT]),
  );
  const splats = [];
  for (let row = 0; row < header.vertexCount; row += 1) {
    const rowOffset = row * header.stride;
    for (let index = 0; index < header.properties.length; index += 1) {
      const raw = dataView.getFloat32(rowOffset + index * 4, true);
      if (!Number.isFinite(raw)) {
        throw plyError(
          "NON_FINITE_PROPERTY",
          `vertex ${row} property ${header.properties[index]} is not finite`,
        );
      }
    }

    const read = (name) => dataView.getFloat32(rowOffset + propertyOffsets.get(name), true);
    const scale = [
      Math.fround(Math.exp(read("scale_0"))),
      Math.fround(Math.exp(read("scale_1"))),
      Math.fround(Math.exp(read("scale_2"))),
    ];
    if (!scale.every((value) => Number.isFinite(value) && value > 0)) {
      throw plyError("INVALID_DECODED_SCALE", `vertex ${row} decoded scale is not finite and positive`);
    }

    // INRIA/G1 stores quaternion components as w, x, y, z. The pinned loader
    // ultimately supplies x, y, z, w to the covariance calculation.
    const rawRotation = [read("rot_1"), read("rot_2"), read("rot_3"), read("rot_0")];
    const rotationLength = Math.sqrt(
      rawRotation[0] * rawRotation[0]
        + rawRotation[1] * rawRotation[1]
        + rawRotation[2] * rawRotation[2]
        + rawRotation[3] * rawRotation[3],
    );
    if (!(rotationLength > 0) || !Number.isFinite(rotationLength)) {
      throw plyError("INVALID_DECODED_QUATERNION", `vertex ${row} quaternion cannot be normalized`);
    }
    const rotation = rawRotation.map((value) => Math.fround(value));
    const opacity = read("opacity");
    const alpha = clamp(Math.floor((1 / (1 + Math.exp(-opacity))) * 255), 0, 255);
    if (alpha < 1) continue;

    splats.push({
      center: [read("x"), read("y"), read("z")],
      scale,
      rotation,
      alpha,
    });
  }

  if (splats.length === 0) {
    throw plyError("NO_RETAINED_SPLATS", "minimumAlpha=1 retained no vertices");
  }
  return {
    splats,
    header,
    stats: {
      fileBytes: bytes.byteLength,
      vertexCount: header.vertexCount,
      retainedSplatCount: splats.length,
      removedSplatCount: header.vertexCount - splats.length,
    },
  };
}

function readHeader(bytes) {
  const token = new TextEncoder().encode(HEADER_END);
  let tokenOffset = -1;
  let dataOffset = -1;
  let lineStart = 0;
  for (let offset = 0; offset < bytes.length; offset += 1) {
    if (bytes[offset] !== 10) continue;
    const lineEnd = offset > lineStart && bytes[offset - 1] === 13 ? offset - 1 : offset;
    if (lineEnd - lineStart === token.length) {
      let matches = true;
      for (let index = 0; index < token.length; index += 1) {
        if (bytes[lineStart + index] !== token[index]) {
          matches = false;
          break;
        }
      }
      if (matches) {
        tokenOffset = lineStart;
        dataOffset = offset + 1;
        break;
      }
    }
    lineStart = offset + 1;
  }
  if (tokenOffset < 0) {
    const trailingLine = bytes.subarray(lineStart);
    if (trailingLine.length === token.length
      && trailingLine.every((value, index) => value === token[index])) {
      throw plyError("INVALID_HEADER_TERMINATOR", "end_header must be followed by a newline");
    }
    throw plyError("MISSING_END_HEADER", "PLY header does not contain end_header");
  }

  const headerBytes = bytes.subarray(0, tokenOffset + token.length);
  if (headerBytes.some((value) => value > 0x7f || value === 0)) {
    throw plyError("NON_ASCII_HEADER", "PLY header must contain only non-NUL ASCII bytes");
  }
  return {
    headerText: new TextDecoder("ascii", {fatal: true}).decode(headerBytes),
    dataOffset,
  };
}

function parseHeader(headerText) {
  const lines = headerText.split(/\r?\n/);
  if (lines[0] !== "ply") {
    throw plyError("INVALID_MAGIC", "first header line must be ply");
  }
  if (lines[1] !== "format binary_little_endian 1.0") {
    throw plyError("UNSUPPORTED_FORMAT", "only binary_little_endian 1.0 is supported");
  }
  if (lines.at(-1) !== HEADER_END) {
    throw plyError("INVALID_END_HEADER", "end_header must terminate the header");
  }

  let vertexCount = null;
  let insideVertexElement = false;
  const properties = [];
  const propertySet = new Set();
  for (const line of lines.slice(2, -1)) {
    if (line === "" || line.startsWith("comment ") || line.startsWith("obj_info ")) continue;
    const parts = line.trim().split(/\s+/);
    if (parts[0] === "element") {
      if (parts.length !== 3 || parts[1] !== "vertex" || vertexCount !== null) {
        throw plyError("UNSUPPORTED_ELEMENT", `unsupported or duplicate element: ${line}`);
      }
      vertexCount = parseVertexCount(parts[2]);
      insideVertexElement = true;
      continue;
    }
    if (parts[0] === "property") {
      if (!insideVertexElement || parts.length !== 3 || parts[1] !== "float") {
        throw plyError("UNSUPPORTED_PROPERTY", `only scalar float vertex properties are supported: ${line}`);
      }
      const name = parts[2];
      if (propertySet.has(name)) {
        throw plyError("DUPLICATE_PROPERTY", `duplicate property ${name}`);
      }
      if (!isAllowedProperty(name)) {
        throw plyError("UNKNOWN_PROPERTY", `property ${name} is not part of the G1 contract`);
      }
      propertySet.add(name);
      properties.push(name);
      continue;
    }
    throw plyError("UNKNOWN_HEADER_DIRECTIVE", `unsupported header line: ${line}`);
  }

  if (vertexCount === null) {
    throw plyError("MISSING_VERTEX_ELEMENT", "vertex element is required");
  }
  for (const property of REQUIRED_PROPERTIES) {
    if (!propertySet.has(property)) {
      throw plyError("MISSING_REQUIRED_PROPERTY", `required property ${property} is missing`);
    }
  }
  const restCount = properties.filter((property) => property.startsWith("f_rest_")).length;
  if (restCount !== 0 && restCount !== 45) {
    throw plyError("INCOMPLETE_SPHERICAL_HARMONICS", "f_rest must be absent or contain f_rest_0 through f_rest_44");
  }
  if (restCount === 45) {
    for (let index = 0; index < 45; index += 1) {
      if (!propertySet.has(`f_rest_${index}`)) {
        throw plyError("NON_CONTIGUOUS_SPHERICAL_HARMONICS", `f_rest_${index} is missing`);
      }
    }
  }

  return {
    format: "binary_little_endian 1.0",
    vertexCount,
    properties,
    stride: properties.length * Float32Array.BYTES_PER_ELEMENT,
  };
}

function isAllowedProperty(name) {
  if (REQUIRED_PROPERTIES.includes(name) || OPTIONAL_NORMAL_PROPERTIES.has(name)) return true;
  const match = /^f_rest_(\d+)$/.exec(name);
  return match !== null && Number(match[1]) >= 0 && Number(match[1]) <= 44;
}

function parseVertexCount(value) {
  if (!/^\d+$/.test(value)) {
    throw plyError("INVALID_VERTEX_COUNT", `vertex count is not an integer: ${value}`);
  }
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count <= 0) {
    throw plyError("INVALID_VERTEX_COUNT", `vertex count must be a positive safe integer: ${value}`);
  }
  return count;
}

function toUint8Array(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  throw plyError("INVALID_INPUT", "Gaussian PLY input must be an ArrayBuffer or Uint8Array");
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function plyError(code, message) {
  return new GaussianPlyValidationError(code, message);
}
