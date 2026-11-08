# PaperWorld AI Core · 后端

前后端分离架构里的「后端」这一半：负责模型调用与密钥管理，浏览器不再接触 API Key。
零 npm 依赖，Node 18+ 直接运行。

## 快速开始

```bash
node server/index.js
```

然后打开 `http://localhost:8080` —— 它同时托管了仓库根目录的静态前端，本地一条命令即可跑通完整产品。

生产环境请先设置环境变量（参考 `.env.example`）：

```bash
PW_TOKEN=改成一个随机长字符串   # 开启接口鉴权
PW_SECRET=改成一个只有你知道的串  # 用于加密模型密钥，换机器/重装后密钥仍能解密
PORT=8080
```

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 健康检查，返回是否已配置密钥 |
| GET | `/api/core/providers` | 支持的模型服务商预设 |
| GET | `/api/core/config` | 读取配置（不含 Key，只返回 `hasKey`） |
| POST | `/api/core/config` | 保存配置；`apiKey` 用 AES-256-GCM 加密落盘 |
| DELETE | `/api/core/config` | 清除配置 |
| POST | `/api/core/test` | 测试模型连接（发一条最小请求，返回耗时与回显） |
| POST | `/api/core/curate` | 提交策展任务，返回 `taskId` |
| GET | `/api/core/task/:id` | 轮询任务进度与结果 |
| GET | `/api/core/tasks` | 最近任务列表 |

所有 `/api/*` 在设置了 `PW_TOKEN` 时都需要 `Authorization: Bearer <token>`；每 IP 限速 60 次/分钟。

## 安全设计

- **API Key 不进浏览器**：前端只传 Key 给后端一次，后端 AES-256-GCM 加密后写入 `server/data/core.json`，解密只在内存里发生，日志与接口响应都不回显 Key。
- **主密钥**：优先用 `PW_SECRET` 环境变量；不设置则首次启动生成 `server/data/master.key`（文件权限 0600，仅适合本机开发）。换机器部署时请用 `PW_SECRET`，否则加密的 Key 解不开。
- **鉴权 + 限速**：生产必须设置 `PW_TOKEN`；内置每 IP 每分钟 60 次限速与模型调用超时（默认 45s）。
- **数据目录** `server/data/` 已加入 `.gitignore`，不会被提交。

## 策展任务

`POST /api/core/curate` 接收论文类型、摘要、章节、图注、**原文语句清单**（`sentences: [{id, page, section, dim, text}]`）与带 `quoteIds` 的维度信息，由模型生成科研故事四幕（problem / solution / results / impact）与分厅讲解。

服务端会按类型侧重生成，并**逐条校验**模型输出：

- 四幕各最多一次；每一幕的 `quoteIds` 必须属于对应维度（问题/方法/结果/边界），模型至少选 1 条、最多 3 条；服务端可能为了数字补证追加到 4 条；
- 讲解里出现数字时，先在允许维度中寻找包含该数字的原句并补入本幕证据；找不到就隐藏数字或拒绝整幕；
- 统计值必须是单个数字，且在本幕引文中出现；
- 分厅 id 与引文必须属于同一个已提交维度；
- 标题、正文长度与句末标点都有检查；不合规内容会被拒绝而非静默改写；
- 若仍有幕缺失，会用该幕允许的句子做一次修正轮；修正仍失败就返回其余结果，前端用本地证据补齐。

因此模型不能凭空新增事实；生成结果写入展馆蓝图后，正常浏览不再消耗模型 Token。

## 部署建议

| 场景 | 做法 |
| --- | --- |
| 本机开发 | `node server/index.js`，前端走 `http://localhost:8080` |
| 云主机 / VPS | 同样一条命令，配好 `PW_TOKEN` 与 `PW_SECRET`，用 nginx/caddy 反代并开 HTTPS |
| Docker | 把仓库根目录作为镜像内容，`CMD ["node","server/index.js"]`，数据卷挂 `server/data` |
| 前端 | 纯静态，继续用 GitHub Pages；在「AI Core」页面填入后端地址即可 |

后端与前端通过「后端地址 + 访问令牌」解耦：换后端不动前端，前端换托管不动后端。
