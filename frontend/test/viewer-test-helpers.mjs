export function makeGlb(jsonOverrides = {}, binData = new Uint8Array([1, 2, 3, 4])) {
  const payload = binData ?? new Uint8Array();
  const json = {
    asset: {version: "2.0"},
    buffers: [{byteLength: payload.byteLength}],
    ...jsonOverrides,
  };
  const encodedJson = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = align4(encodedJson.byteLength);
  const binLength = align4(payload.byteLength);
  const totalLength = 12 + 8 + jsonLength + (binData === null ? 0 : 8 + binLength);
  const bytes = new Uint8Array(totalLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(0x20, 20, 20 + jsonLength);
  bytes.set(encodedJson, 20);
  if (binData !== null) {
    const binHeader = 20 + jsonLength;
    view.setUint32(binHeader, binLength, true);
    view.setUint32(binHeader + 4, 0x004e4942, true);
    bytes.set(payload, binHeader + 8);
  }
  return bytes;
}

export function makeStreamingResponse(bytes, options = {}) {
  const chunks = options.chunks ?? [bytes];
  let index = 0;
  const reader = {
    cancelled: false,
    async read() {
      if (index >= chunks.length) return {done: true, value: undefined};
      return {done: false, value: chunks[index++]};
    },
    async cancel() {
      this.cancelled = true;
    },
  };
  const headers = new Map(
    Object.entries(options.headers ?? {}).map(([key, value]) => [key.toLowerCase(), String(value)]),
  );
  return {
    status: options.status ?? 200,
    url: options.url ?? "https://assets.example/model.glb",
    headers: {get: (name) => headers.get(name.toLowerCase()) ?? null},
    body: {
      getReader: () => reader,
      cancel: async () => {
        reader.cancelled = true;
      },
    },
    reader,
  };
}

export function makeGaussianPly(values = {}) {
  const properties = [
    "x", "y", "z",
    "f_dc_0", "f_dc_1", "f_dc_2",
    "opacity",
    "scale_0", "scale_1", "scale_2",
    "rot_0", "rot_1", "rot_2", "rot_3",
  ];
  const header = `${[
    "ply",
    "format binary_little_endian 1.0",
    "element vertex 1",
    ...properties.map((name) => `property float ${name}`),
    "end_header",
  ].join("\n")}\n`;
  const headerBytes = new TextEncoder().encode(header);
  const bytes = new Uint8Array(headerBytes.byteLength + properties.length * 4);
  bytes.set(headerBytes);
  const defaults = {opacity: 0, rot_0: 1};
  const view = new DataView(bytes.buffer, headerBytes.byteLength);
  properties.forEach((name, index) => view.setFloat32(index * 4, values[name] ?? defaults[name] ?? 0, true));
  return bytes;
}

export class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener, options = false) {
    const entries = this.listeners.get(type) ?? [];
    entries.push({listener, options});
    this.listeners.set(type, entries);
  }

  removeEventListener(type, listener) {
    const entries = this.listeners.get(type) ?? [];
    this.listeners.set(type, entries.filter((entry) => entry.listener !== listener));
  }

  dispatch(type, event = {}) {
    const value = {
      type,
      cancelable: true,
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopPropagation() {
        this.propagationStopped = true;
      },
      ...event,
    };
    for (const {listener} of [...(this.listeners.get(type) ?? [])]) listener(value);
    return value;
  }
}

export function makeObserverFactory(store) {
  return (callback) => {
    const observer = {
      callback,
      observed: [],
      disconnected: false,
      observe(target) {
        this.observed.push(target);
      },
      disconnect() {
        this.disconnected = true;
      },
    };
    store.push(observer);
    return observer;
  };
}

export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return {promise, resolve, reject};
}

function align4(value) {
  return Math.ceil(value / 4) * 4;
}
