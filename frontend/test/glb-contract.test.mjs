import assert from "node:assert/strict";
import test from "node:test";

import {
  GLB_REQUIRED_EXTENSION_ALLOWLIST,
  GlbContractError,
  parseGlbContract,
} from "../src/viewer/format/glb-contract.js";
import {makeGlb} from "./viewer-test-helpers.mjs";

test("returns a plain self-contained GLB contract with parsed JSON and BIN length", () => {
  const bytes = makeGlb({
    images: [{bufferView: 0, mimeType: "image/png"}],
    extensionsRequired: ["KHR_texture_basisu"],
  });
  const contract = parseGlbContract(bytes, {maxAssetBytes: bytes.byteLength});
  assert.equal(contract.format, "glb");
  assert.equal(contract.json.asset.version, "2.0");
  assert.equal(contract.binByteLength, 4);
  assert.equal(contract.binChunk.byteLength, 4);
  assert.ok(!(contract.json instanceof Uint8Array));
});

test("enforces exact header, declared length, first JSON chunk and known chunk sequence", () => {
  const valid = makeGlb();
  const cases = [];
  const badMagic = valid.slice();
  badMagic[0] = 0;
  cases.push([badMagic, "INVALID_MAGIC"]);
  const badVersion = valid.slice();
  new DataView(badVersion.buffer).setUint32(4, 1, true);
  cases.push([badVersion, "UNSUPPORTED_VERSION"]);
  const badLength = valid.slice();
  new DataView(badLength.buffer).setUint32(8, valid.byteLength - 4, true);
  cases.push([badLength, "DECLARED_LENGTH_MISMATCH"]);
  const binFirst = valid.slice();
  new DataView(binFirst.buffer).setUint32(16, 0x004e4942, true);
  cases.push([binFirst, "JSON_CHUNK_REQUIRED"]);
  const unknownSecond = valid.slice();
  const jsonLength = new DataView(unknownSecond.buffer).getUint32(12, true);
  new DataView(unknownSecond.buffer).setUint32(20 + jsonLength + 4, 0x12345678, true);
  cases.push([unknownSecond, "UNKNOWN_CHUNK_TYPE"]);

  for (const [bytes, code] of cases) {
    assert.throws(
      () => parseGlbContract(bytes, {maxAssetBytes: valid.byteLength}),
      (error) => error instanceof GlbContractError && error.code === code,
    );
  }
});

test("rejects all buffer/image URIs and enforces embedded image MIME contract", () => {
  const invalidJsons = [
    {buffers: [{byteLength: 4, uri: "external.bin"}]},
    {buffers: [{byteLength: 4}], images: [{uri: "data:image/png;base64,AA=="}]},
    {buffers: [{byteLength: 4}], images: [{bufferView: 0, mimeType: "image/gif"}]},
  ];
  const expectedCodes = ["EXTERNAL_BUFFER_URI", "EXTERNAL_IMAGE_URI", "INVALID_EMBEDDED_IMAGE"];
  invalidJsons.forEach((json, index) => {
    const bytes = makeGlb(json);
    assert.throws(
      () => parseGlbContract(bytes, {maxAssetBytes: bytes.byteLength}),
      (error) => error.code === expectedCodes[index],
    );
  });
});

test("uses the checked-in required allowlist, blocks model lights and GPU instancing", () => {
  for (const extension of GLB_REQUIRED_EXTENSION_ALLOWLIST) {
    const bytes = makeGlb({extensionsRequired: [extension]});
    assert.doesNotThrow(() => parseGlbContract(bytes, {maxAssetBytes: bytes.byteLength}));
  }
  for (const [extensions, code] of [
    [{extensionsRequired: ["VENDOR_unknown"]}, "UNKNOWN_REQUIRED_EXTENSION"],
    [{extensionsRequired: ["KHR_lights_punctual"]}, "REQUIRED_MODEL_LIGHTS_UNSUPPORTED"],
    [{extensionsUsed: ["EXT_mesh_gpu_instancing"]}, "UNSUPPORTED_GPU_INSTANCING"],
  ]) {
    const bytes = makeGlb(extensions);
    assert.throws(() => parseGlbContract(bytes, {maxAssetBytes: bytes.byteLength}), (error) => error.code === code);
  }
});

test("allows unknown optional extensions only as sanitized warnings", () => {
  const bytes = makeGlb({extensionsUsed: ["VENDOR_optional"]});
  const seen = [];
  const contract = parseGlbContract(bytes, {
    maxAssetBytes: bytes.byteLength,
    onWarning: (warning) => seen.push(warning),
  });
  assert.deepEqual(contract.warnings, [{code: "UNKNOWN_OPTIONAL_EXTENSION", extension: "VENDOR_optional"}]);
  assert.deepEqual(seen, contract.warnings);
});

test("requires an explicit maximum and rejects buffer declarations beyond the BIN chunk", () => {
  const bytes = makeGlb({buffers: [{byteLength: 5}]});
  assert.throws(() => parseGlbContract(bytes), {code: "MISSING_MAX_ASSET_BYTES"});
  assert.throws(
    () => parseGlbContract(bytes, {maxAssetBytes: bytes.byteLength}),
    (error) => error.code === "BUFFER_EXCEEDS_BIN_CHUNK",
  );
});
