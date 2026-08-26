<div align="center">
  <img src="assets/logo.png" width="420" alt="ComfyUI-Lux3D Nodes" />
</div>

# ComfyUI-Lux3D Nodes

<div align="center">

[English](README.md) / [中文](README_CN.md)

🌐 Official Website: [Lux3D China](https://www.luxreal.com/lux3d/home) | [Lux3D Global](https://www.luxreal.ai/lux3d/home)
</div>

A ComfyUI extension that turns text descriptions or 2D images into 3D models in your workflow.

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
<img src="assets/handbag.jpg" height="200" alt="Input">
</td>
<td align="center" width="50%">
<img src="assets/handbag.gif" height="200" alt="Output">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="assets/chips.jpg" height="200" alt="Input">
</td>
<td align="center" width="50%">
<img src="assets/chips.gif" height="200" alt="Output">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="assets/milk-carton.jpg" height="200" alt="Input">
</td>
<td align="center" width="50%">
<img src="assets/milk-carton-render.png" height="200" alt="Output">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="assets/Lawnmower.jpg" height="200" alt="Input">
</td>
<td align="center" width="50%">
<img src="assets/Lawnmower-output.jpg" height="200" alt="Output">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="assets/Pet-bowl.png" height="200" alt="Input">
</td>
<td align="center" width="50%">
<img src="assets/Pet-bowl-output.jpg" height="200" alt="Output">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="assets/Speaker.png" height="200" alt="Input">
</td>
<td align="center" width="50%">
<img src="assets/Speaker-output.jpg" height="200" alt="Output">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="assets/vase.jpg" height="200" alt="Input">
</td>
<td align="center" width="50%">
<img src="assets/vase-output.jpg" height="200" alt="Output">
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
<img src="assets/cartoon-sofa.jpg" height="200" alt="Input">
</td>
<td align="center" width="50%">
<img src="assets/cartoon-sofa.gif" height="200" alt="Output">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="assets/cartoon-boy.jpg" height="200" alt="Input">
</td>
<td align="center" width="50%">
<img src="assets/cartoon-boy.gif" height="200" alt="Output">
</td>
</tr>

<tr>
<td align="center" width="50%">
<img src="assets/axe.jpg" height="200" alt="Input">
</td>
<td align="center" width="50%">
<img src="assets/axe-render.png" height="200" alt="Output">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="assets/toy-gun.jpg" height="200" alt="Input">
</td>
<td align="center" width="50%">
<img src="assets/toy-gun-render.png" height="200" alt="Output">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="assets/box.jpg" height="120" alt="Input">
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
<img src="assets/industrial1.jpg" height="180" alt="Input 1">
<img src="assets/industrial2.jpg" height="180" alt="Input 2">
<img src="assets/industrial3.jpg" height="180" alt="Input 3">
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
<img src="assets/leather-sofa.png" height="200" alt="Input">
</td>
<td align="center" width="50%">
<img src="assets/leather-sofa.gif" height="200" alt="Output">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="assets/marble-coffee-table.png" height="200" alt="Input">
</td>
<td align="center" width="50%">
<img src="assets/marble-coffee-table.gif" height="200" alt="Output">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="assets/refrigerator.jpg" height="200" alt="Input">
</td>
<td align="center" width="50%">
<img src="assets/refrigerator-render.png" height="200" alt="Output">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="assets/stainless-steel-table.png" height="200" alt="Input">
</td>
<td align="center" width="50%">
<img src="assets/stainless-steel-table-render.png" height="200" alt="Output">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="assets/furniture.png" height="200" alt="Input">
</td>
<td align="center" width="50%">
<video src="https://github.com/user-attachments/assets/3ca88eb5-5cc3-4952-aedd-74ab8df1fede" controls width="100%"></video>
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="assets/Office-chair.jpg" height="200" alt="Input">
</td>
<td align="center" width="50%">
<video src="https://github.com/user-attachments/assets/7536eb17-c717-4291-b59e-e21d886096a8" controls width="100%"></video>
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="assets/Outdoor-furniture.jpg" height="200" alt="Input">
</td>
<td align="center" width="50%">
<img src="assets/Outdoor-furniture-output.jpg" height="200" alt="Output">
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

- Generates four multi-view images from one public image URL, upstream `STRING` URL, or ComfyUI `IMAGE`
- Returns `task_id` plus four URL outputs named `image_1` through `image_4`

### Lux3D Multi-Format Export

- Exports a remote or ComfyUI-local `.glb` / `.zip` model to USDZ, OBJ ZIP, and FBX ZIP
- Uploads local models through Asset/OUS before task submission
- Uses stable `task_id`, `glb`, `usdz`, `obj_zip`, and `fbx_zip` output sockets

### Lux3D Material Redraw

- Redraws an existing GLB from a public image URL, upstream `STRING` URL, or one ComfyUI `IMAGE`
- Accepts a public GLB URL, upstream `STRING` URL, or ComfyUI-local GLB through `mesh_url`
- Creates and polls a material-redraw task, then returns a new `glb_model_url`

### Lux3D Viewer

- Previews remote or local GLB and PLY Gaussian-splat files in the ComfyUI canvas
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

🚀 Want a quick preview first? Try the official site: [Lux3D China](https://www.luxreal.com/lux3d/home) | [Lux3D Global](https://www.luxreal.ai/lux3d/home)

## Usage

### Getting an API key

- China service: [https://labs.aholo3d.cn/api-keys](https://labs.aholo3d.cn/api-keys)
- International service: [https://labs.aholo3d.com/api-keys](https://labs.aholo3d.com/api-keys)

If you have any questions, contact us at lux3d@qunhemail.com.

### Recommended Basic Workflows

The current release provides six nodes, which can be combined as needed.

#### Lux3D Image to 3D

1. Find `Lux3D Image to 3D` under `Lux3D/Generate`, or double-click an empty area to search and add it.

2. Provide at least one source in `image_1` through `image_8`. Each slot accepts a public HTTP(S) URL, an upstream `STRING` URL, or one `IMAGE`, and the source types may be mixed.

3. Select `base_api_path`, the generation version, face count, and required output formats, then run the workflow.

4. After polling completes, the node returns `task_id`, `lux3d_zip`, `glb`, and `ply`. A format that was not requested or returned is an empty string.

5. Connect a non-empty `glb` or `ply` output to `Lux3D Viewer` for in-canvas preview. ZIP output cannot be previewed directly.

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

5. Select `base_api_path`, the generation version, face count, and required output formats, then run the workflow.

6. After polling completes, the node returns `task_id`, `lux3d_zip`, `glb`, and `ply`.

7. Connect a non-empty `glb` or `ply` output to `Lux3D Viewer` for in-canvas preview.

#### Lux3D Multi-View Generator

1. Add `Lux3D Multi-View Generator` from `Lux3D/Generate`.

2. Enter a public HTTP(S) URL in `image`, connect an upstream `STRING` URL, or connect one `IMAGE`.

3. Select `base_api_path` and run the workflow. The node returns `task_id` and four image URLs named `image_1` through `image_4`.

#### Lux3D Multi-Format Export

1. Add `Lux3D Multi-Format Export` from `Lux3D/Export`.

2. Enter a public `.glb` / `.zip` URL in `model_url`, connect an upstream `STRING` URL, or use the node's button to select a ComfyUI-local model.

3. Select the export formats. A GLB input requires at least one explicit format; a ZIP input may use `default`.

4. Run the workflow. The node returns stable `task_id`, `glb`, `usdz`, `obj_zip`, and `fbx_zip` output sockets.

#### Lux3D Material Redraw

1. Find the `Lux3D Material Redraw` node under the `Lux3D` category in the ComfyUI node library.

2. Enter a public HTTP(S) URL in `image`, connect an upstream `STRING` URL, or connect one material-reference `IMAGE`.

3. Enter a public GLB URL in `mesh_url`, connect an upstream `STRING` URL, or use the node's button to select a ComfyUI-local GLB.

4. Run the workflow. The node returns a new `glb_model_url` with the redrawn material.

5. The returned model URL can be connected to the `Lux3D Viewer` node for in-canvas preview.

#### Lux3D Viewer

1. Add `Lux3D Viewer` from the `Lux3D` category.

2. Connect an upstream `glb` / `ply` URL to `model_url`, enter a public URL manually, or use the node's button to select a ComfyUI-local `.glb` / `.ply` file.

3. Run the workflow to preview the model in the canvas and return the resolved `model_url`. Local models are never uploaded to Lux3D.

## Node Reference

The current release registers six nodes. Generation, export, and material-redraw nodes create asynchronous tasks internally and poll until completion, with up to 60 checks at 15-second intervals (about 15 minutes).

Common conventions:

- `base_api_path` accepts only `https://api.aholo3d.cn` (China) or `https://api.aholo3d.com` (international). The China endpoint is the default; do not add a trailing slash.
- Nodes other than `Lux3D Viewer` no longer expose an API-key input. Set `LUX3D_API_KEY_CN` or `LUX3D_API_KEY_INTL` in the ComfyUI server environment to match `base_api_path`.
- Image fields typed as `STRING / IMAGE` accept a public HTTP(S) URL, an upstream `STRING` URL, or a connected ComfyUI `IMAGE` containing exactly one image. Local images are uploaded before the Lux3D task is submitted.
- Model fields with local-file support provide a picker for the ComfyUI `input` directory and also accept relative files from `output` or `temp` (marked with ` [output]` or ` [temp]`). Local models used by Lux3D tasks are uploaded first.
- Multi-format results use stable output sockets. A format that was not requested or returned is represented by an empty string.

### Lux3D Viewer

**Category:** `Lux3D`

Previews a GLB model or PLY Gaussian-splat file in the ComfyUI canvas. Remote URLs pass through unchanged. Local files are not uploaded; they are converted to a same-origin ComfyUI `/view` URL.

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
| base_api_path | STRING | Lux3D API endpoint; defaults to `https://api.aholo3d.cn` |
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
| base_api_path | STRING | Lux3D API endpoint; defaults to `https://api.aholo3d.cn` |
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

Generates four multi-view images from a single object image.

#### Inputs

| Input | Type | Description |
| --- | --- | --- |
| base_api_path | STRING | Lux3D API endpoint; defaults to `https://api.aholo3d.cn` |
| image | STRING / IMAGE | Required public HTTP(S) image URL, upstream `STRING` URL, or one local `IMAGE` |

#### Outputs

| Output | Type | Description |
| --- | --- | --- |
| task_id | STRING | Lux3D task ID |
| image_1 | STRING | URL of the first multi-view image |
| image_2 | STRING | URL of the second multi-view image |
| image_3 | STRING | URL of the third multi-view image |
| image_4 | STRING | URL of the fourth multi-view image |

### Lux3D Multi-Format Export

**Category:** `Lux3D/Export`

Exports a remote or ComfyUI-local GLB / Lux3D ZIP model to one or more target formats. Local files are uploaded to Lux3D first.

#### Inputs

| Input | Type | Description |
| --- | --- | --- |
| base_api_path | STRING | Lux3D API endpoint; defaults to `https://api.aholo3d.cn` |
| model_url | STRING / model source | Public HTTP(S) `.glb` / `.zip` URL, upstream STRING output, or a local ComfyUI `.glb` / `.zip` file |
| output_format | Enum | `default`, `usdz`, `obj_zip`, `fbx_zip`, and every non-duplicate combination; a GLB input requires at least one explicit export format, so `default` applies only to ZIP input |

#### Outputs

| Output | Type | Description |
| --- | --- | --- |
| task_id | STRING | Lux3D task ID |
| glb | STRING | GLB model URL, when returned by the service |
| usdz | STRING | USDZ file URL |
| obj_zip | STRING | OBJ ZIP file URL |
| fbx_zip | STRING | FBX ZIP file URL |

### Lux3D Material Redraw

**Category:** `Lux3D`

Redraws the material of an existing GLB from one reference image using the fixed `v3.0-standard` version. A connected local image and a selected local GLB are uploaded before task submission.

#### Inputs

| Input | Type | Description |
| --- | --- | --- |
| image | STRING / IMAGE | Required public HTTP(S) reference-image URL, upstream `STRING` URL, or one local `IMAGE` |
| mesh_url | STRING / model source | Public HTTP(S) `.glb` URL, upstream STRING output, or a local ComfyUI `.glb` file |
| base_api_path | STRING | Lux3D API endpoint; defaults to `https://api.aholo3d.cn` |

#### Outputs

| Output | Type | Description |
| --- | --- | --- |
| glb_model_url | STRING | Download URL for the model with the redrawn material |

## FAQ

1. If the ComfyUI Manager shows a security-level warning when installing this plugin, adjust the corresponding security level in the ComfyUI Manager config and retry.

## Development

### Project Structure

```text
comfyui-lux3d/
├── __init__.py               # Registers the current six nodes and frontend directory
├── lux3d_openapi/            # OpenAPI client, contracts, polling, and four task nodes
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
| `https://api.aholo3d.com` | `LUX3D_API_KEY_INTL` |

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
