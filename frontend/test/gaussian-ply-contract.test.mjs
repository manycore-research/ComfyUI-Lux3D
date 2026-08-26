import assert from "node:assert/strict";
import {test} from "node:test";

import {
  GaussianPlyValidationError,
  parseGaussianPly,
} from "../src/viewer/format/gaussian-ply.js";

const REQUIRED_PROPERTIES = [
  "x", "y", "z",
  "f_dc_0", "f_dc_1", "f_dc_2",
  "opacity",
  "scale_0", "scale_1", "scale_2",
  "rot_0", "rot_1", "rot_2", "rot_3",
];

test("rejects non-float vertex properties", () => {
  const properties = REQUIRED_PROPERTIES.map((name) => ({
    name,
    type: name === "x" ? "double" : "float",
  }));
  assertPlyError(() => parseGaussianPly(buildGaussianPly({properties})), "UNSUPPORTED_PROPERTY");
});

test("rejects duplicate properties", () => {
  const properties = [
    ...REQUIRED_PROPERTIES.map((name) => ({name, type: "float"})),
    {name: "x", type: "float"},
  ];
  assertPlyError(() => parseGaussianPly(buildGaussianPly({properties})), "DUPLICATE_PROPERTY");
});

test("rejects missing and extra properties", () => {
  const missing = REQUIRED_PROPERTIES
    .filter((name) => name !== "f_dc_2")
    .map((name) => ({name, type: "float"}));
  assertPlyError(
    () => parseGaussianPly(buildGaussianPly({properties: missing})),
    "MISSING_REQUIRED_PROPERTY",
  );

  const extra = [
    ...REQUIRED_PROPERTIES.map((name) => ({name, type: "float"})),
    {name: "temperature", type: "float"},
  ];
  assertPlyError(() => parseGaussianPly(buildGaussianPly({properties: extra})), "UNKNOWN_PROPERTY");
});

test("rejects trailing bytes", () => {
  const valid = new Uint8Array(buildGaussianPly());
  const trailing = new Uint8Array(valid.byteLength + 1);
  trailing.set(valid);
  assertPlyError(() => parseGaussianPly(trailing), "INVALID_FILE_LENGTH");
});

test("ignores end_header substrings in comment and obj_info lines", () => {
  for (const lineEnding of ["\n", "\r\n"]) {
    const parsed = parseGaussianPly(buildGaussianPly({
      headerDirectives: [
        "comment end_header is documentation, not a terminator",
        "obj_info end_header",
      ],
      lineEnding,
    }));
    assert.equal(parsed.stats.vertexCount, 1);
    assert.equal(parsed.stats.retainedSplatCount, 1);
  }
});

test("rejects non-finite raw float properties", () => {
  const file = buildGaussianPly({vertices: [{f_dc_1: Number.NaN}]});
  assertPlyError(() => parseGaussianPly(file), "NON_FINITE_PROPERTY");
});

test("rejects finite log-scale values whose decoded float32 scale overflows", () => {
  const file = buildGaussianPly({vertices: [{scale_0: 100}]});
  assertPlyError(() => parseGaussianPly(file), "INVALID_DECODED_SCALE");
});

test("rejects a zero-length quaternion", () => {
  const file = buildGaussianPly({
    vertices: [{rot_0: 0, rot_1: 0, rot_2: 0, rot_3: 0}],
  });
  assertPlyError(() => parseGaussianPly(file), "INVALID_DECODED_QUATERNION");
});

test("minimumAlpha=1 removes alpha zero and retains alpha one", () => {
  const parsed = parseGaussianPly(buildGaussianPly({
    vertices: [
      {x: 0, opacity: -20},
      {x: 1, opacity: -5},
    ],
  }));

  assert.equal(parsed.stats.vertexCount, 2);
  assert.equal(parsed.stats.removedSplatCount, 1);
  assert.equal(parsed.stats.retainedSplatCount, 1);
  assert.equal(parsed.splats[0].center[0], 1);
  assert.equal(parsed.splats[0].alpha, 1);
});

test("converts stored raw float32 wxyz quaternion order to raw xyzw", () => {
  const stored = {
    rot_0: -0.8554975986,
    rot_1: -0.8010262251,
    rot_2: 0.2979183793,
    rot_3: -0.9228214025,
  };
  const parsed = parseGaussianPly(buildGaussianPly({
    vertices: [stored],
  }));
  const expected = [stored.rot_1, stored.rot_2, stored.rot_3, stored.rot_0].map(Math.fround);
  assert.deepEqual(parsed.splats[0].rotation, expected);
  assert.notEqual(Math.hypot(...parsed.splats[0].rotation), 1);
});

function buildGaussianPly({
  properties = REQUIRED_PROPERTIES.map((name) => ({name, type: "float"})),
  vertices = [{}],
  headerDirectives = [],
  lineEnding = "\n",
} = {}) {
  const header = [
    "ply",
    "format binary_little_endian 1.0",
    ...headerDirectives,
    `element vertex ${vertices.length}`,
    ...properties.map(({name, type}) => `property ${type} ${name}`),
    "end_header",
    "",
  ].join(lineEnding);
  const headerBytes = new TextEncoder().encode(header);
  const data = new ArrayBuffer(vertices.length * properties.length * Float32Array.BYTES_PER_ELEMENT);
  const view = new DataView(data);

  vertices.forEach((overrides, row) => {
    const values = {
      x: 0,
      y: 0,
      z: 0,
      f_dc_0: 0,
      f_dc_1: 0,
      f_dc_2: 0,
      opacity: 10,
      scale_0: 0,
      scale_1: 0,
      scale_2: 0,
      rot_0: 1,
      rot_1: 0,
      rot_2: 0,
      rot_3: 0,
      ...overrides,
    };
    properties.forEach(({name}, column) => {
      view.setFloat32(
        (row * properties.length + column) * Float32Array.BYTES_PER_ELEMENT,
        values[name] ?? 0,
        true,
      );
    });
  });

  const file = new Uint8Array(headerBytes.byteLength + data.byteLength);
  file.set(headerBytes);
  file.set(new Uint8Array(data), headerBytes.byteLength);
  return file.buffer;
}

function assertPlyError(callback, expectedCode) {
  assert.throws(
    callback,
    (error) => error instanceof GaussianPlyValidationError && error.code === expectedCode,
  );
}
