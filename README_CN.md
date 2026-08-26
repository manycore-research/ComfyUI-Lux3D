<div align="center">
  <img src="assets/logo.png" width="420" alt="ComfyUI-Lux3D Nodes" />
</div>

# ComfyUI-Lux3D Nodes

<div align="center">

[中文](README_CN.md)/[English](README.md)

🌐 官方网站：[Lux3D 国内站](https://www.luxreal.com/lux3d/home) | [Lux3D 国际站](https://www.luxreal.ai/lux3d/home)
</div>

一个ComfyUI插件，用于在你的工作流中将文本描述或2D图片转换为3D模型。

## 相关项目

如果你希望通过自然语言快速试用 Lux3D 或构建对话式工作流，可以根据使用区域安装对应的 Skill：

- 国内版：[SkillHub：`@user_97275c6e/lux3d-cn`](https://skillhub.cn/skills/user_97275c6e/lux3d-cn)
- 国际版：[ClawHub：`@violalulu/lux3d`](https://clawhub.ai/violalulu/skills/lux3d)

国内版和国际版使用不同的 API Key、接口地址及区域配置，请勿交叉使用。同一个 Agent 或工作区建议只安装一个区域版本；如需同时安装，请先隔离 Agent 或工作区。

## 行业应用

从游戏开发到电子商务，Lux3D 全面驱动下一代 3D 内容创作。

### 电商

为沉浸式购物体验打造高品质的 3D 产品可视化。

- 产品配置器
- AR 试穿
- 虚拟展厅

<table width="100%">
<tr>
<th align="center" width="50%">输入图</th>
<th align="center" width="50%">生成结果</th>
</tr>
<tr>
<td align="center" width="50%">
<img src="assets/handbag.jpg" height="200" alt="皮包输入图">
</td>
<td align="center" width="50%">
<img src="assets/handbag.gif" height="200" alt="皮包生成结果">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="assets/chips.jpg" height="200" alt="薯片输入图">
</td>
<td align="center" width="50%">
<img src="assets/chips.gif" height="200" alt="薯片生成结果">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="assets/milk-carton.jpg" height="200" alt="牛奶盒输入图">
</td>
<td align="center" width="50%">
<img src="assets/milk-carton-render.png" height="200" alt="牛奶盒生成结果">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="assets/Lawnmower.jpg" height="200" alt="输入图">
</td>
<td align="center" width="50%">
<img src="assets/Lawnmower-output.jpg" height="200" alt="生成结果">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="assets/Pet-bowl.png" height="200" alt="输入图">
</td>
<td align="center" width="50%">
<img src="assets/Pet-bowl-output.jpg" height="200" alt="生成结果">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="assets/Speaker.png" height="200" alt="输入图">
</td>
<td align="center" width="50%">
<img src="assets/Speaker-output.jpg" height="200" alt="生成结果">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="assets/vase.jpg" height="200" alt="输入图">
</td>
<td align="center" width="50%">
<img src="assets/vase-output.jpg" height="200" alt="生成结果">
</td>
</tr>
</table>

### 游戏开发

为游戏世界快速构建原型并高效生成高质量资产。

- 道具与环境
- 角色配饰
- 关卡设计

<table width="100%">
<tr>
<th align="center" width="50%">输入图</th>
<th align="center" width="50%">生成结果</th>
</tr>
<tr>
<td align="center" width="50%">
<img src="assets/cartoon-sofa.jpg" height="200" alt="卡通沙发输入图">
</td>
<td align="center" width="50%">
<img src="assets/cartoon-sofa.gif" height="200" alt="卡通沙发生成结果">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="assets/cartoon-boy.jpg" height="200" alt="卡通男孩输入图">
</td>
<td align="center" width="50%">
<img src="assets/cartoon-boy.gif" height="200" alt="卡通男孩生成结果">
</td>
</tr>

<tr>
<td align="center" width="50%">
<img src="assets/axe.jpg" height="200" alt="斧头输入图">
</td>
<td align="center" width="50%">
<img src="assets/axe-render.png" height="200" alt="斧头生成结果">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="assets/toy-gun.jpg" height="200" alt="玩具手枪输入图">
</td>
<td align="center" width="50%">
<img src="assets/toy-gun-render.png" height="200" alt="玩具手枪生成结果">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="assets/box.jpg" height="120" alt="输入图">
</td>
<td align="center" width="50%">
<video src="https://github.com/user-attachments/assets/ee0efc54-96e3-4c1b-8da0-8c3264ebf82e" controls width="100%"></video>
</td>
</tr>
</table>

### 工业设计

以前所未有的速度和精度进行概念可视化及原型验证。

- 概念可视化
- 数字孪生
- 快速原型

<table width="100%">
<tr>
<th align="center" width="50%">输入图</th>
<th align="center" width="50%">生成结果</th>
</tr>
<tr>
<td align="center" width="50%">
<img src="assets/industrial1.jpg" height="180" alt="输入图1">
<img src="assets/industrial2.jpg" height="180" alt="输入图2">
<img src="assets/industrial3.jpg" height="180" alt="输入图3">
</td>
<td align="center" width="50%">
<video src="https://github.com/user-attachments/assets/67ed25c7-a843-4484-a509-fbc53fc11630" controls width="100%"></video>
</td>
</tr>
</table>

### 家具与室内设计

快速实现家具数字化，为室内设计提供极其逼真的 3D 资产。

- 家具数字化
- 空间规划
- 虚拟布置

<table width="100%">
<tr>
<th align="center" width="50%">输入图</th>
<th align="center" width="50%">生成结果</th>
</tr>
<tr>
<td align="center" width="50%">
<img src="assets/leather-sofa.png" height="200" alt="真皮沙发输入图">
</td>
<td align="center" width="50%">
<img src="assets/leather-sofa.gif" height="200" alt="真皮沙发生成结果">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="assets/marble-coffee-table.png" height="200" alt="大理石茶几输入图">
</td>
<td align="center" width="50%">
<img src="assets/marble-coffee-table.gif" height="200" alt="大理石茶几生成结果">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="assets/refrigerator.jpg" height="200" alt="冰箱输入图">
</td>
<td align="center" width="50%">
<img src="assets/refrigerator-render.png" height="200" alt="冰箱生成结果">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="assets/stainless-steel-table.png" height="200" alt="不锈钢桌子输入图">
</td>
<td align="center" width="50%">
<img src="assets/stainless-steel-table-render.png" height="200" alt="不锈钢桌子生成结果">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="assets/furniture.png" height="200" alt="输入图">
</td>
<td align="center" width="50%">
<video src="https://github.com/user-attachments/assets/3ca88eb5-5cc3-4952-aedd-74ab8df1fede" controls width="100%"></video>
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="assets/Office-chair.jpg" height="200" alt="输入图">
</td>
<td align="center" width="50%">
<video src="https://github.com/user-attachments/assets/7536eb17-c717-4291-b59e-e21d886096a8" controls width="100%"></video>
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="assets/Outdoor-furniture.jpg" height="200" alt="输入图">
</td>
<td align="center" width="50%">
<img src="assets/Outdoor-furniture-output.jpg" height="200" alt="生成结果">
</td>
</tr>
</table>

## 功能介绍

### Lux3D Image to 3D（图生3D）

- 支持 1–8 个图片槽，每个槽可填写公开 HTTP(S) URL、连接上游 `STRING` URL，或连接一张 ComfyUI `IMAGE`
- 本地 `IMAGE` 会通过 Asset/OUS 上传后再提交生成任务
- 支持 `G1` / `G1-Turbo`、目标面数、ZIP / GLB / PLY 输出、PBR 和尺寸预测配置
- 自动轮询任务，最多等待约 15 分钟
- 分别输出 `task_id`、`lux3d_zip`、`glb` 和 `ply`

### Lux3D Text to 3D（文生3D）

- 将文本描述转换为 3D 模型
- 可选参考图支持公开 URL、上游 `STRING` URL 或单张 ComfyUI `IMAGE`
- 支持写实、卡通、二次元、手绘、赛博朋克、魔幻和玻璃质感风格
- 与图生 3D 节点共享版本、面数、输出格式、PBR 和尺寸预测选项
- 分别输出 `task_id`、`lux3d_zip`、`glb` 和 `ply`

### Lux3D Multi-View Generator（多视图生成）

- 根据一个公开图片 URL、上游 `STRING` URL 或单张 ComfyUI `IMAGE` 生成 4 张多视角图片
- 分别输出 `task_id` 和 `image_1`～`image_4` URL

### Lux3D Multi-Format Export（多格式导出）

- 将远程或 ComfyUI 本地 `.glb` / `.zip` 模型导出为 USDZ、OBJ ZIP 和 FBX ZIP
- 本地模型会通过 Asset/OUS 上传后再提交导出任务
- 使用固定输出插槽返回 `task_id`、`glb`、`usdz`、`obj_zip` 和 `fbx_zip`

### Lux3D Material Redraw（材质重绘）

- 使用公开图片 URL、上游 `STRING` URL 或单张 ComfyUI `IMAGE` 重绘已有 GLB 的材质
- `mesh_url` 支持公开 GLB URL、上游 `STRING` URL 或 ComfyUI 本地 GLB
- 创建并轮询材质重绘任务，完成后返回新的 `glb_model_url`

### Lux3D Viewer（模型预览）

- 在 ComfyUI 画布中预览远程或本地 GLB、PLY 高斯泼溅文件
- 本地模型直接通过 ComfyUI `/view` 路由加载，不会上传到 Lux3D
- 输出已解析的 `model_url`，可继续连接下游节点

## 安装方式

### 通过 ComfyUI CLI 安装（推荐）

```
comfy node install lux3d
```

### 通过 ComfyUI Manager 安装

1. 打开 ComfyUI。
2. 进入 **Manager → Custom Nodes**。
3. 点击 "**Install via URL**"。
4. 输入：https://github.com/manycore-research/ComfyUI-Lux3D.git

### 手动安装

1. 将本项目克隆到ComfyUI的`custom_nodes`目录下：
   
   ```
   cd path/to/ComfyUI/custom_nodes 
   git clone git@github.com:manycore-research/ComfyUI-Lux3D.git
   ```

2. 安装依赖（如果需要）：
   
   ```
   pip install -r requirements.txt
   ```

3. 在启动 ComfyUI 的服务端环境中配置 API Key。国内服务设置 `LUX3D_API_KEY_CN`，国际服务设置 `LUX3D_API_KEY_INTL`；只使用其中一个区域时，只需设置对应变量。
4. 重启ComfyUI。

🚀 想先看看效果？直接上官网快速体验：[Lux3D 国内站](https://www.luxreal.com/lux3d/home) | [Lux3D 国际站](https://www.luxreal.ai/lux3d/home)

## 使用说明

### 获取 API Key

- 国内服务：[https://labs.aholo3d.cn/api-keys](https://labs.aholo3d.cn/api-keys)
- 国际服务：[https://labs.aholo3d.com/api-keys](https://labs.aholo3d.com/api-keys)

如有任何问题，请联系我们lux3d@qunhemail.com，我们将尽快回复。

### 基础工作流推荐

当前共提供 6 个节点，以下用法可按需组合。

#### Lux3D Image to 3D（图生3D）

1. 在 ComfyUI 节点库的 `Lux3D/Generate` 分类下找到 `Lux3D Image to 3D`，或在空白处双击搜索并添加。

2. 在 `image_1`～`image_8` 中至少提供一个图片来源。可以填写公开 HTTP(S) URL、连接上游 `STRING` URL，或连接一张 `IMAGE`；不同槽可以混用。

3. 选择 `base_api_path`、生成版本、面数和所需输出格式，然后运行工作流。

4. 节点完成轮询后返回 `task_id`、`lux3d_zip`、`glb` 和 `ply`。未请求或未返回的格式对应空字符串。

5. 将非空的 `glb` 或 `ply` 输出连接到 `Lux3D Viewer`，即可在画布内预览；ZIP 输出不能直接预览。

#### Lux3D Text to 3D（文生3D）

1. 在 ComfyUI 节点库的 `Lux3D/Generate` 分类下找到 `Lux3D Text to 3D`。

2. 输入描述物体的文本 prompt。

3. （可选）在 `reference_image` 填写公开 HTTP(S) URL、连接上游 `STRING` URL，或连接一张参考 `IMAGE`。

4. 从下拉菜单选择风格：
   - `photorealistic`: 写实风格（默认）
   - `cartoon`: 卡通风格
   - `anime`: 二次元风格
   - `hand_painted`: 手绘风格
   - `cyberpunk`: 赛博朋克风格
   - `fantasy`: 魔幻风格
   - `glass`: 玻璃质感风格

5. 选择 `base_api_path`、生成版本、面数和所需输出格式，然后运行工作流。

6. 节点完成轮询后返回 `task_id`、`lux3d_zip`、`glb` 和 `ply`。

7. 将非空的 `glb` 或 `ply` 输出连接到 `Lux3D Viewer`，即可在画布内预览。

#### Lux3D Multi-View Generator（多视图生成）

1. 在 `Lux3D/Generate` 分类下添加 `Lux3D Multi-View Generator`。

2. 在 `image` 填写公开 HTTP(S) URL、连接上游 `STRING` URL，或连接一张 `IMAGE`。

3. 选择 `base_api_path` 并运行工作流。节点返回 `task_id` 和 4 个图片 URL：`image_1`～`image_4`。

#### Lux3D Multi-Format Export（多格式导出）

1. 在 `Lux3D/Export` 分类下添加 `Lux3D Multi-Format Export`。

2. 在 `model_url` 填写公开 `.glb` / `.zip` URL、连接上游 `STRING` URL，或通过节点按钮选择 ComfyUI 本地模型。

3. 选择导出格式。GLB 输入必须显式选择至少一种格式；ZIP 输入可以使用 `default`。

4. 运行工作流。节点通过固定插槽返回 `task_id`、`glb`、`usdz`、`obj_zip` 和 `fbx_zip`。

#### Lux3D Material Redraw（材质重绘）

1. 在 ComfyUI 节点库中的 `Lux3D` 分类下找到 `Lux3D Material Redraw` 节点。

2. 在 `image` 填写公开 HTTP(S) URL、连接上游 `STRING` URL，或连接一张材质参考 `IMAGE`。

3. 在 `mesh_url` 填写公开 GLB URL、连接上游 `STRING` URL，或通过节点按钮选择 ComfyUI 本地 GLB。

4. 运行工作流，节点将返回重绘材质后的新 `glb_model_url`。

5. 返回的模型 URL 可连接到 `Lux3D Viewer` 节点，在画布内直接预览。

#### Lux3D Viewer（模型预览）

1. 在 `Lux3D` 分类下添加 `Lux3D Viewer`。

2. 将上游 `glb` / `ply` URL 连接到 `model_url`，也可以手动填写公开 URL，或通过节点按钮选择 ComfyUI 本地 `.glb` / `.ply` 文件。

3. 运行工作流后，节点会在画布中显示模型，并输出已解析的 `model_url`。本地模型不会上传到 Lux3D。

## 节点说明

当前版本共注册 6 个节点。生成、导出和材质重绘节点会在内部创建异步任务并轮询到任务结束，最多查询 60 次、间隔 15 秒（约 15 分钟）。

通用约定：

- `base_api_path` 只接受 `https://api.aholo3d.cn`（国内）或 `https://api.aholo3d.com`（国际），默认使用国内地址，末尾不要添加 `/`。
- 除 `Lux3D Viewer` 外，节点不再提供 API Key 输入框。请根据 `base_api_path` 在 ComfyUI 服务端环境中设置 `LUX3D_API_KEY_CN` 或 `LUX3D_API_KEY_INTL`。
- 接受 `STRING / IMAGE` 的图像参数既可以填写公开 HTTP(S) URL、连接上游 `STRING` URL，也可以连接包含一张图片的 ComfyUI `IMAGE`；本地图像会先上传，再提交给 Lux3D。
- 支持本地模型的参数可通过节点上的文件选择按钮从 ComfyUI `input` 目录选择，也接受 `output` / `temp` 目录中的相对路径（分别以 ` [output]` / ` [temp]` 标记）。需要提交给 Lux3D 的本地模型会先上传。
- 多格式输出使用固定插槽；未请求或服务端未返回的格式对应空字符串。

### Lux3D Viewer

**分类：** `Lux3D`

在 ComfyUI 画布内预览 GLB 模型或 PLY 高斯泼溅文件。远程 URL 会直接透传；本地文件不会上传，而是转换为 ComfyUI 同源 `/view` URL。

#### 输入参数

| 参数名 | 类型 | 描述 |
| --- | --- | --- |
| model_url | STRING / 模型源 | 公开 HTTP(S) `.glb` / `.ply` URL、上游 STRING 输出，或 ComfyUI `input` / `output` / `temp` 中的本地 `.glb` / `.ply` 文件 |
| base_api_path | STRING | 区域地址校验，只接受两个受支持的 API 地址；预览本身不会请求 Lux3D API |

#### 输出说明

| 输出名 | 类型 | 描述 |
| --- | --- | --- |
| model_url | STRING | 可继续连接下游节点的已解析模型 URL；远程输入保持不变，本地输入返回 ComfyUI `/view` URL |

### Lux3D Image to 3D

**分类：** `Lux3D/Generate`

使用 1–8 张图片创建图生 3D 任务。各图片槽可混合使用公开 URL、上游 `STRING` URL 与本地 `IMAGE` 输入。

#### 输入参数

| 参数名 | 类型 | 描述 |
| --- | --- | --- |
| base_api_path | STRING | Lux3D API 地址；默认 `https://api.aholo3d.cn` |
| image_1 … image_8 | STRING / IMAGE | 每个槽可留空、填写公开 HTTP(S) 图片 URL、连接上游 `STRING` URL，或连接一张 `IMAGE`；8 个槽中至少提供一个 |
| version | 枚举 | `G1` / `G1-Turbo`，默认 `G1-Turbo` |
| face_count | INT | 目标面数，默认 `200000`；`0` 表示不提交该字段，非零值必须为 `10000`–`300000` |
| output_format | 枚举 | `default`、`zip`、`glb`、`ply`、`zip,glb`、`zip,ply`、`glb,ply` 或 `zip,glb,ply`；`default` 表示不提交该字段。`G1` 固定返回 ZIP + GLB，并可追加 PLY；`G1-Turbo` 按所选组合输出 |
| enable_pbr | 枚举 | `default` / `true` / `false`；仅 `G1-Turbo` 支持，且不适用于仅输出 `ply` 的请求 |
| ai_predict_size | 枚举 | `default` / `true` / `false`；是否启用尺寸预测 |

#### 输出说明

| 输出名 | 类型 | 描述 |
| --- | --- | --- |
| task_id | STRING | Lux3D 任务 ID |
| lux3d_zip | STRING | Lux3D ZIP 结果 URL |
| glb | STRING | GLB 模型 URL |
| ply | STRING | PLY 高斯泼溅结果 URL |

### Lux3D Text to 3D

**分类：** `Lux3D/Generate`

根据文本描述和一张可选参考图创建文生 3D 任务。

#### 输入参数

| 参数名 | 类型 | 描述 |
| --- | --- | --- |
| base_api_path | STRING | Lux3D API 地址；默认 `https://api.aholo3d.cn` |
| prompt | STRING | 描述要生成物体的文本，不可为空 |
| style | 枚举 | `photorealistic`（默认）、`cartoon`、`anime`、`hand_painted`、`cyberpunk`、`fantasy` 或 `glass` |
| reference_image | STRING / IMAGE | 可选；公开 HTTP(S) 参考图 URL、上游 `STRING` URL 或一张本地 `IMAGE` |
| version | 枚举 | `G1` / `G1-Turbo`，默认 `G1-Turbo` |
| face_count | INT | 目标面数，默认 `200000`；`0` 表示不提交该字段，非零值必须为 `10000`–`300000` |
| output_format | 枚举 | 与 `Lux3D Image to 3D` 相同的 ZIP / GLB / PLY 选项 |
| enable_pbr | 枚举 | `default` / `true` / `false`；仅 `G1-Turbo` 支持，且不适用于仅输出 `ply` 的请求 |
| ai_predict_size | 枚举 | `default` / `true` / `false`；是否启用尺寸预测 |

#### 输出说明

| 输出名 | 类型 | 描述 |
| --- | --- | --- |
| task_id | STRING | Lux3D 任务 ID |
| lux3d_zip | STRING | Lux3D ZIP 结果 URL |
| glb | STRING | GLB 模型 URL |
| ply | STRING | PLY 高斯泼溅结果 URL |

### Lux3D Multi-View Generator

**分类：** `Lux3D/Generate`

根据单张物体图片生成 4 张多视角图片。

#### 输入参数

| 参数名 | 类型 | 描述 |
| --- | --- | --- |
| base_api_path | STRING | Lux3D API 地址；默认 `https://api.aholo3d.cn` |
| image | STRING / IMAGE | 必填；公开 HTTP(S) 图片 URL、上游 `STRING` URL 或一张本地 `IMAGE` |

#### 输出说明

| 输出名 | 类型 | 描述 |
| --- | --- | --- |
| task_id | STRING | Lux3D 任务 ID |
| image_1 | STRING | 第 1 张多视角图片 URL |
| image_2 | STRING | 第 2 张多视角图片 URL |
| image_3 | STRING | 第 3 张多视角图片 URL |
| image_4 | STRING | 第 4 张多视角图片 URL |

### Lux3D Multi-Format Export

**分类：** `Lux3D/Export`

将远程或 ComfyUI 本地的 GLB / Lux3D ZIP 模型导出为一种或多种目标格式。本地文件会先上传到 Lux3D。

#### 输入参数

| 参数名 | 类型 | 描述 |
| --- | --- | --- |
| base_api_path | STRING | Lux3D API 地址；默认 `https://api.aholo3d.cn` |
| model_url | STRING / 模型源 | 公开 HTTP(S) `.glb` / `.zip` URL、上游 STRING 输出，或 ComfyUI 本地 `.glb` / `.zip` 文件 |
| output_format | 枚举 | `default`、`usdz`、`obj_zip`、`fbx_zip` 及所有不重复组合；GLB 输入必须显式选择至少一种导出格式，`default` 仅适用于 ZIP 输入 |

#### 输出说明

| 输出名 | 类型 | 描述 |
| --- | --- | --- |
| task_id | STRING | Lux3D 任务 ID |
| glb | STRING | GLB 模型 URL（服务端返回时提供） |
| usdz | STRING | USDZ 文件 URL |
| obj_zip | STRING | OBJ ZIP 文件 URL |
| fbx_zip | STRING | FBX ZIP 文件 URL |

### Lux3D Material Redraw

**分类：** `Lux3D`

使用一张参考图，以固定版本 `v3.0-standard` 重绘已有 GLB 的材质。连接的本地图像和选择的本地 GLB 会在提交任务前上传。

#### 输入参数

| 参数名 | 类型 | 描述 |
| --- | --- | --- |
| image | STRING / IMAGE | 必填；公开 HTTP(S) 参考图 URL、上游 `STRING` URL 或一张本地 `IMAGE` |
| mesh_url | STRING / 模型源 | 公开 HTTP(S) `.glb` URL、上游 STRING 输出，或 ComfyUI 本地 `.glb` 文件 |
| base_api_path | STRING | Lux3D API 地址；默认 `https://api.aholo3d.cn` |

#### 输出说明

| 输出名 | 类型 | 描述 |
| --- | --- | --- |
| glb_model_url | STRING | 重绘材质后的新模型下载 URL |

## 常见问题
 
1.通过comfyui-manager安装插件时，如果遇到安全等级问题，请修改comfyui-manager配置文件内的对应的安全等级后，再重试安装。

## 开发说明

### 项目结构

```text
comfyui-lux3d/
├── __init__.py               # 注册当前 6 个节点和前端目录
├── lux3d_openapi/            # OpenAPI 客户端、契约、任务轮询和 4 个任务节点
├── lux3d_material.py         # Lux3D Material Redraw 节点
├── lux3d_viewer.py           # Lux3D Viewer 节点
├── viewer_asset_routes.py    # Viewer 静态资源路由
├── viewer_assets/            # 随插件发布的 Viewer 运行时资源
├── frontend/                 # Viewer 与输入源扩展源码及测试
├── js/                       # ComfyUI 实际加载的前端构建产物
├── tests/                    # Python 测试
├── requirements.txt          # Python 运行时依赖
├── README.md                 # 英文说明
└── README_CN.md              # 中文说明
```

### 依赖说明

| **依赖名称** | **版本号要求**                                                            | **功能概述**        | **开源许可证**  |
|----------|----------------------------------------------------------------------|-----------------|------------|
| requests | &gt;=2.25.0                                                          | HTTP请求库，用于API调用 | Apache 2.0 |
| Pillow   | &gt;=9.0.0                                                           | 图像处理库           | BSD        |
| NumPy    | &gt;=1.21.0                                                          | 科学计算库           | BSD        |

## 配置说明

### 服务端环境变量

当前注册节点不读取 `config.txt`，也不会在工作流中提供 API Key 输入框。请在启动 ComfyUI 的进程环境中配置与 `base_api_path` 对应的变量：

| `base_api_path` | 环境变量 |
| --- | --- |
| `https://api.aholo3d.cn` | `LUX3D_API_KEY_CN` |
| `https://api.aholo3d.com` | `LUX3D_API_KEY_INTL` |

PowerShell 示例：

```powershell
$env:LUX3D_API_KEY_CN = "your_cn_api_key"
$env:LUX3D_API_KEY_INTL = "your_intl_api_key"
```

Bash 示例：

```bash
export LUX3D_API_KEY_CN="your_cn_api_key"
export LUX3D_API_KEY_INTL="your_intl_api_key"
```

只使用其中一个区域时，只需配置对应变量。环境变量必须对 ComfyUI 服务端进程可见，修改后请重启 ComfyUI。`Lux3D Viewer` 不请求 Lux3D API，因此不需要 API Key。

## 许可证

[MIT](LICENSE)
