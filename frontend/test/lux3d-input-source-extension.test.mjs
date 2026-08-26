import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

import {
  LUX3D_INPUT_SOURCE_RULES,
  registerLux3DInputSourceExtension,
} from "../src/lux3d-input-source-extension.mjs";


test("all six public Lux3D nodes have input-source rules", () => {
  assert.deepEqual(Object.keys(LUX3D_INPUT_SOURCE_RULES).sort(), [
    "Lux3DMaterialTransfer",
    "Lux3DOpenAPIImageTo3D",
    "Lux3DOpenAPIImageToFourView",
    "Lux3DOpenAPIMultiFormatExport",
    "Lux3DOpenAPITextTo3D",
    "Lux3DViewer",
  ]);
});

test("each union image field clears and locks its own URL widget when linked", async () => {
  const {app, extension} = setupExtension();
  class ImageNode extends FakeNode {
    constructor() {
      super({
        widgets: [
          widget("image_1", "https://assets.example/front.png"),
          widget("image_2", "https://assets.example/side.png"),
        ],
        inputs: [
          {name: "image_1", link: null},
          {name: "image_2", link: null},
        ],
      });
    }
  }
  await extension.beforeRegisterNodeDef(ImageNode, {name: "Lux3DOpenAPIImageTo3D"});
  const node = new ImageNode();
  node.onNodeCreated();

  assert.equal(node.find("image_1").disabled, false);
  assert.equal(node.find("image_2").disabled, false);

  node.inputs[0].link = 7;
  node.onConnectionsChange();
  assert.equal(node.find("image_1").value, "");
  assert.equal(node.find("image_1").disabled, true);
  assert.equal(node.find("image_2").disabled, false);
  assert.equal(node.find("image_2").value, "https://assets.example/side.png");

  node.find("image_1").value = "https://assets.example/blocked.png";
  node.find("image_1").callback(node.find("image_1").value);
  assert.equal(node.find("image_1").value, "");

  node.inputs[0].link = null;
  node.onConnectionsChange();
  assert.equal(node.find("image_1").disabled, false);
  assert.ok(app.graph.dirtyCalls > 0);
});

test("all image-like URL/local sources use one union widget and socket", () => {
  const rule = LUX3D_INPUT_SOURCE_RULES.Lux3DOpenAPIImageTo3D;
  assert.equal(rule.unionSocketType, "STRING,IMAGE");
  assert.deepEqual(rule.unionWidgets, [
    "image_1", "image_2", "image_3", "image_4",
    "image_5", "image_6", "image_7", "image_8",
  ]);
  assert.deepEqual(
    LUX3D_INPUT_SOURCE_RULES.Lux3DOpenAPITextTo3D.unionWidgets,
    ["reference_image"],
  );
  assert.equal(
    LUX3D_INPUT_SOURCE_RULES.Lux3DOpenAPITextTo3D.unionSocketType,
    "STRING,IMAGE",
  );
  assert.deepEqual(
    LUX3D_INPUT_SOURCE_RULES.Lux3DOpenAPIImageToFourView.unionWidgets,
    ["image"],
  );
  assert.equal(
    LUX3D_INPUT_SOURCE_RULES.Lux3DOpenAPIImageToFourView.unionSocketType,
    "STRING,IMAGE",
  );
});

test("brand-new nodes with inputs=[] receive one connectable socket per union widget", async () => {
  const {extension} = setupExtension();
  const cases = [
    [
      "Lux3DOpenAPIImageTo3D",
      Array.from({length: 8}, (_, index) => `image_${index + 1}`),
      "STRING,IMAGE",
    ],
    ["Lux3DOpenAPITextTo3D", ["reference_image"], "STRING,IMAGE"],
    ["Lux3DOpenAPIImageToFourView", ["image"], "STRING,IMAGE"],
    ["Lux3DOpenAPIMultiFormatExport", ["model_url"], "STRING,LUX3D_MODEL_SOURCE"],
    ["Lux3DMaterialTransfer", ["image", "mesh_url"], {
      image: "STRING,IMAGE",
      mesh_url: "STRING,LUX3D_MODEL_SOURCE",
    }],
    ["Lux3DViewer", ["model_url"], "STRING,LUX3D_MODEL_SOURCE"],
  ];

  for (const [nodeName, fields, socketTypes] of cases) {
    class NewNode extends FakeNode {
      constructor() {
        super({widgets: fields.map((name) => widget(name, "")), inputs: []});
      }
    }
    await extension.beforeRegisterNodeDef(NewNode, {name: nodeName});
    const node = new NewNode();
    node.onNodeCreated();
    node.onNodeCreated();

    assert.equal(node.inputs.length, fields.length, nodeName);
    for (const field of fields) {
      const sockets = node.inputs.filter((input) => input.name === field);
      assert.equal(sockets.length, 1, `${nodeName}.${field}`);
      const socketType = typeof socketTypes === "string"
        ? socketTypes
        : socketTypes[field];
      assert.equal(sockets[0].type, socketType, `${nodeName}.${field}`);
      assert.equal(sockets[0].widget?.name, field, `${nodeName}.${field}`);
    }
  }
});

test("Material adds independent image and model union sockets to a new node", async () => {
  const {extension} = setupExtension();
  class MaterialNode extends FakeNode {
    constructor() {
      super({
        widgets: [widget("image", ""), widget("mesh_url", "")],
        inputs: [],
      });
    }
  }
  await extension.beforeRegisterNodeDef(MaterialNode, {name: "Lux3DMaterialTransfer"});
  const node = new MaterialNode();
  node.onNodeCreated();

  assert.deepEqual(node.inputs.map(({name, type, widget: locator}) => ({
    name,
    type,
    widget: locator,
  })), [
    {name: "image", type: "STRING,IMAGE", widget: {name: "image"}},
    {
      name: "mesh_url",
      type: "STRING,LUX3D_MODEL_SOURCE",
      widget: {name: "mesh_url"},
    },
  ]);
});

test("Material preserves a linked legacy IMAGE socket and standardizes its union type", async () => {
  const {extension} = setupExtension();
  class MaterialNode extends FakeNode {
    constructor() {
      super({
        widgets: [
          widget("image", "https://assets.example/ignored.png"),
          widget("mesh_url", "https://assets.example/source.glb"),
        ],
        inputs: [
          {name: "image", type: "IMAGE", link: 211},
          {name: "mesh_url", type: "STRING,LUX3D_MODEL_SOURCE", link: null},
        ],
      });
      this.graph.links = {211: {id: 211, target_slot: 0}};
    }
  }
  await extension.beforeRegisterNodeDef(MaterialNode, {name: "Lux3DMaterialTransfer"});
  const node = new MaterialNode();
  node.onConfigure({
    inputs: [
      {name: "image", type: "IMAGE", link: 211},
      {name: "mesh_url", type: "STRING", widget: {name: "mesh_url"}, link: null},
    ],
  });

  assert.equal(node.inputs[0].name, "image");
  assert.equal(node.inputs[0].type, "STRING,IMAGE");
  assert.equal(node.inputs[0].link, 211);
  assert.equal(node.inputs[0].widget?.name, "image");
  assert.equal(node.graph.links[211].target_slot, 0);
  assert.equal(node.find("image").value, "");
  assert.equal(node.find("image").disabled, true);
  assert.equal(node.find("mesh_url").value, "https://assets.example/source.glb");
  assert.equal(node.find("mesh_url").disabled, false);
});

test("Material image and mesh connections disable only their matching URL field", async () => {
  const {extension} = setupExtension();
  class MaterialNode extends FakeNode {
    constructor() {
      super({
        widgets: [
          widget("image", "https://assets.example/material.png"),
          widget("mesh_url", "https://assets.example/source.glb"),
        ],
        inputs: [],
      });
    }
  }
  await extension.beforeRegisterNodeDef(MaterialNode, {name: "Lux3DMaterialTransfer"});
  const node = new MaterialNode();
  node.onNodeCreated();
  const imageInput = node.inputs.find((input) => input.name === "image");
  const meshInput = node.inputs.find((input) => input.name === "mesh_url");
  const picker = node.find("Choose local GLB");

  imageInput.link = 221;
  node.onConnectionsChange();
  assert.equal(node.find("image").value, "");
  assert.equal(node.find("image").disabled, true);
  assert.equal(node.find("mesh_url").value, "https://assets.example/source.glb");
  assert.equal(node.find("mesh_url").disabled, false);
  assert.equal(picker.disabled, false);

  imageInput.link = null;
  node.onConnectionsChange();
  node.find("image").value = "https://assets.example/replacement.png";
  meshInput.link = 222;
  node.onConnectionsChange();
  assert.equal(node.find("mesh_url").value, "");
  assert.equal(node.find("mesh_url").disabled, true);
  assert.equal(picker.disabled, true);
  assert.equal(node.find("image").value, "https://assets.example/replacement.png");
  assert.equal(node.find("image").disabled, false);
});

test("a connection in the eighth image slot is mutually exclusive", async () => {
  const {extension} = setupExtension();
  class ImageNode extends FakeNode {
    constructor() {
      super({
        widgets: [widget("image_8", "https://assets.example/rear.png")],
        inputs: [{name: "image_8", link: 88}],
      });
    }
  }
  await extension.beforeRegisterNodeDef(ImageNode, {name: "Lux3DOpenAPIImageTo3D"});
  const node = new ImageNode();
  node.onNodeCreated();
  assert.equal(node.find("image_8").disabled, true);
  assert.equal(node.find("image_8").value, "");
});

test("model sources use one URL/upstream/local field with format-specific pickers", () => {
  const exportRule = LUX3D_INPUT_SOURCE_RULES.Lux3DOpenAPIMultiFormatExport;
  assert.deepEqual(exportRule.unionWidgets, ["model_url"]);
  assert.equal(exportRule.unionSocketType, "STRING,LUX3D_MODEL_SOURCE");
  assert.equal(exportRule.localPicker.accept, ".glb,.zip");
  assert.equal(exportRule.legacySingleSource.local, "model_file");

  const materialRule = LUX3D_INPUT_SOURCE_RULES.Lux3DMaterialTransfer;
  assert.deepEqual(materialRule.unionWidgets, ["image", "mesh_url"]);
  assert.deepEqual(materialRule.unionSocketTypes, {
    image: "STRING,IMAGE",
    mesh_url: "STRING,LUX3D_MODEL_SOURCE",
  });
  assert.equal(materialRule.localPicker.accept, ".glb");
  assert.equal(materialRule.legacySingleSource.local, "mesh_file");

  const viewerRule = LUX3D_INPUT_SOURCE_RULES.Lux3DViewer;
  assert.deepEqual(viewerRule.unionWidgets, ["model_url"]);
  assert.equal(viewerRule.unionSocketType, "STRING,LUX3D_MODEL_SOURCE");
  assert.equal(viewerRule.localPicker.accept, ".glb,.ply");
  assert.equal(viewerRule.legacySingleSource.upstream, "model_url_input");
});

test("Viewer's one model field and local picker lock while its socket is connected", async () => {
  const {extension} = setupExtension();
  class ViewerNode extends FakeNode {
    constructor() {
      super({
        widgets: [widget("model_url", "https://assets.example/manual.glb")],
        inputs: [{name: "model_url", link: null}],
      });
    }
  }
  await extension.beforeRegisterNodeDef(ViewerNode, {name: "Lux3DViewer"});
  const node = new ViewerNode();
  node.onNodeCreated();

  const picker = node.find("Choose local GLB / PLY");
  assert.ok(picker);
  assert.equal(node.find("model_url").disabled, false);
  assert.equal(picker.disabled, false);

  node.inputs[0].link = 31;
  node.onConnectionsChange();
  assert.equal(node.find("model_url").disabled, true);
  assert.equal(node.find("model_url").value, "");
  assert.equal(picker.disabled, true);

  node.inputs[0].link = null;
  node.onConnectionsChange();
  assert.equal(node.find("model_url").disabled, false);
  assert.equal(picker.disabled, false);
});

test("nodeCreated fallback installs local pickers on already registered node types", async () => {
  const {extension} = setupExtension();
  const node = new FakeNode({
    widgets: [widget("model_url", "")],
    inputs: [{name: "model_url", link: null}],
  });
  node.comfyClass = "Lux3DViewer";

  await extension.nodeCreated(node);
  await extension.nodeCreated(node);

  assert.equal(
    node.widgets.filter((candidate) => candidate.name === "Choose local GLB / PLY").length,
    1,
  );
});

test("local model picker uploads only to Comfy input and writes the returned relative path", async () => {
  const selected = new Blob(["glTF"], {type: "model/gltf-binary"});
  Object.defineProperty(selected, "name", {value: "chair.glb"});
  let fileInput;
  let request;
  const document = {
    body: {append() {}},
    createElement(tag) {
      assert.equal(tag, "input");
      const listeners = {};
      fileInput = {
        style: {},
        files: [selected],
        addEventListener(name, callback) {
          listeners[name] = callback;
        },
        click() {
          listeners.change();
        },
        remove() {},
      };
      return fileInput;
    },
  };
  const api = {
    async fetchApi(path, options) {
      request = {path, options};
      return {
        ok: true,
        async json() {
          return {name: "chair.glb", subfolder: "lux3d", type: "input"};
        },
      };
    },
  };
  const {extension} = setupExtension({api, document});
  class ExportNode extends FakeNode {
    constructor() {
      super({
        widgets: [widget("model_url", "")],
        inputs: [{name: "model_url", link: null}],
      });
    }
  }
  await extension.beforeRegisterNodeDef(ExportNode, {
    name: "Lux3DOpenAPIMultiFormatExport",
  });
  const node = new ExportNode();
  node.onNodeCreated();

  await node.find("Choose local GLB / ZIP").callback();

  assert.equal(fileInput.type, "file");
  assert.equal(fileInput.accept, ".glb,.zip");
  assert.equal(request.path, "/upload/image");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.body.get("subfolder"), "lux3d");
  assert.equal(request.options.body.get("type"), "input");
  assert.equal(request.options.body.get("overwrite"), null);
  assert.equal(request.options.body.get("image").name, "chair.glb");
  assert.equal(node.find("model_url").value, "lux3d/chair.glb");
});

test("Viewer local picker immediately previews the safe same-origin Comfy view URL", async () => {
  const selected = new Blob(["ply\n"], {type: "application/octet-stream"});
  Object.defineProperty(selected, "name", {value: "chair final.ply"});
  const document = {
    body: {append() {}},
    createElement() {
      const listeners = {};
      return {
        style: {},
        files: [selected],
        addEventListener(name, callback) {
          listeners[name] = callback;
        },
        click() {
          listeners.change();
        },
        remove() {},
      };
    },
  };
  const api = {
    apiURL(route) {
      return `/comfy-prefix${route}`;
    },
    async fetchApi() {
      return {
        ok: true,
        async json() {
          return {
            name: "chair final.ply",
            subfolder: "lux3d/previews",
            type: "input",
          };
        },
      };
    },
  };
  const {extension} = setupExtension({api, document});
  class ViewerNode extends FakeNode {
    constructor() {
      super({
        widgets: [widget("model_url", "")],
        inputs: [{name: "model_url", link: null}],
      });
    }
  }
  await extension.beforeRegisterNodeDef(ViewerNode, {name: "Lux3DViewer"});
  const node = new ViewerNode();
  node.onNodeCreated();
  const previews = [];
  node[Symbol.for("comfyui-lux3d.viewer.preview-local-model")] = (url) => previews.push(url);

  await node.find("Choose local GLB / PLY").callback();

  assert.equal(node.find("model_url").value, "lux3d/previews/chair final.ply");
  assert.deepEqual(previews, [
    "/comfy-prefix/view?filename=chair+final.ply&type=input&subfolder=lux3d%2Fpreviews",
  ]);
});

test("Viewer previews a saved local input/output/temp model on configure, never a remote URL", async () => {
  const {extension} = setupExtension({
    api: {apiURL: (route) => `/proxy${route}`},
  });
  class ViewerNode extends FakeNode {
    constructor(value) {
      super({
        widgets: [widget("model_url", value)],
        inputs: [{name: "model_url", link: null}],
      });
    }
  }
  await extension.beforeRegisterNodeDef(ViewerNode, {name: "Lux3DViewer"});

  for (const [value, expected] of [
    ["lux3d/input.glb", "/proxy/view?filename=input.glb&type=input&subfolder=lux3d"],
    ["renders/result.ply [output]", "/proxy/view?filename=result.ply&type=output&subfolder=renders"],
    ["preview.glb [temp]", "/proxy/view?filename=preview.glb&type=temp&subfolder="],
  ]) {
    const node = new ViewerNode(value);
    node.onNodeCreated();
    const previews = [];
    node[Symbol.for("comfyui-lux3d.viewer.preview-local-model")] = (url) => previews.push(url);
    node.onConfigure({});
    assert.deepEqual(previews, [expected]);
  }

  const remote = new ViewerNode("https://assets.example/model.glb");
  remote.onNodeCreated();
  const remotePreviews = [];
  remote[Symbol.for("comfyui-lux3d.viewer.preview-local-model")] = (url) => remotePreviews.push(url);
  remote.onConfigure({});
  assert.deepEqual(remotePreviews, []);
});

test("local picker rejects path-injecting Comfy upload metadata before preview", async () => {
  const selected = new Blob(["ply\n"]);
  Object.defineProperty(selected, "name", {value: "safe.ply"});
  const document = {
    body: {append() {}},
    createElement() {
      const listeners = {};
      return {
        style: {},
        files: [selected],
        addEventListener(name, callback) {
          listeners[name] = callback;
        },
        click() {
          listeners.change();
        },
        remove() {},
      };
    },
  };
  const api = {
    async fetchApi() {
      return {
        ok: true,
        async json() {
          return {name: "outside..ply", subfolder: "lux3d", type: "input"};
        },
      };
    },
  };
  const {app, extension} = setupExtension({api, document});
  const errors = [];
  app.extensionManager = {toast: {add(message) { errors.push(message); }}};
  class ViewerNode extends FakeNode {
    constructor() {
      super({
        widgets: [widget("model_url", "")],
        inputs: [{name: "model_url", link: null}],
      });
    }
  }
  await extension.beforeRegisterNodeDef(ViewerNode, {name: "Lux3DViewer"});
  const node = new ViewerNode();
  node.onNodeCreated();
  const previews = [];
  node[Symbol.for("comfyui-lux3d.viewer.preview-local-model")] = (url) => previews.push(url);

  await node.find("Choose local GLB / PLY").callback();

  assert.equal(node.find("model_url").value, "");
  assert.deepEqual(previews, []);
  assert.equal(errors.length, 1);
  assert.match(errors[0].detail, /unsafe filename/);
});

test("version and output format disable unsupported PBR without sending a value", async () => {
  const {extension} = setupExtension();
  class TextNode extends FakeNode {
    constructor() {
      super({widgets: [
        widget("version", "G1-Turbo"),
        widget("output_format", "glb"),
        widget("enable_pbr", "true"),
        widget("reference_image", ""),
      ]});
    }
  }
  await extension.beforeRegisterNodeDef(TextNode, {
    name: "Lux3DOpenAPITextTo3D",
  });
  const node = new TextNode();
  node.onNodeCreated();
  assert.equal(node.find("enable_pbr").disabled, false);
  assert.equal(node.find("enable_pbr").value, "true");

  node.find("version").value = "G1";
  node.find("version").callback("G1");
  assert.equal(node.find("enable_pbr").disabled, true);
  assert.equal(node.find("enable_pbr").value, "default");

  node.find("version").value = "G1-Turbo";
  node.find("version").callback("G1-Turbo");
  assert.equal(node.find("enable_pbr").disabled, false);
  node.find("enable_pbr").value = "false";
  node.find("output_format").value = "ply";
  node.find("output_format").callback("ply");
  assert.equal(node.find("enable_pbr").disabled, true);
  assert.equal(node.find("enable_pbr").value, "default");
});

test("legacy region aliases are displayed as full base API URLs", async () => {
  const {extension} = setupExtension();
  class TextNode extends FakeNode {
    constructor() {
      super({
        widgets: [
          widget("base_api_path", "cn"),
          widget("reference_image", ""),
        ],
      });
    }
  }
  await extension.beforeRegisterNodeDef(TextNode, {
    name: "Lux3DOpenAPITextTo3D",
  });
  const node = new TextNode();
  node.onConfigure();
  assert.equal(node.find("base_api_path").value, "https://api.aholo3d.cn");

  node.find("base_api_path").value = "intl";
  node.find("base_api_path").callback("intl");
  assert.equal(node.find("base_api_path").value, "https://api.aholo3d.com");
});

test("saved timeout values are removed without shifting old workflow widgets", async () => {
  const {extension} = setupExtension();
  const names = [
    "base_api_path",
    "image_1", "image_2", "image_3", "image_4",
    "image_5", "image_6", "image_7", "image_8",
    "version", "face_count", "output_format", "enable_pbr", "ai_predict_size",
  ];
  class ImageNode extends FakeNode {
    constructor() {
      super({widgets: names.map((name) => widget(name, "misaligned"))});
    }
  }
  await extension.beforeRegisterNodeDef(ImageNode, {
    name: "Lux3DOpenAPIImageTo3D",
  });
  const node = new ImageNode();
  node.onConfigure({
    widgets_values: [
      "cn", 30, "multiple", "", [
        "https://assets.example/front.png",
        "https://assets.example/side.png",
      ], "G1-Turbo", 0, "default", "default", "default",
    ],
  });
  assert.equal(node.find("base_api_path").value, "https://api.aholo3d.cn");
  assert.equal(node.find("image_1").value, "https://assets.example/front.png");
  assert.equal(node.find("image_2").value, "https://assets.example/side.png");
  assert.equal(node.find("image_3").value, "");
  assert.equal(node.find("version").value, "G1-Turbo");
  assert.equal(node.find("face_count").value, 200000);
});

test("dual-field Image to 3D workflows preserve all eight saved URL widgets", async () => {
  const {extension} = setupExtension();
  const unionNames = Array.from({length: 8}, (_, index) => `image_${index + 1}`);
  const urls = unionNames.map((_, index) => `https://assets.example/view-${index + 1}.png`);
  class ImageNode extends FakeNode {
    constructor() {
      super({
        widgets: [widget("base_api_path", "cn"), ...unionNames.map((name) => widget(name, ""))],
        inputs: [
          {name: "base_api_path", link: null},
          ...unionNames.map((name) => ({name, type: "STRING,IMAGE", link: null})),
        ],
      });
    }
  }
  await extension.beforeRegisterNodeDef(ImageNode, {
    name: "Lux3DOpenAPIImageTo3D",
  });
  const node = new ImageNode();
  node.onConfigure({
    inputs: [
      {name: "base_api_path", type: "STRING", widget: {name: "base_api_path"}, link: null},
      ...unionNames.map((_, index) => ({
        name: `image_url_${index + 1}`,
        type: "STRING",
        widget: {name: `image_url_${index + 1}`},
        link: null,
      })),
      ...unionNames.map((name) => ({name, type: "IMAGE", link: null})),
    ],
    widgets_values: ["cn", ...urls],
  });

  assert.equal(node.find("base_api_path").value, "https://api.aholo3d.cn");
  for (const [index, name] of unionNames.entries()) {
    assert.equal(node.find(name).value, urls[index]);
    assert.equal(node.find(name).disabled, false);
  }
});

test("dual-field Image to 3D workflows relocate all eight local IMAGE links", async () => {
  const {extension} = setupExtension();
  const unionNames = Array.from({length: 8}, (_, index) => `image_${index + 1}`);
  const linkIds = unionNames.map((_, index) => 101 + index);
  class ImageNode extends FakeNode {
    constructor() {
      super({
        widgets: unionNames.map((name) => widget(name, "stale URL")),
        inputs: unionNames.map((name, index) => ({
          name,
          type: "STRING,IMAGE",
          link: index === 0 ? linkIds[7] : null,
        })),
      });
      this.graph.links = Object.fromEntries(
        linkIds.map((linkId) => [linkId, {id: linkId, target_slot: 99}]),
      );
    }
  }
  await extension.beforeRegisterNodeDef(ImageNode, {
    name: "Lux3DOpenAPIImageTo3D",
  });
  const node = new ImageNode();
  node.onConfigure({
    inputs: [
      ...unionNames.map((_, index) => ({
        name: `image_url_${index + 1}`,
        type: "STRING",
        widget: {name: `image_url_${index + 1}`},
        link: null,
      })),
      ...unionNames.map((name, index) => ({
        name,
        type: "IMAGE",
        link: linkIds[index],
      })),
    ],
    widgets_values: unionNames.map((_, index) => `https://assets.example/${index + 1}.png`),
  });

  for (const [index, name] of unionNames.entries()) {
    assert.equal(node.inputs[index].link, linkIds[index]);
    assert.equal(node.graph.links[linkIds[index]].target_slot, index);
    assert.equal(node.find(name).value, "");
    assert.equal(node.find(name).disabled, true);
  }
});

test("dual-field Text to 3D reference image link migrates to its union input", async () => {
  const {extension} = setupExtension();
  class TextNode extends FakeNode {
    constructor() {
      super({
        widgets: [widget("reference_image", "")],
        inputs: [
          {name: "prompt", type: "STRING", link: null},
          {name: "reference_image", type: "STRING,IMAGE", link: null},
        ],
      });
      this.graph.links = new Map([[301, {id: 301, target_slot: 8}]]);
    }
  }
  await extension.beforeRegisterNodeDef(TextNode, {
    name: "Lux3DOpenAPITextTo3D",
  });
  const node = new TextNode();
  node.onConfigure({
    inputs: [
      {name: "reference_image_url", type: "STRING", widget: {name: "reference_image_url"}, link: null},
      {name: "reference_image", type: "IMAGE", link: 301},
    ],
    widgets_values: ["https://assets.example/reference.png"],
  });

  assert.equal(node.inputs[1].link, 301);
  assert.equal(node.graph.links.get(301).target_slot, 1);
  assert.equal(node.find("reference_image").value, "");
  assert.equal(node.find("reference_image").disabled, true);
});

test("dual-field Four View workflow preserves URL and relocates legacy IMAGE link", async () => {
  const {extension} = setupExtension();
  class FourViewNode extends FakeNode {
    constructor() {
      super({
        widgets: [widget("image", "")],
        inputs: [{name: "image", type: "STRING,IMAGE", link: null}],
      });
      this.graph._links = new Map([[401, [401, 9, 0, 12, 7, "IMAGE"]]]);
    }
  }
  await extension.beforeRegisterNodeDef(FourViewNode, {
    name: "Lux3DOpenAPIImageToFourView",
  });
  const urlOnly = new FourViewNode();
  urlOnly.onConfigure({
    inputs: [
      {name: "image_url", type: "STRING", widget: {name: "image_url"}, link: null},
      {name: "image", type: "IMAGE", link: null},
    ],
    widgets_values: ["https://assets.example/object.png"],
  });
  assert.equal(urlOnly.find("image").value, "https://assets.example/object.png");
  assert.equal(urlOnly.find("image").disabled, false);

  const linked = new FourViewNode();
  linked.onConfigure({
    inputs: [
      {name: "image_url", type: "STRING", widget: {name: "image_url"}, link: null},
      {name: "image", type: "IMAGE", link: 401},
    ],
    widgets_values: ["https://assets.example/ignored.png"],
  });
  assert.equal(linked.inputs[0].link, 401);
  assert.equal(linked.graph._links.get(401)[4], 0);
  assert.equal(linked.find("image").value, "");
  assert.equal(linked.find("image").disabled, true);
});

test("legacy Export and Material local-file widgets migrate into their one source field", async () => {
  const {extension} = setupExtension();
  class ExportNode extends FakeNode {
    constructor() {
      super({
        widgets: [widget("model_url", "")],
        inputs: [{name: "model_url", type: "STRING,LUX3D_MODEL_SOURCE", link: null}],
      });
    }
  }
  await extension.beforeRegisterNodeDef(ExportNode, {
    name: "Lux3DOpenAPIMultiFormatExport",
  });
  const exportNode = new ExportNode();
  exportNode.onConfigure({
    inputs: [
      {name: "base_api_path", type: "STRING", widget: {name: "base_api_path"}, link: null},
      {name: "model_url", type: "STRING", widget: {name: "model_url"}, link: null},
      {name: "output_format", type: "COMBO", widget: {name: "output_format"}, link: null},
      {name: "model_file", type: "COMBO", widget: {name: "model_file"}, link: null},
    ],
    widgets_values: ["https://api.aholo3d.cn", "", "obj", "lux3d/legacy.glb"],
  });
  assert.equal(exportNode.find("model_url").value, "lux3d/legacy.glb");

  class MaterialNode extends FakeNode {
    constructor() {
      super({
        // Simulate LiteGraph restoring the old widget array by position before
        // the extension sees the saved workflow. The legacy key must never
        // survive in the new base_api_path widget.
        widgets: [
          widget("image", "https://assets.example/manual.glb"),
          widget("mesh_url", "https://api.aholo3d.cn"),
          widget("base_api_path", "legacy-secret-must-be-discarded"),
        ],
        inputs: [
          {name: "image", type: "STRING,IMAGE", widget: {name: "image"}, link: 811},
          {name: "mesh_url", type: "STRING,LUX3D_MODEL_SOURCE", link: null},
        ],
      });
      this.graph.links = {811: {id: 811, target_slot: 0}};
    }

    configure(info) {
      // Mirror ComfyNode.configure normalizing saved inputs to the current
      // node definition before it invokes onConfigure.
      const normalized = {
        ...info,
        inputs: info.inputs.map((saved) => {
          const current = this.inputs.find((input) => input.name === saved.name);
          return current
            ? {...saved, type: current.type, widget: current.widget}
            : {...saved};
        }),
      };
      return this.onConfigure(normalized);
    }
  }
  await extension.beforeRegisterNodeDef(MaterialNode, {name: "Lux3DMaterialTransfer"});
  const materialNode = new MaterialNode();
  materialNode.configure({
    inputs: [
      {name: "image", type: "IMAGE", link: 811},
      {name: "mesh_url", type: "STRING", widget: {name: "mesh_url"}, link: null},
      {name: "base_api_path", type: "STRING", widget: {name: "base_api_path"}, link: null},
      {name: "lux3d_api_key", type: "STRING", widget: {name: "lux3d_api_key"}, link: null},
      {name: "mesh_file", type: "COMBO", widget: {name: "mesh_file"}, link: null},
    ],
    widgets_values: [
      "https://assets.example/manual.glb",
      "https://api.aholo3d.cn",
      "",
      "lux3d/ignored-local.glb",
    ],
  });
  assert.equal(materialNode.find("image").value, "");
  assert.equal(materialNode.find("image").disabled, true);
  assert.equal(materialNode.find("mesh_url").value, "https://assets.example/manual.glb");
  assert.equal(materialNode.find("base_api_path").value, "https://api.aholo3d.cn");
  assert.equal(materialNode.inputs.find((input) => input.name === "image").link, 811);
  assert.ok(materialNode.widgets.every((candidate) => (
    candidate.value !== "legacy-secret-must-be-discarded"
  )));
});

test("legacy Material workflow without a key survives real configure normalization", async () => {
  const {extension} = setupExtension();
  class MaterialNode extends FakeNode {
    constructor() {
      super({
        widgets: [
          widget("image", "lux3d/legacy.glb"),
          widget("mesh_url", "https://api.aholo3d.com"),
          widget("base_api_path", "https://api.aholo3d.cn"),
        ],
        inputs: [
          {name: "image", type: "STRING,IMAGE", widget: {name: "image"}, link: null},
          {name: "mesh_url", type: "STRING,LUX3D_MODEL_SOURCE", link: null},
        ],
      });
    }

    configure(info) {
      const normalized = {
        ...info,
        inputs: info.inputs.map((saved) => {
          const current = this.inputs.find((input) => input.name === saved.name);
          return current
            ? {...saved, type: current.type, widget: current.widget}
            : {...saved};
        }),
      };
      return this.onConfigure(normalized);
    }
  }
  await extension.beforeRegisterNodeDef(MaterialNode, {name: "Lux3DMaterialTransfer"});
  const node = new MaterialNode();
  node.configure({
    inputs: [
      {name: "image", type: "IMAGE", link: null},
      {name: "mesh_url", type: "STRING", widget: {name: "mesh_url"}, link: null},
      {name: "base_api_path", type: "STRING", widget: {name: "base_api_path"}, link: null},
    ],
    widgets_values: ["lux3d/legacy.glb", "https://api.aholo3d.com"],
  });

  assert.equal(node.find("image").value, "");
  assert.equal(node.find("mesh_url").value, "lux3d/legacy.glb");
  assert.equal(node.find("base_api_path").value, "https://api.aholo3d.com");
});

test("current Material union workflow is not reinterpreted as legacy", async () => {
  const {extension} = setupExtension();
  class MaterialNode extends FakeNode {
    constructor() {
      super({
        widgets: [
          widget("image", "https://assets.example/current.png"),
          widget("mesh_url", "https://assets.example/current.glb"),
          widget("base_api_path", "https://api.aholo3d.cn"),
        ],
        inputs: [
          {name: "image", type: "STRING,IMAGE", widget: {name: "image"}, link: null},
          {name: "mesh_url", type: "STRING,LUX3D_MODEL_SOURCE", link: null},
        ],
      });
    }

    configure(info) {
      return this.onConfigure(info);
    }
  }
  await extension.beforeRegisterNodeDef(MaterialNode, {name: "Lux3DMaterialTransfer"});
  const node = new MaterialNode();
  node.configure({
    inputs: [
      {name: "image", type: "STRING,IMAGE", widget: {name: "image"}, link: null},
      {name: "mesh_url", type: "STRING,LUX3D_MODEL_SOURCE", widget: {name: "mesh_url"}, link: null},
      {name: "base_api_path", type: "STRING", widget: {name: "base_api_path"}, link: null},
    ],
    widgets_values: [
      "https://assets.example/current.png",
      "https://assets.example/current.glb",
      "https://api.aholo3d.cn",
    ],
  });

  assert.equal(node.find("image").value, "https://assets.example/current.png");
  assert.equal(node.find("mesh_url").value, "https://assets.example/current.glb");
  assert.equal(node.find("base_api_path").value, "https://api.aholo3d.cn");
});

test("retired public fields restored by an old workflow are removed from Material", async () => {
  const {extension} = setupExtension();
  class MaterialNode extends FakeNode {
    constructor() {
      super({
        widgets: [widget("mesh_url", "")],
        inputs: [{name: "mesh_url", type: "STRING,LUX3D_MODEL_SOURCE", link: null}],
      });
    }

    onConfigure(info) {
      this.widgets.push(
        widget("lux3d_api_key", "must-not-survive"),
        widget("region", "cn"),
        widget("timeout", 600),
      );
      this.inputs.push(
        {name: "lux3d_api_key", type: "STRING", link: null},
        {name: "region", type: "COMBO", link: null},
        {name: "timeout", type: "INT", link: null},
      );
      return info;
    }
  }
  await extension.beforeRegisterNodeDef(MaterialNode, {name: "Lux3DMaterialTransfer"});
  const node = new MaterialNode();
  node.onConfigure({inputs: [], widgets_values: []});
  assert.deepEqual(node.widgets.map(({name}) => name), ["mesh_url", "Choose local GLB"]);
  assert.deepEqual(node.inputs.map(({name}) => name), ["mesh_url", "image"]);
});

test("legacy Viewer local value and dedicated upstream link migrate to model_url", async () => {
  const {extension} = setupExtension();
  class ViewerNode extends FakeNode {
    constructor() {
      super({
        widgets: [widget("model_url", "")],
        inputs: [{name: "model_url", type: "STRING,LUX3D_MODEL_SOURCE", link: null}],
      });
      this.graph.links = {701: {id: 701, target_slot: 9}};
    }
  }
  await extension.beforeRegisterNodeDef(ViewerNode, {name: "Lux3DViewer"});

  const local = new ViewerNode();
  local.onConfigure({
    inputs: [
      {name: "model_url", type: "STRING", widget: {name: "model_url"}, link: null},
      {name: "base_api_path", type: "STRING", widget: {name: "base_api_path"}, link: null},
      {name: "model_file", type: "COMBO", widget: {name: "model_file"}, link: null},
      {name: "model_url_input", type: "STRING", link: null},
    ],
    widgets_values: ["", "https://api.aholo3d.cn", "lux3d/legacy.ply"],
  });
  assert.equal(local.find("model_url").value, "lux3d/legacy.ply");

  const linked = new ViewerNode();
  linked.onConfigure({
    inputs: [
      {name: "model_url", type: "STRING", widget: {name: "model_url"}, link: null},
      {name: "base_api_path", type: "STRING", widget: {name: "base_api_path"}, link: null},
      {name: "model_file", type: "COMBO", widget: {name: "model_file"}, link: null},
      {name: "model_url_input", type: "STRING", link: 701},
    ],
    widgets_values: ["https://assets.example/ignored.glb", "https://api.aholo3d.cn", ""],
  });
  assert.equal(linked.inputs[0].link, 701);
  assert.equal(linked.inputs.length, 1);
  assert.equal(linked.inputs[0].name, "model_url");
  assert.equal(linked.graph.links[701].target_slot, 0);
  assert.equal(linked.find("model_url").value, "");
  assert.equal(linked.find("model_url").disabled, true);
  assert.equal(linked.find("Choose local GLB / PLY").disabled, true);
});

test("legacy Viewer with only model_url_input normalizes that socket in place", async () => {
  const {extension} = setupExtension();
  class LegacyViewerNode extends FakeNode {
    constructor() {
      super({
        widgets: [widget("model_url", "https://assets.example/ignored.glb")],
        inputs: [{
          name: "model_url_input",
          label: "model_url_input",
          type: "STRING",
          link: 801,
        }],
      });
      this.graph.links = {801: {id: 801, target_slot: 0}};
    }
  }
  await extension.beforeRegisterNodeDef(LegacyViewerNode, {name: "Lux3DViewer"});
  const node = new LegacyViewerNode();
  node.onConfigure({
    inputs: [
      {name: "model_url", type: "STRING", widget: {name: "model_url"}, link: null},
      {name: "model_url_input", type: "STRING", link: 801},
    ],
    widgets_values: ["https://assets.example/ignored.glb"],
  });

  assert.equal(node.inputs.length, 1);
  assert.equal(node.inputs[0].name, "model_url");
  assert.equal(node.inputs[0].label, "model_url");
  assert.equal(node.inputs[0].type, "STRING,LUX3D_MODEL_SOURCE");
  assert.equal(node.inputs[0].link, 801);
  assert.equal(node.graph.links[801].target_slot, 0);
  assert.equal(node.find("model_url").value, "");
});

test("nodeCreated fallback collapses simultaneous current and legacy Viewer sockets", async () => {
  const {extension} = setupExtension();
  const node = new FakeNode({
    widgets: [widget("model_url", "")],
    inputs: [
      {name: "model_url", type: "STRING,LUX3D_MODEL_SOURCE", link: null},
      {name: "model_url_input", type: "STRING", link: 901},
    ],
  });
  node.comfyClass = "Lux3DViewer";
  node.graph.links = {901: {id: 901, target_slot: 1}};

  await extension.nodeCreated(node);

  assert.equal(node.inputs.length, 1);
  assert.equal(node.inputs[0].name, "model_url");
  assert.equal(node.inputs[0].link, 901);
  assert.equal(node.graph.links[901].target_slot, 0);
});

test("late core configure restoration is repaired without duplicating the Viewer socket", async () => {
  const {extension} = setupExtension();
  class LateViewerNode extends FakeNode {
    constructor() {
      super({
        widgets: [widget("model_url", "https://assets.example/stale.glb")],
        inputs: [],
      });
      this.graph.links = {1001: {id: 1001, target_slot: 7}};
    }

    onConfigure() {
      queueMicrotask(() => {
        this.inputs = [{
          name: "model_url_input",
          label: "model_url_input",
          type: "STRING",
          link: 1001,
        }];
      });
      return "configured-late";
    }
  }
  await extension.beforeRegisterNodeDef(LateViewerNode, {name: "Lux3DViewer"});
  const node = new LateViewerNode();
  const result = node.onConfigure({
    inputs: [
      {name: "model_url", type: "STRING", widget: {name: "model_url"}, link: null},
      {name: "model_url_input", type: "STRING", link: 1001},
    ],
    widgets_values: ["https://assets.example/stale.glb"],
  });
  assert.equal(result, "configured-late");

  await Promise.resolve();

  assert.equal(node.inputs.length, 1);
  assert.equal(node.inputs[0].name, "model_url");
  assert.equal(node.inputs[0].type, "STRING,LUX3D_MODEL_SOURCE");
  assert.equal(node.inputs[0].widget?.name, "model_url");
  assert.equal(node.inputs[0].link, 1001);
  assert.equal(node.graph.links[1001].target_slot, 0);
  assert.equal(node.find("model_url").value, "");
  assert.equal(node.find("model_url").disabled, true);
});

test("thin Comfy entry registers the local extension module", async () => {
  const source = await readFile(
    new URL("../../js/lux3d_runtime.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /new URL\(\s*"\.\/assets\/lux3d-input-source-extension\.mjs"/);
  assert.match(source, /inputSourcesBundleUrl\.searchParams\.set\("v", cacheToken\)/);
  assert.match(source, /await import\(inputSourcesBundleUrl\.href\)/);
  assert.match(source, /import \{api\} from "\.\.\/\.\.\/scripts\/api\.js"/);
  assert.match(source, /registerLux3DInputSourceExtension\(\{app, api\}\)/);
});


function setupExtension({api, document} = {}) {
  const app = {
    extensions: [],
    graph: {
      dirtyCalls: 0,
      setDirtyCanvas() {
        this.dirtyCalls += 1;
      },
    },
    registerExtension(extension) {
      this.extensions.push(extension);
    },
  };
  const extension = registerLux3DInputSourceExtension({app, api, document});
  return {app, extension};
}

function widget(name, value) {
  return {
    name,
    value,
    options: {},
    callback(nextValue) {
      this.lastCallbackValue = nextValue;
    },
  };
}

class FakeNode {
  constructor({widgets = [], inputs = []}) {
    this.widgets = widgets;
    this.inputs = inputs;
    this.graph = {setDirtyCanvas() {}};
  }

  find(name) {
    return this.widgets.find((candidate) => candidate.name === name);
  }

  addWidget(type, name, value, callback, options = {}) {
    const created = {type, name, value, callback, options};
    this.widgets.push(created);
    return created;
  }

  addInput(name, type, options = {}) {
    const created = {name, type, link: null, ...options};
    this.inputs.push(created);
    return created;
  }

  removeInput(index) {
    this.inputs.splice(index, 1);
  }

  onNodeCreated() {
    return "created";
  }

  onConfigure() {
    return "configured";
  }

  onConnectionsChange() {
    return "connections";
  }

  onGraphConfigured() {
    return "graph-configured";
  }
}
