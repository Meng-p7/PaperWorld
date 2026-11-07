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
const HOST = process.env.HOST || "0.0.0.0";
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

const CURATE_SYSTEM = `你是 PaperWorld 数字科研博物馆的策展 AI。任务：把一篇学术论文变成普通人愿意探索的科研故事与展区讲解。

你必须只输出一个 JSON 对象，格式：
{
  "acts": [
    { "id": "problem", "title": "为什么这是一个难题", "plain": "通俗解读，≤120字", "tech": "技术细节，≤160字", "quoteIds": ["a001"], "stat": {"value": "示例数字", "label": "这个数字是什么"} }
  ],
  "zones": [
    { "id": "background", "title": "展区名，≤16字", "note": "展区讲解，≤110字", "quoteIds": ["a002"] }
  ]
}

硬规则：
1) acts 必须且只能包含这四幕：problem / solution / results / impact，顺序固定。solution 一幕内同时讲清硬件/装置与算法/方法；results 一幕放实验成绩与关键消融。
2) plain 是写给没读过论文的人的，口语、有画面感、不用术语堆砌；tech 是给想深挖的人的，可包含术语但仍要克制。
3) 不得编造任何事实、数值、百分比、实验结论。quoteIds 只能来自输入给你的清单，只能少不能多，也不能改写成新引文。
4) stat.value 若填数字，必须是输入清单里出现过的数字原文；不确定就留空字符串。
5) quoteIds 每幕 0~3 个，用最能支撑这一幕的原句。
6) 不要输出解释、Markdown 代码块或多余文字。`;

function validatePlan(obj, allowedIds) {
  const acts = [];
  const zones = [];
  const rejects = [];
  const pct = /(\d+(?:\.\d+)?)\s?%/;
  const allowed = new Set(allowedIds);
  const legacy = { why: "problem", idea: "solution", how: "solution", result: "results", meaning: "impact" };
  for (const a of Array.isArray(obj.acts) ? obj.acts : []) {
    const ids = Array.isArray(a.quoteIds) ? a.quoteIds.filter((x) => typeof x === "string") : [];
    const aid = legacy[a?.id] || a?.id;
    const bad = !["problem", "solution", "results", "impact"].includes(aid)
      || typeof a.title !== "string" || a.title.length > 40
      || typeof a.plain !== "string" || a.plain.length > 220
      || typeof a.tech !== "string" || a.tech.length > 320
      || ids.some((x) => !allowed.has(x))
      || pct.test(a.plain) || pct.test(a.tech);
    if (bad) { rejects.push(`act:${a?.id || "?"}`); continue; }
    acts.push({
      id: aid, title: a.title.trim(), plain: a.plain.trim(), tech: a.tech.trim(),
      quoteIds: ids, stat: (a.stat && typeof a.stat === "object")
        ? { value: String(a.stat.value || "").slice(0, 24), label: String(a.stat.label || "").slice(0, 40) }
        : null,
    });
  }
  for (const z of Array.isArray(obj.zones) ? obj.zones : []) {
    const ids = Array.isArray(z.quoteIds) ? z.quoteIds.filter((x) => typeof x === "string") : [];
    const bad = typeof z?.id !== "string" || typeof z?.title !== "string" || z.title.length > 24
      || typeof z?.note !== "string" || z.note.length > 220
      || ids.some((x) => !allowed.has(x)) || pct.test(z.note);
    if (bad) { rejects.push(`zone:${z?.id || "?"}`); continue; }
    zones.push({ id: z.id, title: z.title.trim(), note: z.note.trim(), quoteIds: ids });
  }
  return { acts, zones, rejects };
}

async function runCurate(task, payload, cfg, apiKey) {
  task.status = "running";
  task.stage = "整理原文清单";
  task.progress = 0.15;
  const sentences = Array.isArray(payload.sentences) ? payload.sentences.slice(0, 220) : [];
  const allowedIds = sentences.map((s) => s.id);
  if (!sentences.length) throw Object.assign(new Error("没有可策展的原文语句"), { status: 400 });

  const input = {
    paperTitle: payload.title || "未命名论文",
    pageCount: payload.pageCount || 0,
    dimensions: payload.dimensions || [],
    sentences: sentences.map((s) => ({ id: s.id, page: s.page, section: s.section || "", text: String(s.text || "").slice(0, 220) })),
  };
  task.stage = "模型理解论文并规划展馆";
  task.progress = 0.35;

  const { content, usage } = await callModel({
    baseUrl: cfg.baseUrl, apiKey, model: cfg.model,
    messages: [{ role: "system", content: CURATE_SYSTEM }, { role: "user", content: JSON.stringify(input) }],
    maxTokens: 2200,
  });
  task.stage = "校验模型输出";
  task.progress = 0.78;

  const plan = validatePlan(jsonFrom(content), allowedIds);
  if (!plan.acts.length && !plan.zones.length) {
    throw Object.assign(new Error("模型输出未通过校验（可能编造了引文或数值），请重试或换模型"), { status: 422 });
  }
  task.progress = 1;
  task.stage = "完成";
  task.status = "done";
  task.result = { ...plan, usage, model: cfg.model, provider: cfg.provider };
  persistTask(task);
  log(`task ${task.id} done: ${plan.acts.length} acts, ${plan.zones.length} zones, ${plan.rejects.length} rejected`);
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
server.listen(PORT, HOST, () => {
  log(`PaperWorld AI Core 已启动 · http://${HOST}:${PORT}`);
  log(`鉴权：${PW_TOKEN ? "已开启（PW_TOKEN）" : "未开启（开发模式，生产请设置 PW_TOKEN）"}`);
  log(`密钥存储：${process.env.PW_SECRET ? "PW_SECRET 环境变量" : KEYFILE}`);
});
