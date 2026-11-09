<div align="center">
  <img src="figures/logo.png" width="420" alt="ComfyUI-Lux3D Nodes" />
</div>

# ComfyUI-Lux3D Nodes

<div align="center">

[English](README.md) / [中文](README_CN.md)

🌐 Official Website: [Lux3D China](https://lux3d.aholo3d.cn/lux3d/home) | [Lux3D Global](https://lux3d.aholo.ai/lux3d/home)
</div>

A ComfyUI extension that turns text descriptions or 2D images into 3D models in your workflow.


## Model postprocessing

Five Lux3D/Postprocess nodes support Mesh Segmentation, Retopology, Articulation, Humanoid Rigging and Humanoid Animation. Retopology accepts a public or local GLB, a required face budget, topology mode and optional texture baking; its fixed outputs are GLB, OBJ and an optional OBJ ZIP.

Humanoid Animation supports separate/combined, GLB/FBX and in-place motion, with visible partial failures and complete actions_json. GLB Viewer provides clip selection. Articulation preserves the actual result format; download ZIP results instead of connecting them to the GLB Viewer.

## Related Projects

For quick trials or conversational Lux3D workflows, install the Skill distribution that matches your service region:

- China: [SkillHub — `@user_97275c6e/lux3d-cn`](https://skillhub.cn/skills/user_97275c6e/lux3d-cn)
- Global: [ClawHub — `@violalulu/lux3d`](https://clawhub.ai/violalulu/skills/lux3d)

The China and Global distributions use different API keys, endpoints, and region settings; do not mix their configuration. Install only one regional distribution per agent or workspace unless the environments are isolated.

## Industry Applications

From gaming to e-commerce, Lux3D powers the next generation of 3D content creation.

### E-Commerce

Create 3D product visualizations for immersive shopping experiences.

- Product configurators
- AR Try-On
- Virtual Showrooms

<table width="100%">
<tr>
<th align="center" width="50%">Input Image</th>
<th align="center" width="50%">Generated Result</th>
</tr>
<tr>
<td align="center" width="50%">
<img src="figures/handbag.jpg" height="200" alt="Input">
</td>
<td align="center" width="50%">
<img src="figures/handbag.gif" height="200" alt="Output">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="figures/chips.jpg" height="200" alt="Input">
</td>
<td align="center" width="50%">
<img src="figures/chips.gif" height="200" alt="Output">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="figures/milk-carton.jpg" height="200" alt="Input">
</td>
<td align="center" width="50%">
<img src="figures/milk-carton-render.png" height="200" alt="Output">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="figures/Lawnmower.jpg" height="200" alt="Input">
</td>
<td align="center" width="50%">
<img src="figures/Lawnmower-output.jpg" height="200" alt="Output">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="figures/Pet-bowl.png" height="200" alt="Input">
</td>
<td align="center" width="50%">
<img src="figures/Pet-bowl-output.jpg" height="200" alt="Output">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="figures/Speaker.png" height="200" alt="Input">
</td>
<td align="center" width="50%">
<img src="figures/Speaker-output.jpg" height="200" alt="Output">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="figures/vase.jpg" height="200" alt="Input">
</td>
<td align="center" width="50%">
<img src="figures/vase-output.jpg" height="200" alt="Output">
</td>
</tr>
</table>

### Game Development

Rapidly prototype and generate assets for your game worlds.

- Props & Environment
- Character Accessories
- Level Design

<table width="100%">
<tr>
<th align="center" width="50%">Input Image</th>
<th align="center" width="50%">Generated Result</th>
</tr>
<tr>
<td align="center" width="50%">
<img src="figures/cartoon-sofa.jpg" height="200" alt="Input">
</td>
<td align="center" width="50%">
<img src="figures/cartoon-sofa.gif" height="200" alt="Output">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="figures/cartoon-boy.jpg" height="200" alt="Input">
</td>
<td align="center" width="50%">
<img src="figures/cartoon-boy.gif" height="200" alt="Output">
</td>
</tr>

<tr>
<td align="center" width="50%">
<img src="figures/axe.jpg" height="200" alt="Input">
</td>
<td align="center" width="50%">
<img src="figures/axe-render.png" height="200" alt="Output">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="figures/toy-gun.jpg" height="200" alt="Input">
</td>
<td align="center" width="50%">
<img src="figures/toy-gun-render.png" height="200" alt="Output">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="figures/box.jpg" height="120" alt="Input">
</td>
<td align="center" width="50%">
<video src="https://github.com/user-attachments/assets/ee0efc54-96e3-4c1b-8da0-8c3264ebf82e" controls width="100%"></video>
</td>
</tr>
</table>

### Industrial Design

Visualize concepts and prototypes with speed and precision.

- Concept Visualization
- Digital Twins
- Rapid Prototyping

<table width="100%">
<tr>
<th align="center" width="50%">Input Images</th>
<th align="center" width="50%">Generated Result</th>
</tr>
<tr>
<td align="center" width="50%">
<img src="figures/industrial1.jpg" height="180" alt="Input 1">
<img src="figures/industrial2.jpg" height="180" alt="Input 2">
<img src="figures/industrial3.jpg" height="180" alt="Input 3">
</td>
<td align="center" width="50%">
<video src="https://github.com/user-attachments/assets/67ed25c7-a843-4484-a509-fbc53fc11630" controls width="100%"></video>
</td>
</tr>
</table>

### Furniture & Interior

Rapidly digitize furniture and create realistic 3D assets for interior planning.

- Furniture Digitization
- Room Planning
- Virtual Staging

<table width="100%">
<tr>
<th align="center" width="50%">Input Image</th>
<th align="center" width="50%">Generated Result</th>
</tr>
<tr>
<td align="center" width="50%">
<img src="figures/leather-sofa.png" height="200" alt="Input">
</td>
<td align="center" width="50%">
<img src="figures/leather-sofa.gif" height="200" alt="Output">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="figures/marble-coffee-table.png" height="200" alt="Input">
</td>
<td align="center" width="50%">
<img src="figures/marble-coffee-table.gif" height="200" alt="Output">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="figures/refrigerator.jpg" height="200" alt="Input">
</td>
<td align="center" width="50%">
<img src="figures/refrigerator-render.png" height="200" alt="Output">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="figures/stainless-steel-table.png" height="200" alt="Input">
</td>
<td align="center" width="50%">
<img src="figures/stainless-steel-table-render.png" height="200" alt="Output">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="figures/furniture.png" height="200" alt="Input">
</td>
<td align="center" width="50%">
<video src="https://github.com/user-attachments/assets/3ca88eb5-5cc3-4952-aedd-74ab8df1fede" controls width="100%"></video>
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="figures/Office-chair.jpg" height="200" alt="Input">
</td>
<td align="center" width="50%">
<video src="https://github.com/user-attachments/assets/7536eb17-c717-4291-b59e-e21d886096a8" controls width="100%"></video>
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="figures/Outdoor-furniture.jpg" height="200" alt="Input">
</td>
<td align="center" width="50%">
<img src="figures/Outdoor-furniture-output.jpg" height="200" alt="Output">
</td>
</tr>
</table>

## Features

### Lux3D Image to 3D

- Provides 1–8 image slots; each accepts a public HTTP(S) URL, an upstream `STRING` URL, or one connected ComfyUI `IMAGE`
- Uploads local `IMAGE` inputs through Asset/OUS before task submission
- Supports `G1` / `G1-Turbo`, target face count, ZIP / GLB / PLY output, PBR, and size prediction
- Polls automatically for up to about 15 minutes
- Returns separate `task_id`, `lux3d_zip`, `glb`, and `ply` outputs

### Lux3D Text to 3D

- Converts a text description into a 3D model
- Accepts an optional public image URL, upstream `STRING` URL, or one ComfyUI `IMAGE` as a reference
- Multiple styles: photorealistic, cartoon, anime, hand-painted, cyberpunk, fantasy, glass
- Shares the version, face-count, output-format, PBR, and size-prediction controls of Image to 3D
- Returns separate `task_id`, `lux3d_zip`, `glb`, and `ply` outputs

### Lux3D Multi-View Generator

- Accepts an optional public image URL, upstream `STRING` URL, or ComfyUI `IMAGE`, plus an optional text prompt; at least one is required
- Supports image-only, text-only, and image-plus-text generation
- Returns `task_id` plus `image_1` through `image_4` in `FRONT_THREE_QUARTER`, `OPPOSITE_THREE_QUARTER`, `SIDE`, and `BACK` order

### Lux3D Single Image Generator

- Generates one new image from an optional public image URL, upstream `STRING` URL, or ComfyUI `IMAGE`, plus an optional multiline prompt; at least one is required
- Supports image-only, text-only, and image-plus-text generation; image-only input is regenerated rather than passed through
- Creates and polls the task internally, then returns `task_id` and `image_url`

### Lux3D Multi-Format Export

- Exports a remote or ComfyUI-local `.glb` / `.zip` model to any combination of USDZ, OBJ ZIP, FBX ZIP, STL, and 3MF
- Uploads local models through Asset/OUS before task submission
- Maps the service's fixed result slots by position instead of guessing formats from filenames
- Uses the backward-compatible output order `task_id`, `glb`, `usdz`, `obj_zip`, `fbx_zip`, `stl`, `3mf`, and `lux3d_zip`

### Lux3D Material Redraw

- Redraws an existing GLB from a public image URL, upstream `STRING` URL, or one ComfyUI `IMAGE`
- Accepts a public GLB URL, upstream `STRING` URL, or ComfyUI-local GLB through `mesh_url`
- Creates and polls a material-redraw task, then returns a new `glb_model_url`

### Lux3D Mesh Segmentation

- Splits one GLB model into multiple parts and returns a reconstructed GLB containing the result
- Accepts a public GLB URL, upstream `STRING` URL, or ComfyUI-local GLB; local models are uploaded first
- Creates and polls the task, then returns `task_id` and `glb`

### Lux3D Retopology

- Rebuilds the topology of a static, non-Draco GLB with quad or triangle topology and a target face count
- Supports optional texture baking and texture size; returns GLB, untextured OBJ, and an optional textured OBJ ZIP
- Resumes an existing task through `resume_task_id` without uploading the model or creating another task

### Lux3D Articulation

- Adds joint motion to model parts from a GLB and a motion prompt
- Accepts a public GLB URL, upstream `STRING` URL, or ComfyUI-local GLB
- Returns `task_id` and `result_url`; the final file can be downloaded from the result panel

### Lux3D Humanoid Rigging

- Automatically rigs a character GLB from a public HTTPS URL, upstream `STRING` URL, or ComfyUI-local GLB
- Creates and polls the rigging task, then returns `task_id` and the rigged `glb`
- Connects to `Lux3D Humanoid Animation` to generate selected motions

### Lux3D Humanoid Animation

- Applies selected motions to a rigged GLB; choose 1–10 distinct, case-sensitive IDs from 85 public actions
- Supports separate files or combined animation clips, GLB / FBX output, and in-place motion
- Returns `task_id`, the first successful `glb` or `fbx`, and `actions_json` with every action's status
- Shows per-action status and download links in the result panel; successful results remain available when some actions fail

### Lux3D Viewer

- Previews remote or local GLB and PLY Gaussian-splat files in the ComfyUI canvas
- Plays GLB animations and supports animation clip selection
- Loads local models through ComfyUI's `/view` route without uploading them to Lux3D
- Returns the resolved `model_url` for downstream nodes

## Installation

### ComfyUI CLI (recommended)

```
comfy node install lux3d
```

### ComfyUI Manager

1. Open ComfyUI.
2. Go to **Manager → Custom Nodes**.
3. Click "**Install via URL**".
4. Enter: https://github.com/manycore-research/ComfyUI-Lux3D.git

### Manual Installation

1. Clone this repository into ComfyUI's `custom_nodes` directory:

   ```
   cd path/to/ComfyUI/custom_nodes
   git clone git@github.com:manycore-research/ComfyUI-Lux3D.git
   ```

2. Install dependencies if needed:

   ```
   pip install -r requirements.txt
   ```

3. Configure the API key in the server environment that starts ComfyUI. Set `LUX3D_API_KEY_CN` for the China service or `LUX3D_API_KEY_INTL` for the international service. If you use only one region, set only its variable.
4. Restart ComfyUI.

🚀 Want a quick preview first? Try the official site: [Lux3D China](https://lux3d.aholo3d.cn/lux3d/home) | [Lux3D Global](https://lux3d.aholo.ai/lux3d/home)

## Usage

### Getting an API key

- China service: [https://labs.aholo3d.cn/api-keys](https://labs.aholo3d.cn/api-keys)
- International service: [https://labs.aholo.ai/api-keys](https://labs.aholo.ai/api-keys)

If you have any questions, contact us at lux3d@qunhemail.com.

### Recommended Basic Workflows

The current release provides twelve nodes, which can be combined as needed.

#### Lux3D Image to 3D

1. Find `Lux3D Image to 3D` under `Lux3D/Generate`.

2. Provide at least one source in `image_1` through `image_8`. Each slot accepts a public HTTP(S) URL, an upstream `STRING` URL, or one `IMAGE`, and the source types may be mixed.

3. (Optional) When you have one reference image and want to complete the remaining views, add `Lux3D Multi-View Generator` between `Load Image` and `Lux3D Image to 3D`, then connect `image_1` through `image_4` to the matching Image to 3D inputs. When you already have multiple views, connect them directly to `image_1` through `image_8` without using Multi-View Generator.

4. Select `base_api_path`, the generation version, face count, and required output formats. Include `glb` when you need an in-canvas preview; Multi-Format Export accepts either the generated `glb` or `lux3d_zip`.

5. Run the workflow.

6. After polling completes, the node returns `task_id`, `lux3d_zip`, `glb`, and `ply`. A format that was not requested or returned is an empty string.

7. (Optional) Connect a non-empty `glb` or `ply` output to `Lux3D Viewer` for in-canvas preview. When you need USDZ, OBJ ZIP, FBX ZIP, or other formats, connect either `glb` or `lux3d_zip` to `Lux3D Multi-Format Export`.

<p align="center">
  <img src="figures/image-to-3d-workflow-en.png" width="900" alt="Lux3D Image to 3D workflow" />
</p>

#### Lux3D Text to 3D

1. Find `Lux3D Text to 3D` under `Lux3D/Generate`.

2. Enter a text prompt describing the object.

3. Optionally enter a public HTTP(S) URL in `reference_image`, connect an upstream `STRING` URL, or connect one reference `IMAGE`.

4. Choose a style from the dropdown:
   - `photorealistic`: Photorealistic (default)
   - `cartoon`: Cartoon
   - `anime`: Anime
   - `hand_painted`: Hand-painted
   - `cyberpunk`: Cyberpunk
   - `fantasy`: Fantasy
   - `glass`: Glass

5. Select `base_api_path`, the generation version, face count, and required output formats. Include `glb` when you need an in-canvas preview; Multi-Format Export accepts either the generated `glb` or `lux3d_zip`.

6. Run the workflow.

7. After polling completes, the node returns `task_id`, `lux3d_zip`, `glb`, and `ply`.

8. (Optional) Connect a non-empty `glb` or `ply` output to `Lux3D Viewer` for in-canvas preview. When you need USDZ, OBJ ZIP, FBX ZIP, or other formats, connect either `glb` or `lux3d_zip` to `Lux3D Multi-Format Export`.

<p align="center">
  <img src="figures/text-to-3d-workflow-en.png" width="900" alt="Lux3D Text to 3D workflow" />
</p>

#### Lux3D Single Image Generator

1. Add `Lux3D Single Image Generator` from `Lux3D/Generate`.

2. Optionally enter a public HTTP(S) URL in `image`, connect an upstream `STRING` URL, or connect one `IMAGE`. Optionally enter a multiline `prompt`. At least one of `image` and `prompt` is required.

3. Select `base_api_path` and run the workflow. The node creates and polls the task internally, then returns `task_id` and `image_url`. Image-only input still produces a newly generated image; the source URL is not passed through as the result.

<p align="center">
  <img src="figures/single-image-to-four-view-workflow-en.png" width="900" alt="Lux3D Single Image Generator to Multi-View Generator workflow" />
</p>

#### Lux3D Multi-View Generator

1. Add `Lux3D Multi-View Generator` from `Lux3D/Generate`.

2. Optionally enter a public HTTP(S) URL in `image`, connect an upstream `STRING` URL, or connect one `IMAGE`. Optionally enter a multiline `prompt`. At least one of `image` and `prompt` is required, so the node supports image-only, text-only, and image-plus-text generation.

3. Select `base_api_path` and run the workflow. The node returns `task_id` and four image URLs in a stable order: `image_1` = `FRONT_THREE_QUARTER`, `image_2` = `OPPOSITE_THREE_QUARTER`, `image_3` = `SIDE`, and `image_4` = `BACK`.

#### Lux3D Multi-Format Export

1. Add `Lux3D Multi-Format Export` from `Lux3D/Export`.

2. Enter a public `.glb` / `.zip` URL in `model_url`, connect an upstream `STRING` URL, or use the node's button to select a ComfyUI-local model.

3. Select the export formats. A GLB input requires at least one explicit format; a ZIP input may use `default`.

4. Run the workflow. The node returns `task_id`, `glb`, `usdz`, `obj_zip`, `fbx_zip`, `stl`, `3mf`, and `lux3d_zip`, in that order. The first five sockets retain their historical positions; unrequested or unavailable results are empty strings.

5. For a ZIP input, `lux3d_zip` returns the source Lux3D ZIP and `glb` returns the default GLB export. For a GLB input, `glb` returns the original model URL and `lux3d_zip` is empty.

#### Lux3D Material Redraw

1. Find the `Lux3D Material Redraw` node under the `Lux3D` category in the ComfyUI node library.

2. Enter a public HTTP(S) URL in `image`, connect an upstream `STRING` URL, or connect one material-reference `IMAGE`.

3. Enter a public GLB URL in `mesh_url`, connect an upstream `STRING` URL, or use the node's button to select a ComfyUI-local GLB.

4. Run the workflow. The node returns a new `glb_model_url` with the redrawn material.

5. The returned model URL can be connected to the `Lux3D Viewer` node for in-canvas preview.

<p align="center">
  <img src="figures/material-redraw-workflow-en.png" width="900" alt="Lux3D Material Redraw workflow" />
</p>

#### Lux3D Mesh Segmentation

1. Add `Lux3D Mesh Segmentation` from `Lux3D/Postprocess`.

2. Enter a public GLB URL in `model_url`, connect the `glb` output of an Image to 3D or Text to 3D node, or use the node's button to select a ComfyUI-local GLB.

3. Select `base_api_path` and run the workflow. Local models are uploaded first. After polling completes, the node returns `task_id` and a `glb` containing the reconstructed parts.

4. Connect `glb` to `Lux3D Viewer` for preview or download it from the result panel. If the account already has a part-splitting task in progress, wait for it to finish before submitting another.

<p align="center">
  <img src="figures/part-split-workflow-en.png" width="1200" alt="Lux3D Mesh Segmentation workflow and result example" />
</p>

#### Lux3D Retopology

1. Add `Lux3D Retopology` from `Lux3D/Postprocess`.

2. Enter a public GLB URL in `model_url`, connect an upstream `glb` output, or select a ComfyUI-local GLB. Input must be static and non-Draco, without bones, skinning, animation, or morph targets.

3. Enter the required `face_limit`, such as `5000`, and use `quad` to choose quad or triangle topology. Enable `bake_textures` and select `texture_size` when texture baking is needed.

4. Select `base_api_path` and run the workflow. The node returns `task_id`, `glb`, `OBJ Untextured`, and `OBJ Textured` (a textured OBJ ZIP). The last output is empty when no texture package is generated; the result panel reports a missing package if baking was requested.

5. Connect `glb` to `Lux3D Viewer` for preview. Download the untextured OBJ and any returned texture ZIP from the result panel. Use OBJ to inspect quad topology; GLB is always triangulated.

6. If polling times out or is interrupted, enter the recorded task ID in `resume_task_id`, keep the original account, `base_api_path`, and `bake_textures` setting, and run again. This only queries the original task; it does not upload the model, create a task, or change the original parameters.

<p align="center">
  <img src="figures/retopology-workflow-en.png" width="1200" alt="Lux3D Retopology workflow with before and after topology comparison" />
</p>

#### Lux3D Articulation

1. Add `Lux3D Articulation` from `Lux3D/Postprocess`.

2. Enter a public GLB URL in `model_url`, connect the `glb` output of a generation or Mesh Segmentation node, or select a ComfyUI-local GLB.

3. Use `prompt` to describe the moving parts, fixed parts, and desired motion, for example: "Keep the base fixed and slowly open and close the lid around its hinge."

4. Select `base_api_path` and run the workflow. The node returns `task_id` and the final file's `result_url`.

5. For a GLB result, connect `result_url` to `Lux3D Viewer` to preview the motion. Download ZIP or other formats from the result panel.

<p align="center">
  <img src="figures/articulation-urdf-workflow-en.png" width="1200" alt="Lux3D Articulation workflow and ZIP output structure" />
</p>

#### Lux3D Humanoid Rigging

1. Add `Lux3D Humanoid Rigging` from `Lux3D/Postprocess`.

2. Enter the character model's public HTTPS GLB URL in `model_url`, connect an upstream `glb` output, or select a ComfyUI-local GLB. Local models are uploaded first.

3. Select `base_api_path` and run the workflow. After polling completes, the node returns `task_id` and the rigged `glb`.

4. Connect `glb` to `Lux3D Viewer` for preview, or to `model_url` on `Lux3D Humanoid Animation` to generate character motions.

#### Lux3D Humanoid Animation

1. Add `Lux3D Humanoid Animation` from `Lux3D/Postprocess`.

2. Connect the `glb` output of `Lux3D Humanoid Rigging` to `model_url`. For an existing rigged model, enter a public HTTPS GLB URL or select a ComfyUI-local GLB.

3. Select an action in `Action to add` and click `Add action`, or enter a JSON array or one action ID per line in `animation_ids`, such as `["Walk_Loop", "Idle_Loop"]`. Choose 1–10 distinct, case-sensitive IDs.

4. Set `output_mode` to `separate` for one file per action or `combined` for one file with independent animation clips. Set `out_format` to `glb` or `fbx`, and enable `animate_in_place` for in-place motion.

5. Select `base_api_path` and run the workflow. The node returns `task_id`, the first successful `glb` or `fbx`, and `actions_json` containing every action's status, result URL, or failure reason. Download other successful results from the result panel.

6. For GLB output, connect `glb` to `Lux3D Viewer` to play the animation; combined output supports clip selection. Download the original FBX file from the result panel and open it in your target 3D application.

<p align="center">
  <img src="figures/humanoid-rigging-retarget-workflow-en.png" width="1200" alt="Lux3D Humanoid Rigging and Animation workflow" />
</p>

#### Lux3D Viewer

1. Add `Lux3D Viewer` from the `Lux3D` category.

2. Connect an upstream `glb` / `ply` URL to `model_url`, enter a public URL manually, or use the node's button to select a ComfyUI-local `.glb` / `.ply` file.

3. Run the workflow to preview the model in the canvas and return the resolved `model_url`. Local models are never uploaded to Lux3D.

4. GLB animations play automatically when present. Use the animation clip dropdown in the preview to switch motions.

## Node Reference

The current release registers twelve nodes. Generation, export, material-redraw, and postprocessing nodes create asynchronous tasks internally and poll until completion, with up to 60 checks at 15-second intervals (about 15 minutes). Retopology only queries an existing task when `resume_task_id` is set.

Common conventions:

- `base_api_path` accepts `https://api.aholo3d.cn` (China) or `https://api.aholo.ai` (international). Do not add a trailing slash.
- Nodes other than `Lux3D Viewer` no longer expose an API-key input. Set `LUX3D_API_KEY_CN` or `LUX3D_API_KEY_INTL` in the ComfyUI server environment to match `base_api_path`.
- Image fields typed as `STRING / IMAGE` accept a public HTTP(S) URL, an upstream `STRING` URL, or a connected ComfyUI `IMAGE` containing exactly one image. Local images are uploaded through Asset/OUS before the Lux3D task is submitted; nodes use the resulting asset URL and do not expose Base64 data URLs.
- Model fields with local-file support provide a picker for the ComfyUI `input` directory and also accept relative files from `output` or `temp` (marked with ` [output]` or ` [temp]`). Local models used by Lux3D tasks are uploaded first.
- The multi-format service returns seven fixed slots in `zipUrl`, `glbUrl`, `usdzUrl`, `objZipUrl`, `fbxZipUrl`, `stlUrl`, `threeMfUrl` order. The plugin maps these slots by position rather than inferring formats from filenames; a format that was not requested or returned is represented by an empty string.
- All five postprocessing nodes use the `Lux3D/Postprocess` category. Their result panels show the task ID, available download links, and warnings or per-action status. GLB can connect to Viewer; use download links for OBJ, ZIP, and FBX.

### Lux3D Viewer

**Category:** `Lux3D`

Previews a GLB model or PLY Gaussian-splat file in the ComfyUI canvas. Remote URLs pass through unchanged. Local files are not uploaded; they are converted to a same-origin ComfyUI `/view` URL.

GLB preview uses the same `model-viewer` 4.2.0 runtime and preset as the Web GLB Viewer: black background, the same HDR environment, exposure `0.95`, `auto` tone mapping, a `30°` field of view, and a `125%` initial camera distance. Shadows and auto-rotation are disabled; orbit, zoom, pan, and model animation remain enabled. Runtime, HDR, and decoders are bundled locally. Restart ComfyUI and refresh the browser after updating the plugin's viewer assets.

#### Inputs

| Input | Type | Description |
| --- | --- | --- |
| model_url | STRING / model source | Public HTTP(S) `.glb` / `.ply` URL, upstream STRING output, or a local `.glb` / `.ply` file in ComfyUI `input`, `output`, or `temp` |
| base_api_path | STRING | Validates the region endpoint and accepts only the two supported API URLs; previewing does not call the Lux3D API |

#### Outputs

| Output | Type | Description |
| --- | --- | --- |
| model_url | STRING | Resolved model URL for downstream nodes; remote input is unchanged and local input becomes a ComfyUI `/view` URL |

### Lux3D Image to 3D

**Category:** `Lux3D/Generate`

Creates an image-to-3D task from 1–8 images. Public URLs, upstream `STRING` URLs, and local `IMAGE` inputs can be mixed across the slots.

#### Inputs

| Input | Type | Description |
| --- | --- | --- |
| base_api_path | STRING | Lux3D API endpoint: `https://api.aholo3d.cn` (China) or `https://api.aholo.ai` (international) |
| image_1 … image_8 | STRING / IMAGE | Each slot may be empty, a public HTTP(S) image URL, an upstream `STRING` URL, or one connected `IMAGE`; at least one of the eight slots is required |
| version | Enum | `G1` / `G1-Turbo`; defaults to `G1-Turbo` |
| face_count | INT | Target face count; defaults to `200000`. `0` omits the field; a nonzero value must be `10000`–`300000` |
| output_format | Enum | `default`, `zip`, `glb`, `ply`, `zip,glb`, `zip,ply`, `glb,ply`, or `zip,glb,ply`; `default` omits the field. `G1` always returns ZIP + GLB and can additionally return PLY; `G1-Turbo` follows the selected combination |
| enable_pbr | Enum | `default` / `true` / `false`; supported only by `G1-Turbo` and not applicable to a PLY-only request |
| ai_predict_size | Enum | `default` / `true` / `false`; enables size prediction |

#### Outputs

| Output | Type | Description |
| --- | --- | --- |
| task_id | STRING | Lux3D task ID |
| lux3d_zip | STRING | Lux3D ZIP result URL |
| glb | STRING | GLB model URL |
| ply | STRING | PLY Gaussian-splat result URL |

### Lux3D Text to 3D

**Category:** `Lux3D/Generate`

Creates a text-to-3D task from a prompt and one optional reference image.

#### Inputs

| Input | Type | Description |
| --- | --- | --- |
| base_api_path | STRING | Lux3D API endpoint: `https://api.aholo3d.cn` (China) or `https://api.aholo.ai` (international) |
| prompt | STRING | Non-empty text describing the object to generate |
| style | Enum | `photorealistic` (default), `cartoon`, `anime`, `hand_painted`, `cyberpunk`, `fantasy`, or `glass` |
| reference_image | STRING / IMAGE | Optional public HTTP(S) reference-image URL, upstream `STRING` URL, or one local `IMAGE` |
| version | Enum | `G1` / `G1-Turbo`; defaults to `G1-Turbo` |
| face_count | INT | Target face count; defaults to `200000`. `0` omits the field; a nonzero value must be `10000`–`300000` |
| output_format | Enum | The same ZIP / GLB / PLY choices as `Lux3D Image to 3D` |
| enable_pbr | Enum | `default` / `true` / `false`; supported only by `G1-Turbo` and not applicable to a PLY-only request |
| ai_predict_size | Enum | `default` / `true` / `false`; enables size prediction |

#### Outputs

| Output | Type | Description |
| --- | --- | --- |
| task_id | STRING | Lux3D task ID |
| lux3d_zip | STRING | Lux3D ZIP result URL |
| glb | STRING | GLB model URL |
| ply | STRING | PLY Gaussian-splat result URL |

### Lux3D Multi-View Generator

**Category:** `Lux3D/Generate`

Generates four multi-view images from an optional object image and/or a text prompt. Image-only, text-only, and image-plus-text requests are supported.

#### Inputs

| Input | Type | Description |
| --- | --- | --- |
| base_api_path | STRING | Lux3D API endpoint: `https://api.aholo3d.cn` (China) or `https://api.aholo.ai` (international) |
| image | STRING / IMAGE | Optional public HTTP(S) image URL, upstream `STRING` URL, or one local `IMAGE`; local input is uploaded through Asset/OUS |
| prompt | STRING | Optional multiline generation prompt; at least one of `image` and `prompt` is required |

#### Outputs

| Output | Type | Description |
| --- | --- | --- |
| task_id | STRING | Lux3D task ID |
| image_1 | STRING | `FRONT_THREE_QUARTER` image URL |
| image_2 | STRING | `OPPOSITE_THREE_QUARTER` image URL |
| image_3 | STRING | `SIDE` image URL |
| image_4 | STRING | `BACK` image URL |

### Lux3D Single Image Generator

**Registered node key:** `Lux3DOpenAPISingleImageGenerator`

**Category:** `Lux3D/Generate`

Generates one new image from an optional image and/or a text prompt. It creates and polls the OpenAPI task internally. Image-only input is regenerated rather than returned unchanged.

#### Inputs

| Input | Type | Description |
| --- | --- | --- |
| base_api_path | STRING | Lux3D API endpoint: `https://api.aholo3d.cn` (China) or `https://api.aholo.ai` (international) |
| image | STRING / IMAGE | Optional public HTTP(S) image URL, upstream `STRING` URL, or one local `IMAGE`; local input is uploaded through Asset/OUS |
| prompt | STRING | Optional multiline generation prompt; at least one of `image` and `prompt` is required |

#### Outputs

| Output | Type | Description |
| --- | --- | --- |
| task_id | STRING | Lux3D task ID |
| image_url | STRING | URL of the newly generated image; never a Base64 data URL |

### Lux3D Multi-Format Export

**Category:** `Lux3D/Export`

Exports a remote or ComfyUI-local GLB / Lux3D ZIP model to one or more target formats. Local files are uploaded to Lux3D first. A ZIP input returns the source ZIP through `lux3d_zip` and its default GLB export through `glb`. A GLB input returns the original model URL through `glb`, requires at least one explicit target format, and leaves `lux3d_zip` empty.

#### Inputs

| Input | Type | Description |
| --- | --- | --- |
| base_api_path | STRING | Lux3D API endpoint: `https://api.aholo3d.cn` (China) or `https://api.aholo.ai` (international) |
| model_url | STRING / model source | Public HTTP(S) `.glb` / `.zip` URL, upstream STRING output, or a local ComfyUI `.glb` / `.zip` file |
| output_format | Enum | `default`; any one of `usdz`, `obj_zip`, `fbx_zip`, `stl`, or `3mf`; or any non-duplicate combination of those five formats. A GLB input requires at least one explicit export format, so `default` applies only to ZIP input |

#### Outputs

| Output | Type | Description |
| --- | --- | --- |
| task_id | STRING | Lux3D task ID |
| glb | STRING | Default GLB export for ZIP input; original model URL for GLB input |
| usdz | STRING | USDZ file URL |
| obj_zip | STRING | OBJ ZIP file URL |
| fbx_zip | STRING | FBX ZIP file URL |
| stl | STRING | STL file URL |
| 3mf | STRING | 3MF file URL |
| lux3d_zip | STRING | Source Lux3D ZIP URL for ZIP input; empty for GLB input |

The output socket order is `task_id`, `glb`, `usdz`, `obj_zip`, `fbx_zip`, `stl`, `3mf`, `lux3d_zip`; the first five positions are unchanged for compatibility with existing workflows. The service response itself has seven fixed positions—`zipUrl`, `glbUrl`, `usdzUrl`, `objZipUrl`, `fbxZipUrl`, `stlUrl`, and `threeMfUrl`—which the plugin maps directly without relying on URL filenames or extensions.

### Lux3D Material Redraw

**Category:** `Lux3D`

Redraws the material of an existing GLB from one reference image using the fixed `v3.0-standard` version. A connected local image and a selected local GLB are uploaded before task submission.

#### Inputs

| Input | Type | Description |
| --- | --- | --- |
| image | STRING / IMAGE | Required public HTTP(S) reference-image URL, upstream `STRING` URL, or one local `IMAGE` |
| mesh_url | STRING / model source | Public HTTP(S) `.glb` URL, upstream STRING output, or a local ComfyUI `.glb` file |
| base_api_path | STRING | Lux3D API endpoint: `https://api.aholo3d.cn` (China) or `https://api.aholo.ai` (international) |

#### Outputs

| Output | Type | Description |
| --- | --- | --- |
| glb_model_url | STRING | Download URL for the model with the redrawn material |

### Lux3D Mesh Segmentation

**Category:** `Lux3D/Postprocess`

Splits one GLB model into multiple parts and returns a single reconstructed GLB containing the result. Local GLBs are uploaded to Lux3D first. If the account already has a part-splitting task in progress, wait for it to finish before submitting another.

#### Inputs

| Input | Type | Description |
| --- | --- | --- |
| base_api_path | STRING | Lux3D API endpoint: `https://api.aholo3d.cn` (China) or `https://api.aholo.ai` (international) |
| model_url | STRING / model source | Public HTTP(S) `.glb` URL, upstream STRING output, or a local ComfyUI `.glb` file |

#### Outputs

| Output | Type | Description |
| --- | --- | --- |
| task_id | STRING | Lux3D task ID |
| glb | STRING | Reconstructed GLB URL containing the split parts; connects to Viewer or downstream model-processing nodes |

### Lux3D Retopology

**Category:** `Lux3D/Postprocess`

Rebuilds the topology of a static, non-Draco GLB. Bones, skinning, animation, and morph targets are unsupported, and original part boundaries may not be preserved. The target face count is a budget rather than a guarantee of an exact count or all-quad topology. OBJ is the topology geometry result; GLB is always triangulated.

#### Inputs

| Input | Type | Description |
| --- | --- | --- |
| base_api_path | STRING | Lux3D API endpoint: `https://api.aholo3d.cn` (China) or `https://api.aholo.ai` (international) |
| model_url | STRING / model source | Public HTTP(S) static `.glb` URL, upstream STRING output, or a local ComfyUI `.glb` file |
| face_limit | INT | Required face budget: `1000`–`500000` for quads or `2000`–`1000000` for triangles. The default `0` means not set and cannot be used to create a task |
| quad | BOOLEAN | Uses quad topology when `true` (default), or triangle topology when `false` |
| bake_textures | BOOLEAN | Enables texture baking; defaults to `false`. Keep the original request's setting when resuming so a missing texture package is reported correctly |
| texture_size | Enum | `512`, `1024`, `2048`, or `4096`; defaults to `2048`. A valid value is required even when baking is disabled |
| content_id | STRING | Optional business correlation value; defaults to an empty string and is not an idempotency key |
| resume_task_id | STRING | Optional existing task ID; queries using the original account and region without uploading a model, creating a task, or changing the original parameters |

#### Outputs

| Output | Type | Description |
| --- | --- | --- |
| task_id | STRING | Lux3D task ID |
| glb | STRING | Retopologized GLB URL for Viewer; includes textures when baking succeeds |
| OBJ Untextured | STRING | Standalone OBJ geometry URL preserving the topology generated by the service |
| OBJ Textured | STRING | ZIP URL containing OBJ, MTL, and textures; empty when no texture package is generated |

Output positions remain fixed when the texture package is missing. The result panel shows only non-empty download links. If baking was requested but no ZIP was generated, it reports that geometry results are available but the texture package is missing; GLB and OBJ remain usable. Resume a timed-out or interrupted query with its recorded task ID. If task creation has an unknown outcome, check task history before submitting again.

### Lux3D Articulation

**Category:** `Lux3D/Postprocess`

Adds joint motion to model parts from a GLB and a motion prompt. The final file format follows the actual service result. For a GLB result, connect `result_url` to Viewer; download ZIP or other formats from the result panel.

#### Inputs

| Input | Type | Description |
| --- | --- | --- |
| base_api_path | STRING | Lux3D API endpoint: `https://api.aholo3d.cn` (China) or `https://api.aholo.ai` (international) |
| model_url | STRING / model source | Public HTTP(S) `.glb` URL, upstream STRING output, or a local ComfyUI `.glb` file |
| prompt | STRING | Required, non-empty motion prompt describing moving parts, fixed parts, and the desired joint motion |

#### Outputs

| Output | Type | Description |
| --- | --- | --- |
| task_id | STRING | Lux3D task ID |
| result_url | STRING | Download URL of the single final file |

### Lux3D Humanoid Rigging

**Category:** `Lux3D/Postprocess`

Automatically rigs a character GLB. Public model URLs must use HTTPS; local GLBs are uploaded first. The resulting rigged GLB can connect to Humanoid Animation.

#### Inputs

| Input | Type | Description |
| --- | --- | --- |
| base_api_path | STRING | Lux3D API endpoint: `https://api.aholo3d.cn` (China) or `https://api.aholo.ai` (international) |
| model_url | STRING / model source | Public HTTPS character `.glb` URL, upstream STRING output, or a local ComfyUI character `.glb` file |

#### Outputs

| Output | Type | Description |
| --- | --- | --- |
| task_id | STRING | Lux3D task ID |
| glb | STRING | Rigged GLB URL; connects to Viewer or `model_url` on `Lux3D Humanoid Animation` |

### Lux3D Humanoid Animation

**Category:** `Lux3D/Postprocess`

Applies selected motions to a rigged GLB. Public model URLs must use HTTPS; local GLBs are uploaded first. The catalogue contains 85 public IDs, with 1–10 distinct actions per task, separate or combined output, and in-place motion support.

#### Inputs

| Input | Type | Description |
| --- | --- | --- |
| base_api_path | STRING | Lux3D API endpoint: `https://api.aholo3d.cn` (China) or `https://api.aholo.ai` (international) |
| model_url | STRING / model source | Public HTTPS rigged `.glb` URL, a rigging node's `glb` output, or a local ComfyUI rigged `.glb` file |
| animation_ids | STRING | 1–10 distinct, case-sensitive public action IDs as a JSON array or one ID per line. Defaults to `["Walk_Loop"]`; actions can also be added with the selection button |
| output_mode | Enum | `separate` (default) returns one file per action; `combined` returns one file with independent animation clips |
| out_format | Enum | `glb` (default) or `fbx`; FBX is the original file, not a ZIP |
| animate_in_place | BOOLEAN | Enables in-place motion; defaults to `false` |

#### Outputs

| Output | Type | Description |
| --- | --- | --- |
| task_id | STRING | Lux3D task ID |
| glb | STRING | First successful result URL in GLB mode; empty in FBX mode |
| fbx | STRING | First successful result URL in FBX mode; empty in GLB mode |
| actions_json | STRING | JSON string containing an `actions` array in request order, with each action's ID, status, success URL, or failure reason |

The result panel provides download links for every successful file and per-action status. Successful results remain usable when some actions fail; the node raises an error if all actions fail. GLB animations play in Viewer, with clip selection for combined output. Download FBX files and open them in your target 3D application.

## FAQ

1. If the ComfyUI Manager shows a security-level warning when installing this plugin, adjust the corresponding security level in the ComfyUI Manager config and retry.

## Development

### Project Structure

```text
comfyui-lux3d/
├── __init__.py               # Registers the current twelve nodes and frontend directory
├── lux3d_openapi/            # OpenAPI client, contracts, polling, and ten task nodes
├── lux3d_material.py         # Lux3D Material Redraw node
├── lux3d_viewer.py           # Lux3D Viewer node
├── viewer_asset_routes.py    # Viewer static-asset routes
├── viewer_assets/            # Viewer runtime assets shipped with the plugin
├── frontend/                 # Viewer/input-source extension source and tests
├── js/                       # Frontend build loaded by ComfyUI
├── tests/                    # Python tests
├── requirements.txt          # Python runtime dependencies
├── README.md                 # English documentation
└── README_CN.md              # Chinese documentation
```

### Dependencies

| Dependency | Version | Purpose | License |
| --- | --- | --- | --- |
| requests | >=2.25.0 | HTTP client for API calls | Apache 2.0 |
| Pillow | >=9.0.0 | Image processing | BSD |
| NumPy | >=1.21.0 | Scientific computing | BSD |

## Configuration

### Server environment variables

The currently registered nodes do not read `config.txt` or expose an API-key input in the workflow. Set the variable matching `base_api_path` in the environment of the process that starts ComfyUI:

| `base_api_path` | Environment variable |
| --- | --- |
| `https://api.aholo3d.cn` | `LUX3D_API_KEY_CN` |
| `https://api.aholo.ai` | `LUX3D_API_KEY_INTL` |

Existing workflows that explicitly store `https://api.aholo3d.com` continue to use that origin for upload credentials, generation, and task queries, with `LUX3D_API_KEY_INTL`. Updating the extension does not rewrite saved workflow addresses. To migrate, change each affected node's `base_api_path` to `https://api.aholo.ai` and save the workflow. The client adds `/global`; do not enter it in the field. Legacy API availability and its compatibility period depend on the gateway operator; accepting the old address does not guarantee it will remain available.

PowerShell example:

```powershell
$env:LUX3D_API_KEY_CN = "your_cn_api_key"
$env:LUX3D_API_KEY_INTL = "your_intl_api_key"
```

Bash example:

```bash
export LUX3D_API_KEY_CN="your_cn_api_key"
export LUX3D_API_KEY_INTL="your_intl_api_key"
```

If you use only one region, set only its variable. The variables must be visible to the ComfyUI server process; restart ComfyUI after changing them. `Lux3D Viewer` does not call the Lux3D API and therefore needs no API key.

## License

[MIT](LICENSE)
