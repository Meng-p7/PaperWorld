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
- `ensureFourActs(acts, focus)`：无论输入几条，都补齐四个槽位；缺证据时明确写「未检出」，不生成事实
- `resolveStory(bp)`：读取 `bp.story`、示范展手写故事或本地自动故事，统一返回四幕

`analyze.js` 还负责判断论文类型（`robotics / algorithm / mechanical / materials / theory / review / benchmark / empirical`），并给出该类型的四幕标题与讲解侧重。类型判断是版面和措辞信号启发式，会写入 `meta.analysis.type/focus`；不会生成论文事实。

`story.html` 与 `station.html` 都调用 `resolveStory`。空间站不再读取 `bp.halls` 生成舱门，只读取 `story.acts`，因此不会重新出现七个展区入口。

自动展的本地故事由 `buildLocalStory(bp)` 用类型侧重与六维度证据组装；接入 AI Core 后，`js/engine/curate.js` 的 `applyAIPlan` 把模型返回的故事与分厅讲解写入 `bp.story` 和对应分厅。模型无法新增 evidence，服务端与前端都会回查引文 id。模型缺失的幕会改用本地证据补齐，不会用空话凑满。

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

- 环形居住舱：`TorusGeometry` + 24 个实例化分段舱体 + 舷窗；
- 六组双梁辐条与斜撑、中央脊柱、后方服务舱与外部货舱；
- 对接通道、伸缩肋环、四根管线、四片导向瓣与对接靶；
- 两扇对开舱门、门后暖光、门边指示灯；
- 贯穿式桁架与左右各三块太阳翼（程序化电池片贴图、边框与万向节）；
- 背侧散热板、天线、馈源与外部手扶栏。

镜头由 `js/cosmos/camera.js` 的 `z` 值驱动，`entranceScene.setCamera(z)` 把进度映射到远景、侧向接近、对接三个位置；桌面端把主体偏到右侧给文案让位，移动端居中并把初始距离拉远以容纳太阳翼。竖屏静止时通过 CSS 将 3D 画布上移，进入镜头时平滑回中。最后一阶段舱门向两侧打开。

渲染策略：ACES 色调映射、PMREM 环境反射、程序化 albedo/bump/roughness、太阳光 + 地球反照 + 轮廓光 + 舱门点光，静态阴影首帧烘焙后冻结。高/中档降低 DPR 与阴影分辨率；软件 WebGL 或极低端直接进入低档：0.82 DPR、无阴影、减少舱段细节，并把 PBR 材质降为带贴图的 Lambert。运行中若持续低于 34fps 会继续降档。`prefers-reduced-motion` 下不启动帧循环。WebGL 不可用时不创建渲染器，由 Canvas2D 星云承担背景。

当前**没有加载外部 GLB**。`js/cosmos/assets.js` 只读取 `assets/exhibits/manifest.json`，条目必须带明确的 `license` 才会尝试加载；当前 manifest 为空，所以首页与大厅全部是程序化几何。若之后加入 GLB，需要先 vendor `GLTFLoader` / 可选 `KTX2Loader` 与 basis 转码器，并提供失败回退。

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

中央玻璃展舱内的涡扇占位展品已替换为「论文档案核心」：悬浮核心 + 六片环绕纸页，与阅读主题对应，不声称是某篇论文的真实硬件。`onSelect` 跳转 `story.html#act-{id}`。内部画质档位与后处理未改；新增 `webglcontextlost` 处理，丢失上下文时停止帧循环，外层切回四幕列表，而不是黑屏或持续报错。`pagehide` 时释放渲染器。

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
2. 论文类型判断 + 六维度分析；
3. 若配置了 AI Core，提交策展任务并轮询；payload 包含类型侧重、摘要、章节、图注、带维度的句子清单；
4. 服务端按论文类型生成四幕，并做事实/引文/数值校验；若有幕缺失，会用该幕允许的引文做一次修正轮；
5. `applyAIPlan` 写入故事与分厅讲解；仍缺失的幕用本地证据补齐；失败或不配置则保留本地提取式策展；
6. 写入 IndexedDB / localStorage，主按钮进入 `story.html`；容量不足时先把最旧蓝图迁到 IndexedDB；
7. AI 失败时保留本地四幕，结果区可「重试 AI 策展」，只重跑策展，不重新解析 PDF。

服务端校验规则：

- 四幕各最多一次，引文必须属于该幕对应的维度（问题/方法/结果/边界）；
- 每幕至少一条引文，模型最多选 3 条；讲解中出现数字时，先在允许维度里找包含该数字的原句补入证据（最多补到 4 条），找不到则隐藏该数字或拒绝整幕；
- 统计值必须是单个数字，且在本幕引文中出现；
- 分厅 id 必须来自本次维度，引文必须属于该分厅维度；
- 仍缺失的幕触发一次只含允许句子的修正轮，修正仍失败则交给本地证据。

浏览器本地 API Key 配置路径已移除，旧的 `js/engine/llm.js` 不再参与构建。AI Core 未配置时首屏不自动发请求；失败原因会回到上传页，不再只在控制台里。

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
- 首页 3D 首帧与运行帧率、低档降级、上下文丢失；
- 上传失败的原因说明与重试入口；
- 长任务结束后的堆内存与页面切换。

`tools/build_blueprint.py` 在每次构建时逐条核对 81 条引文；运行期由 `js/core/drawer.js` 回查证据 id，缺证据会显示未核验标记。

## 9. 数据兼容清单

- `paperworld.blueprint/v1`：不变；
- `evidence` 字段：不变；
- `halls[].blocks` 类型：不变；
- IndexedDB 数据库与对象仓库：不变；
- `localStorage` 索引 `pw.index.v1` / 蓝图键：键名不变；容量不足时蓝图会迁到 IndexedDB v2 的 `blueprint` 仓库，读取逻辑自动回退，不丢失旧展览；
- PDF 原页渲染与高亮：不变；
- IndexedDB 升级到 v2，仅新增 `blueprint` 仓库；旧 `pdf` 仓库与 `paperworld.v1` 名称不变；
- 旧 `index.html?e=<id>` 与 `hall.html#<id>`：改为进入故事 / 展开对应主题，仍然可用；
- `meta.analysis` 新增 `type / focus`，旧蓝图缺这两个字段时仍按通用实验研究读取；
- `assets/exhibits/manifest.json` 为空且无外部模型资产，不改变既有渲染。

## 后端端点自动解析（`js/core/endpoint.js`）

早期版本让用户在 AI Core 里填写后端地址，这对普通用户是错的：克隆项目的人往往不知道要跑后端，更不知道地址该填什么。现在地址完全由运行环境决定，界面只留「填 API Key」这一步。

解析顺序（`baseFromContext()`，不联网）：

1. `DECLARED` 常量——把项目部署到自己的后端后改这一行，终端用户不可见；
2. `localStorage` 里上次连接成功记住的地址；
3. 页面同源（`location.origin`），前提是 host 为 localhost / 127.0.0.1——用 `start-backend.bat` 打开时后端就在同源；
4. 空。

`detect()` 只在用户点击「检测本机服务」或生成论文需要模型时调用，依次探测候选地址的 `/health`，第一个返回 `service: paperworld-ai-core` 的地址被记住。**页面加载时不做任何猜测性请求**，因此在线上托管（GitHub Pages）打开时控制台是干净的。

配套改动：

- `js/engine/ai.js` 的 `getCoreLink()` 改为从 `endpoint.js` 读取，不再读输入框；
- `core.html` 的「后端地址」输入移入 `<details>` 高级折叠，仅在自定义域名或开启 `PW_TOKEN` 时使用；
- `parse.html` 的状态条只在「本站点就是后端」时探测，其余情况不联网；
- `start-backend.bat` 启动后自动打开浏览器，用户落在同源页面上，AI Core 零点击即已连接。
