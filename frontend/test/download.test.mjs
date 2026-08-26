import assert from "node:assert/strict";
import test from "node:test";

import {
  downloadAsset,
  sanitizeAssetUrl,
  validateHttpAssetUrl,
  ViewerDownloadError,
} from "../src/viewer/download.js";
import {makeStreamingResponse} from "./viewer-test-helpers.mjs";

test("downloads one complete streaming GET and removes URL secrets from observable metadata", async () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const calls = [];
  const result = await downloadAsset("https://assets.example/model.glb?signature=secret#fragment", {
    maxAssetBytes: 16,
    timeoutMs: 1000,
    fetchImpl: async (url, init) => {
      calls.push({url, init});
      return makeStreamingResponse(bytes, {
        url: "https://cdn.example/final/model.glb?redirectToken=secret",
        headers: {"content-length": 4},
        chunks: [bytes.subarray(0, 1), bytes.subarray(1)],
      });
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers, undefined);
  assert.deepEqual(new Uint8Array(result.arrayBuffer), bytes);
  assert.equal(result.sanitizedUrl, "https://cdn.example/final/model.glb");
  assert.equal(sanitizeAssetUrl(calls[0].url), "https://assets.example/model.glb");
});

test("resolves a ComfyUI-local view path against the browser origin", async () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const calls = [];
  const result = await downloadAsset(
    "/view?filename=model.glb&type=input&subfolder=lux3d",
    {
      baseUrl: "http://127.0.0.1:8488/workflow",
      maxAssetBytes: 16,
      timeoutMs: 1000,
      fetchImpl: async (url) => {
        calls.push(url);
        return makeStreamingResponse(bytes, {
          url,
          headers: {"content-length": 4},
        });
      },
    },
  );

  assert.equal(
    calls[0],
    "http://127.0.0.1:8488/view?filename=model.glb&type=input&subfolder=lux3d",
  );
  assert.equal(result.sanitizedUrl, "http://127.0.0.1:8488/view");
  assert.deepEqual(new Uint8Array(result.arrayBuffer), bytes);
});

test("rejects unsupported input and redirected protocols without exposing query strings", async () => {
  for (const url of ["file:///tmp/a.glb", "data:model/gltf-binary;base64,AA==", "blob:https://example/a"]) {
    assert.throws(() => validateHttpAssetUrl(url), (error) => {
      assert.equal(error.code, "UNSUPPORTED_PROTOCOL");
      assert.ok(!error.message.includes("base64"));
      return true;
    });
  }
  assert.equal(sanitizeAssetUrl("data:model/gltf-binary;base64,SECRET"), "<unsupported-protocol>");
  await assert.rejects(
    downloadAsset("https://assets.example/a.glb?secret=yes", {
      maxAssetBytes: 16,
      timeoutMs: 1000,
      fetchImpl: async () => makeStreamingResponse(new Uint8Array([1]), {url: "file:///redirect.glb"}),
    }),
    (error) => error instanceof ViewerDownloadError
      && error.code === "UNSUPPORTED_PROTOCOL"
      && !error.message.includes("secret=yes"),
  );
});

test("accepts HTTP 206 only when Content-Range and actual bytes cover the entire asset", async () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const complete = await downloadAsset("https://assets.example/a", {
    maxAssetBytes: 16,
    timeoutMs: 1000,
    fetchImpl: async () => makeStreamingResponse(bytes, {
      status: 206,
      headers: {"content-range": "bytes 0-3/4", "content-length": 4},
    }),
  });
  assert.equal(complete.status, 206);
  assert.equal(complete.byteLength, 4);

  for (const headers of [
    {"content-range": "bytes 1-3/4", "content-length": 3},
    {"content-range": "bytes 0-2/4", "content-length": 3},
    {"content-range": "bytes 0-3/*", "content-length": 4},
  ]) {
    await assert.rejects(
      downloadAsset("https://assets.example/a", {
        maxAssetBytes: 16,
        timeoutMs: 1000,
        fetchImpl: async () => makeStreamingResponse(bytes, {status: 206, headers}),
      }),
      (error) => error.code === "PARTIAL_RESPONSE_UNSUPPORTED",
    );
  }
  await assert.rejects(
    downloadAsset("https://assets.example/a", {
      maxAssetBytes: 16,
      timeoutMs: 1000,
      fetchImpl: async () => makeStreamingResponse(bytes.subarray(0, 3), {
        status: 206,
        headers: {"content-range": "bytes 0-3/4", "content-length": 4},
      }),
    }),
    (error) => error.code === "PARTIAL_RESPONSE_UNSUPPORTED" || error.code === "INCOMPLETE_RESPONSE",
  );
});

test("enforces the same explicit limit at headers and while streaming", async () => {
  const headerResponse = makeStreamingResponse(new Uint8Array([1]), {headers: {"content-length": 17}});
  await assert.rejects(
    downloadAsset("https://assets.example/a", {
      maxAssetBytes: 16,
      timeoutMs: 1000,
      fetchImpl: async () => headerResponse,
    }),
    (error) => error.code === "ASSET_TOO_LARGE" && error.details.maxAssetBytes === 16,
  );
  assert.equal(headerResponse.reader.cancelled, true);

  await assert.rejects(
    downloadAsset("https://assets.example/a", {
      maxAssetBytes: 3,
      timeoutMs: 1000,
      fetchImpl: async () => makeStreamingResponse(new Uint8Array([1, 2, 3, 4]), {
        chunks: [new Uint8Array([1, 2]), new Uint8Array([3, 4])],
      }),
    }),
    (error) => error.code === "ASSET_TOO_LARGE",
  );
});

test("requires explicit size and timeout configuration and reports timeout by name", async () => {
  await assert.rejects(downloadAsset("https://assets.example/a", {timeoutMs: 1}), {
    code: "MISSING_MAX_ASSET_BYTES",
  });
  await assert.rejects(downloadAsset("https://assets.example/a", {maxAssetBytes: 1}), {
    code: "MISSING_FETCH_TIMEOUT_MS",
  });
  await assert.rejects(
    downloadAsset("https://assets.example/a", {
      maxAssetBytes: 1,
      timeoutMs: 1,
      fetchImpl: (_url, {signal}) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")), {once: true});
      }),
    }),
    (error) => error.code === "FETCH_TIMEOUT",
  );
});
