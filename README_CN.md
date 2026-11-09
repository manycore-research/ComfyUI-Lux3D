<div align="center">
  <img src="figures/logo.png" width="420" alt="ComfyUI-Lux3D Nodes" />
</div>

# ComfyUI-Lux3D 节点

<div align="center">

[中文](README_CN.md)/[English](README.md)

🌐 官方网站：[Lux3D 国内站](https://lux3d.aholo3d.cn/lux3d/home) | [Lux3D 国际站](https://lux3d.aholo.ai/lux3d/home)
</div>

一个 ComfyUI 插件，用于在你的工作流中将文本描述或 2D 图片转换为 3D 模型。


## 模型后处理（部件拆分、模型重拓扑、模型关节化、人物模型自动绑骨、人物模型动画重定向）

新增五个 `Lux3D/后处理` 节点：部件拆分、模型重拓扑、模型关节化、人物模型自动绑骨和人物模型动画重定向。重拓扑接收公网或本机 GLB，必须填写目标面数，可选择拓扑方式及贴图烘焙，固定输出 GLB、OBJ 和可选 OBJ ZIP。

动画支持逐动作或合并输出、GLB/FBX 和原地运动；部分动作失败会明确显示，成功结果仍可使用。模型预览节点支持动画片段切换。关节化返回格式以实际服务结果为准，ZIP 使用下载入口。

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
<img src="figures/handbag.jpg" height="200" alt="皮包输入图">
</td>
<td align="center" width="50%">
<img src="figures/handbag.gif" height="200" alt="皮包生成结果">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="figures/chips.jpg" height="200" alt="薯片输入图">
</td>
<td align="center" width="50%">
<img src="figures/chips.gif" height="200" alt="薯片生成结果">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="figures/milk-carton.jpg" height="200" alt="牛奶盒输入图">
</td>
<td align="center" width="50%">
<img src="figures/milk-carton-render.png" height="200" alt="牛奶盒生成结果">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="figures/Lawnmower.jpg" height="200" alt="输入图">
</td>
<td align="center" width="50%">
<img src="figures/Lawnmower-output.jpg" height="200" alt="生成结果">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="figures/Pet-bowl.png" height="200" alt="输入图">
</td>
<td align="center" width="50%">
<img src="figures/Pet-bowl-output.jpg" height="200" alt="生成结果">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="figures/Speaker.png" height="200" alt="输入图">
</td>
<td align="center" width="50%">
<img src="figures/Speaker-output.jpg" height="200" alt="生成结果">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="figures/vase.jpg" height="200" alt="输入图">
</td>
<td align="center" width="50%">
<img src="figures/vase-output.jpg" height="200" alt="生成结果">
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
<img src="figures/cartoon-sofa.jpg" height="200" alt="卡通沙发输入图">
</td>
<td align="center" width="50%">
<img src="figures/cartoon-sofa.gif" height="200" alt="卡通沙发生成结果">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="figures/cartoon-boy.jpg" height="200" alt="卡通男孩输入图">
</td>
<td align="center" width="50%">
<img src="figures/cartoon-boy.gif" height="200" alt="卡通男孩生成结果">
</td>
</tr>

<tr>
<td align="center" width="50%">
<img src="figures/axe.jpg" height="200" alt="斧头输入图">
</td>
<td align="center" width="50%">
<img src="figures/axe-render.png" height="200" alt="斧头生成结果">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="figures/toy-gun.jpg" height="200" alt="玩具手枪输入图">
</td>
<td align="center" width="50%">
<img src="figures/toy-gun-render.png" height="200" alt="玩具手枪生成结果">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="figures/box.jpg" height="120" alt="输入图">
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
<img src="figures/industrial1.jpg" height="180" alt="输入图1">
<img src="figures/industrial2.jpg" height="180" alt="输入图2">
<img src="figures/industrial3.jpg" height="180" alt="输入图3">
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
<img src="figures/leather-sofa.png" height="200" alt="真皮沙发输入图">
</td>
<td align="center" width="50%">
<img src="figures/leather-sofa.gif" height="200" alt="真皮沙发生成结果">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="figures/marble-coffee-table.png" height="200" alt="大理石茶几输入图">
</td>
<td align="center" width="50%">
<img src="figures/marble-coffee-table.gif" height="200" alt="大理石茶几生成结果">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="figures/refrigerator.jpg" height="200" alt="冰箱输入图">
</td>
<td align="center" width="50%">
<img src="figures/refrigerator-render.png" height="200" alt="冰箱生成结果">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="figures/stainless-steel-table.png" height="200" alt="不锈钢桌子输入图">
</td>
<td align="center" width="50%">
<img src="figures/stainless-steel-table-render.png" height="200" alt="不锈钢桌子生成结果">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="figures/furniture.png" height="200" alt="输入图">
</td>
<td align="center" width="50%">
<video src="https://github.com/user-attachments/assets/3ca88eb5-5cc3-4952-aedd-74ab8df1fede" controls width="100%"></video>
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="figures/Office-chair.jpg" height="200" alt="输入图">
</td>
<td align="center" width="50%">
<video src="https://github.com/user-attachments/assets/7536eb17-c717-4291-b59e-e21d886096a8" controls width="100%"></video>
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="figures/Outdoor-furniture.jpg" height="200" alt="输入图">
</td>
<td align="center" width="50%">
<img src="figures/Outdoor-furniture-output.jpg" height="200" alt="生成结果">
</td>
</tr>
</table>

## 功能介绍

### Lux3D 图生 3D

- 支持 1–8 个图片槽，每个槽可填写公开 HTTP(S) URL、连接上游 `STRING` URL，或连接一张 ComfyUI `IMAGE`
- 本地 `IMAGE` 会通过 Asset/OUS 上传后再提交生成任务
- 支持 `G1` / `G1-Turbo`、目标面数、ZIP / GLB / PLY 输出、PBR 和尺寸预测配置
- 自动轮询任务，最多等待约 15 分钟
- 分别输出 `任务 ID`、`Lux3D ZIP`、`GLB` 和 `PLY`

### Lux3D 文生 3D

- 将文本描述转换为 3D 模型
- 可选参考图支持公开 URL、上游 `STRING` URL 或单张 ComfyUI `IMAGE`
- 支持写实、卡通、二次元、手绘、赛博朋克、魔幻和玻璃质感风格
- 与图生 3D 节点共享版本、面数、输出格式、PBR 和尺寸预测选项
- 分别输出 `任务 ID`、`Lux3D ZIP`、`GLB` 和 `PLY`

### Lux3D 四视图

- 支持可选的公开图片 URL、上游 `STRING` URL 或单张 ComfyUI `IMAGE`，并支持可选文本提示词；图片与 提示词 至少提供一个
- 支持纯图、纯文和图文组合生成
- 分别输出 `任务 ID`，以及按 `FRONT_THREE_QUARTER`、`OPPOSITE_THREE_QUARTER`、`SIDE`、`BACK` 排列的 `图片 1`～`图片 4` URL

### Lux3D 单图生成

- 根据可选的公开图片 URL、上游 `STRING` URL 或单张 ComfyUI `IMAGE`，以及可选的多行提示词 生成一张新图片；图片与 提示词 至少提供一个
- 支持纯图、纯文和图文组合生成；纯图输入也会重新生成，不会直接透传原图
- 节点内部创建并轮询任务，完成后返回 `任务 ID` 和 `图片地址`

### Lux3D 多格式导出

- 将远程或 ComfyUI 本地 `.glb` / `.zip` 模型导出为 USDZ、OBJ ZIP、FBX ZIP、STL、3MF 的任意组合
- 本地模型会通过 Asset/OUS 上传后再提交导出任务
- 按服务端固定结果槽位映射，不再根据文件名猜测格式
- 使用向后兼容的输出顺序：`任务 ID`、`GLB`、`USDZ`、`OBJ ZIP`、`FBX ZIP`、`STL`、`3MF`、`Lux3D ZIP`

### Lux3D 模型材质重绘

- 使用公开图片 URL、上游 `STRING` URL 或单张 ComfyUI `IMAGE` 重绘已有 GLB 的材质
- `模型地址` 支持公开 GLB URL、上游 `STRING` URL 或 ComfyUI 本地 GLB
- 创建并轮询材质重绘任务，完成后返回新的 `GLB`

### Lux3D 部件拆分

- 将一个 GLB 模型拆分为多个部件，返回包含拆分结果的重构 GLB
- 支持公开 GLB URL、上游 `STRING` URL 或 ComfyUI 本地 GLB；本地模型会先上传
- 创建并轮询任务，完成后返回 `任务 ID` 和 `GLB`

### Lux3D 模型重拓扑

- 为静态、非 Draco 压缩 GLB 重新生成拓扑，支持四边面或三角面及目标面数配置
- 可选择贴图烘焙和贴图尺寸，输出 GLB、OBJ 白模及可选的 OBJ 带材质 ZIP
- 支持通过 `恢复任务 ID` 继续查询已有任务，无需重新上传模型或创建任务

### Lux3D 模型关节化

- 根据 GLB 模型和运动提示词，为模型部件添加关节并生成运动效果
- 支持公开 GLB URL、上游 `STRING` URL 或 ComfyUI 本地 GLB
- 返回 `任务 ID`、`结果地址`、`结果格式` 和可预览时的 `GLB`；其他格式可通过结果面板下载

### Lux3D 人物模型自动绑骨

- 为人物 GLB 模型自动绑定骨骼，支持公开 HTTPS URL、上游 `STRING` URL 或 ComfyUI 本地 GLB
- 创建并轮询绑骨任务，完成后返回 `任务 ID` 和已绑骨的 `GLB`
- 结果可连接到 `Lux3D 人物模型动画重定向`，继续生成指定动作

### Lux3D 人物模型动画重定向

- 为已绑骨 GLB 生成指定动作，从 85 个公开动作中选择 1–10 个，动作 ID 区分大小写且不可重复
- 支持逐动作输出或合并动画片段、GLB / FBX 格式及原地动画
- 返回 `任务 ID`、首个成功结果的 `GLB` 或 `FBX`，以及记录全部动作状态的 `动作结果 JSON`
- 结果面板提供各动作状态及下载入口；部分动作失败时，成功结果仍可使用

### Lux3D 模型预览

- 在 ComfyUI 画布中预览远程或本地 GLB、PLY 高斯泼溅文件
- 支持 GLB 动画播放和动画片段切换
- 本地模型直接通过 ComfyUI `/view` 路由加载，不会上传到 Lux3D
- 输出已解析的 `模型地址`，可继续连接下游节点

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

🚀 想先看看效果？直接上官网快速体验：[Lux3D 国内站](https://lux3d.aholo3d.cn/lux3d/home) | [Lux3D 国际站](https://lux3d.aholo.ai/lux3d/home)

## 使用说明

### 获取 API Key

- 国内服务：[https://labs.aholo3d.cn/api-keys](https://labs.aholo3d.cn/api-keys)
- 国际服务：[https://labs.aholo.ai/api-keys](https://labs.aholo.ai/api-keys)

如有任何问题，请联系我们lux3d@qunhemail.com，我们将尽快回复。

### 基础工作流推荐

当前共提供 12 个节点，以下用法可按需组合。本文操作步骤以 ComfyUI 界面语言设为“中文”为准；更改语言后请刷新网页。参数表括号中保留字段标识，工作流和 API 请求仍使用原有标识及取值。

#### Lux3D 图生 3D

1. 在 ComfyUI 节点库的 `Lux3D/生成` 分类下找到 `Lux3D 图生 3D`。

2. 在 `图片 1`～`图片 8` 中至少提供一个图片来源。可以填写公开 HTTP(S) URL、连接上游 `STRING` URL，或连接一张 `IMAGE`；不同槽可以混用。

3. （可选）只有一张参考图且希望补全其他角度时，在 `加载图像` 与 `Lux3D 图生 3D` 之间添加 `Lux3D 四视图`，并将四视图的 `图片 1`～`图片 4` 分别连接到图生 3D 的对应输入。已有多角度图片时，可直接连接到图生 3D 的 `图片 1`～`图片 8`，无需使用四视图。

4. 选择 `API 地址`、生成版本、面数和所需输出格式；需要在画布预览时，请在输出格式中包含 `GLB`。多格式导出可使用生成得到的 `GLB` 或 `Lux3D ZIP`。

5. 运行工作流。

6. 节点完成轮询后返回 `任务 ID`、`Lux3D ZIP`、`GLB` 和 `PLY`。未请求或未返回的格式对应空字符串。

7. （可选）将非空的 `GLB` 或 `PLY` 输出连接到 `Lux3D 模型预览`，即可在画布内预览；需要 USDZ、OBJ ZIP、FBX ZIP 等文件时，再将 `GLB` 或 `ZIP` 输出连接到 `Lux3D 多格式导出`。

<p align="center">
  <img src="figures/image-to-3d-workflow-cn.png" width="900" alt="Lux3D 图生 3D 工作流" />
</p>

#### Lux3D 文生 3D

1. 在 ComfyUI 节点库的 `Lux3D/生成` 分类下找到 `Lux3D 文生 3D`。

2. 在 `提示词` 中输入描述物体的文本。

3. （可选）在 `参考图` 填写公开 HTTP(S) URL、连接上游 `STRING` URL，或连接一张参考 `IMAGE`。

4. 在 `风格` 下拉菜单选择：
   - `写实`（默认）
   - `卡通`
   - `二次元`
   - `手绘`
   - `赛博朋克`
   - `魔幻`
   - `玻璃质感`

5. 选择 `API 地址`、生成版本、面数和所需输出格式；需要在画布预览时，请在输出格式中包含 `GLB`。多格式导出可使用生成得到的 `GLB` 或 `Lux3D ZIP`。

6. 运行工作流。

7. 节点完成轮询后返回 `任务 ID`、`Lux3D ZIP`、`GLB` 和 `PLY`。

8. （可选）将非空的 `GLB` 或 `PLY` 输出连接到 `Lux3D 模型预览`，即可在画布内预览；需要 USDZ、OBJ ZIP、FBX ZIP 等文件时，再将 `GLB` 或 `ZIP` 输出连接到 `Lux3D 多格式导出`。

<p align="center">
  <img src="figures/text-to-3d-workflow-cn.png" width="900" alt="Lux3D 文生 3D 工作流" />
</p>

#### Lux3D 单图生成

1. 在 `Lux3D/生成` 分类下添加 `Lux3D 单图生成`。

2. 可在 `图片` 填写公开 HTTP(S) URL、连接上游 `STRING` URL 或连接一张 `IMAGE`，也可填写多行 `提示词`。`图片` 与 `提示词` 至少提供一个。

3. 选择 `API 地址` 并运行工作流。节点在内部创建并轮询任务，完成后返回 `任务 ID` 和 `图片地址`。只提供图片时仍会生成一张新图，不会把原图 URL 直接作为结果透传。

<p align="center">
  <img src="figures/single-image-to-four-view-workflow-cn.png" width="900" alt="Lux3D 单图生成到四视图工作流" />
</p>

#### Lux3D 四视图生成

1. 在 `Lux3D/生成` 分类下添加 `Lux3D 四视图生成`。

2. 可在 `图片` 填写公开 HTTP(S) URL、连接上游 `STRING` URL 或连接一张 `IMAGE`，也可填写多行 `提示词`。`图片` 与 `提示词` 至少提供一个，因此支持纯图、纯文和图文组合生成。

3. 选择 `API 地址` 并运行工作流。节点返回 `任务 ID` 和顺序固定的 4 个图片 URL：`图片 1` = `FRONT_THREE_QUARTER`、`图片 2` = `OPPOSITE_THREE_QUARTER`、`图片 3` = `SIDE`、`图片 4` = `BACK`。

#### Lux3D 多格式导出

1. 在 `Lux3D/导出` 分类下添加 `Lux3D 多格式导出`。

2. 在 `模型地址` 填写公开 `.glb` / `.zip` URL、连接上游 `STRING` URL，或通过节点按钮选择 ComfyUI 本地模型。

3. 选择导出格式。GLB 输入必须显式选择至少一种格式；ZIP 输入可以使用 `默认`。

4. 运行工作流。节点依次返回 `任务 ID`、`GLB`、`USDZ`、`OBJ ZIP`、`FBX ZIP`、`STL`、`3MF` 和 `Lux3D ZIP`。前 5 个插槽保留历史位置；未请求或未返回的结果为空字符串。

5. 输入 ZIP 时，`Lux3D ZIP` 回传源 Lux3D ZIP，`GLB` 返回默认导出的 GLB；输入 GLB 时，`GLB` 回传原模型 URL，`Lux3D ZIP` 为空。

#### Lux3D 模型材质重绘

1. 在 ComfyUI 节点库中的 `Lux3D` 分类下找到 `Lux3D 模型材质重绘` 节点。

2. 在 `材质参考图` 填写公开 HTTP(S) URL、连接上游 `STRING` URL，或连接一张材质参考 `IMAGE`。

3. 在 `模型地址` 填写公开 GLB URL、连接上游 `STRING` URL，或通过节点按钮选择 ComfyUI 本地 GLB。

4. 运行工作流，节点将返回重绘材质后的新 `GLB`。

5. 返回的模型 URL 可连接到 `Lux3D 模型预览` 节点，在画布内直接预览。

<p align="center">
  <img src="figures/material-redraw-workflow-cn.png" width="900" alt="Lux3D 材质重绘工作流" />
</p>

#### Lux3D 部件拆分

1. 在 `Lux3D/后处理` 分类下添加 `Lux3D 部件拆分`。

2. 在 `模型地址` 填写公开 GLB URL、连接图生 3D 或文生 3D 节点的 `GLB` 输出，或通过节点按钮选择 ComfyUI 本地 GLB。

3. 选择 `API 地址` 并运行工作流。本地模型会先上传，节点完成轮询后返回 `任务 ID` 和包含拆分部件的 `GLB`。

4. 将 `GLB` 连接到 `Lux3D 模型预览` 预览，或通过节点结果面板下载。若当前账号已有部件拆分任务进行中，请等待该任务完成后再提交。

<p align="center">
  <img src="figures/part-split-workflow-cn.png" width="1200" alt="Lux3D 部件拆分工作流" />
</p>

#### Lux3D 模型重拓扑

1. 在 `Lux3D/后处理` 分类下添加 `Lux3D 模型重拓扑`。

2. 在 `模型地址` 填写公开 GLB URL、连接上游 `GLB` 输出，或选择 ComfyUI 本地 GLB。输入应为静态、非 Draco 压缩模型，不包含骨骼、蒙皮、动画或形态键。

3. 填写必需的 `目标面数`，例如 `5000`；开启 `四边面拓扑` 选择四边面，关闭则为三角面。需要保留贴图时开启 `烘焙贴图`，并选择 `贴图尺寸`。

4. 选择 `API 地址` 并运行工作流。节点返回 `任务 ID`、`GLB`、`OBJ 白模` 和 `OBJ 带材质`（ZIP）。未生成贴图包时，最后一个输出为空；请求烘焙但未生成贴图包时，结果面板会提示。

5. 将 `GLB` 连接到 `Lux3D 模型预览` 预览，在结果面板下载 OBJ 白模及实际返回的贴图 ZIP。四边面拓扑以 OBJ 为准，GLB 始终为三角面。

6. 若查询超时或中断，将已记录的任务 ID 填入 `恢复任务 ID`，保持原账号、`API 地址` 和 `烘焙贴图` 设置后再次运行。此时该节点只查询原任务，不会重新上传、创建任务或修改原任务参数。

<p align="center">
  <img src="figures/retopology-workflow-cn.png" width="900" alt="Lux3D 模型重拓扑工作流与重拓扑前后对比" />
</p>

#### Lux3D 模型关节化

1. 在 `Lux3D/后处理` 分类下添加 `Lux3D 模型关节化`。

2. 在 `模型地址` 填写公开 GLB URL、连接生成或部件拆分节点的 `GLB` 输出，或选择 ComfyUI 本地 GLB。

3. 在 `提示词` 描述运动部件、固定部件及期望的运动方式，例如“保持底座固定，让盖子绕铰链缓慢打开和闭合”。

4. 选择 `API 地址` 并运行工作流。节点返回 `任务 ID`、最终文件的 `结果地址` 和实际 `结果格式`。

5. 当结果为 GLB 时，将非空的 `GLB` 输出连接到 `Lux3D 模型预览` 查看运动效果；ZIP 或其他格式通过结果面板下载。

<p align="center">
  <img src="figures/articulation-urdf-workflow-cn.png" width="900" alt="Lux3D 模型关节化工作流与 URDF ZIP 文件结构" />
</p>

#### Lux3D 人物模型自动绑骨

1. 在 `Lux3D/后处理` 分类下添加 `Lux3D 人物模型自动绑骨`。

2. 在 `模型地址` 填写人物模型的公开 HTTPS GLB URL、连接上游 `GLB` 输出，或选择 ComfyUI 本地 GLB。本地模型会先上传。

3. 选择 `API 地址` 并运行工作流。节点完成轮询后返回 `任务 ID` 和已绑骨的 `GLB`。

4. 将 `GLB` 连接到 `Lux3D 模型预览` 预览，或连接到 `Lux3D 人物模型动画重定向` 的 `模型地址`，继续生成人物动作。

#### Lux3D 人物模型动画重定向

1. 在 `Lux3D/后处理` 分类下添加 `Lux3D 人物模型动画重定向`。

2. 将 `Lux3D 人物模型自动绑骨` 的 `GLB` 输出连接到 `模型地址`；已有绑骨模型也可以填写公开 HTTPS GLB URL，或选择 ComfyUI 本地 GLB。

3. 在 `选择动作` 下拉菜单选择动作并点击 `添加动作`，或在 `动作 ID` 中填写 JSON 数组或每行一个动作 ID，例如 `["Walk_Loop", "Idle_Loop"]`。一次选择 1–10 个不同动作，区分大小写。

4. 选择 `动画输出方式`：`逐动作` 为每个动作生成一个文件，`合并输出` 为一个文件包含多个独立动画片段。选择 `输出格式` 为 `GLB` 或 `FBX`；需要原地运动时开启 `原地动画`。

5. 选择 `API 地址` 并运行工作流。节点返回 `任务 ID`、首个成功结果的 `GLB` 或 `FBX`，以及包含全部动作状态、结果 URL 和失败原因的 `动作结果 JSON`；其余成功结果可通过结果面板下载。

6. 使用 GLB 输出时，将 `GLB` 连接到 `Lux3D 模型预览` 播放动画；合并结果可在查看器中切换动画片段。FBX 为原文件，通过结果面板下载后使用目标 3D 软件打开。

<p align="center">
  <img src="figures/humanoid-rigging-retarget-workflow-cn.png" width="900" alt="Lux3D 人物模型自动绑骨与动画重定向工作流" />
</p>

#### Lux3D 模型预览

1. 在 `Lux3D` 分类下添加 `Lux3D 模型预览`。

2. 将上游 `GLB` / `PLY` URL 连接到 `模型地址`，也可以手动填写公开 URL，或通过节点按钮选择 ComfyUI 本地 `.glb` / `.ply` 文件。

3. 运行工作流后，节点会在画布中显示模型，并输出已解析的 `模型地址`。本地模型不会上传到 Lux3D。

4. GLB 包含动画时会自动播放，可在预览区的动画片段下拉菜单中切换动作。

## 节点说明

当前版本共注册 12 个节点。生成、导出、材质重绘和后处理节点会在内部创建异步任务并轮询到任务结束，最多查询 60 次、间隔 15 秒（约 15 分钟）。重拓扑填写 `恢复任务 ID` 时只查询已有任务。

通用约定：

- `API 地址` 可使用 `https://api.aholo3d.cn`（国内）或 `https://api.aholo.ai`（国际），末尾不要添加 `/`。
- 除 `Lux3D 模型预览` 外，节点不再提供 API Key 输入框。请根据 `API 地址` 在 ComfyUI 服务端环境中设置 `LUX3D_API_KEY_CN` 或 `LUX3D_API_KEY_INTL`。
- 接受 `STRING / IMAGE` 的图像参数既可以填写公开 HTTP(S) URL、连接上游 `STRING` URL，也可以连接包含一张图片的 ComfyUI `IMAGE`；本地图像会先通过 Asset/OUS 上传，再将资产 URL 提交给 Lux3D，节点不会暴露 Base64 data URL。
- 支持本地模型的参数可通过节点上的文件选择按钮从 ComfyUI `input` 目录选择，也接受 `output` / `temp` 目录中的相对路径（分别以 ` [output]` / ` [temp]` 标记）。需要提交给 Lux3D 的本地模型会先上传。
- 多格式导出服务固定返回 `zipUrl`、`glbUrl`、`usdzUrl`、`objZipUrl`、`fbxZipUrl`、`stlUrl`、`threeMfUrl` 七个槽位。插件按槽位位置映射，不再根据文件名猜测格式；未请求或服务端未返回的格式对应空字符串。
- 五个后处理节点统一使用 `Lux3D/后处理` 分类；结果面板显示任务 ID、实际可用的下载链接，以及警告或逐动作状态。GLB 可连接到模型预览节点，OBJ、ZIP 和 FBX 使用下载入口。

### Lux3D 模型预览

**分类：** `Lux3D`

在 ComfyUI 画布内预览 GLB 模型或 PLY 高斯泼溅文件。远程 URL 会直接透传；本地文件不会上传，而是转换为 ComfyUI 同源 `/view` URL。

GLB 预览使用与 Web GLB Viewer 相同的 `model-viewer` 4.2.0 运行时及预设：黑色背景、同一张 HDR 环境贴图、曝光 `0.95`、`auto` 色调映射、`30°` 视角和 `125%` 初始相机距离。关闭阴影和自动旋转，保留旋转、缩放、平移及模型动画。运行时、HDR 和解码器均随插件本地打包。更新模型预览节点资源后，请重启 ComfyUI 并刷新浏览器。

#### 输入参数

| 参数名 | 类型 | 描述 |
| --- | --- | --- |
| 模型地址（`model_url`） | STRING / 模型源 | 公开 HTTP(S) `.glb` / `.ply` URL、上游 STRING 输出，或 ComfyUI `input` / `output` / `temp` 中的本地 `.glb` / `.ply` 文件 |
| API 地址（`base_api_path`） | STRING | 区域地址校验，只接受两个受支持的 API 地址；预览本身不会请求 Lux3D API |

#### 输出说明

| 输出名 | 类型 | 描述 |
| --- | --- | --- |
| 模型地址（`model_url`） | STRING | 可继续连接下游节点的已解析模型 URL；远程输入保持不变，本地输入返回 ComfyUI `/view` URL |

### Lux3D 图生 3D

**分类：** `Lux3D/生成`

使用 1–8 张图片创建图生 3D 任务。各图片槽可混合使用公开 URL、上游 `STRING` URL 与本地 `IMAGE` 输入。

#### 输入参数

| 参数名 | 类型 | 描述 |
| --- | --- | --- |
| API 地址（`base_api_path`） | STRING | Lux3D API 地址：`https://api.aholo3d.cn`（国内）或 `https://api.aholo.ai`（国际） |
| 图片 1～8（`image_1` … `image_8`） | STRING / IMAGE | 每个槽可留空、填写公开 HTTP(S) 图片 URL、连接上游 `STRING` URL，或连接一张 `IMAGE`；8 个槽中至少提供一个 |
| 生成版本（`version`） | 枚举 | `G1` / `G1-Turbo`，默认 `G1-Turbo` |
| 目标面数（`face_count`） | INT | 目标面数，默认 `200000`；`0` 表示不提交该字段，非零值必须为 `10000`–`300000` |
| 输出格式（`output_format`） | 枚举 | `默认`、`ZIP`、`GLB`、`PLY`、`ZIP + GLB`、`ZIP + PLY`、`GLB + PLY` 或 `ZIP + GLB + PLY`；`默认` 表示不提交该字段。`G1` 固定返回 ZIP + GLB，并可追加 PLY；`G1-Turbo` 按所选组合输出 |
| 启用 PBR（`enable_pbr`） | 枚举 | `默认` / `开启` / `关闭`；仅 `G1-Turbo` 支持，且不适用于仅输出 `PLY` 的请求 |
| 尺寸预测（`ai_predict_size`） | 枚举 | `默认` / `开启` / `关闭`；是否启用尺寸预测 |

#### 输出说明

| 输出名 | 类型 | 描述 |
| --- | --- | --- |
| 任务 ID（`task_id`） | STRING | Lux3D 任务 ID |
| Lux3D ZIP（`lux3d_zip`） | STRING | Lux3D ZIP 结果 URL |
| GLB（`glb`） | STRING | GLB 模型 URL |
| PLY（`ply`） | STRING | PLY 高斯泼溅结果 URL |

### Lux3D 文生 3D

**分类：** `Lux3D/生成`

根据文本描述和一张可选参考图创建文生 3D 任务。

#### 输入参数

| 参数名 | 类型 | 描述 |
| --- | --- | --- |
| API 地址（`base_api_path`） | STRING | Lux3D API 地址：`https://api.aholo3d.cn`（国内）或 `https://api.aholo.ai`（国际） |
| 提示词（`prompt`） | STRING | 描述要生成物体的文本，不可为空 |
| 风格（`style`） | 枚举 | `写实`（默认）、`卡通`、`二次元`、`手绘`、`赛博朋克`、`魔幻` 或 `玻璃质感` |
| 参考图（`reference_image`） | STRING / IMAGE | 可选；公开 HTTP(S) 参考图 URL、上游 `STRING` URL 或一张本地 `IMAGE` |
| 生成版本（`version`） | 枚举 | `G1` / `G1-Turbo`，默认 `G1-Turbo` |
| 目标面数（`face_count`） | INT | 目标面数，默认 `200000`；`0` 表示不提交该字段，非零值必须为 `10000`–`300000` |
| 输出格式（`output_format`） | 枚举 | 与 `Lux3D 图生 3D` 相同的 ZIP / GLB / PLY 选项 |
| 启用 PBR（`enable_pbr`） | 枚举 | `默认` / `开启` / `关闭`；仅 `G1-Turbo` 支持，且不适用于仅输出 `PLY` 的请求 |
| 尺寸预测（`ai_predict_size`） | 枚举 | `默认` / `开启` / `关闭`；是否启用尺寸预测 |

#### 输出说明

| 输出名 | 类型 | 描述 |
| --- | --- | --- |
| 任务 ID（`task_id`） | STRING | Lux3D 任务 ID |
| Lux3D ZIP（`lux3d_zip`） | STRING | Lux3D ZIP 结果 URL |
| GLB（`glb`） | STRING | GLB 模型 URL |
| PLY（`ply`） | STRING | PLY 高斯泼溅结果 URL |

### Lux3D 四视图

**分类：** `Lux3D/生成`

根据可选的物体图片和/或文本提示词 生成 4 张多视角图片，支持纯图、纯文和图文组合请求。

#### 输入参数

| 参数名 | 类型 | 描述 |
| --- | --- | --- |
| API 地址（`base_api_path`） | STRING | Lux3D API 地址：`https://api.aholo3d.cn`（国内）或 `https://api.aholo.ai`（国际） |
| 图片（`image`） | STRING / IMAGE | 可选；公开 HTTP(S) 图片 URL、上游 `STRING` URL 或一张本地 `IMAGE`；本地输入通过 Asset/OUS 上传 |
| 提示词（`prompt`） | STRING | 可选多行生成提示词；`图片` 与 `提示词` 至少提供一个 |

#### 输出说明

| 输出名 | 类型 | 描述 |
| --- | --- | --- |
| 任务 ID（`task_id`） | STRING | Lux3D 任务 ID |
| 图片 1（`image_1`） | STRING | `FRONT_THREE_QUARTER` 图片 URL |
| 图片 2（`image_2`） | STRING | `OPPOSITE_THREE_QUARTER` 图片 URL |
| 图片 3（`image_3`） | STRING | `SIDE` 图片 URL |
| 图片 4（`image_4`） | STRING | `BACK` 图片 URL |

### Lux3D 单图生成

**注册节点标识：** `Lux3DOpenAPISingleImageGenerator`

**分类：** `Lux3D/生成`

根据可选图片和/或文本提示词 生成一张新图片。节点在内部创建并轮询 OpenAPI 任务；仅提供图片时也会重新生成，不会原样返回输入图片。

#### 输入参数

| 参数名 | 类型 | 描述 |
| --- | --- | --- |
| API 地址（`base_api_path`） | STRING | Lux3D API 地址：`https://api.aholo3d.cn`（国内）或 `https://api.aholo.ai`（国际） |
| 图片（`image`） | STRING / IMAGE | 可选；公开 HTTP(S) 图片 URL、上游 `STRING` URL 或一张本地 `IMAGE`；本地输入通过 Asset/OUS 上传 |
| 提示词（`prompt`） | STRING | 可选多行生成提示词；`图片` 与 `提示词` 至少提供一个 |

#### 输出说明

| 输出名 | 类型 | 描述 |
| --- | --- | --- |
| 任务 ID（`task_id`） | STRING | Lux3D 任务 ID |
| 图片地址（`image_url`） | STRING | 新生成图片的 URL，不会返回 Base64 data URL |

### Lux3D 多格式导出

**分类：** `Lux3D/导出`

将远程或 ComfyUI 本地的 GLB / Lux3D ZIP 模型导出为一种或多种目标格式。本地文件会先上传到 Lux3D。输入 ZIP 时，`Lux3D ZIP` 回传源 ZIP，`GLB` 返回默认导出的 GLB；输入 GLB 时，`GLB` 回传原模型 URL、必须显式选择至少一种目标格式，且 `Lux3D ZIP` 为空。

#### 输入参数

| 参数名 | 类型 | 描述 |
| --- | --- | --- |
| API 地址（`base_api_path`） | STRING | Lux3D API 地址：`https://api.aholo3d.cn`（国内）或 `https://api.aholo.ai`（国际） |
| 模型地址（`model_url`） | STRING / 模型源 | 公开 HTTP(S) `.glb` / `.zip` URL、上游 STRING 输出，或 ComfyUI 本地 `.glb` / `.zip` 文件 |
| 输出格式（`output_format`） | 枚举 | `默认`；`USDZ`、`OBJ ZIP`、`FBX ZIP`、`STL`、`3MF` 中的任意一种；或这 5 种格式的任意不重复组合。GLB 输入必须显式选择至少一种导出格式，因此 `默认` 仅适用于 ZIP 输入 |

#### 输出说明

| 输出名 | 类型 | 描述 |
| --- | --- | --- |
| 任务 ID（`task_id`） | STRING | Lux3D 任务 ID |
| GLB（`glb`） | STRING | ZIP 输入的默认 GLB 导出；GLB 输入的原模型 URL |
| USDZ（`usdz`） | STRING | USDZ 文件 URL |
| OBJ ZIP（`obj_zip`） | STRING | OBJ ZIP 文件 URL |
| FBX ZIP（`fbx_zip`） | STRING | FBX ZIP 文件 URL |
| STL（`stl`） | STRING | STL 文件 URL |
| 3MF（`3mf`） | STRING | 3MF 文件 URL |
| Lux3D ZIP（`lux3d_zip`） | STRING | ZIP 输入的源 Lux3D ZIP URL；GLB 输入时为空 |

节点输出插槽顺序为 `任务 ID`、`GLB`、`USDZ`、`OBJ ZIP`、`FBX ZIP`、`STL`、`3MF`、`Lux3D ZIP`；为兼容已有工作流，前 5 个位置保持不变。服务端响应本身固定为 `zipUrl`、`glbUrl`、`usdzUrl`、`objZipUrl`、`fbxZipUrl`、`stlUrl`、`threeMfUrl` 七个位置，插件直接按位置映射，不依赖 URL 文件名或扩展名。

### Lux3D 模型材质重绘

**分类：** `Lux3D`

使用一张参考图，以固定版本 `v3.0-standard` 重绘已有 GLB 的材质。连接的本地图像和选择的本地 GLB 会在提交任务前上传。

#### 输入参数

| 参数名 | 类型 | 描述 |
| --- | --- | --- |
| 材质参考图（`image`） | STRING / IMAGE | 必填；公开 HTTP(S) 参考图 URL、上游 `STRING` URL 或一张本地 `IMAGE` |
| 模型地址（`mesh_url`） | STRING / 模型源 | 公开 HTTP(S) `.glb` URL、上游 STRING 输出，或 ComfyUI 本地 `.glb` 文件 |
| API 地址（`base_api_path`） | STRING | Lux3D API 地址：`https://api.aholo3d.cn`（国内）或 `https://api.aholo.ai`（国际） |

#### 输出说明

| 输出名 | 类型 | 描述 |
| --- | --- | --- |
| GLB（`glb_model_url`） | STRING | 重绘材质后的新模型下载 URL |

### Lux3D 部件拆分

**分类：** `Lux3D/后处理`

将一个 GLB 模型拆分为多个部件，返回包含拆分结果的单个重构 GLB。本地 GLB 会先上传到 Lux3D。当前账号已有部件拆分任务进行中时，需等待该任务完成后再提交。

#### 输入参数

| 参数名 | 类型 | 描述 |
| --- | --- | --- |
| API 地址（`base_api_path`） | STRING | Lux3D API 地址：`https://api.aholo3d.cn`（国内）或 `https://api.aholo.ai`（国际） |
| 模型地址（`model_url`） | STRING / 模型源 | 公开 HTTP(S) `.glb` URL、上游 STRING 输出，或 ComfyUI 本地 `.glb` 文件 |

#### 输出说明

| 输出名 | 类型 | 描述 |
| --- | --- | --- |
| 任务 ID（`task_id`） | STRING | Lux3D 任务 ID |
| GLB（`glb`） | STRING | 包含拆分部件的重构 GLB URL，可连接到模型预览节点或下游模型处理节点 |

### Lux3D 模型重拓扑

**分类：** `Lux3D/后处理`

为静态、非 Draco 压缩 GLB 重新生成拓扑。输入不支持骨骼、蒙皮、动画或形态键，也不保证保留原部件。目标面数是预算，不保证精确面数或全部四边面；OBJ 为正式拓扑几何结果，GLB 始终为三角面。

#### 输入参数

| 参数名 | 类型 | 描述 |
| --- | --- | --- |
| API 地址（`base_api_path`） | STRING | Lux3D API 地址：`https://api.aholo3d.cn`（国内）或 `https://api.aholo.ai`（国际） |
| 模型地址（`model_url`） | STRING / 模型源 | 公开 HTTP(S) 静态 `.glb` URL、上游 STRING 输出，或 ComfyUI 本地 `.glb` 文件 |
| 目标面数（`face_limit`） | INT | 必填目标面数；四边面允许 `1000`–`500000`，三角面允许 `2000`–`1000000`。默认 `0` 仅表示尚未填写，不能用于创建任务 |
| 四边面拓扑（`quad`） | BOOLEAN | 是否使用四边面拓扑，默认 `开启`；`关闭` 为三角面 |
| 烘焙贴图（`bake_textures`） | BOOLEAN | 是否烘焙贴图，默认 `关闭`；恢复查询时保持与原请求一致，用于正确提示贴图包缺失 |
| 贴图尺寸（`texture_size`） | 枚举 | `512`、`1024`、`2048` 或 `4096`，默认 `2048`；不开启烘焙时也必须选择有效值 |
| 业务内容 ID（`content_id`） | STRING | 可选业务内容 ID，用于任务溯源，默认空字符串；不是幂等键 |
| 恢复任务 ID（`resume_task_id`） | STRING | 可选已有任务 ID；填写后仅使用原账号和区域继续查询，不上传模型、不创建新任务，也不修改原任务参数 |

#### 输出说明

| 输出名 | 类型 | 描述 |
| --- | --- | --- |
| 任务 ID（`task_id`） | STRING | Lux3D 任务 ID |
| GLB（`glb`） | STRING | 重拓扑后的 GLB URL，可连接到模型预览节点；贴图烘焙成功时包含贴图 |
| OBJ 白模（`OBJ Untextured`） | STRING | 独立 OBJ 几何白模 URL，保留服务实际生成的拓扑 |
| OBJ 带材质（`OBJ Textured`） | STRING | 包含 OBJ、MTL 和贴图的 ZIP URL；未生成贴图包时为空字符串 |

输出位置固定，不会因贴图包缺失而前移。结果面板只显示非空下载链接；请求烘焙但未生成 ZIP 时会提示“已有几何结果，未生成贴图包”，GLB 和 OBJ 仍可使用。查询超时或中断后，可使用已记录的任务 ID 恢复查询；创建结果未知时，应先核对任务记录，避免重复创建。

### Lux3D 模型关节化

**分类：** `Lux3D/后处理`

根据 GLB 和运动提示词，为模型部件添加关节并生成运动效果。最终文件格式以服务实际返回结果为准；只有 GLB 结果会同时填充可连接到模型预览节点的 `GLB` 输出。

#### 输入参数

| 参数名 | 类型 | 描述 |
| --- | --- | --- |
| API 地址（`base_api_path`） | STRING | Lux3D API 地址：`https://api.aholo3d.cn`（国内）或 `https://api.aholo.ai`（国际） |
| 模型地址（`model_url`） | STRING / 模型源 | 公开 HTTP(S) `.glb` URL、上游 STRING 输出，或 ComfyUI 本地 `.glb` 文件 |
| 提示词（`prompt`） | STRING | 必填的非空运动提示词，说明运动部件、固定部件及期望的关节运动方式 |

#### 输出说明

| 输出名 | 类型 | 描述 |
| --- | --- | --- |
| 任务 ID（`task_id`） | STRING | Lux3D 任务 ID |
| 结果地址（`result_url`） | STRING | 单个最终文件的下载 URL |
| 结果格式（`result_format`） | STRING | 从最终 URL 识别的文件格式，例如 `GLB` 或 `ZIP`；无法识别扩展名时为 `unknown` |
| GLB（`glb`） | STRING | 结果为 GLB 时与 `结果地址` 相同；其他格式为空字符串 |

### Lux3D 人物模型自动绑骨

**分类：** `Lux3D/后处理`

为人物 GLB 模型自动绑定骨骼。公开模型地址必须使用 HTTPS；本地 GLB 会先上传。完成后返回的已绑骨 GLB 可继续连接人物模型动画重定向节点。

#### 输入参数

| 参数名 | 类型 | 描述 |
| --- | --- | --- |
| API 地址（`base_api_path`） | STRING | Lux3D API 地址：`https://api.aholo3d.cn`（国内）或 `https://api.aholo.ai`（国际） |
| 模型地址（`model_url`） | STRING / 模型源 | 公开 HTTPS 人物 `.glb` URL、上游 STRING 输出，或 ComfyUI 本地人物 `.glb` 文件 |

#### 输出说明

| 输出名 | 类型 | 描述 |
| --- | --- | --- |
| 任务 ID（`task_id`） | STRING | Lux3D 任务 ID |
| GLB（`glb`） | STRING | 已绑骨的 GLB URL，可连接到模型预览节点或 `Lux3D 人物模型动画重定向` 的 `模型地址` |

### Lux3D 人物模型动画重定向

**分类：** `Lux3D/后处理`

为已绑骨 GLB 生成指定动作。公开模型地址必须使用 HTTPS；本地 GLB 会先上传。动作目录包含 85 个公开 ID，支持 1–10 个不同动作、逐动作或合并输出，以及原地动画。

#### 输入参数

| 参数名 | 类型 | 描述 |
| --- | --- | --- |
| API 地址（`base_api_path`） | STRING | Lux3D API 地址：`https://api.aholo3d.cn`（国内）或 `https://api.aholo.ai`（国际） |
| 模型地址（`model_url`） | STRING / 模型源 | 公开 HTTPS 已绑骨 `.glb` URL、绑骨节点的 `GLB` 输出，或 ComfyUI 本地已绑骨 `.glb` 文件 |
| 动作 ID（`animation_ids`） | STRING | 1–10 个不重复且区分大小写的公开动作 ID；JSON 数组或每行一个 ID，默认 `["Walk_Loop"]`，也可通过动作选择按钮追加 |
| 动画输出方式（`output_mode`） | 枚举 | `逐动作`（默认）为每个动作输出一个文件；`合并输出` 将动作合并为单个文件中的独立动画片段 |
| 输出格式（`out_format`） | 枚举 | `GLB`（默认）或 `FBX`；FBX 为原文件，不是 ZIP |
| 原地动画（`animate_in_place`） | BOOLEAN | 是否原地运动，默认 `关闭` |

#### 输出说明

| 输出名 | 类型 | 描述 |
| --- | --- | --- |
| 任务 ID（`task_id`） | STRING | Lux3D 任务 ID |
| GLB（`glb`） | STRING | GLB 输出模式下首个成功结果的 URL；FBX 模式时为空字符串 |
| FBX（`fbx`） | STRING | FBX 输出模式下首个成功结果的 URL；GLB 模式时为空字符串 |
| 动作结果 JSON（`actions_json`） | STRING | 包含 `actions` 数组的 JSON 字符串，按请求顺序记录每个动作的 ID、状态、成功 URL 或失败原因 |

结果面板提供全部成功文件的下载入口及逐动作状态。部分动作失败时，成功结果仍可使用；全部动作失败时节点报错。GLB 可在模型预览节点中播放，合并结果可切换动画片段；FBX 需下载后使用目标 3D 软件打开。

## 常见问题
 
1.通过comfyui-manager安装插件时，如果遇到安全等级问题，请修改comfyui-manager配置文件内的对应的安全等级后，再重试安装。

## 开发说明

### 项目结构

```text
comfyui-lux3d/
├── __init__.py               # 注册当前 12 个节点和前端目录
├── lux3d_openapi/            # OpenAPI 客户端、契约、任务轮询和 10 个任务节点
├── lux3d_material.py         # Lux3D 模型材质重绘 节点
├── lux3d_viewer.py           # Lux3D 模型预览 节点
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

当前注册节点不读取 `config.txt`，也不会在工作流中提供 API Key 输入框。请在启动 ComfyUI 的进程环境中配置与 `API 地址` 对应的变量：

| API 地址（`base_api_path`） | 环境变量 |
| --- | --- |
| `https://api.aholo3d.cn` | `LUX3D_API_KEY_CN` |
| `https://api.aholo.ai` | `LUX3D_API_KEY_INTL` |

已保存工作流若显式填写 `https://api.aholo3d.com`，上传凭证、生成和任务查询仍使用该旧域及 `LUX3D_API_KEY_INTL`。升级插件不会重写已保存的工作流地址。迁移时，请将各相关节点的 `base_api_path` 改为 `https://api.aholo.ai` 并保存工作流；客户端会添加 `/global`，输入框中不要填写该路径。旧 API 的可用性和兼容期限由网关维护方确定；客户端接受旧地址不代表旧入口会一直可用。

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

只使用其中一个区域时，只需配置对应变量。环境变量必须对 ComfyUI 服务端进程可见，修改后请重启 ComfyUI。`Lux3D 模型预览` 不请求 Lux3D API，因此不需要 API Key。

## 许可证

[MIT](LICENSE)
