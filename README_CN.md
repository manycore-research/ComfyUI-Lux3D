# ComfyUI-Lux3D & LuxReal Engine Nodes

<div align="center">

[中文](README_CN.md)/[English](README.md)

🌐 官方网站：[Lux3D 国内站](https://www.luxreal.com/lux3d/home) | [Lux3D 国际站](https://www.luxreal.ai/lux3d/home)
</div>

一个ComfyUI插件，用于在你的工作流中将2D图片转换为3D模型；支持实时渲染、场景模板切换、材质预览以及各类通道图渲染。

## 行业应用

从游戏开发到电子商务，Lux3D 全面驱动下一代 3D 内容创作。

### 电商

为沉浸式购物体验打造高品质的 3D 产品可视化。

- 产品配置器
- AR 试穿
- 虚拟展厅

<table>
<tr>
<th align="center" width="50%">输入图</th>
<th align="center" width="50%">生成结果</th>
</tr>
<tr>
<td align="center" width="50%">
<img src="figures/ecommerce.jpg" height="200" alt="输入图">
</td>
<td align="center" width="50%">
<video src="https://github.com/user-attachments/assets/25df0ee3-1100-4201-9670-22ada6e43374" controls width="100%"></video>
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="figures/fruit.png" height="200" alt="输入图">
</td>
<td align="center" width="50%">
<img src="figures/fruit-output.jpg" height="200" alt="生成结果">
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="figures/Glass-vase.jpg" height="200" alt="输入图">
</td>
<td align="center" width="50%">
<img src="figures/Glass-vase-output.jpg" height="200" alt="生成结果">
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

<table>
<tr>
<th align="center" width="50%">输入图</th>
<th align="center" width="50%">生成结果</th>
</tr>
<tr>
<td align="center" width="50%">
<img src="figures/game1.jpg" height="180" alt="输入图1">
<img src="figures/game2.jpg" height="180" alt="输入图2">
<img src="figures/game3.jpg" height="180" alt="输入图3">
</td>
<td align="center" width="50%">
<video src="https://github.com/user-attachments/assets/5f026961-f276-4ab2-ba0f-a5809d54363a" controls width="100%"></video>
</td>
</tr>
</table>

### 工业设计

以前所未有的速度和精度进行概念可视化及原型验证。

- 概念可视化
- 数字孪生
- 快速原型

<table>
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

<table>
<tr>
<th align="center" width="50%">输入图</th>
<th align="center" width="50%">生成结果</th>
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
<img src="figures/Glassware.png" height="200" alt="输入图">
</td>
<td align="center" width="50%">
<img src="figures/Glassware-output.jpg" height="200" alt="生成结果">
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

### Lux3D 节点

<img src="figures/image.png" title="" alt="image.png" width="403">

- 支持通过连线接收ComfyUI标准`IMAGE`类型输入

- `api_key`支持从节点参数输入或配置文件读取

- 任务提交和状态查询功能

- 最多等待**15分钟**（60次 × 15秒间隔）

- 输出生成的3D模型URL

### LuxReal Engine 节点

<img title="" src="figures/image (1).png" alt="" width="491" data-align="inline">

- 最多支持**5个Lux3D输入**和**5个本地文件输入**

- 实时渲染方案构建和更新功能

- `api_key`支持从节点参数输入或配置文件读取

- 实时WebSocket消息推送

- 离线渲染生成**6种图像输出**：
  
  - 渲染图像（RGB）
  
  - 材质通道（Material Id）
  
  - 模型通道（Model Id）
  
  - 深度图（Depth EXR）
  
  - 漫反射图（Diffuse）
  
  - 法线图（Normal）

- 可配置**分辨率**（1K/2K/4K/8K）和**宽高比**（1:1/16:9/9:16/4:3/3:4）


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

3. 配置API密钥：
- 将`lux3d_api_key`添加到`config.txt`中，或者使用时直接在节点参数中输入。
4. 重启ComfyUI。

## 使用说明

### lux3d_api_key获取

[点击跳转](https://forms.cloud.microsoft/r/kRTjdDBV1e)，留下您的个人信息，我们会将`api_key`发送到您的邮箱。

如有任何问题，请联系我们lux3d@qunhemail.com，我们将尽快回复。

### Lux3D 节点使用

1. 在ComfyUI 节点库中的`Lux3D`分类下找到`Lux3D`节点，或在空白处双击搜索并添加。
   
   ![image (2).png](figures/image%20(2).png)

2. 连接`IMAGE`类型的输入端口。

3. 运行工作流。

4. 节点将返回生成的3D模型下载URL。
   
   ![image (3).png](figures/image%20(3).png)

### LuxReal Engine 节点使用

1. 在ComfyUI工作区中，从节点菜单的`Lux3D`分类下找到`LuxReal Engine`节点

2. 链接输入端口：
- **lux3D_input**：最多链接5个lux3D的glb_model_url输出端口

- **file_input**：链接本地glbmodel path，或直接直接输入glb文件路径
  
  ![image (4).png](figures/image%20(4).png)

3.模型上传并同步至渲染场景：

![image (5).png](figures/image%20(5).png)

4.编辑场景：

- 切换场景模板：
  
  ![切换场景.gif](figures/sceneswitch.gif)

- 切换灯光效果：
  
  ![切换光影.gif](figures/lightswitch.gif)

- 编辑物体位置：
  
  ![切换位置.gif](figures/transformswitch.gif)

5.配置参数：

- **resolution**: 选择输出分辨率（1K/2K/4K/8K）

- **ratio**: 选择宽高比（1:1/16:9/9:16/4:3/3:4）

- **lux3d_input_1~5**: 连接Lux3D节点的输出URL

- **file_input_1~5**: 输入本地文件路径（支持Glb/OBJ格式）

- **seed**: 随机种子
6. 连接输出端口：
   
   ![image (6).png](figures/image%20(6).png)
- **render_image**: 渲染图像
- **material_ch**: 材质通道
- **model_ch**: 模型通道
- **depth**: 深度图
- **diffuse**: 漫反射图
- **normal**: 法线图
7. 运行工作流：
- 输入物体实现在场景中的实时渲染
- 节点通过WebSocket推送iframe URL到前端
- 通过加载图像获取图片内容

## 节点说明

### Lux3D 节点

将2D图片转换为3D模型的核心节点。

#### 输入参数

| **参数名**       | **类型** | **描述**                          |
| ------------- | ------ | ------------------------------- |
| image         | IMAGE  | 输入图片，支持通过连线接收ComfyUI标准`IMAGE`类型 |
| base_api_path | STRING | API服务器地址                        |
| lux3d_api_key | STRING |                                 |

#### 输出说明

| **输出名**       | **类型** | **描述**       |
| ------------- | ------ | ------------ |
| glb_model_url | STRING | 生成的3D模型下载URL |

### LuxReal Engine 节点

实时渲染和材质预览节点。

#### 输入参数

| **参数名**         | **类型** | **默认值** | **描述**                     |
| --------------- | ------ | ------- | -------------------------- |
| resolution      | 枚举     | 1K      | 输出分辨率（1K/2K/4K/8K）         |
| ratio           | 枚举     | 16:9    | 宽高比（1:1/16:9/9:16/4:3/3:4） |
| lux3d_input_1~5 | STRING | None    | Lux3D节点输出URL               |
| file_input_1~5  | STRING | None    | 本地文件路径（支持Glb/OBJ格式）        |
| base_api_path   | STRING | 默认API地址 | API服务器地址                   |
| seed            | INT    | 0       | 随机种子                       |
| _upload_cache   | STRING | {}      | 上传缓存（自动传递）                 |

#### 输出说明

| **输出名**      | **类型** | **描述** |
| ------------ | ------ | ------ |
| render_image | IMAGE  | 渲染图像   |
| material_ch  | IMAGE  | 材质通道   |
| model_ch     | IMAGE  | 模型通道   |
| depth        | IMAGE  | 深度图    |
| diffuse      | IMAGE  | 漫反射图   |
| normal       | IMAGE  | 法线图    |

## 使用示例

- 使用lux3D节点和LuxReal Engine节点，生成物体模型，并渲染成图：
  
  - （待添加）

- 使用lux3D节点和LuxReal Engine节点，结合本地模型，生成组合物体，并进行场景布置成图：
  
  - （待添加）

- 使用LuxReal Engine节点，生成物体通道图，并对物体的部分材质进行编辑重生成：
  
  - （待添加）

## 常见问题
 
1.通过comfyui-manager安装插件时，如果遇到安全等级问题，请修改comfyui-manager配置文件内的对应的安全等级后，再重试安装。

## 开发说明

### 项目结构

```
comfyui-lux3d/
├── __init__.py               # 节点注册文件
├── lux3d_node.py             # Lux3D 核心节点实现
├── luxreal_engine.py         # LuxReal Engine 节点实现
├── render/                   # 渲染模块
│   ├── __init__.py
│   ├── offline_render.py     # 离线渲染模块
│   ├── build_render_design.py# 渲染方案构建模块
│   ├── image_to_torch.py     # 图像转换工具
│   └── model_upload.py       # 模型上传工具
├── sso/                      # SSO 认证配置目录
│   └── sso_token.py          # SSO Token 加载模块
├── upload/                   # 上传模块
│   ├── __init__.py
│   └── upload.py             # 上传实现
├── js/                       # 前端 JavaScript 模块
│   └── lux3d_viewer.js       # 3D 查看器
├── requirements.txt          # 依赖列表
├── config.txt.example        # 配置文件示例
└── README.md                 # 项目说明文档
```

### 依赖说明

| **依赖名称** | **版本号要求**                                                            | **功能概述**        | **开源许可证**  |
|----------|----------------------------------------------------------------------|-----------------|------------|
| requests | &gt;=2.25.0                                                          | HTTP请求库，用于API调用 | Apache 2.0 |
| Pillow   | &gt;=9.0.0                                                           | 图像处理库           | BSD        |
| NumPy    | &gt;=1.21.0                                                          | 科学计算库           | BSD        |
| OpenEXR  | ==3.4.4 (python_version == "3.12");==3.2.4(python_version == "3.11") | EXR图像处理库（用于深度图） | BSD        |

## 配置说明

### config.txt.example

将 `config.txt.example` 复制为 `config.txt` 并配置以下参数：

```
lux3d_api_key=your_lux3d_api_key
```

## 更新日志

(待添加)

## 许可证

[MIT](LICENSE)
