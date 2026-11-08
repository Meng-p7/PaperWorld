/* PaperWorld AI Core · 独立后端
 *
 * 为什么要有它：浏览器直接调用模型会把 API Key 暴露给任何能打开 DevTools 的人，
 * 也会被 CORS 卡住。这个服务把密钥加密留在服务端，只对前端暴露「配置 / 测试 / 任务」三类接口。
 *
 * 特性：
 *   - 零 npm 依赖，Node 18+ 内置 fetch 即可运行
 *   - API Key 用 AES-256-GCM 加密落盘，解密只在内存中进行
 *   - 异步策展任务队列：提交后返回 taskId，前端轮询进度，长任务不阻塞 HTTP
 *   - 可选 Bearer 鉴权（PW_TOKEN）、每 IP 限速、模型调用超时
 *   - 同时把仓库根目录当作静态站点托管，本地一条命令即可跑通前后端
 *
 * 运行：
 *   node server/index.js                 # 静态前端 + API，端口 8080
 *   PORT=3000 PW_TOKEN=xxx node server/index.js
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(__dirname, "data");
const KEYFILE = path.join(DATA, "master.key");
const CFGFILE = path.join(DATA, "core.json");
const LOGFILE = path.join(DATA, "events.log");

const PORT = Number(process.env.PORT || 8080);
// 不写 HOST 时用 Node 默认双栈监听（::，同时接受 IPv4 映射地址），
// 这样 localhost 无论解析到 127.0.0.1 还是 ::1 都能连上。
const HOST = process.env.HOST || null;
const PW_TOKEN = process.env.PW_TOKEN || "";
const MODEL_TIMEOUT = Number(process.env.PW_MODEL_TIMEOUT || 45000);

/* ---------------- 小工具 ---------------- */
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".pdf": "application/pdf", ".txt": "text/plain; charset=utf-8", ".wasm": "application/wasm",
};
function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(" ")}`;
  console.log(line);
  try {
    fs.mkdirSync(DATA, { recursive: true });
    fs.appendFileSync(LOGFILE, line + "\n");
  } catch { /* 日志失败不影响服务 */ }
}
function send(res, code, obj, headers = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    // Chrome 私有网络访问（PNA）：从公网页面（如 GitHub Pages）请求 localhost 时，
    // 预检必须显式允许，否则请求会被浏览器直接拦掉，页面只能看到「连不上」。
    "Access-Control-Allow-Private-Network": "true",
    ...headers,
  });
  res.end(body);
}
function fail(res, code, message, extra = {}) { send(res, code, { ok: false, error: message, ...extra }); }
/* 把模型/网络错误里的密钥片段抹掉，避免回显给前端或写进日志 */
function redact(text, secrets = []) {
  let s = String(text || "");
  for (const sec of secrets) if (sec && sec.length >= 6) s = s.split(sec).join("***");
  return s
    .replace(/\b(sk-[A-Za-z0-9_-]{8,})\b/g, (m) => m.slice(0, 5) + "***")
    .replace(/\b(api[_-]?key["']?\s*[:=]\s*["']?)([^\s"',;]{6,})/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "***");
}
function readBody(req, limit = 12 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(new Error("请求体过大")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/* ---------------- 鉴权 + 限速 ---------------- */
function authorized(req) {
  if (!PW_TOKEN) return true;
  const h = req.headers.authorization || "";
  return h === `Bearer ${PW_TOKEN}` || h === PW_TOKEN;
}
const hits = new Map();
function rateLimit(req, limit = 60, windowMs = 60000) {
  const ip = req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const bucket = hits.get(ip) || { start: now, n: 0 };
  if (now - bucket.start > windowMs) { bucket.start = now; bucket.n = 0; }
  bucket.n++;
  hits.set(ip, bucket);
  return bucket.n <= limit;
}

/* ---------------- 密钥加密（AES-256-GCM） ---------------- */
function masterKey() {
  if (process.env.PW_SECRET) {
    const raw = process.env.PW_SECRET;
    return crypto.createHash("sha256").update(raw).digest();
  }
  fs.mkdirSync(DATA, { recursive: true });
  if (fs.existsSync(KEYFILE)) return Buffer.from(fs.readFileSync(KEYFILE, "utf8").trim(), "hex");
  const k = crypto.randomBytes(32);
  fs.writeFileSync(KEYFILE, k.toString("hex"), { mode: 0o600 });
  log("已生成本地主密钥 server/data/master.key（生产环境请改用 PW_SECRET 环境变量）");
  return k;
}
function encryptSecret(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", masterKey(), iv);
  const ct = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(".");
}
function decryptSecret(blob) {
  const [iv, tag, ct] = String(blob || "").split(".");
  if (!iv || !tag || !ct) return "";
  const d = crypto.createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8");
}

/* ---------------- 配置 ---------------- */
const PROVIDERS = {
  openai: { label: "OpenAI", baseUrl: "https://api.openai.com/v1/chat/completions", model: "gpt-4o-mini", kind: "openai" },
  deepseek: { label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1/chat/completions", model: "deepseek-chat", kind: "openai" },
  zhipu: { label: "智谱 GLM", baseUrl: "https://open.bigmodel.cn/api/paas/v4/chat/completions", model: "glm-4-flash", kind: "openai" },
  qwen: { label: "通义千问", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", model: "qwen-plus", kind: "openai" },
  moonshot: { label: "Moonshot", baseUrl: "https://api.moonshot.cn/v1/chat/completions", model: "moonshot-v1-8k", kind: "openai" },
  anthropic: { label: "Anthropic", baseUrl: "https://api.anthropic.com/v1/messages", model: "claude-3-5-sonnet-latest", kind: "anthropic" },
  custom: { label: "自定义兼容端点", baseUrl: "", model: "", kind: "openai" },
};
function loadConfig() {
  try {
    const c = JSON.parse(fs.readFileSync(CFGFILE, "utf8"));
    return {
      provider: c.provider || "openai",
      baseUrl: c.baseUrl || PROVIDERS[c.provider]?.baseUrl || "",
      model: c.model || PROVIDERS[c.provider]?.model || "",
      apiKeyEnc: c.apiKeyEnc || "",
      updatedAt: c.updatedAt || null,
    };
  } catch {
    return { provider: "openai", baseUrl: PROVIDERS.openai.baseUrl, model: PROVIDERS.openai.model, apiKeyEnc: "", updatedAt: null };
  }
}
function saveConfig(c) {
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(CFGFILE, JSON.stringify({ ...c, updatedAt: Date.now() }, null, 2), { mode: 0o600 });
}

/* ---------------- 模型调用 ---------------- */
async function callModel({ baseUrl, apiKey, model, messages, maxTokens = 1600, timeout = MODEL_TIMEOUT }) {
  const isAnthropic = /anthropic\.com/.test(baseUrl) || /\/messages$/.test(baseUrl);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const url = isAnthropic
      ? baseUrl
      : (baseUrl.includes("chat/completions") ? baseUrl : baseUrl.replace(/\/+$/, "") + "/chat/completions");
    const headers = { "Content-Type": "application/json" };
    if (isAnthropic) {
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = "2023-06-01";
    } else headers.Authorization = `Bearer ${apiKey}`;
    const body = isAnthropic
      ? {
        model, max_tokens: maxTokens, temperature: 0.3,
        system: messages.filter((m) => m.role === "system").map((m) => m.content).join("\n"),
        messages: messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content })),
      }
      : { model, max_tokens: maxTokens, temperature: 0.3, messages };
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: ctrl.signal });
    const text = await res.text();
    if (!res.ok) {
      let detail = text.slice(0, 300);
      try { detail = JSON.parse(text).error?.message || detail; } catch { /* keep */ }
      const err = new Error(`模型返回 HTTP ${res.status}：${redact(detail, [apiKey])}`);
      err.status = res.status;
      throw err;
    }
    const data = JSON.parse(text);
    const content = isAnthropic
      ? (data.content || []).map((c) => c.text || "").join("")
      : data.choices?.[0]?.message?.content ?? "";
    const usage = data.usage || {};
    return { content, usage };
  } catch (e) {
    if (e.name === "AbortError") { const t = new Error(`模型调用超时（${timeout / 1000}s）`); t.status = 504; throw t; }
    if (e.message === "请求体过大") throw e;
    const t = new Error(e.message || "模型调用失败"); t.status = e.status || 502; throw t;
  } finally { clearTimeout(timer); }
}

/* ---------------- 策展任务 ---------------- */
const tasks = new Map();
function newTask() {
  const id = "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const t = { id, status: "queued", progress: 0, stage: "排队中", createdAt: Date.now(), result: null, error: null };
  tasks.set(id, t);
  return t;
}
/* 任务结果落盘，服务重启后仍可查历史（不含任何密钥） */
function persistTask(t) {
  try {
    fs.mkdirSync(path.join(DATA, "tasks"), { recursive: true });
    fs.writeFileSync(path.join(DATA, "tasks", t.id + ".json"), JSON.stringify({
      id: t.id, status: t.status, stage: t.stage, error: t.error,
      createdAt: t.createdAt, finishedAt: Date.now(),
      acts: t.result?.acts?.length ?? 0, zones: t.result?.zones?.length ?? 0, rejects: t.result?.rejects ?? [],
    }, null, 2));
  } catch { /* 落盘失败不影响返回 */ }
}
function jsonFrom(text) {
  const clean = String(text || "").replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const a = clean.indexOf("{"), b = clean.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("模型没有返回 JSON");
  return JSON.parse(clean.slice(a, b + 1));
}

const ACT_IDS = ["problem", "solution", "results", "impact"];
const ACT_DIMS = {
  problem: ["background", "question"],
  solution: ["innovation", "method"],
  results: ["experiment", "result"],
  impact: ["limitation"],
};

const CURATE_SYSTEM_BASE = `你是 PaperWorld 数字科研博物馆的策展 AI。任务：读懂一篇学术论文，把它组织成普通人愿意看、且每一句都能回到原文的四幕科研故事。

你必须只输出一个 JSON 对象，不要 Markdown 代码块，不要解释。格式：
{
  "storyTitle": "给这篇论文的一句中文故事标题，≤28字，不用论文原题直译",
  "acts": [
    { "id": "problem", "title": "这一幕的标题，≤28字", "plain": "给普通人的通俗解读，45~150字，必须以句号/问号/感叹号收尾", "tech": "技术细节，0~180字", "quoteIds": ["a001"], "stat": {"value": "只允许原文里出现过的数字", "label": "这个数字是什么，≤30字"} }
  ],
  "zones": [
    { "id": "background", "title": "分厅名，≤16字", "note": "分厅讲解，≤110字", "quoteIds": ["a002"] }
  ]
}

硬规则：
1) acts 最多四个，id 只能为 problem / solution / results / impact，各最多出现一次。四幕是阅读顺序，不是四份模板：标题与讲解必须围绕这篇论文自己的研究问题、方法、证据与边界来写。若某一幕找不到对应维度的原句，就省略该幕，前端会如实显示“未检出”。
2) 每一幕至少引用 1 条、最多 3 条 quoteIds，且只能来自输入清单。引文与所在幕的维度必须匹配：
   - problem 只能用 background / question 的原句；
   - solution 只能用 innovation / method 的原句；
   - results 只能用 experiment / result 的原句；
   - impact 只能用 limitation 的原句。
   如果没有对应维度的原句，就不要生成那一幕——前端会明确显示“未检出”，绝不允许为了凑四幕编造。
3) plain 是给没读过论文的人看的：先说清这一幕在讲什么，再解释它为什么重要；不要用“本研究”“本文”开头，不要写论文摘要。tech 给愿意深挖的人，可以保留术语。
4) 不得编造事实、机制、因果、数值、百分比、实验结论。plain / tech / title 中出现的任何数字、百分比、金额、单位，必须逐字来自本幕 quoteIds 的原文；不确定就不要写数字。stat 只能填本幕引文里出现过的单个数字（不要范围、对比或一串数）；没有就省略 stat。
5) 不要把不同论文的常见套路套上来。先看论文类型、摘要、章节结构与证据分布，再决定每一幕的重点。
6) quoteIds 不得重复，不得改写、翻译或拼接原文；zones 最多 4 个，id 必须来自输入 dimensions 的 id。
7) 只输出 JSON。`;

function curateSystem(input) {
  const t = input.paperType || {};
  const f = input.storyFocus || {};
  const titles = f.titles || {};
  const cues = f.cues || {};
  return `${CURATE_SYSTEM_BASE}

这篇论文的类型：${t.label || "未确定"}（${t.id || "unknown"}）。
本类型四幕应重点回答：
- problem（${titles.problem || "研究问题"}）：${cues.problem || "问题与已有方法缺口"}
- solution（${titles.solution || "核心方法"}）：${cues.solution || "方法、装置或研究设计"}
- results（${titles.results || "主要结果"}）：${cues.results || "证据、实验与结论"}
- impact（${titles.impact || "价值与局限"}）：${cues.impact || "适用边界、限制与未解决问题"}

写作时优先使用论文自己的术语与章节标题，但用普通人能懂的方式解释。不同类型不要复用同一套措辞：机器人论文要讲清硬件、控制与真实任务；算法论文要讲清改动、基准与代价；材料/机械论文要讲清结构、工艺与实测；理论论文要讲清假设、证明路线与适用范围；综述要讲清组织框架、证据分歧与空白。`;
}

function normalizeNumToken(t) {
  return String(t || "").toLowerCase().replace(/[,\s]/g, "").replace(/[–—−]/g, "-");
}
function numTokens(text) {
  const re = /(?:\$|¥|€|£)\s?\d[\d,]*(?:\.\d+)?(?:\s?[kKmMbB])?|\b\d+(?:[.,]\d+)?(?:\s?[–—−-]\s?\d+(?:[.,]\d+)?)?\s?(?:%|hz|khz|mhz|ghz|fps|ms|s|kg|g|mg|mm|cm|km|m|gb|mb|tb|m|b|k|x|×)?\b/gi;
  return [...String(text || "").matchAll(re)].map((m) => normalizeNumToken(m[0])).filter(Boolean);
}
function quoteContainsNumbers(quotes, text) {
  const pool = new Set(quotes.flatMap(numTokens));
  return numTokens(text).filter((n) => !pool.has(n));
}

function validatePlan(obj, allowedIds, ctx = {}) {
  const acts = [];
  let storyTitle = "";
  if (typeof obj.storyTitle === "string") {
    const t = obj.storyTitle.trim().slice(0, 36);
    if (t.length >= 4 && !quoteContainsNumbers(Object.values(ctx.texts || {}), t).length) storyTitle = t;
  }
  const zones = [];
  const rejects = [];
  const allowed = new Set(allowedIds);
  const dimOf = ctx.dimOf || {};
  const texts = ctx.texts || {};
  const legacy = { why: "problem", idea: "solution", how: "solution", result: "results", meaning: "impact" };
  const seenActs = new Set();
  for (const a of Array.isArray(obj.acts) ? obj.acts : []) {
    const aid = legacy[a?.id] || a?.id;
    if (!ACT_IDS.includes(aid)) { rejects.push(`act:${a?.id || "?"}:unknown-id`); continue; }
    if (seenActs.has(aid)) { rejects.push(`act:${aid}:duplicate`); continue; }
    const ids = [...new Set(Array.isArray(a.quoteIds) ? a.quoteIds.filter((x) => typeof x === "string") : [])].slice(0, 3);
    const wrongDim = ids.filter((id) => !allowed.has(id) || !ACT_DIMS[aid].includes(dimOf[id]));
    if (!ids.length) { rejects.push(`act:${aid}:no-evidence`); continue; }
    if (wrongDim.length) { rejects.push(`act:${aid}:wrong-dimension:${wrongDim.join(",")}`); continue; }
    if (typeof a.title !== "string" || !a.title.trim() || a.title.length > 40) { rejects.push(`act:${aid}:title`); continue; }
    const plainText = typeof a.plain === "string" ? a.plain.trim() : "";
    if (!plainText || plainText.length < 26 || plainText.length > 240 || !/[。！？.!?…”’"'）)]$/.test(plainText)) {
      rejects.push(`act:${aid}:plain`);
      continue;
    }
    if (typeof a.tech !== "string" || a.tech.length > 340) { rejects.push(`act:${aid}:tech`); continue; }
    let quotes = ids.map((id) => String(texts[id] || ""));
    let tokenPool = new Set(quotes.flatMap(numTokens));
    // 若讲解里出现引文之外的数字，先在对应幕允许的维度里找一条包含该数字的原句，
    // 把它补进本幕证据；找不到就拒绝整幕，绝不保留无出处的数字。
    const supportPool = Object.keys(texts).filter((id) => allowed.has(id) && ACT_DIMS[aid].includes(dimOf[id]));
    const nums = [...new Set([
      ...numTokens(a.title), ...numTokens(a.plain), ...numTokens(a.tech),
    ])];
    const badTextNums = [];
    for (const n of nums) {
      if (tokenPool.has(n)) continue;
      const found = supportPool.find((id) => !ids.includes(id) && numTokens(texts[id]).includes(n));
      if (found && ids.length < 4) {
        ids.push(found);
        quotes.push(String(texts[found] || ""));
        tokenPool = new Set(quotes.flatMap(numTokens));
      } else badTextNums.push(n);
    }
    if (badTextNums.length) { rejects.push(`act:${aid}:number-not-in-quotes:${badTextNums.slice(0, 3).join(",")}`); continue; }

    let stat = null;
    if (a.stat && typeof a.stat === "object" && String(a.stat.value || "").trim()) {
      const value = String(a.stat.value).trim().slice(0, 18);
      const label = String(a.stat.label || "").trim().slice(0, 40);
      const tokens = numTokens(value);
      const labelBad = quoteContainsNumbers(quotes, label);
      const strong = /[%$¥€£/×x]|\b\d{2,}\b|(?:hz|khz|mhz|ghz|fps|ms|kg|mg|mm|cm|km|mb|gb|tb)\b/i.test(value);
      if (tokens.length === 1 && strong) {
        let owner = ids.find((id) => numTokens(texts[id]).includes(tokens[0]));
        if (!owner) {
          const found = supportPool.find((id) => !ids.includes(id) && numTokens(texts[id]).includes(tokens[0]));
          if (found && ids.length < 4) { ids.push(found); owner = found; quotes.push(String(texts[found] || "")); }
        }
        const labelOk = !labelBad.length || labelBad.every((n, i) => tokenPool.has(n) || numTokens(quotes.join(" ")).includes(n));
        if (owner && labelOk) stat = { value, label, quoteId: owner };
        else rejects.push(`act:${aid}:stat-invalid:${value.slice(0, 18)}`);
      } else {
        rejects.push(`act:${aid}:stat-invalid:${value.slice(0, 18)}`);
      }
    }

    seenActs.add(aid);
    acts.push({ id: aid, title: a.title.trim(), plain: a.plain.trim(), tech: String(a.tech || "").trim(), quoteIds: ids, stat });
  }

  for (const z of Array.isArray(obj.zones) ? obj.zones : []) {
    const ids = [...new Set(Array.isArray(z.quoteIds) ? z.quoteIds.filter((x) => typeof x === "string") : [])].slice(0, 3);
    const why = [];
    if (typeof z?.id !== "string" || !(ctx.dimIds && ctx.dimIds.has(z.id))) why.push("unknown-id");
    if (typeof z?.title !== "string" || !z.title.trim() || z.title.length > 24) why.push("title");
    if (typeof z?.note !== "string" || z.note.length > 220 || z.note.trim().length < 12) why.push("note");
    if (ids.length === 0) why.push("no-evidence");
    if (ids.some((x) => !allowed.has(x) || dimOf[x] !== z.id)) why.push("wrong-dimension");
    if (!why.length && quoteContainsNumbers(ids.map((id) => String(texts[id] || "")), z.note).length) why.push("number-not-in-quotes");
    if (why.length) { rejects.push(`zone:${z?.id || "?"}:${why.join("+")}`); continue; }
    zones.push({ id: z.id, title: z.title.trim(), note: z.note.trim(), quoteIds: ids });
  }
  return { acts, zones, rejects, storyTitle };
}

async function runCurate(task, payload, cfg, apiKey) {
  task.status = "running";
  task.stage = "整理原文清单";
  task.progress = 0.15;
  const sentences = Array.isArray(payload.sentences) ? payload.sentences.slice(0, 220) : [];
  const allowedIds = sentences.map((s) => s.id);
  if (!sentences.length) throw Object.assign(new Error("没有可策展的原文语句"), { status: 400 });

  const dims = Array.isArray(payload.dimensions) ? payload.dimensions.slice(0, 8) : [];
  const dimOf = {};
  const dimIds = new Set(dims.map((d) => d.id));
  const texts = {};
  for (const d of dims) {
    const ids = Array.isArray(d.quoteIds) ? d.quoteIds.filter((x) => typeof x === "string") : [];
    for (const id of ids) dimOf[id] = d.id;
  }
  for (const s of sentences) texts[s.id] = String(s.text || "");
  const input = {
    paperTitle: payload.title || "未命名论文",
    pageCount: payload.pageCount || 0,
    paperType: payload.paperType || null,
    storyFocus: payload.storyFocus || null,
    abstract: String(payload.abstract || "").slice(0, 1600),
    sections: Array.isArray(payload.sections) ? payload.sections.slice(0, 20) : [],
    figures: Array.isArray(payload.figures) ? payload.figures.slice(0, 8) : [],
    dimensions: dims.map((d) => ({ id: d.id, name: d.name, count: d.count, quoteCount: (d.quoteIds || []).length })),
    sentences: sentences.map((s) => ({
      id: s.id, page: s.page, section: s.section || "", dim: dimOf[s.id] || "",
      text: String(s.text || "").slice(0, 220),
    })),
  };
  task.stage = "模型理解论文并规划展馆";
  task.progress = 0.35;

  const { content, usage } = await callModel({
    baseUrl: cfg.baseUrl, apiKey, model: cfg.model,
    messages: [{ role: "system", content: curateSystem(input) }, { role: "user", content: JSON.stringify(input) }],
    maxTokens: 2600,
  });
  task.stage = "校验事实、引文与数值";
  task.progress = 0.78;

  const plan = validatePlan(jsonFrom(content), allowedIds, { dimOf, texts, dimIds });
  let repaired = false;
  let totalUsage = usage;
  const missing = ACT_IDS.filter((id) => !plan.acts.some((a) => a.id === id)
    && ACT_DIMS[id].some((dim) => (dims.find((d) => d.id === dim)?.quoteIds || []).length > 0));
  if (missing.length) {
    repaired = true;
    task.stage = `修正未通过的 ${missing.length} 幕`;
    task.progress = 0.9;
    const allowedFor = {};
    for (const id of missing) {
      allowedFor[id] = ACT_DIMS[id].flatMap((dim) => (dims.find((d) => d.id === dim)?.quoteIds || []))
        .filter((qid) => texts[qid])
        .slice(0, 8)
        .map((qid) => ({ id: qid, dim: dimOf[qid], text: String(texts[qid]).slice(0, 220) }));
    }
    try {
      const repairInput = {
        paperTitle: input.paperTitle,
        paperType: input.paperType,
        storyFocus: input.storyFocus,
        missingActs: missing.map((id) => ({
          id,
          title: input.storyFocus?.titles?.[id] || id,
          focus: input.storyFocus?.cues?.[id] || "",
          allowedSentences: allowedFor[id],
        })),
        alreadyPassed: plan.acts.map((a) => ({ id: a.id, title: a.title })),
        validationErrors: plan.rejects,
      };
      const repairSystem = `${curateSystem(input)}

这是修正轮。只补写 missingActs 里的幕，不要重复已经通过的幕，不要输出 zones。
每个修正幕必须从该幕的 allowedSentences 里选 1~3 条 quoteIds；没有可用原句就不要输出该幕。
只输出 {"acts":[...] } 的 JSON。`;
      const r = await callModel({
        baseUrl: cfg.baseUrl, apiKey, model: cfg.model,
        messages: [{ role: "system", content: repairSystem }, { role: "user", content: JSON.stringify(repairInput) }],
        maxTokens: 1500,
      });
      const fixed = validatePlan(jsonFrom(r.content), allowedIds, { dimOf, texts, dimIds });
      if (!plan.storyTitle && fixed.storyTitle) plan.storyTitle = fixed.storyTitle;
      for (const a of fixed.acts) {
        if (!missing.includes(a.id) || plan.acts.some((x) => x.id === a.id)) continue;
        plan.acts.push(a);
      }
      plan.rejects.push(...fixed.rejects.map((x) => "repair:" + x));
      totalUsage = {
        prompt_tokens: (usage.prompt_tokens || 0) + (r.usage.prompt_tokens || 0),
        completion_tokens: (usage.completion_tokens || 0) + (r.usage.completion_tokens || 0),
        total_tokens: (usage.total_tokens || 0) + (r.usage.total_tokens || 0),
      };
    } catch (e) {
      plan.rejects.push("repair:" + String(e.message || "修正轮失败").slice(0, 120));
    }
    plan.acts.sort((a, b) => ACT_IDS.indexOf(a.id) - ACT_IDS.indexOf(b.id));
  }
  if (!plan.acts.length && !plan.zones.length) {
    const why = plan.rejects.length ? `：${plan.rejects.slice(0, 3).join("；")}` : "";
    throw Object.assign(new Error(`模型输出未通过事实或引文校验${why}`), { status: 422 });
  }
  task.progress = 1;
  task.stage = "完成";
  task.status = "done";
  task.result = { ...plan, paperType: input.paperType, usage: totalUsage, repaired, model: cfg.model, provider: cfg.provider };
  persistTask(task);
  log(`task ${task.id} done: ${plan.acts.length} acts, ${plan.zones.length} zones, ${plan.rejects.length} rejected, repair=${repaired}`);
}

/* ---------------- 路由 ---------------- */
async function handleApi(req, res, pathname) {
  if (req.method === "OPTIONS") { send(res, 204, {}); return true; }
  // /health 公开，便于前端/监控探测后端是否可达（不返回任何敏感信息）
  if (pathname === "/health" && req.method === "GET") {
    send(res, 200, { ok: true, service: "paperworld-ai-core", version: "1.0.0", tokenRequired: Boolean(PW_TOKEN) });
    return true;
  }
  if (!rateLimit(req)) { fail(res, 429, "请求过于频繁，请稍后再试", { retryAfter: 60 }); return true; }
  if (!authorized(req)) { fail(res, 401, "未授权：请在配置里填写后端访问令牌（PW_TOKEN）"); return true; }

  if (pathname === "/api/core/status" && req.method === "GET") {
    const c = loadConfig();
    send(res, 200, { ok: true, hasKey: Boolean(c.apiKeyEnc), provider: c.provider, tokenRequired: Boolean(PW_TOKEN) });
    return true;
  }
  if (pathname === "/api/core/providers" && req.method === "GET") {
    send(res, 200, { ok: true, providers: Object.entries(PROVIDERS).map(([id, p]) => ({ id, ...p })) });
    return true;
  }
  if (pathname === "/api/core/config") {
    if (req.method === "GET") {
      const c = loadConfig();
      send(res, 200, {
        ok: true, provider: c.provider, baseUrl: c.baseUrl, model: c.model,
        hasKey: Boolean(c.apiKeyEnc), updatedAt: c.updatedAt, tokenRequired: Boolean(PW_TOKEN),
      });
      return true;
    }
    if (req.method === "POST") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const provider = PROVIDERS[body.provider] ? body.provider : "custom";
      const cfg = {
        provider,
        baseUrl: String(body.baseUrl || PROVIDERS[provider].baseUrl || "").slice(0, 400),
        model: String(body.model || PROVIDERS[provider].model || "").slice(0, 120),
        apiKeyEnc: (body.apiKey && String(body.apiKey).trim()) ? encryptSecret(String(body.apiKey).trim()) : loadConfig().apiKeyEnc,
      };
      if (!cfg.baseUrl) { fail(res, 400, "请填写模型接口地址"); return true; }
      if (!cfg.model) { fail(res, 400, "请填写模型名称"); return true; }
      saveConfig(cfg);
      log(`config saved: provider=${provider} model=${cfg.model} key=${cfg.apiKeyEnc ? "set" : "kept"}`);
      send(res, 200, { ok: true, provider: cfg.provider, baseUrl: cfg.baseUrl, model: cfg.model, hasKey: Boolean(cfg.apiKeyEnc) });
      return true;
    }
    if (req.method === "DELETE") {
      try { fs.rmSync(CFGFILE, { force: true }); } catch { /* ignore */ }
      log("config cleared");
      send(res, 200, { ok: true });
      return true;
    }
  }
  if (pathname === "/api/core/test" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)) || "{}");
    const saved = loadConfig();
    const provider = PROVIDERS[body.provider] ? body.provider : saved.provider;
    const baseUrl = String(body.baseUrl || saved.baseUrl || PROVIDERS[provider]?.baseUrl || "");
    const model = String(body.model || saved.model || PROVIDERS[provider]?.model || "");
    const apiKey = body.apiKey ? String(body.apiKey) : (saved.apiKeyEnc ? decryptSecret(saved.apiKeyEnc) : "");
    if (!apiKey) { fail(res, 400, "没有可用的 API Key，请先填写并保存"); return true; }
    const t0 = Date.now();
    try {
      const { content, usage } = await callModel({
        baseUrl, apiKey, model,
        messages: [{ role: "user", content: "回复两个字：可用" }],
        maxTokens: 12, timeout: 20000,
      });
      send(res, 200, { ok: true, ms: Date.now() - t0, echo: String(content || "").slice(0, 40), model, usage });
    } catch (e) {
      fail(res, 502, e.message || "连接失败", { ms: Date.now() - t0 });
    }
    return true;
  }
  if (pathname === "/api/core/curate" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)) || "{}");
    const saved = loadConfig();
    const apiKey = saved.apiKeyEnc ? decryptSecret(saved.apiKeyEnc) : "";
    if (!apiKey) { fail(res, 400, "尚未配置 API Key，无法调用模型策展"); return true; }
    const task = newTask();
    runCurate(task, body, saved, apiKey).catch((e) => {
      task.status = "error";
      task.error = redact(e.message || "策展失败", [apiKey]);
      task.stage = "失败";
      persistTask(task);
      log(`task ${task.id} failed: ${task.error}`);
    });
    send(res, 202, { ok: true, taskId: task.id, status: task.status });
    return true;
  }
  const m = pathname.match(/^\/api\/core\/task\/([\w-]+)$/);
  if (m && req.method === "GET") {
    const t = tasks.get(m[1]);
    if (!t) { fail(res, 404, "任务不存在"); return true; }
    send(res, 200, { ok: true, task: { id: t.id, status: t.status, progress: t.progress, stage: t.stage, error: t.error, result: t.result } });
    return true;
  }
  if (pathname === "/api/core/tasks" && req.method === "GET") {
    send(res, 200, { ok: true, tasks: [...tasks.values()].slice(-20).map((t) => ({ id: t.id, status: t.status, progress: t.progress, stage: t.stage })) });
    return true;
  }
  return false;
}

/* ---------------- 静态托管 ---------------- */
function serveStatic(req, res, pathname) {
  let p = decodeURIComponent(pathname);
  if (p === "/" || p === "") p = "/index.html";
  const file = path.join(ROOT, path.normalize(p).replace(/^(\.\.[/\\])+/, ""));
  if (!file.startsWith(ROOT)) { fail(res, 403, "禁止访问"); return true; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return false;
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Private-Network": "true",
  });
  fs.createReadStream(file).pipe(res);
  return true;
}

/* ---------------- 服务器 ---------------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;
  try {
    if (pathname.startsWith("/api/") || pathname === "/health") {
      if (await handleApi(req, res, pathname)) return;
      fail(res, 404, "接口不存在"); return;
    }
    if (serveStatic(req, res, pathname)) return;
    fail(res, 404, "文件不存在：" + pathname);
  } catch (e) {
    const code = /过大|Invalid JSON|Unexpected/.test(e.message) ? 400 : 500;
    fail(res, code, e.message || "服务器错误");
  }
});
const onListen = () => {
  log(`PaperWorld AI Core 已启动 · http://localhost:${PORT}`);
  log(`      本地页面：http://localhost:${PORT}/index.html   模型配置：http://localhost:${PORT}/core.html`);
  log(`鉴权：${PW_TOKEN ? "已开启（PW_TOKEN）" : "未开启（开发模式，生产请设置 PW_TOKEN）"}`);
  if (!PW_TOKEN && !HOST) log("提醒：当前监听所有网卡且未开鉴权，同一局域网内其他人也能访问；只想本机用可设 HOST=127.0.0.1。");
  log(`密钥存储：${process.env.PW_SECRET ? "PW_SECRET 环境变量" : KEYFILE}`);
};
if (HOST) server.listen(PORT, HOST, onListen);
else server.listen(PORT, onListen);
