import assert from "node:assert/strict";
import test from "node:test";
import {renderPostprocessResult, safeArtifactUrl, registerLux3DPostprocessExtension} from "../src/lux3d-postprocess-extension.mjs";

class Element {
  constructor(tag) { this.tag=tag; this.style={}; this.children=[]; }
  appendChild(child) { this.children.push(child); }
  replaceChildren() { this.children=[]; }
}
test("partial failures remain visible; combined artifacts are deduplicated and excluded from workflow serialization", () => {
  const document = {createElement: tag => new Element(tag)};
  let panel, widget;
  const node = {addDOMWidget(name,type,element,options) { panel=element; widget={options}; return widget; }};
  renderPostprocessResult(node, {task_id:"42", failed_count:1, artifacts:[
    {url:"https://example.com/model.glb",format:"glb"},
    {url:"https://example.com/model.glb",format:"glb"},
    {url:"javascript:alert(1)",format:"glb"}], actions:[
    {animation_id:"Walk_Loop",status:"success"},
    {animation_id:"Idle_Loop",status:"failed",error:"<img src=x onerror=alert(1)>"}]}, document);
  assert.equal(panel.children.length,4);
  assert.match(panel.children[0].textContent,/1 action\(s\) failed/);
  assert.equal(panel.children[1].children[0].rel,"noopener noreferrer");
  assert.match(panel.children[3].textContent,/<img/);
  assert.equal(widget.options.serialize,false);
  renderPostprocessResult(node,{task_id:"43",artifacts:[],actions:[]},document);
  assert.equal(panel.children.length,1);
});
test("artifact links reject active schemes and embedded credentials", () => {
  for(const url of ["javascript:alert(1)","data:text/html,hello","file:///etc/passwd","https://user:pass@example.com/a.glb","/view?filename=x"]) assert.equal(safeArtifactUrl(url),null);
  assert.equal(safeArtifactUrl("https://example.com/a.fbx?signature=xyz"),"https://example.com/a.fbx?signature=xyz");
});

test("retopology retains GLB and OBJ delivery and safely displays missing-texture warnings", () => {
  const document = {createElement: tag => new Element(tag)};
  let panel;
  const node = {
    type:"Lux3DOpenAPIRetopology",
    outputs:[{name:"task_id"},{name:"glb"},{name:"OBJ Untextured"},{name:"OBJ Textured"}],
    addDOMWidget(name, type, element) {panel = element; return {};},
  };
  const warning = "已有几何结果，未生成贴图包 <img src=x onerror=alert(1)>";
  renderPostprocessResult(node, {task_id:"42", warnings:[warning], artifacts:[
    {url:"https://example.com/model.glb",format:"glb"},
    {url:"https://example.com/model.obj",format:"obj"},
    {url:"",format:"zip"},
  ]}, document);
  assert.equal(panel.children.length,4);
  assert.equal(panel.children[1].textContent,warning);
  assert.equal(panel.children[2].children[0].textContent,"Download GLB");
  assert.equal(panel.children[3].children[0].textContent,"Download OBJ Untextured");
  node.outputs[2].localized_name="OBJ 白模";
  node.outputs[3].localized_name="OBJ 带材质";
  renderPostprocessResult(node, {task_id:"43", artifacts:[
    {url:"https://example.com/model.glb",format:"glb"},
    {url:"https://example.com/model.obj",format:"obj"},
    {url:"https://example.com/model.zip",format:"zip"},
  ]}, document);
  assert.equal(panel.children[2].children[0].textContent,"Download OBJ 白模");
  assert.equal(panel.children[3].children[0].textContent,"Download OBJ 带材质 (ZIP)");
  assert.equal(panel.children[3].children[0].href,"https://example.com/model.zip");
});

function setup() {
  const api=new EventTarget();
  let attached=0;
  const add=api.addEventListener.bind(api),remove=api.removeEventListener.bind(api);
  api.addEventListener=(...args)=>{attached++;add(...args);};
  api.removeEventListener=(...args)=>{attached--;remove(...args);};
  api.emit=(name,detail)=>{const event=new Event(name);event.detail=detail;api.dispatchEvent(event);};
  let extension;
  const app={registerExtension(value){extension=value;}};
  const document={createElement:tag=>new Element(tag)};
  class Node {
    constructor(id){this.id=id;this.size=[380,300];this.inputs=[];this.widgets=[{name:"model_url",value:"https://example.com/in.glb"},{name:"animation_ids",value:'["Walk_Loop"]'}];this.onNodeCreated();}
    addDOMWidget(name,type,panel,options){this.panel=panel;this.resultWidget={options};return this.resultWidget;}
    addWidget(type,name,value,callback,options){const widget={type,name,value,callback,options};this.widgets.push(widget);return widget;}
    computeSize(){return [380,300];}
    setSize(size){this.size=size;}
  }
  registerLux3DPostprocessExtension({app,api,document});
  extension.beforeRegisterNodeDef(Node,{name:"Lux3DOpenAPIAnimationRetarget",input:{required:{animation_ids:["STRING",{lux3d_animation_ids:["Walk_Loop","Idle_Loop","Yes"]}]}}});
  return {Node,api,attached:()=>attached};
}
const fixture={task_id:"42",failed_count:1,artifacts:[{format:"glb",url:"https://example.com/walk.glb"}],actions:[{animation_id:"Walk_Loop",status:"success",animationGlbUrl:"https://example.com/walk.glb"},{animation_id:"Idle_Loop",status:"failed",error:"MODEL_INVALID"}]};
test("result widget gets usable minimum height and action-associated downloads",()=>{
  const {Node}=setup();const node=new Node(1);node.onExecuted({lux3d_postprocess:[fixture]});
  assert.equal(node.resultWidget.options.getMinHeight(),200);
  assert.ok(node.size[1]>=500);
  assert.equal(node.panel.children[1].children[0].textContent,"Download GLB · Walk_Loop");
});
test("result panel preserves a narrow node and follows shrink, grow and layout recomputation",()=>{
  const {Node}=setup();const node=new Node(1);
  node.size[0]=220;
  node.onExecuted({lux3d_postprocess:[fixture]});
  assert.equal(node.size[0],220,"rendering a result must preserve the chosen node width");
  const widget=node.resultWidget;
  assert.equal(widget.width,220);
  for(const width of [180,520]) {
    node.size[0]=width;
    widget.options.afterResize.call(widget,node);
    assert.equal(widget.width,width);
  }
  widget.width=380;
  widget.options.onDraw(widget);
  assert.equal(widget.width,520,"a cached layout width must not make the panel overflow");
  assert.equal(node.panel.children[1].children[0].href,"https://example.com/walk.glb");
  node.onExecuted({lux3d_postprocess:[fixture]});
  assert.equal(node.resultWidget,widget,"new results must reuse the resized widget");
});
test("execution failure/cancellation and changed inputs mark prior results; unrelated nodes and cache are handled separately",()=>{
  const {Node,api,attached}=setup();const a=new Node(1),b=new Node(2);
  a.onExecuted({lux3d_postprocess:[fixture]});b.onExecuted({lux3d_postprocess:[fixture]});
  api.emit("executing",{node:"2"});assert.match(a.panel.children[0].textContent,/^Task 42/);assert.match(b.panel.children[0].textContent,/Previous result/);
  api.emit("execution_error",{node_id:"2"});assert.match(b.panel.children[0].textContent,/Latest run failed/);
  api.emit("execution_cached",{nodes:["2"]});assert.match(b.panel.children[0].textContent,/^Task 42/);
  api.emit("execution_interrupted",{node_id:"1"});assert.match(a.panel.children[0].textContent,/Latest run cancelled/);
  b.widgets[0].value="https://example.com/new.glb";b.onWidgetChanged();assert.match(b.panel.children[0].textContent,/Inputs changed/);
  api.emit("execution_cached",{nodes:["2"]});assert.match(b.panel.children[0].textContent,/Inputs changed/);
  a.onRemoved();b.onRemoved();assert.equal(attached(),0);
});
test("catalog helper updates only serializable animation_ids and does not duplicate actions",()=>{
  const {Node}=setup();const node=new Node(1);const combo=node.widgets.find(w=>w.name==="Action to add"),button=node.widgets.find(w=>w.name==="Add action");
  combo.value="Idle_Loop";button.callback();button.callback();
  assert.deepEqual(JSON.parse(node.widgets.find(w=>w.name==="animation_ids").value),["Walk_Loop","Idle_Loop"]);
  assert.equal(combo.options.serialize,false);assert.equal(button.options.serialize,false);
});
