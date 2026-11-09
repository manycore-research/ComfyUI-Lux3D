const registeredApps = new WeakMap();

function activeLocale(app) {
  const locale = app.extensionManager?.setting?.get?.("Comfy.Locale")
    ?? app.ui?.settings?.getSettingValue?.("Comfy.Locale")
    ?? "en";
  const normalized = String(locale).toLowerCase().replace(/_/g, "-");
  return /^zh(?:-cn|-hans(?:-cn)?)?$/.test(normalized) ? "zh" : normalized;
}

// Comfy translates input/output names itself. Combo option labels and widgets
// added by our extensions need a display mapping; their names and values remain
// the original identifiers used by saved workflows and API prompts.
function localizeWidgets(node, nodeData, messages, app, hookedWidgets, placeholders) {
  const translation = () => messages[activeLocale(app)]?.nodeDefs?.[nodeData.name];
  const backendInputs = {
    ...nodeData.input?.required,
    ...nodeData.input?.optional,
  };
  for (const widget of node.widgets ?? []) {
    const field = widget.name.replace(/\./g, "_");
    const element = widget.element;
    if (widget.type === "customtext" && typeof element?.placeholder === "string") {
      if (!placeholders.has(element)) placeholders.set(element, element.placeholder);
      element.placeholder = translation()?.inputs?.[field]?.name ?? placeholders.get(element);
    }
    if (!Object.hasOwn(backendInputs, widget.name)) {
      const name = translation()?.inputs?.[field]?.name;
      if (name) widget.label = name;
      else if (messages.zh?.nodeDefs?.[nodeData.name]?.inputs?.[field]) widget.label = widget.name;
    }
    if (hookedWidgets.has(widget) || !widget.options) continue;
    const hasOptionTranslations = Object.values(messages).some(
      locale => locale?.nodeDefs?.[nodeData.name]?.inputs?.[field]?.options,
    );
    if (!hasOptionTranslations) continue;
    const originalLabel = widget.options.getOptionLabel;
    widget.options.getOptionLabel = function (value) {
      const label = translation()?.inputs?.[field]?.options?.[String(value)];
      if (typeof label === "string") return label;
      return originalLabel?.call(this, value) ?? String(value ?? "");
    };
    hookedWidgets.add(widget);
  }
}

// LiteGraph truncates titles and single-line widget labels independently of
// computeSize(). Measure the displayed title and API row after localization.
function fitNodeLabels(node, app) {
  const ctx = app.canvas?.ctx;
  const width = node.size?.[0];
  const height = node.size?.[1];
  if (!ctx?.measureText || !Number.isFinite(width) || !Number.isFinite(height) || !node.setSize) return;
  let requiredWidth = width;
  ctx.save();
  try {
    ctx.font = node.titleFontStyle ?? "14px sans-serif";
    const title = String(node.getTitle?.() ?? node.title ?? "");
    let buttonWidth = 0;
    for (const button of node.title_buttons ?? []) {
      if (button.visible) buttonWidth += (button.getWidth?.(ctx) ?? 0) + 2;
    }
    requiredWidth = Math.max(requiredWidth, ctx.measureText(title).width + 64 + Math.max(0, buttonWidth - 20));
    const apiWidget = node.widgets?.find(widget => widget.name === "base_api_path");
    if (apiWidget) {
      ctx.font = node.innerFontStyle ?? "12px sans-serif";
      // Two 30px text margins and the 5px label/value gap, plus rounding room.
      requiredWidth = Math.max(requiredWidth,
        ctx.measureText(apiWidget.label || apiWidget.name).width
        + ctx.measureText(String(apiWidget.value ?? "")).width + 69);
    }
  } finally {
    ctx.restore();
  }
  if (requiredWidth > width) node.setSize([Math.ceil(requiredWidth), height]);
}

export function registerLux3DLocalizationExtension({app, api}) {
  if (registeredApps.has(app)) return registeredApps.get(app);
  let messagesPromise;
  const hookedNodeTypes = new WeakSet();
  const hookedWidgets = new WeakSet();
  const placeholders = new WeakMap();
  const extension = {
    name: "Lux.Lux3DLocalization",
    async beforeRegisterNodeDef(nodeType, nodeData) {
      if (!nodeData?.name?.startsWith("Lux3D") || hookedNodeTypes.has(nodeType)) return;
      messagesPromise ??= (async () => {
        try {
          const response = await api.fetchApi("/i18n");
          return response.ok ? await response.json() : {};
        } catch {
          // Keep the normal English widgets usable if translations fail to load.
          return {};
        }
      })();
      const messages = await messagesPromise;
      if (!Object.values(messages).some(locale => locale?.nodeDefs?.[nodeData.name])) return;
      hookedNodeTypes.add(nodeType);
      for (const hook of ["onNodeCreated", "onConfigure"]) {
        const original = nodeType.prototype[hook];
        nodeType.prototype[hook] = function (...args) {
          const result = original?.apply(this, args);
          localizeWidgets(this, nodeData, messages, app, hookedWidgets, placeholders);
          fitNodeLabels(this, app);
          return result;
        };
      }
    },
  };
  app.registerExtension(extension);
  registeredApps.set(app, extension);
  return extension;
}
