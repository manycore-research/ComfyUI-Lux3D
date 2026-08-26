export class ViewerDownloadError extends Error {
  constructor(code, message, details = {}) {
    super(`${code}: ${message}`);
    this.name = "ViewerDownloadError";
    this.code = code;
    this.details = Object.freeze({...details});
  }
}

export function sanitizeAssetUrl(input, baseUrl) {
  try {
    const url = baseUrl === undefined ? new URL(input) : new URL(input, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "<unsupported-protocol>";
    return `${url.origin}${url.pathname}`;
  } catch {
    return "<invalid-url>";
  }
}

export function validateHttpAssetUrl(input, baseUrl) {
  let url;
  try {
    url = baseUrl === undefined ? new URL(input) : new URL(input, baseUrl);
  } catch {
    throw downloadError("INVALID_ASSET_URL", "asset URL is not valid", input, baseUrl);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw downloadError(
      "UNSUPPORTED_PROTOCOL",
      `asset protocol ${url.protocol || "<missing>"} is not supported`,
      input,
      baseUrl,
    );
  }
  return url;
}

export async function downloadAsset(input, options = {}) {
  const maxAssetBytes = requirePositiveSafeInteger(options.maxAssetBytes, "MISSING_MAX_ASSET_BYTES");
  const timeoutMs = requirePositiveSafeInteger(options.timeoutMs, "MISSING_FETCH_TIMEOUT_MS");
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new ViewerDownloadError("MISSING_FETCH_CAPABILITY", "Fetch API is unavailable");
  }

  const requestedUrl = validateHttpAssetUrl(input, options.baseUrl);
  const controller = new AbortController();
  let timedOut = false;
  let externallyAborted = false;
  const onExternalAbort = () => {
    externallyAborted = true;
    controller.abort(options.signal?.reason);
  };
  if (options.signal?.aborted) onExternalAbort();
  else options.signal?.addEventListener("abort", onExternalAbort, {once: true});

  const setTimer = options.setTimeoutImpl ?? globalThis.setTimeout;
  const clearTimer = options.clearTimeoutImpl ?? globalThis.clearTimeout;
  const timer = setTimer(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  let response;
  let reader;
  let completed = false;
  try {
    response = await fetchImpl(requestedUrl.href, {
      method: "GET",
      signal: controller.signal,
    });
    const finalUrl = validateHttpAssetUrl(response.url || requestedUrl.href, requestedUrl.href);
    if (response.status !== 200 && response.status !== 206) {
      throw downloadError(
        "HTTP_STATUS_UNSUPPORTED",
        `asset request returned HTTP ${response.status}`,
        finalUrl.href,
      );
    }

    const contentLength = parseContentLength(getHeader(response.headers, "content-length"), finalUrl.href);
    const contentEncoding = getHeader(response.headers, "content-encoding")?.trim().toLowerCase();
    const uncompressed = !contentEncoding || contentEncoding === "identity";
    let requiredLength = contentLength;
    if (response.status === 206) {
      requiredLength = parseCompleteContentRange(
        getHeader(response.headers, "content-range"),
        contentLength,
        finalUrl.href,
      );
    }
    if (requiredLength !== null && requiredLength > maxAssetBytes) {
      controller.abort();
      await cancelResponseBody(response);
      throw downloadError(
        "ASSET_TOO_LARGE",
        `asset declares ${requiredLength} bytes, exceeding the configured limit`,
        finalUrl.href,
        undefined,
        {maxAssetBytes},
      );
    }
    if (!response.body || typeof response.body.getReader !== "function") {
      throw downloadError("MISSING_STREAMING_BODY", "asset response is not a readable stream", finalUrl.href);
    }

    reader = response.body.getReader();
    const expectedBodyLength = response.status === 206
      ? requiredLength
      : (uncompressed ? contentLength : null);
    const bytes = await readCompleteBody(reader, expectedBodyLength, maxAssetBytes, finalUrl.href);
    if (controller.signal.aborted) throw new Error("asset request aborted while reading");
    if (response.status === 206 && bytes.byteLength !== requiredLength) {
      throw downloadError(
        "PARTIAL_RESPONSE_UNSUPPORTED",
        `HTTP 206 body has ${bytes.byteLength} bytes, expected ${requiredLength}`,
        finalUrl.href,
      );
    }
    if (response.status === 200 && uncompressed
      && contentLength !== null && bytes.byteLength !== contentLength) {
      throw downloadError(
        "INCOMPLETE_RESPONSE",
        `HTTP 200 body has ${bytes.byteLength} bytes, expected ${contentLength}`,
        finalUrl.href,
      );
    }

    completed = true;
    return Object.freeze({
      arrayBuffer: bytes.buffer,
      byteLength: bytes.byteLength,
      finalUrl: finalUrl.href,
      sanitizedUrl: sanitizeAssetUrl(finalUrl.href),
      status: response.status,
    });
  } catch (error) {
    if (timedOut) {
      throw downloadError("FETCH_TIMEOUT", `asset request exceeded ${timeoutMs} ms`, requestedUrl.href);
    }
    if (externallyAborted || options.signal?.aborted) {
      throw downloadError("FETCH_ABORTED", "asset request was aborted", requestedUrl.href);
    }
    if (error instanceof ViewerDownloadError) throw error;
    throw downloadError("FETCH_FAILED", "asset request failed", requestedUrl.href);
  } finally {
    clearTimer(timer);
    options.signal?.removeEventListener("abort", onExternalAbort);
    if ((!completed || controller.signal.aborted) && reader) {
      try {
        await reader.cancel();
      } catch {
        // The primary timeout/abort error is more useful than a cancellation failure.
      }
    }
  }
}

async function readCompleteBody(reader, expectedLength, maxAssetBytes, url) {
  const target = expectedLength === null ? null : new Uint8Array(expectedLength);
  const chunks = [];
  let received = 0;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    if (!(value instanceof Uint8Array)) {
      throw downloadError("INVALID_STREAM_CHUNK", "asset stream produced a non-byte chunk", url);
    }
    if (value.byteLength > maxAssetBytes - received) {
      throw downloadError(
        "ASSET_TOO_LARGE",
        "asset stream exceeds the configured byte limit",
        url,
        undefined,
        {maxAssetBytes},
      );
    }
    if (target) {
      if (value.byteLength > target.byteLength - received) {
        throw downloadError("RESPONSE_LENGTH_MISMATCH", "asset body exceeds its declared length", url);
      }
      target.set(value, received);
    } else {
      chunks.push(value.slice());
    }
    received += value.byteLength;
  }
  if (target) return received === target.byteLength ? target : target.subarray(0, received).slice();
  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

function parseContentLength(value, url) {
  if (value === null || value === undefined || value === "") return null;
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    throw downloadError("INVALID_CONTENT_LENGTH", "Content-Length is not a non-negative integer", url);
  }
  const length = Number(value);
  if (!Number.isSafeInteger(length)) {
    throw downloadError("INVALID_CONTENT_LENGTH", "Content-Length exceeds safe integer range", url);
  }
  return length;
}

function parseCompleteContentRange(value, contentLength, url) {
  const match = /^bytes 0-(0|[1-9]\d*)\/(0|[1-9]\d*)$/.exec(value ?? "");
  if (!match) {
    throw downloadError(
      "PARTIAL_RESPONSE_UNSUPPORTED",
      "HTTP 206 does not declare a complete bytes 0-(N-1)/N range",
      url,
    );
  }
  const end = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isSafeInteger(end) || !Number.isSafeInteger(total)
    || total <= 0 || end !== total - 1 || (contentLength !== null && contentLength !== total)) {
    throw downloadError(
      "PARTIAL_RESPONSE_UNSUPPORTED",
      "HTTP 206 range does not exactly cover the complete response",
      url,
    );
  }
  return total;
}

function getHeader(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === "function") return headers.get(name);
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  return entry?.[1] ?? null;
}

async function cancelResponseBody(response) {
  if (typeof response?.body?.cancel !== "function") return;
  try {
    await response.body.cancel();
  } catch {
    // The capacity error remains authoritative.
  }
}

function requirePositiveSafeInteger(value, code) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ViewerDownloadError(code, "a positive safe integer configuration value is required");
  }
  return value;
}

function downloadError(code, message, input, baseUrl, details = {}) {
  return new ViewerDownloadError(code, message, {
    ...details,
    asset: sanitizeAssetUrl(input, baseUrl),
  });
}
