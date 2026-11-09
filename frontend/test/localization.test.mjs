import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

import {registerLux3DLocalizationExtension} from "../src/lux3d-localization-extension.mjs";

const zh = JSON.parse(await readFile(new URL("../../locales/zh/nodeDefs.json", import.meta.url), "utf8"));

function setup() {
  let locale = "zh";
  let requests = 0;
  const app = {
    extensionManager: {setting: {get: () => locale}},
    registerExtension() {},
  };
  const api = {async fetchApi() {requests++; return {ok: true, json: async () => ({zh: {nodeDefs: zh}})};}};
  return {
    app, api,
    extension: registerLux3DLocalizationExtension({app, api}),
    setLocale(value) {locale = value;},
    get requests() {return requests;},
  };
}

test("Chinese option labels preserve the original style values, callbacks and serialized inputs", async () => {
  const state = setup();
  const values = Object.keys(zh.Lux3DOpenAPITextTo3D.inputs.style.options);
  let submitted;
  const callback = value => {submitted = value;};
  class Node {
    constructor() {this.widgets = [{name: "style", value: "photorealistic", callback, options: {values}}];}
  }
  await state.extension.beforeRegisterNodeDef(Node, {name: "Lux3DOpenAPITextTo3D", input: {required: {style: [values]}}});
  const node = new Node();
  node.onNodeCreated();
  const widget = node.widgets[0];
  assert.deepEqual(values.map(value => widget.options.getOptionLabel(value)), ["写实", "卡通", "二次元", "手绘", "赛博朋克", "魔幻", "玻璃质感"]);
  for (const value of values) {
    widget.value = value;
    widget.callback(widget.value);
    assert.equal(submitted, value);
    assert.equal(JSON.parse(JSON.stringify({inputs: {[widget.name]: widget.value}})).inputs.style, value);
  }
  assert.equal(widget.options.values, values);
  assert.equal(widget.callback, callback);
  state.setLocale("en");
  assert.equal(widget.options.getOptionLabel("photorealistic"), "photorealistic");
  state.setLocale("zh-CN");
  assert.equal(widget.options.getOptionLabel("photorealistic"), "写实");
  state.setLocale("zh-TW");
  assert.equal(widget.options.getOptionLabel("photorealistic"), "photorealistic");
  assert.equal(widget.options.getOptionLabel("future_style"), "future_style");
});

test("helper buttons use Chinese labels while keeping their workflow identifiers and hooks", async () => {
  const state = setup();
  let created = 0;
  class Node {
    constructor() {this.widgets = [{name: "Action to add", options: {}}, {name: "Add action", options: {}}, {name: "Choose local GLB", options: {}}];}
    onNodeCreated() {created++; return "existing hook";}
  }
  await state.extension.beforeRegisterNodeDef(Node, {name: "Lux3DOpenAPIAnimationRetarget"});
  await state.extension.beforeRegisterNodeDef(Node, {name: "Lux3DOpenAPIAnimationRetarget"});
  const node = new Node();
  assert.equal(node.onNodeCreated(), "existing hook");
  assert.equal(created, 1);
  assert.deepEqual(node.widgets.map(widget => widget.label), ["选择动作", "添加动作", "选择本地 GLB"]);
  assert.deepEqual(node.widgets.map(widget => widget.name), ["Action to add", "Add action", "Choose local GLB"]);
  state.setLocale("en");
  node.onConfigure();
  assert.deepEqual(node.widgets.map(widget => widget.label), node.widgets.map(widget => widget.name));
  assert.equal(state.requests, 1);
  assert.equal(registerLux3DLocalizationExtension(state), state.extension);
});

test("untranslated values retain an existing label mapper and a failed locale fetch keeps nodes usable", async () => {
  const state = setup();
  class Node {
    constructor() {this.widgets = [{name: "style", options: {getOptionLabel(value) {return `existing:${value}`;}}}];}
  }
  await state.extension.beforeRegisterNodeDef(Node, {name: "Lux3DOpenAPITextTo3D"});
  const node = new Node();
  node.onNodeCreated();
  assert.equal(node.widgets[0].options.getOptionLabel("future_style"), "existing:future_style");
  const app = {registerExtension() {}};
  const extension = registerLux3DLocalizationExtension({app, api: {fetchApi() {throw new Error("offline");}}});
  class OfflineNode {onNodeCreated() {return "usable";}}
  await extension.beforeRegisterNodeDef(OfflineNode, {name: "Lux3DOpenAPITextTo3D"});
  assert.equal(new OfflineNode().onNodeCreated(), "usable");
});

test("multiline placeholders follow Chinese labels and restore the original English without changing inputs", async () => {
  const state = setup();
  const callback = () => {};
  class Node {
    constructor() {
      this.widgets = [{name: "prompt", type: "customtext", value: "Keep the base fixed", callback,
        element: {placeholder: "Describe the motion"}, options: {}}];
    }
  }
  await state.extension.beforeRegisterNodeDef(Node, {name: "Lux3DOpenAPIArticulation",
    input: {required: {prompt: ["STRING", {multiline: true}]}}});
  const node = new Node();
  node.onNodeCreated();
  const widget = node.widgets[0];
  assert.equal(widget.element.placeholder, "提示词");
  assert.deepEqual({[widget.name]: widget.value}, {prompt: "Keep the base fixed"});
  assert.equal(widget.callback, callback);
  state.setLocale("en");
  node.onConfigure();
  assert.equal(widget.element.placeholder, "Describe the motion");
  assert.equal(widget.name, "prompt");
  assert.equal(widget.value, "Keep the base fixed");
});
