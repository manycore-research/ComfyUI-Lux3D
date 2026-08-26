const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const JSON_CHUNK_TYPE = 0x4e4f534a;
const BIN_CHUNK_TYPE = 0x004e4942;

export const GLB_REQUIRED_EXTENSION_ALLOWLIST = Object.freeze(new Set([
  "KHR_draco_mesh_compression",
  "KHR_texture_basisu",
  "EXT_meshopt_compression",
  "KHR_mesh_quantization",
  "KHR_texture_transform",
  "KHR_materials_unlit",
  "KHR_materials_clearcoat",
  "KHR_materials_ior",
  "KHR_materials_specular",
  "KHR_materials_transmission",
  "KHR_materials_volume",
  "KHR_materials_sheen",
  "KHR_materials_iridescence",
  "KHR_materials_emissive_strength",
  "KHR_materials_anisotropy",
  "KHR_materials_dispersion",
]));

const IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/ktx2",
]);

export class GlbContractError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = "GlbContractError";
    this.code = code;
  }
}

export function parseGlbContract(input, options = {}) {
  const maxAssetBytes = options.maxAssetBytes;
  if (!Number.isSafeInteger(maxAssetBytes) || maxAssetBytes <= 0) {
    throw glbError("MISSING_MAX_ASSET_BYTES", "a positive safe integer byte limit is required");
  }
  const bytes = toUint8Array(input);
  if (bytes.byteLength > maxAssetBytes) {
    throw glbError("ASSET_TOO_LARGE", "GLB exceeds the configured byte limit");
  }
  if (bytes.byteLength < 12) throw glbError("TRUNCATED_HEADER", "GLB header requires 12 bytes");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) throw glbError("INVALID_MAGIC", "GLB magic must be glTF");
  if (view.getUint32(4, true) !== GLB_VERSION) throw glbError("UNSUPPORTED_VERSION", "only GLB 2 is supported");
  const declaredLength = view.getUint32(8, true);
  if (declaredLength !== bytes.byteLength) {
    throw glbError("DECLARED_LENGTH_MISMATCH", "GLB declared length must equal the complete response length");
  }
  if (declaredLength > maxAssetBytes) throw glbError("ASSET_TOO_LARGE", "GLB declared length exceeds the configured limit");
  if (declaredLength < 20) throw glbError("TRUNCATED_JSON_CHUNK", "GLB requires a JSON chunk header");

  const chunks = [];
  let offset = 12;
  while (offset < declaredLength) {
    if (declaredLength - offset < 8) throw glbError("TRUNCATED_CHUNK_HEADER", "GLB chunk header is truncated");
    const byteLength = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    if (byteLength % 4 !== 0) {
      throw glbError("INVALID_CHUNK_ALIGNMENT", "GLB chunk length must be aligned to four bytes");
    }
    const dataOffset = offset + 8;
    const end = dataOffset + byteLength;
    if (!Number.isSafeInteger(end) || end > declaredLength || end > bytes.byteLength || end > maxAssetBytes) {
      throw glbError("CHUNK_OUT_OF_BOUNDS", "GLB chunk crosses the declared, actual, or configured length");
    }
    chunks.push(Object.freeze({type, byteLength, dataOffset}));
    offset = end;
  }
  if (offset !== declaredLength) throw glbError("CHUNK_LENGTH_MISMATCH", "GLB chunks do not fill the declared length");
  if (chunks[0]?.type !== JSON_CHUNK_TYPE) throw glbError("JSON_CHUNK_REQUIRED", "the first GLB chunk must be JSON");
  if (chunks.length > 2) throw glbError("TOO_MANY_CHUNKS", "JSON may be followed by at most one BIN chunk");
  if (chunks.length === 2 && chunks[1].type !== BIN_CHUNK_TYPE) {
    throw glbError("UNKNOWN_CHUNK_TYPE", "the only supported chunk after JSON is BIN");
  }

  const jsonChunk = chunks[0];
  let json;
  try {
    const text = new TextDecoder("utf-8", {fatal: true}).decode(
      bytes.subarray(jsonChunk.dataOffset, jsonChunk.dataOffset + jsonChunk.byteLength),
    );
    json = JSON.parse(text);
  } catch {
    throw glbError("INVALID_JSON_CHUNK", "GLB JSON chunk is not valid UTF-8 JSON");
  }
  if (!isPlainObject(json)) throw glbError("INVALID_GLTF_ROOT", "glTF JSON root must be an object");
  if (!isPlainObject(json.asset) || json.asset.version !== "2.0") {
    throw glbError("INVALID_GLTF_VERSION", "glTF asset.version must be 2.0");
  }

  const binChunk = chunks[1] ?? null;
  validateSelfContainedBuffers(json, binChunk);
  validateImages(json);
  const warnings = validateExtensions(json);
  for (const warning of warnings) options.onWarning?.(warning);

  return Object.freeze({
    format: "glb",
    json,
    jsonChunk,
    binChunk,
    binByteLength: binChunk?.byteLength ?? 0,
    warnings: Object.freeze(warnings),
  });
}

function validateSelfContainedBuffers(json, binChunk) {
  if (!Array.isArray(json.buffers) || json.buffers.length !== 1 || !isPlainObject(json.buffers[0])) {
    throw glbError("SELF_CONTAINED_BUFFER_REQUIRED", "self-contained GLB requires exactly one buffer");
  }
  const buffer = json.buffers[0];
  if (Object.hasOwn(buffer, "uri")) {
    throw glbError("EXTERNAL_BUFFER_URI", "buffer uri is forbidden, including data URIs");
  }
  if (!Number.isSafeInteger(buffer.byteLength) || buffer.byteLength < 0) {
    throw glbError("INVALID_BUFFER_LENGTH", "buffer byteLength must be a non-negative safe integer");
  }
  if (buffer.byteLength > (binChunk?.byteLength ?? 0)) {
    throw glbError("BUFFER_EXCEEDS_BIN_CHUNK", "buffer byteLength exceeds the BIN chunk");
  }
}

function validateImages(json) {
  if (json.images === undefined) return;
  if (!Array.isArray(json.images)) throw glbError("INVALID_IMAGES", "images must be an array");
  for (const image of json.images) {
    if (!isPlainObject(image)) throw glbError("INVALID_IMAGE", "each image must be an object");
    if (Object.hasOwn(image, "uri")) {
      throw glbError("EXTERNAL_IMAGE_URI", "image uri is forbidden, including data URIs");
    }
    if (!Number.isSafeInteger(image.bufferView) || image.bufferView < 0 || !IMAGE_MIME_TYPES.has(image.mimeType)) {
      throw glbError(
        "INVALID_EMBEDDED_IMAGE",
        "images require a non-negative bufferView and a supported PNG/JPEG/WebP/KTX2 MIME type",
      );
    }
  }
}

function validateExtensions(json) {
  const required = validateExtensionArray(json.extensionsRequired, "extensionsRequired");
  const used = validateExtensionArray(json.extensionsUsed, "extensionsUsed");
  const all = new Set([...required, ...used]);
  if (all.has("EXT_mesh_gpu_instancing")) {
    throw glbError("UNSUPPORTED_GPU_INSTANCING", "EXT_mesh_gpu_instancing is not supported in v1");
  }
  if (required.has("KHR_lights_punctual")) {
    throw glbError("REQUIRED_MODEL_LIGHTS_UNSUPPORTED", "required model lights are ignored by the viewer");
  }
  for (const extension of required) {
    if (!GLB_REQUIRED_EXTENSION_ALLOWLIST.has(extension)) {
      throw glbError("UNKNOWN_REQUIRED_EXTENSION", `required extension ${extension} is not supported`);
    }
  }
  const warnings = [];
  for (const extension of used) {
    if (!required.has(extension) && !GLB_REQUIRED_EXTENSION_ALLOWLIST.has(extension)) {
      warnings.push(Object.freeze({code: "UNKNOWN_OPTIONAL_EXTENSION", extension}));
    }
  }
  return warnings;
}

function validateExtensionArray(value, field) {
  if (value === undefined) return new Set();
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item === "")) {
    throw glbError("INVALID_EXTENSION_LIST", `${field} must be an array of non-empty strings`);
  }
  if (new Set(value).size !== value.length) {
    throw glbError("DUPLICATE_EXTENSION", `${field} must not contain duplicates`);
  }
  return new Set(value);
}

function toUint8Array(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  throw glbError("INVALID_INPUT", "GLB input must be an ArrayBuffer or Uint8Array");
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function glbError(code, message) {
  return new GlbContractError(code, message);
}
