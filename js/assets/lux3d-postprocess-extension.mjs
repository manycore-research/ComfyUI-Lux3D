const TYPES = new Set(["Lux3DOpenAPIPartSplit", "Lux3DOpenAPIArticulation", "Lux3DOpenAPIAutoRig", "Lux3DOpenAPIAnimationRetarget", "Lux3DOpenAPIRetopology"]);
const panels = new WeakMap();
const results = new WeakMap();
const listeners = new WeakMap();
const installed = new WeakSet();
// ComfyUI reserves 20 px of a DOM widget's allocation for its outer margins.
const MIN_HEIGHT = 200;

export function safeArtifactUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function inputSignature(node) {
  const values = n => (n?.widgets ?? []).filter(w => w.options?.serialize !== false && w.type !== "button" && w.name !== "lux3d_results").map(w => [w.name, w.value]);
  return JSON.stringify([values(node), (node.inputs ?? []).map(input => {
    const link = node.graph?.links?.[input.link] ?? node.graph?.links?.get?.(input.link);
    return [input.name, input.link, values(node.graph?.getNodeById?.(link?.origin_id))];
  })]);
}

function previous(node, reason) {
  const record = results.get(node);
  if (!record) return;
  record.title.textContent = `Previous result · Task ${record.result.task_id} · ${reason}`;
  record.title.style.color = "#ffc070";
  record.current = false;
  node.setDirtyCanvas?.(true, true);
}

export function observePostprocessInputs(node) {
  const record = results.get(node);
  if (record?.current && record.signature !== inputSignature(node)) previous(node, "Inputs changed");
}

function artifactLabel(node, artifact) {
  if ((node.comfyClass ?? node.type) === "Lux3DOpenAPIRetopology") {
    const slot = {obj: 2, zip: 3}[artifact.format];
    if (slot !== undefined) {
      const output = node.outputs?.[slot];
      const label = output?.label || output?.localized_name || output?.name
        || (slot === 2 ? "OBJ Untextured" : "OBJ Textured");
      return slot === 3 ? `${label} (ZIP)` : label;
    }
  }
  return String(artifact.format ?? "artifact").toUpperCase();
}

export function renderPostprocessResult(node, result, documentRef = document) {
  if (!result || !Array.isArray(result.artifacts)) return;
  let panel = panels.get(node);
  if (!panel) {
    panel = documentRef.createElement("div");
    panel.setAttribute?.("role", "region");
    panel.setAttribute?.("aria-label", "Lux3D task results");
    panel.style.cssText = "padding:8px;overflow:auto;overflow-wrap:anywhere;font-size:12px;background:#252525;color:#eee;width:100%;min-width:0;max-width:100%;height:100%;box-sizing:border-box;max-height:240px";
    const before = node.size?.[1] ?? 300;
    // The DOM overlay uses widget.width before node.width. Keep that cached
    // allocation in sync, including when ComfyUI recomputes widget layout.
    const fitWidth = widget => {
      if (Number.isFinite(node.size?.[0])) widget.width = node.size[0];
    };
    const widget = node.addDOMWidget("lux3d_results", "lux3d_results", panel, {
      serialize:false, hideOnZoom:false,
      getMinHeight:()=>MIN_HEIGHT, getMaxHeight:()=>240,
      onDraw:fitWidth,
      afterResize() { fitWidth(this); },
    });
    widget.serializeValue = () => undefined;
    widget.options ??= {};
    widget.options.serialize = false;
    panels.set(node, panel);
    const computed = node.computeSize?.() ?? node.size ?? [380, before];
    node.setSize?.([node.size?.[0] ?? computed[0], Math.max(before + MIN_HEIGHT, computed[1])]);
    fitWidth(widget);
  }
  panel.replaceChildren();
  panel.scrollTop = 0;
  const title = documentRef.createElement("div");
  title.textContent = `Task ${result.task_id}${result.failed_count ? ` · ${result.failed_count} action(s) failed` : ""}`;
  panel.appendChild(title);
  for (const warning of result.warnings ?? []) {
    if (typeof warning !== "string" || !warning.trim()) continue;
    const row = documentRef.createElement("div");
    row.textContent = warning;
    row.style.color = "#ffc070";
    panel.appendChild(row);
  }
  const seen = new Set();
  for (const artifact of result.artifacts) {
    const url = safeArtifactUrl(artifact?.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const row = documentRef.createElement("div");
    const link = documentRef.createElement("a");
    link.href = url; link.target = "_blank"; link.rel = "noopener noreferrer";
    const associated = (result.actions ?? []).filter(action => action.status === "success" && (safeArtifactUrl(action.animationGlbUrl) === url || safeArtifactUrl(action.fbxUrl) === url)).map(action => action.animation_id);
    link.textContent = `Download ${artifactLabel(node, artifact)}${associated.length ? ` · ${associated.join(", ")}` : ""}`;
    link.style.color = "#88caff";
    row.appendChild(link); panel.appendChild(row);
  }
  for (const action of result.actions ?? []) {
    const row = documentRef.createElement("div");
    row.textContent = `${action.animation_id}: ${action.status}${action.error ? ` · ${typeof action.error === "string" ? action.error : JSON.stringify(action.error)}` : ""}`;
    if (action.status === "failed") row.style.color = "#ffc070";
    panel.appendChild(row);
  }
  results.set(node, {result, title, signature:inputSignature(node), current:true});
  node.setDirtyCanvas?.(true, true);
}

function attachLifecycle(node, api, documentRef) {
  if (!api?.addEventListener || listeners.has(node)) return;
  const handlers = {
    executing: event => { if (String(event.detail?.node) === String(node.id)) previous(node, "New run in progress"); },
    execution_error: event => { if (String(event.detail?.node_id) === String(node.id)) previous(node, "Latest run failed"); },
    execution_interrupted: event => { if (String(event.detail?.node_id) === String(node.id)) previous(node, "Latest run cancelled"); },
    execution_cached: event => {
      const record = results.get(node);
      if (record && event.detail?.nodes?.some(id=>String(id)===String(node.id)) && record.signature === inputSignature(node)) renderPostprocessResult(node,record.result,documentRef);
    },
  };
  for (const [name, handler] of Object.entries(handlers)) api.addEventListener(name,handler);
  listeners.set(node,()=>{for(const [name,handler] of Object.entries(handlers)) api.removeEventListener?.(name,handler);});
}

function installActionHelper(node, catalog, app) {
  if (!Array.isArray(catalog) || !catalog.length || node.widgets?.some(w=>w.name==="Action to add")) return;
  const options={serialize:false};
  const combo=node.addWidget("combo","Action to add",catalog.includes("Walk_Loop")?"Walk_Loop":catalog[0],()=>{}, {...options,values:catalog});
  const button=node.addWidget("button","Add action","Add action",()=>{
    if (node.inputs?.some(input=>input.name==="animation_ids" && input.link!=null)) return;
    const target=node.widgets.find(w=>w.name==="animation_ids");
    try {
      const text=String(target.value??"").trim();
      const ids=text.startsWith("[")?JSON.parse(text):text.split(/\r?\n/).map(id=>id.trim()).filter(Boolean);
      if (!Array.isArray(ids) || ids.some(id=>!catalog.includes(id)) || new Set(ids).size!==ids.length) throw new Error("Fix the existing animation IDs first.");
      if (ids.includes(combo.value)) return;
      if (ids.length>=10) throw new Error("Choose at most 10 actions.");
      target.value=JSON.stringify([...ids,combo.value]);target.callback?.(target.value);
      observePostprocessInputs(node);node.setDirtyCanvas?.(true,true);
    } catch(error) {app.extensionManager?.toast?.add?.({severity:"error",summary:"Lux3D",detail:error.message});}
  },options);
  for(const widget of [combo,button]) {widget.serializeValue=()=>undefined;widget.options.serialize=false;}
  const size=node.computeSize?.();if(size) node.setSize?.([Math.max(node.size?.[0]??0,size[0]),Math.max(node.size?.[1]??0,size[1])]);
}

function chain(prototype,name,after) {
  const original=prototype[name];
  prototype[name]=function(...args) {const value=original?.apply(this,args);after.apply(this,args);return value;};
}

export function registerLux3DPostprocessExtension({app, api, document: documentRef = globalThis.document}) {
  if (installed.has(app)) return;
  installed.add(app);
  app.registerExtension({
    name:"Lux.Lux3DPostprocessResults",
    beforeRegisterNodeDef(nodeType,nodeData) {
      if (!TYPES.has(nodeData.name)) return;
      const catalog=nodeData.input?.required?.animation_ids?.[1]?.lux3d_animation_ids;
      chain(nodeType.prototype,"onNodeCreated",function(){attachLifecycle(this,api,documentRef);installActionHelper(this,catalog,app);});
      chain(nodeType.prototype,"onExecuted",function(message){renderPostprocessResult(this,message?.lux3d_postprocess?.[0],documentRef);});
      for(const name of ["onDrawForeground","onWidgetChanged","onConnectionsChange","onConfigure"]) chain(nodeType.prototype,name,function(){observePostprocessInputs(this);});
      const removed = nodeType.prototype.onRemoved;
      nodeType.prototype.onRemoved = function(...args) {
        try { return removed?.apply(this,args); }
        finally { listeners.get(this)?.();listeners.delete(this);results.delete(this);panels.delete(this); }
      };
    },
  });
}
