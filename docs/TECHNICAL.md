# PaperWorld 技术说明

本文记录当前版本的模块边界、四幕主线、存档兼容与测试方法。产品介绍、使用流程与隐私说明以根目录 `README.md` 为准。

## 1. 路由与信息层级

| 路径 | 角色 | 默认去向 |
| --- | --- | --- |
| `index.html` | 空间站外景与两个主要动作 | 「进入空间站」→ `station.html`；「上传我的论文」→ `parse.html` |
| `station.html` | 四幕入口 | 四个舱门对应 `story.html#act-{id}`；「直接阅读」→ `story.html` |
| `story.html` | 默认阅读主线 | 四幕故事 + 文末折叠参考文献 |
| `hall.html` | 主动进入的完整资料 | 四主题折叠，内部保留七个原始分厅 |
| `parse.html` | 上传与生成 | 生成完成后的主按钮 → `story.html?e=<id>` |
| `core.html` | 唯一的模型配置入口 | 后端地址、令牌、服务商、API Key、测试连接 |
| `about.html` | 产品原则与边界 | 阅读首展、上传论文 |

旧链接 `index.html?e=<id>` 在页面内重定向到 `story.html?e=<id>`。`hall.html#<hallId>` 仍然可用：会展开该分厅所属的主题并定位。

## 2. 四幕故事模型

`js/engine/stories/aloha.js` 是唯一的故事模型来源，导出：

- `ACT_IDS = ["problem", "solution", "results", "impact"]`
- `ALOHA_STORY`：示范展的手写四幕，每幕含 `plain / tech / quotes / figures / stat / interact`
- `normalizeActs(acts)`：把旧五幕或模型输出的 `why / idea / how / result / meaning` 归并到四幕
- `ensureFourActs(acts)`：无论输入几条，都补齐四个槽位；缺证据时明确写「未检出」，不生成事实
- `resolveStory(bp)`：读取 `bp.story`、示范展手写故事或本地自动故事，统一返回四幕

`story.html` 与 `station.html` 都调用 `resolveStory`。空间站不再读取 `bp.halls` 生成舱门，只读取 `story.acts`，因此不会重新出现七个展区入口。

自动展的本地故事由 `buildLocalStory(bp)` 用六维度数据组装；接入 AI Core 后，`js/engine/curate.js` 的 `applyAIPlan` 把模型返回的故事与展区讲解写入 `bp.story` 和对应分厅。模型无法新增 evidence，服务端与前端都会回查引文 id。

## 3. 完整资料的存档映射

`js/engine/render.js` 中的 `ARCHIVE_GROUPS` 定义五个折叠主题（四幕 + 参考文献），`HALL_GROUP` 把原始分厅归入主题：

| 主题 | 原始分厅 |
| --- | --- |
| 第一幕 · 为什么研究 | `question`、`dim-background`、`dim-question` |
| 第二幕 · 怎么做 | `specimen`、`method`、`dim-innovation`、`dim-method`、`plates` |
| 第三幕 · 效果如何 | `bench`、`ablation`、`dim-experiment`、`dim-result` |
| 第四幕 · 价值与局限 | `horizon`、`dim-limitation` |
| 参考文献与其他资料 | `archive`，以及无法归类的分厅 |

所有原始 `<section class="hall" id="...">` 都保留原 id、块顺序与证据引用。渲染只是把它们放进 `<details>`，因此：

- `paperworld.blueprint/v1` 不需要迁移；
- `hall.html#question` 等旧深链接仍能定位；
- 原页 PDF 渲染、证据抽屉、互动装置无需修改。

默认只展开第一个主题。`initHoloNav()` 在展开目标主题后再滚动，避免折叠状态下原生锚点无法定位。

## 4. 首页 3D 外景

`js/cosmos/entranceScene.js` 用本地 `vendor/three/three.module.js` 程序化搭建：

- 环形居住舱：`TorusGeometry` + 28 个实例化模块舱 + 舷窗；
- 六根辐条与中央脊柱、环向接缝；
- 对接通道、肋环、四根管线；
- 两扇对开舱门、门后暖光、门边指示灯；
- 贯穿式桁架梁与左右各两组太阳翼（程序化电池片贴图）；
- 背侧散热板与天线。

镜头由 `js/cosmos/camera.js` 的 `z` 值驱动，`entranceScene.setCamera(z, warp)` 把进度映射到远景、接近、对接三个位置；桌面端把主体偏到右侧给文案让位，移动端居中并把初始距离拉远以容纳太阳翼。最后一阶段舱门向两侧打开。

渲染策略：ACES 色调映射、透明背景、太阳光 + 半球光 + 舱门点光；移动端降低 DPR 并关闭阴影。运行中若持续低于 34fps，会先降分辨率再关阴影。`prefers-reduced-motion` 下不启动帧循环，点击直接进入空间站。WebGL 不可用时不创建渲染器，由既有 Canvas2D 星云承担背景。

首页 3D 不依赖 GLB 或外部贴图；`js/cosmos/assets.js` 仍保留可选 GLB/KTX2 扩展点，未提供 manifest 时静默跳过。

## 5. 空间站内部

`station.html` 仍优先使用 `js/cosmos/stationCinematic.js`（Three.js PBR 环形大厅），失败时回退 `station3d.js`，再失败显示四幕列表。改动仅在输入：

```js
doors = acts.map((act, i) => ({
  num: ["第一幕", "第二幕", "第三幕", "第四幕"][i],
  title: act.title,
  theta: (i / acts.length) * Math.PI * 2,
  id: "act-" + act.id,
}));
```

`onSelect` 跳转 `story.html#act-{id}`。渲染器与画质档位未改。

## 6. 视觉收敛

`css/refined.css` 在所有页面最后加载，只覆盖呈现层：

- 正文桌面 17px、移动 16px，次要说明最低 14px；
- 统一导航、按钮、圆角与边框，移除扫描线和装饰性动效；
- 首页只保留两个主按钮与一条首展直达链接；
- 四幕主线限制每幕一张核心图，其余图版进入展开层；
- 完整资料按主题折叠，并重置旧展区的首字下沉与过小字号；
- AI Core、上传页、关于页收敛为同一套文字与间距尺度。

不改 `blueprint/v1`、PDF 解析、`js/core/drawer.js` 或 `js/core/pdfview.js`。

## 7. AI Core

后端在 `server/index.js`：零 npm 依赖，负责服务商预设、AES-256-GCM 加密保存密钥、测试连接、异步策展任务、Bearer 鉴权、限速与超时。前端 `js/engine/ai.js` 只与后端通信。

`parse.js` 的生成流程：

1. 本地解析 PDF；
2. 六维度分析；
3. 若配置了 AI Core，提交策展任务并轮询；
4. 成功则 `applyAIPlan` 写入故事与展区讲解；失败或不配置则保留本地提取式策展；
5. 写入 IndexedDB / localStorage，主按钮进入 `story.html`。

浏览器本地 API Key 配置路径已移除，旧的 `js/engine/llm.js` 不再参与构建。模型输出必须通过服务端的结构校验，讲解中出现新数值会被丢弃。

## 8. 测试

使用真实 Chrome（CDP）跑桌面 1440×900 与移动 390×844，检查：

- 控制台错误、断链、横向溢出、图片加载失败；
- 所有入口最终落到 `story.html`；
- 空间站只出现四个故事舱门；
- 完整资料只出现五个折叠主题，内部保留七个原始分厅；
- 故事四幕、每幕一张主线图、文末参考文献；
- 证据抽屉与 PDF 原页高亮；
- 上传演示生成与展览库入口；
- `prefers-reduced-motion` 与无 WebGL 降级；
- 首页 3D 首帧与运行帧率。

`tools/build_blueprint.py` 在每次构建时逐条核对 81 条引文；运行期由 `js/core/drawer.js` 回查证据 id，缺证据会显示未核验标记。

## 9. 数据兼容清单

- `paperworld.blueprint/v1`：不变；
- `evidence` 字段：不变；
- `halls[].blocks` 类型：不变；
- IndexedDB 数据库与对象仓库：不变；
- `localStorage` 索引 `pw.index.v1` / 蓝图键：不变；
- PDF 原页渲染与高亮：不变；
- 旧 `index.html?e=<id>` 与 `hall.html#<id>`：改为进入故事 / 展开对应主题，仍然可用。
