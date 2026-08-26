const RULES = Object.freeze({
  Lux3DOpenAPIImageTo3D: Object.freeze({
    unionSocketType: "STRING,IMAGE",
    unionWidgets: Object.freeze([
      "image_1", "image_2", "image_3", "image_4",
      "image_5", "image_6", "image_7", "image_8",
    ]),
    legacyUnionPairs: Object.freeze([
      Object.freeze({union: "image_1", url: "image_url_1", local: "image_1"}),
      Object.freeze({union: "image_2", url: "image_url_2", local: "image_2"}),
      Object.freeze({union: "image_3", url: "image_url_3", local: "image_3"}),
      Object.freeze({union: "image_4", url: "image_url_4", local: "image_4"}),
      Object.freeze({union: "image_5", url: "image_url_5", local: "image_5"}),
      Object.freeze({union: "image_6", url: "image_url_6", local: "image_6"}),
      Object.freeze({union: "image_7", url: "image_url_7", local: "image_7"}),
      Object.freeze({union: "image_8", url: "image_url_8", local: "image_8"}),
    ]),
    legacyImageTo3D: true,
    generationOptions: true,
    legacyTimeoutIndex: 1,
    widgetOrder: Object.freeze([
      "base_api_path",
      "image_1", "image_2", "image_3", "image_4",
      "image_5", "image_6", "image_7", "image_8",
      "version", "face_count", "output_format", "enable_pbr", "ai_predict_size",
    ]),
  }),
  Lux3DOpenAPITextTo3D: Object.freeze({
    unionSocketType: "STRING,IMAGE",
    unionWidgets: Object.freeze(["reference_image"]),
    legacyUnionPairs: Object.freeze([
      Object.freeze({
        union: "reference_image",
        url: "reference_image_url",
        local: "reference_image",
      }),
    ]),
    generationOptions: true,
    legacyTimeoutIndex: 1,
    widgetOrder: Object.freeze([
      "base_api_path", "prompt", "style", "reference_image", "version",
      "face_count", "output_format", "enable_pbr", "ai_predict_size",
    ]),
  }),
  Lux3DOpenAPIImageToFourView: Object.freeze({
    unionSocketType: "STRING,IMAGE",
    unionWidgets: Object.freeze(["image"]),
    legacyUnionPairs: Object.freeze([
      Object.freeze({union: "image", url: "image_url", local: "image"}),
    ]),
    legacyTimeoutIndex: 1,
    widgetOrder: Object.freeze(["base_api_path", "image"]),
  }),
  Lux3DOpenAPIMultiFormatExport: Object.freeze({
    unionSocketType: "STRING,LUX3D_MODEL_SOURCE",
    unionWidgets: Object.freeze(["model_url"]),
    localPicker: Object.freeze({
      field: "model_url",
      widget: "Choose local GLB / ZIP",
      label: "Choose local GLB / ZIP",
      accept: ".glb,.zip",
    }),
    legacySingleSource: Object.freeze({
      field: "model_url",
      local: "model_file",
    }),
    legacyTimeoutIndex: 1,
    widgetOrder: Object.freeze(["base_api_path", "model_url", "output_format"]),
  }),
  Lux3DMaterialTransfer: Object.freeze({
    unionSocketTypes: Object.freeze({
      image: "STRING,IMAGE",
      mesh_url: "STRING,LUX3D_MODEL_SOURCE",
    }),
    unionWidgets: Object.freeze(["image", "mesh_url"]),
    localPicker: Object.freeze({
      field: "mesh_url",
      widget: "Choose local GLB",
      label: "Choose local GLB",
      accept: ".glb",
    }),
    legacySingleSource: Object.freeze({
      field: "mesh_url",
      local: "mesh_file",
    }),
    legacyMaterialImageSocket: true,
  }),
  Lux3DViewer: Object.freeze({
    unionSocketType: "STRING,LUX3D_MODEL_SOURCE",
    unionWidgets: Object.freeze(["model_url"]),
    localPicker: Object.freeze({
      field: "model_url",
      widget: "Choose local GLB / PLY",
      label: "Choose local GLB / PLY",
      accept: ".glb,.ply",
      previewLocal: true,
    }),
    legacySingleSource: Object.freeze({
      field: "model_url",
      local: "model_file",
      upstream: "model_url_input",
    }),
    legacyTimeoutIndex: 2,
    widgetOrder: Object.freeze(["model_url", "base_api_path"]),
  }),
});

const wrappedWidgets = new WeakSet();
const hookedNodeTypes = new WeakSet();
const registeredApps = new WeakMap();
const rawConfigureInfos = new WeakMap();
const repairingInputSlots = new WeakSet();
const pendingLateRepairs = new WeakMap();
const LOCAL_MODEL_PREVIEW = Symbol.for("comfyui-lux3d.viewer.preview-local-model");

const REMOVED_PUBLIC_FIELDS = Object.freeze([
  "lux3d_api_key",
  "region",
  "timeout",
]);

const LEGACY_BASE_API_PATHS = Object.freeze({
  cn: "https://api.aholo3d.cn",
  intl: "https://api.aholo3d.com",
});

export function registerLux3DInputSourceExtension({
  app,
  api,
  document: documentRef = globalThis.document,
}) {
  if (!app || typeof app.registerExtension !== "function") {
    throw new TypeError("Lux3D input-source extension requires the Comfy app");
  }
  const existing = registeredApps.get(app);
  if (existing) return existing;
  const extension = {
    name: "Lux.Lux3DInputSources",
    async beforeRegisterNodeDef(nodeType, nodeData) {
      const rule = RULES[nodeData?.name];
      if (!rule || hookedNodeTypes.has(nodeType)) return;
      hookedNodeTypes.add(nodeType);
      installNodeTypeHooks(nodeType, rule, app, api, documentRef);
    },
    async nodeCreated(node) {
      const rule = findRuleForNode(node);
      if (!rule) return;
      installNode(node, rule, app, api, documentRef);
      scheduleLateRepair(node, rule, app, api, documentRef);
    },
  };
  app.registerExtension(extension);
  registeredApps.set(app, extension);
  return extension;
}

function findRuleForNode(node) {
  const names = [node?.comfyClass, node?.type, node?.constructor?.comfyClass];
  for (const name of names) {
    if (typeof name === "string" && RULES[name]) return RULES[name];
  }
  return undefined;
}

function installNodeTypeHooks(nodeType, rule, app, api, documentRef) {
  captureRawConfigureInfo(nodeType.prototype);
  chainAfter(nodeType.prototype, "onNodeCreated", function onNodeCreated() {
    installNode(this, rule, app, api, documentRef);
    scheduleLateRepair(this, rule, app, api, documentRef);
  });
  chainAfter(nodeType.prototype, "onConfigure", function onConfigure() {
    const info = rawConfigureInfos.get(this) ?? arguments[0];
    configureNode(this, rule, info, app, api, documentRef);
    scheduleLateRepair(this, rule, app, api, documentRef, info);
  });
  chainAfter(nodeType.prototype, "onGraphConfigured", function onGraphConfigured() {
    installNode(this, rule, app, api, documentRef);
    scheduleLateRepair(this, rule, app, api, documentRef);
  });
  chainAfter(nodeType.prototype, "onConnectionsChange", function onConnectionsChange() {
    if (!repairingInputSlots.has(this)) {
      installNode(this, rule, app, api, documentRef);
    }
  });
}

function captureRawConfigureInfo(prototype) {
  const original = prototype.configure;
  if (typeof original !== "function") return;
  prototype.configure = function lux3dCaptureRawConfigureInfo(info, ...args) {
    const previous = rawConfigureInfos.get(this);
    rawConfigureInfos.set(this, snapshotWorkflowInfo(info));
    try {
      return original.call(this, info, ...args);
    } finally {
      if (previous === undefined) rawConfigureInfos.delete(this);
      else rawConfigureInfos.set(this, previous);
    }
  };
}

function snapshotWorkflowInfo(info) {
  if (!info || typeof info !== "object") return info;
  const snapshot = {...info};
  if (Array.isArray(info.inputs)) {
    snapshot.inputs = info.inputs.map((input) => (
      input && typeof input === "object"
        ? {...input, widget: input.widget && typeof input.widget === "object"
          ? {...input.widget}
          : input.widget}
        : input
    ));
  }
  if (Array.isArray(info.widgets_values)) {
    snapshot.widgets_values = [...info.widgets_values];
  } else if (info.widgets_values && typeof info.widgets_values === "object") {
    snapshot.widgets_values = {...info.widgets_values};
  }
  return snapshot;
}

function configureNode(node, rule, info, app, api, documentRef) {
  removeRetiredPublicFields(node);
  migrateLegacyMaterialImageSocket(node, rule, info);
  migrateLegacyTimeout(node, rule, info);
  repairUnionInputSlots(node, rule);
  migrateLegacyUnionInputs(node, rule, info);
  migrateLegacySingleSource(node, rule, info);
  installNode(node, rule, app, api, documentRef);
  previewConfiguredLocalModel(node, rule, api);
}

function migrateLegacyMaterialImageSocket(node, rule, info) {
  if (
    !rule.legacyMaterialImageSocket
    || !Array.isArray(info?.inputs)
    || !Array.isArray(info?.widgets_values)
  ) return;

  const savedImage = info.inputs.find((input) => input?.name === "image");
  // A raw union schema is already current. Never reinterpret its valid image
  // URL as a legacy mesh URL, even if an unrelated stale field is present.
  if (savedImage && hasInputType(savedImage, "STRING")) return;
  const legacyImageOnly = savedImage && hasInputType(savedImage, "IMAGE");
  const hasLegacyField = info.inputs.some((input) => (
    input?.name === "lux3d_api_key" || input?.name === "mesh_file"
  ));
  if (!legacyImageOnly && !hasLegacyField) return;

  // Older Material workflows had an IMAGE-only socket, so their first saved
  // widget was mesh_url. Comfy restores widget arrays by position before this
  // hook runs; explicitly restore named values so the new leading image URL
  // widget cannot receive a mesh URL and base_api_path cannot receive an old key.
  const savedMesh = info.inputs.find((input) => input?.name === "mesh_url");
  const savedBase = info.inputs.find((input) => input?.name === "base_api_path");
  setWidgetValue(node, "image", "");
  if (savedMesh) {
    setWidgetValue(
      node,
      "mesh_url",
      findSavedWidgetValue(info, info.inputs, savedMesh),
    );
  }
  if (savedBase) {
    setWidgetValue(
      node,
      "base_api_path",
      findSavedWidgetValue(info, info.inputs, savedBase),
    );
  }
}

function scheduleLateRepair(node, rule, app, api, documentRef, info) {
  const pending = pendingLateRepairs.get(node);
  if (pending) {
    if (info !== undefined) {
      pending.info = info;
      pending.hasInfo = true;
    }
    return;
  }

  const repair = {info, hasInfo: info !== undefined};
  pendingLateRepairs.set(node, repair);
  queueMicrotask(() => {
    if (pendingLateRepairs.get(node) !== repair) return;
    pendingLateRepairs.delete(node);
    if (repair.hasInfo) {
      configureNode(node, rule, repair.info, app, api, documentRef);
    } else {
      installNode(node, rule, app, api, documentRef);
    }
  });
}

function migrateLegacyTimeout(node, rule, info) {
  const values = info?.widgets_values;
  const timeoutIndex = rule.legacyTimeoutIndex;
  if (
    !Array.isArray(values)
    || !Number.isInteger(timeoutIndex)
    || typeof values[timeoutIndex] !== "number"
    || findWidget(node, "timeout")
  ) return;

  if (rule.legacyImageTo3D) {
    migrateLegacyImageTo3D(node, values);
    return;
  }

  const migrated = values.filter((_, index) => index !== timeoutIndex);
  for (const [index, name] of (rule.widgetOrder ?? []).entries()) {
    if (index >= migrated.length) break;
    const widget = findWidget(node, name);
    if (widget) widget.value = migrated[index];
  }
  const faceCount = findWidget(node, "face_count");
  if (faceCount?.value === 0) faceCount.value = 200000;
}

function migrateLegacyImageTo3D(node, values) {
  const mode = values[2];
  const urls = mode === "multiple"
    ? parseLegacyUrlList(values[4])
    : hasValue(values[3]) ? [String(values[3]).trim()] : [];
  setWidgetValue(node, "base_api_path", values[0]);
  for (let index = 0; index < 8; index += 1) {
    setWidgetValue(node, `image_${index + 1}`, urls[index] ?? "");
  }
  setWidgetValue(node, "version", values[5]);
  setWidgetValue(node, "face_count", values[6] === 0 ? 200000 : values[6]);
  setWidgetValue(node, "output_format", values[7]);
  setWidgetValue(node, "enable_pbr", values[8]);
  setWidgetValue(node, "ai_predict_size", values[9]);
}

function migrateLegacyUnionInputs(node, rule, info) {
  const pairs = rule.legacyUnionPairs;
  const savedInputs = info?.inputs;
  if (!Array.isArray(pairs) || !Array.isArray(savedInputs)) return;

  for (const pair of pairs) {
    const savedUrlInput = savedInputs.find((input) => input?.name === pair.url);
    const savedLocalInput = savedInputs.find((input) => (
      input?.name === pair.local && hasInputType(input, "IMAGE")
    ));

    // A union workflow has no separate URL input. Requiring both old inputs
    // keeps this migration isolated from current and older input_mode schemas.
    if (!savedUrlInput || !savedLocalInput) continue;

    const savedUrlValue = findSavedWidgetValue(info, savedInputs, savedUrlInput);
    if (savedUrlValue !== undefined) {
      setWidgetValue(node, pair.union, savedUrlValue);
    }

    if (savedLocalInput.link !== null && savedLocalInput.link !== undefined) {
      relocateSavedInputLink(node, pair.union, savedLocalInput.link);
    }
  }
}

function migrateLegacySingleSource(node, rule, info) {
  const migration = rule.legacySingleSource;
  const savedInputs = info?.inputs;
  if (!migration || !Array.isArray(savedInputs)) return;

  const savedField = savedInputs.find((input) => input?.name === migration.field);
  const savedLocal = savedInputs.find((input) => input?.name === migration.local);
  const savedUpstream = migration.upstream
    ? savedInputs.find((input) => input?.name === migration.upstream)
    : undefined;

  // Only old nodes contained the second local-file widget or Viewer-only URL
  // socket. This guard keeps current workflow values untouched.
  if (!savedLocal && !savedUpstream) return;

  const remoteValue = savedField
    ? findSavedWidgetValue(info, savedInputs, savedField)
    : undefined;
  const localValue = savedLocal
    ? findSavedWidgetValue(info, savedInputs, savedLocal)
    : undefined;
  if (hasValue(remoteValue)) {
    setWidgetValue(node, migration.field, remoteValue);
  } else if (hasValue(localValue)) {
    setWidgetValue(node, migration.field, localValue);
  }

  const linkId = savedUpstream?.link ?? savedField?.link;
  if (linkId !== null && linkId !== undefined) {
    relocateSavedInputLink(node, migration.field, linkId);
  }
}

function normalizeLegacySingleSourceInput(node, migration) {
  if (!migration.upstream || !Array.isArray(node.inputs)) return;
  let current = node.inputs.find((input) => input?.name === migration.field);
  let legacyIndex = node.inputs.findIndex((input) => input?.name === migration.upstream);
  if (legacyIndex < 0) return;

  if (!current) {
    current = node.inputs[legacyIndex];
    current.name = migration.field;
    current.label = migration.field;
    current.type = "STRING,LUX3D_MODEL_SOURCE";
    current.widget = normalizeInputWidgetLocator(current.widget, migration.field);
  }

  while ((legacyIndex = node.inputs.findIndex((input) => (
    input !== current && input?.name === migration.upstream
  ))) >= 0) {
    const legacy = node.inputs[legacyIndex];
    moveInputConnectionIfAvailable(current, legacy);
    removeInputAt(node, legacyIndex);
  }
  retargetNodeInputLinks(node);
}

function repairUnionInputSlots(node, rule) {
  if (repairingInputSlots.has(node)) return;
  repairingInputSlots.add(node);
  try {
    if (rule.legacySingleSource) {
      normalizeLegacySingleSourceInput(node, rule.legacySingleSource);
    }
    ensureUnionInputSlots(node, rule);
  } finally {
    repairingInputSlots.delete(node);
  }
}

function ensureUnionInputSlots(node, rule) {
  const names = rule.unionWidgets;
  if (!Array.isArray(names)) return;
  if (!Array.isArray(node.inputs)) node.inputs = [];

  let changed = false;
  for (const name of names) {
    const socketType = rule.unionSocketTypes?.[name] ?? rule.unionSocketType;
    if (typeof socketType !== "string") continue;
    let matching = node.inputs.filter((input) => input?.name === name);
    if (matching.length === 0) {
      const options = {widget: {name}};
      const added = typeof node.addInput === "function"
        ? node.addInput(name, socketType, options)
        : undefined;
      const input = added ?? node.inputs.find((candidate) => candidate?.name === name);
      if (input) {
        matching = [input];
      } else {
        const fallback = {name, type: socketType, link: null, ...options};
        node.inputs.push(fallback);
        matching = [fallback];
      }
      changed = true;
    }

    const current = matching[0];
    if (current.type !== socketType) {
      current.type = socketType;
      changed = true;
    }
    const normalizedWidget = normalizeInputWidgetLocator(current.widget, name);
    if (normalizedWidget !== current.widget || current.widget?.name !== name) {
      current.widget = normalizedWidget;
      changed = true;
    }

    for (const duplicate of matching.slice(1)) {
      moveInputConnectionIfAvailable(current, duplicate);
      const duplicateIndex = node.inputs.indexOf(duplicate);
      if (duplicateIndex >= 0) removeInputAt(node, duplicateIndex);
      changed = true;
    }
  }

  if (changed) {
    retargetNodeInputLinks(node);
    resizeNodeToFitWidgets(node);
  }
}

function normalizeInputWidgetLocator(widget, name) {
  if (widget && typeof widget === "object") {
    widget.name = name;
    return widget;
  }
  return {name};
}

function moveInputConnectionIfAvailable(target, source) {
  if (isInputConnected(target)) return;
  if (source?.link !== null && source?.link !== undefined) {
    target.link = source.link;
    source.link = null;
    return;
  }
  if (Array.isArray(source?.links) && source.links.length > 0) {
    target.links = source.links;
    source.links = [];
  }
}

function removeInputAt(node, index) {
  if (typeof node.removeInput === "function") node.removeInput(index);
  else node.inputs.splice(index, 1);
}

function retargetNodeInputLinks(node) {
  if (!Array.isArray(node.inputs)) return;
  for (const [targetSlot, input] of node.inputs.entries()) {
    for (const linkId of inputLinkIds(input)) {
      const graphLink = findGraphLink(node.graph, linkId);
      if (Array.isArray(graphLink)) graphLink[4] = targetSlot;
      else if (graphLink && typeof graphLink === "object") graphLink.target_slot = targetSlot;
    }
  }
}

function inputLinkIds(input) {
  const ids = [];
  if (input?.link !== null && input?.link !== undefined) ids.push(input.link);
  if (Array.isArray(input?.links)) {
    for (const id of input.links) {
      if (id !== null && id !== undefined && !ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

function isInputConnected(input) {
  return input?.link !== null && input?.link !== undefined
    || Array.isArray(input?.links) && input.links.length > 0;
}

function findSavedWidgetValue(info, savedInputs, savedInput) {
  const values = info?.widgets_values;
  const savedWidgetName = savedInput?.widget?.name ?? savedInput?.name;
  if (values && !Array.isArray(values) && typeof values === "object") {
    if (Object.prototype.hasOwnProperty.call(values, savedWidgetName)) {
      return values[savedWidgetName];
    }
    return undefined;
  }
  if (!Array.isArray(values)) return undefined;

  let widgetIndex = -1;
  for (const input of savedInputs) {
    if (!input?.widget?.name) continue;
    widgetIndex += 1;
    if (input === savedInput) return values[widgetIndex];
  }
  return undefined;
}

function hasInputType(input, expectedType) {
  if (typeof input?.type !== "string") return false;
  return input.type.split(",").map((type) => type.trim()).includes(expectedType);
}

function relocateSavedInputLink(node, unionName, linkId) {
  const targetSlot = node.inputs?.findIndex((input) => input?.name === unionName) ?? -1;
  if (targetSlot < 0) return;

  for (const [index, input] of node.inputs.entries()) {
    if (index !== targetSlot && input?.link === linkId) input.link = null;
  }
  node.inputs[targetSlot].link = linkId;

  const graphLink = findGraphLink(node.graph, linkId);
  if (Array.isArray(graphLink)) {
    graphLink[4] = targetSlot;
  } else if (graphLink && typeof graphLink === "object") {
    graphLink.target_slot = targetSlot;
  }
}

function findGraphLink(graph, linkId) {
  if (!graph) return undefined;
  const direct = graph.getLink?.(linkId);
  if (direct) return direct;
  const links = graph.links;
  if (links?.get) {
    const mapped = links.get(linkId);
    if (mapped) return mapped;
  }
  if (links && links[linkId] !== undefined) return links[linkId];
  return graph._links?.get?.(linkId);
}

function parseLegacyUrlList(value) {
  if (Array.isArray(value)) return value.filter(hasValue).map((item) => String(item).trim()).slice(0, 8);
  if (!hasValue(value)) return [];
  const text = String(value).trim();
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.filter(hasValue).map((item) => String(item).trim()).slice(0, 8);
  } catch {
    // Legacy multiline values are handled below.
  }
  return text.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean).slice(0, 8);
}

function setWidgetValue(node, name, value) {
  const widget = findWidget(node, name);
  if (widget && value !== undefined) widget.value = value;
}

function installNode(node, rule, app, api, documentRef) {
  removeRetiredPublicFields(node);
  repairUnionInputSlots(node, rule);
  for (const name of [
    ...(rule.urlWidgets ?? []),
    ...(rule.localWidgets ?? []),
    ...(rule.unionWidgets ?? []),
    ...(rule.modeWidget ? [rule.modeWidget] : []),
    ...(rule.generationOptions ? ["version", "output_format"] : []),
    "base_api_path",
  ]) {
    const widget = findWidget(node, name);
    if (widget) wrapWidgetCallback(widget, () => syncNode(node, rule, app));
  }
  installLocalFilePicker(node, rule, app, api, documentRef);
  syncNode(node, rule, app);
}

function removeRetiredPublicFields(node) {
  if (Array.isArray(node.widgets)) {
    for (let index = node.widgets.length - 1; index >= 0; index -= 1) {
      const widget = node.widgets[index];
      if (!REMOVED_PUBLIC_FIELDS.includes(widget?.name)) continue;
      try {
        widget.onRemove?.();
      } catch {
        // Removing a retired field must not block loading the rest of the node.
      }
      node.widgets.splice(index, 1);
    }
  }

  if (Array.isArray(node.inputs)) {
    for (let index = node.inputs.length - 1; index >= 0; index -= 1) {
      if (!REMOVED_PUBLIC_FIELDS.includes(node.inputs[index]?.name)) continue;
      removeInputAt(node, index);
    }
    retargetNodeInputLinks(node);
  }
}

function installLocalFilePicker(node, rule, app, api, documentRef) {
  const picker = rule.localPicker;
  if (!picker || typeof node.addWidget !== "function" || findWidget(node, picker.widget)) return;

  const button = node.addWidget(
    "button",
    picker.widget,
    picker.label,
    async () => {
      if (isSocketConnected(node, picker.field)) return;
      try {
        const file = await chooseBrowserFile(documentRef, picker.accept);
        if (!file) return;
        const uploaded = await uploadToComfyInput(api, file);
        if (isSocketConnected(node, picker.field)) return;
        setWidgetValue(node, picker.field, uploaded.relativePath);
        syncNode(node, rule, app);
        if (picker.previewLocal) {
          notifyLocalModelPreview(node, uploaded.previewUrl);
        }
      } catch (error) {
        reportPickerError(app, error);
      }
    },
    {serialize: false},
  );
  if (button) {
    button.serializeValue = () => undefined;
    button.options ??= {};
    button.options.serialize = false;
    resizeNodeToFitWidgets(node);
  }
}

function resizeNodeToFitWidgets(node) {
  if (typeof node?.computeSize !== "function" || typeof node?.setSize !== "function") return;
  const computed = node.computeSize();
  if (!Array.isArray(computed) || computed.length < 2) return;
  const current = Array.isArray(node.size) ? node.size : [0, 0];
  const width = Math.max(finiteDimension(current[0]), finiteDimension(computed[0]));
  const height = Math.max(finiteDimension(current[1]), finiteDimension(computed[1]));
  node.setSize([width, height]);
}

function finiteDimension(value) {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function chooseBrowserFile(documentRef, accept) {
  if (!documentRef?.createElement) {
    throw new Error("Local file selection is unavailable in this browser context");
  }
  return new Promise((resolve) => {
    const input = documentRef.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    const finish = (file) => {
      input.remove?.();
      resolve(file ?? null);
    };
    input.addEventListener?.("change", () => finish(input.files?.[0]), {once: true});
    input.addEventListener?.("cancel", () => finish(null), {once: true});
    documentRef.body?.append?.(input);
    input.click();
  });
}

async function uploadToComfyInput(api, file) {
  if (typeof api?.fetchApi !== "function") {
    throw new Error("Comfy API is unavailable for local file selection");
  }
  const form = new FormData();
  form.append("image", file, file.name);
  form.append("subfolder", "lux3d");
  form.append("type", "input");
  const response = await api.fetchApi("/upload/image", {
    method: "POST",
    body: form,
  });
  if (!response?.ok) {
    const detail = await response?.text?.();
    throw new Error(`Comfy local file upload failed${detail ? `: ${detail}` : ""}`);
  }
  const result = await response.json();
  const name = requireSafeUploadedFilename(result?.name);
  const subfolder = requireSafeUploadedSubfolder(result?.subfolder);
  if (result?.type !== "input") {
    throw new Error("Comfy local file upload returned an invalid storage type");
  }
  return Object.freeze({
    relativePath: subfolder ? `${subfolder}/${name}` : name,
    previewUrl: buildComfyViewUrl(api, name, subfolder, "input"),
  });
}

function requireSafeUploadedFilename(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("Comfy local file upload returned no filename");
  }
  if (value !== value.trim() || value === "." || value.includes("..")
      || value.includes("/") || value.includes("\\") || /[\0-\x1f\x7f]/.test(value)) {
    throw new Error("Comfy local file upload returned an unsafe filename");
  }
  return value;
}

function requireSafeUploadedSubfolder(value) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string" || value !== value.trim()
      || value.startsWith("/") || value.endsWith("/")
      || value.includes("\\") || /[\0-\x1f\x7f]/.test(value)) {
    throw new Error("Comfy local file upload returned an unsafe subfolder");
  }
  const segments = value.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment.includes(".."))) {
    throw new Error("Comfy local file upload returned an unsafe subfolder");
  }
  return segments.join("/");
}

function buildComfyViewUrl(api, name, subfolder, type) {
  const candidate = typeof api?.apiURL === "function" ? api.apiURL("/view") : "/view";
  const endpoint = isSafeRelativeViewEndpoint(candidate) ? candidate : "/view";
  const query = new URLSearchParams({filename: name, type, subfolder});
  return `${endpoint}?${query.toString()}`;
}

function isSafeRelativeViewEndpoint(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return false;
  try {
    const parsed = new URL(value, "http://lux3d.local");
    return parsed.origin === "http://lux3d.local"
      && parsed.pathname.endsWith("/view")
      && parsed.search === ""
      && parsed.hash === "";
  } catch {
    return false;
  }
}

function previewConfiguredLocalModel(node, rule, api) {
  const picker = rule.localPicker;
  if (!picker?.previewLocal || isSocketConnected(node, picker.field)) return;
  const previewUrl = localModelSourcePreviewUrl(api, findWidget(node, picker.field)?.value);
  if (previewUrl) notifyLocalModelPreview(node, previewUrl);
}

function localModelSourcePreviewUrl(api, value) {
  if (typeof value !== "string" || value.trim() === "") return null;
  let source = value.trim();
  let type = "input";
  for (const candidate of ["input", "output", "temp"]) {
    const annotation = ` [${candidate}]`;
    if (source.endsWith(annotation)) {
      type = candidate;
      source = source.slice(0, -annotation.length);
      break;
    }
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(source) || source.startsWith("//")) return null;
  if (source.startsWith("/") || source.endsWith("/") || source.includes("\\")
      || source.includes("?") || source.includes("#") || /[\0-\x1f\x7f]/.test(source)) {
    return null;
  }
  const segments = source.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment.includes(".."))) {
    return null;
  }
  const name = segments.pop();
  const subfolder = segments.join("/");
  if (!name || !/\.(?:glb|ply)$/i.test(name)) return null;
  return buildComfyViewUrl(api, name, subfolder, type);
}

function notifyLocalModelPreview(node, previewUrl) {
  const preview = node?.[LOCAL_MODEL_PREVIEW];
  if (typeof preview !== "function") return;
  try {
    preview(previewUrl);
  } catch {
    // The Viewer extension owns presentation of controller failures.
  }
}

function reportPickerError(app, error) {
  const message = error instanceof Error ? error.message : String(error);
  const toast = app?.extensionManager?.toast;
  if (typeof toast?.add === "function") {
    toast.add({severity: "error", summary: "Lux3D", detail: message});
    return;
  }
  console.error("[Lux3D]", message);
}

function syncNode(node, rule, app) {
  normalizeBaseApiPath(node);
  syncGenerationOptions(node, rule);
  if (rule.unionWidgets) {
    for (const name of rule.unionWidgets) {
      const widget = findWidget(node, name);
      if (!widget) continue;
      const linked = isSocketConnected(node, name);
      if (linked && hasValue(widget.value)) widget.value = "";
      setWidgetDisabled(widget, linked);
    }
  }
  if (rule.localPicker) {
    const button = findWidget(node, rule.localPicker.widget);
    if (button) setWidgetDisabled(button, isSocketConnected(node, rule.localPicker.field));
  }
  const urlWidgets = (rule.urlWidgets ?? []).map((name) => findWidget(node, name)).filter(Boolean);
  const localWidgets = (rule.localWidgets ?? []).map((name) => findWidget(node, name)).filter(Boolean);
  const exclusiveSocketActive = rule.exclusiveSocket
    ? isSocketConnected(node, rule.exclusiveSocket)
    : false;
  if (exclusiveSocketActive) {
    for (const widget of [...urlWidgets, ...localWidgets]) {
      if (hasValue(widget.value)) widget.value = "";
      setWidgetDisabled(widget, true);
    }
    node.graph?.setDirtyCanvas?.(true, true);
    app.graph?.setDirtyCanvas?.(true, true);
    return;
  }
  const localSocketActive = (rule.localSockets ?? []).some((name) => isSocketConnected(node, name));
  const localWidgetActive = localWidgets.some((widget) => hasValue(widget.value));
  const localActive = localSocketActive || localWidgetActive;

  let enabledUrlName = null;
  if (rule.modeWidget) {
    const mode = findWidget(node, rule.modeWidget)?.value;
    enabledUrlName = rule.urlForMode?.[mode] ?? null;
  }

  for (const widget of urlWidgets) {
    const inactiveMode = enabledUrlName !== null && widget.name !== enabledUrlName;
    const disabled = localActive || inactiveMode;
    if (disabled && hasValue(widget.value)) widget.value = "";
    setWidgetDisabled(widget, disabled);
  }

  const remoteActive = !localActive && urlWidgets.some((widget) => {
    if (enabledUrlName !== null && widget.name !== enabledUrlName) return false;
    return hasValue(widget.value);
  });
  for (const widget of localWidgets) setWidgetDisabled(widget, remoteActive);

  node.graph?.setDirtyCanvas?.(true, true);
  app.graph?.setDirtyCanvas?.(true, true);
}

function syncGenerationOptions(node, rule) {
  if (!rule.generationOptions) return;
  const version = findWidget(node, "version")?.value;
  const outputFormat = findWidget(node, "output_format")?.value;
  const enablePbr = findWidget(node, "enable_pbr");
  if (!enablePbr) return;
  const supported = version === "G1-Turbo" && outputFormat !== "ply";
  if (!supported) enablePbr.value = "default";
  setWidgetDisabled(enablePbr, !supported);
}

function normalizeBaseApiPath(node) {
  const widget = findWidget(node, "base_api_path");
  const normalized = LEGACY_BASE_API_PATHS[widget?.value];
  if (normalized) widget.value = normalized;
}

function wrapWidgetCallback(widget, sync) {
  if (wrappedWidgets.has(widget)) return;
  wrappedWidgets.add(widget);
  const original = widget.callback;
  widget.callback = function lux3dMutuallyExclusiveCallback(...args) {
    const result = original?.apply(this, args);
    sync();
    return result;
  };
}

function setWidgetDisabled(widget, disabled) {
  widget.disabled = disabled;
  widget.computedDisabled = disabled;
  widget.options ??= {};
  widget.options.disabled = disabled;
  widget.options.readOnly = disabled;
  if (widget.inputEl) {
    widget.inputEl.disabled = disabled;
    widget.inputEl.readOnly = disabled;
  }
  if (widget.element) {
    widget.element.disabled = disabled;
    widget.element.readOnly = disabled;
  }
}

function isSocketConnected(node, name) {
  const input = node.inputs?.find((candidate) => candidate?.name === name);
  return isInputConnected(input);
}

function findWidget(node, name) {
  return node.widgets?.find((widget) => widget?.name === name);
}

function hasValue(value) {
  return typeof value === "string" ? value.trim() !== "" : value !== null && value !== undefined;
}

function chainAfter(prototype, name, after) {
  const original = prototype[name];
  prototype[name] = function lux3dChainedHook(...args) {
    const result = original?.apply(this, args);
    after.apply(this, args);
    return result;
  };
}

export const LUX3D_INPUT_SOURCE_RULES = RULES;
