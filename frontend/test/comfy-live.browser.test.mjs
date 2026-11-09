// Opt-in installed-ComfyUI integration test. Creates no Lux3D remote tasks.
import assert from "node:assert/strict";
import {readFile, readdir, mkdir} from "node:fs/promises";
import {resolve, join} from "node:path";
import {chromium} from "playwright";

const origin = process.env.LUX3D_COMFY_ORIGIN;
assert.ok(origin, "Set LUX3D_COMFY_ORIGIN to the installed ComfyUI under test");
const workflowDir = process.env.LUX3D_COMFY_WORKFLOWS_DIR;
assert.ok(workflowDir, "Set LUX3D_COMFY_WORKFLOWS_DIR to your local validation workflows");
const browser = await chromium.launch({headless: true, args:["--enable-unsafe-swiftshader"]});
const page = await browser.newPage({viewport:{width:1600,height:1000}});
const errors=[];
page.on("pageerror", error => errors.push(error.message));
try {
  // Keep this browser's assertions independent of the installed user's locale.
  // Override the read response only; do not change the server's saved settings.
  await page.route("**/settings", async route => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const settings = await response.json();
    settings["Comfy.Locale"] = "en";
    await route.fulfill({response, json:settings});
  });
  await page.goto(origin);
  await page.locator("#splash-loader").waitFor({state:"hidden"});
  await page.getByRole("button", {name:/Run|运行/}).first().waitFor();
  await page.waitForFunction(() => window.comfyAPI?.app?.app?.graph && window.LiteGraph?.registered_node_types?.Lux3DOpenAPIAnimationRetarget, {timeout:60000});
  const files=(await readdir(resolve(workflowDir))).filter(name=>name.endsWith(".json"));
  for(const file of files) {
    const workflow=JSON.parse(await readFile(join(workflowDir,file),"utf8"));
    const check=await page.evaluate(async workflow => {
      const app=window.comfyAPI.app.app;
      await app.loadGraphData(workflow);
      const prompt=await app.graphToPrompt();
      const serialized=app.graph.serialize();
      await app.loadGraphData(serialized);
      const reloaded=await app.graphToPrompt();
      return {prompt:prompt.output,reloaded:reloaded.output,nodes:app.graph._nodes.map(node=>({type:node.type,widgets:node.widgets.map(widget=>widget.name),inputs:node.inputs.map(input=>({name:input.name,type:input.type,link:input.link}))}))};
    }, workflow);
    assert.deepEqual(check.prompt,check.reloaded,`${file}: save/reload changed API inputs`);
    assert.equal(check.nodes.length,workflow.nodes.length);
    for(const node of check.nodes) {
      assert.ok(node.widgets.some(name=>name.startsWith("Choose local GLB")),`${file}: missing picker`);
      assert.ok(node.inputs.some(input=>input.name==="model_url" && input.type==="STRING,LUX3D_MODEL_SOURCE"));
    }
    console.log("Workflow import/serialize/reload passed:",file);
  }
  const retopologyCheck = await page.evaluate(async () => {
    const node = window.LiteGraph.createNode("Lux3DOpenAPIRetopology");
    if (!node) return null;
    window.comfyAPI.app.app.graph.clear();
    window.comfyAPI.app.app.graph.add(node);
    const fields = Object.fromEntries(node.widgets.map(widget => [widget.name, widget]));
    fields.model_url.value = "lux3d-smoke/split-input.glb";
    fields.face_limit.value = 5000;
    fields.quad.value = true;
    fields.bake_textures.value = true;
    node.onExecuted({lux3d_postprocess:[{
      task_id:"offline-retopology", warnings:["已有几何结果，未生成贴图包"],
      artifacts:[{format:"glb",url:"https://example.com/result.glb"},{format:"obj",url:"https://example.com/result.obj"}],
    }]});
    const prompt = (await window.comfyAPI.app.app.graphToPrompt()).output[String(node.id)];
    const panel = document.querySelector('[aria-label="Lux3D task results"]');
    return {title:node.title, inputs:prompt.inputs, outputs:node.outputs.map(output=>output.name), text:panel?.textContent, links:panel?.querySelectorAll("a").length};
  });
  assert.ok(retopologyCheck,"Installed backend must register Lux3D Retopology");
  assert.equal(retopologyCheck.title,"Lux3D Retopology");
  assert.deepEqual(retopologyCheck.outputs,["task_id","glb","OBJ Untextured","OBJ Textured"]);
  assert.equal(retopologyCheck.inputs.face_limit,5000);
  assert.equal(retopologyCheck.inputs.bake_textures,true);
  assert.equal(retopologyCheck.links,2);
  assert.match(retopologyCheck.text,/已有几何结果，未生成贴图包/);
  assert.match(retopologyCheck.text,/Download OBJ/);
  assert.doesNotMatch(retopologyCheck.text,/Download ZIP/);
  console.log("Installed Retopology node, payload fields, OBJ delivery and texture-warning panel passed without creating a remote task.");
  const candidates=await Promise.all(files.map(async file=>JSON.parse(await readFile(join(workflowDir,file),"utf8"))));
  const workflow=candidates.find(item => item.nodes?.some(node => node.id===1 && node.type==="Lux3DOpenAPIAnimationRetarget"));
  assert.ok(workflow, "Provide a local animation workflow with an animation node at ID 1");
  await page.evaluate(async workflow=>{await window.comfyAPI.app.app.loadGraphData(workflow);},workflow);
  const helper = await page.evaluate(async () => {
    const app=window.comfyAPI.app.app,node=app.graph.getNodeById(1);
    const combo=node.widgets.find(w=>w.name==="Action to add");
    const button=node.widgets.find(w=>w.name==="Add action");
    combo.value="Yes";button.callback();button.callback();
    const prompt=(await app.graphToPrompt()).output["1"].inputs;
    return {catalogCount:combo.options.values.length,ids:JSON.parse(prompt.animation_ids),keys:Object.keys(prompt)};
  });
  assert.equal(helper.catalogCount,85);
  assert.deepEqual(helper.ids,["Walk_Loop","Idle_Loop","Yes"]);
  assert.ok(!helper.keys.includes("Action to add") && !helper.keys.includes("Add action"));
  console.log("Backend-catalog action helper passed; only animation_ids enters prompt.");
  if(process.env.LUX3D_COMFY_PICKER_FIXTURE) {
    const fileChooser=page.waitForEvent("filechooser");
    await page.evaluate(()=>{window.comfyAPI.app.app.graph.getNodeById(1).widgets.find(widget=>widget.name==="Choose local GLB").callback();});
    await (await fileChooser).setFiles(resolve(process.env.LUX3D_COMFY_PICKER_FIXTURE));
    await page.waitForFunction(()=>window.comfyAPI.app.app.graph.getNodeById(1).widgets.find(widget=>widget.name==="model_url").value.startsWith("lux3d/"));
    const selected=await page.evaluate(async()=>{const app=window.comfyAPI.app.app;return (await app.graphToPrompt()).output["1"].inputs.model_url;});
    assert.match(selected,/\.glb$/i);
    console.log("Actual local GLB picker/upload updated prompt:",selected);
  }
  await page.evaluate(()=>{
    const node=window.comfyAPI.app.app.graph.getNodeById(1);
    node.widgets.find(w=>w.name==="animation_ids").value='["Walk_Loop","Idle_Loop"]';
    window.partialResult={task_id:"offline-42",failed_count:1,artifacts:[{format:"glb",url:"https://example.com/result.glb"},{format:"glb",url:"https://example.com/result.glb"}],actions:[{animation_id:"Walk_Loop",status:"success",animationGlbUrl:"https://example.com/result.glb"},{animation_id:"Idle_Loop",status:"failed",error:"<img src=x onerror=alert(1)>"}]};
    node.onExecuted({lux3d_postprocess:[window.partialResult]});
    window.comfyAPI.app.app.canvas.centerOnNode(node);
  });
  await page.getByText("Task offline-42 · 1 action(s) failed",{exact:true}).waitFor();
  assert.equal(await page.getByRole("link",{name:"Download GLB · Walk_Loop",exact:true}).count(),1);
  const panel=page.getByRole("region",{name:"Lux3D task results",exact:true});
  // Vue mounts the element before ComfyUI applies its canvas widget layout.
  await page.waitForFunction(()=>document.querySelector('[aria-label="Lux3D task results"]')?.clientHeight>=180,null,{timeout:10000});
  const partialLayout=await panel.evaluate(element=>{
    const bounds=element.getBoundingClientRect(),last=element.lastElementChild.getBoundingClientRect();
    return {clientHeight:element.clientHeight,visibleHeight:bounds.height,lastVisible:last.bottom<=bounds.bottom && last.top>=bounds.top};
  });
  assert.ok(partialLayout.clientHeight>=180,JSON.stringify(partialLayout));
  assert.equal(partialLayout.lastVisible,true,"Partial failure detail clipped at default size");
  const serialized=await page.evaluate(()=>JSON.stringify(window.comfyAPI.app.app.graph.serialize()));
  assert.ok(!serialized.includes("example.com/result.glb"),"Expiring result link serialized into workflow");
  assert.ok(!serialized.includes("<img src=x"),"Backend result serialized into workflow");
  if(process.env.LUX3D_COMFY_SCREENSHOT) {
    const path=resolve(process.env.LUX3D_COMFY_SCREENSHOT);
    await mkdir(resolve(path,".."),{recursive:true});
    await page.screenshot({path});
  }
  const event = async (name, detail) => page.evaluate(async ({name,detail})=>{
    const {api}=await import("/scripts/api.js");api.dispatchEvent(new CustomEvent(name,{detail}));
  },{name,detail});
  await event("executing",{node:"999"});
  assert.equal(await page.getByText("Task offline-42 · 1 action(s) failed",{exact:true}).count(),1);
  await event("executing",{node:"1"});
  await event("execution_error",{node_id:"1",exception_message:"offline failure",node_type:"Lux3DOpenAPIAnimationRetarget",executed:[],traceback:[],current_inputs:{}});
  await page.getByText("Previous result · Task offline-42 · Latest run failed",{exact:true}).waitFor();
  if(process.env.LUX3D_COMFY_SCREENSHOT) await page.screenshot({path:resolve(process.env.LUX3D_COMFY_SCREENSHOT).replace(/\.png$/,"-failed.png")});
  await page.evaluate(()=>window.comfyAPI.app.app.graph.getNodeById(1).onExecuted({lux3d_postprocess:[window.partialResult]}));
  await event("execution_interrupted",{node_id:"1",node_type:"Lux3DOpenAPIAnimationRetarget",executed:[]});
  await page.getByText("Previous result · Task offline-42 · Latest run cancelled",{exact:true}).waitFor();
  await page.evaluate(()=>{const node=window.comfyAPI.app.app.graph.getNodeById(1);node.onExecuted({lux3d_postprocess:[window.partialResult]});const widget=node.widgets.find(w=>w.name==="model_url"),old=widget.value;widget.value="https://example.com/changed.glb";node.onWidgetChanged(widget.name,widget.value,old,widget);});
  await page.getByText("Previous result · Task offline-42 · Inputs changed",{exact:true}).waitFor();
  await page.evaluate(()=>{
    const node=window.comfyAPI.app.app.graph.getNodeById(1),ids=node.widgets.find(w=>w.name==="Action to add").options.values.slice(0,10);
    const actions=ids.map((id,i)=>({animation_id:id,status:"success",animationGlbUrl:`https://example.com/action-${i}.glb`}));
    node.onExecuted({lux3d_postprocess:[{task_id:"offline-ten",failed_count:0,artifacts:actions.map(a=>({format:"glb",url:a.animationGlbUrl})),actions}]});
  });
  const longLayout=await panel.evaluate(element=>({clientHeight:element.clientHeight,scrollHeight:element.scrollHeight}));
  assert.ok(longLayout.clientHeight>=180 && longLayout.scrollHeight>longLayout.clientHeight,JSON.stringify(longLayout));
  await panel.evaluate(element=>{element.scrollTop=element.scrollHeight;});
  assert.ok(await panel.evaluate(element=>element.scrollTop)>0,"Ten-action result must have usable scrolling");
  if(process.env.LUX3D_COMFY_SCREENSHOT) await page.screenshot({path:resolve(process.env.LUX3D_COMFY_SCREENSHOT).replace(/\.png$/,"-ten.png")});
  console.log("Default-size partial/ten-action layouts and success→failure/cancel/input-change lifecycle passed.");
  assert.deepEqual(errors,[]);
  console.log("Installed ComfyUI frontend checks passed; no remote tasks created.");
} finally {await browser.close();}
