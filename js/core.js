/* PaperWorld · AI Core 配置页控制器
 *
 * 产品原则：普通用户只填自己的 API Key。
 * 后端地址由 js/core/endpoint.js 在运行时自动确认，页面上不出现“请填地址”。
 */
import { $, $$, el, initMobileNav } from "./core/ui.js";
import { createStarfield } from "./cosmos/starfield.js";
import {
  getCoreLink, saveCoreLink,
  coreHealth, listProviders, readConfig,
  writeConfig, clearConfig, testConnection,
} from "./engine/ai.js";
import { baseFromContext, readStored, detect } from "./core/endpoint.js";

createStarfield({ sky: $("#sky"), particles: $("#particles"), mode: "ambient" });
initMobileNav();

const pill = (node, text, cls) => {
  node.textContent = text;
  node.className = "core-pill" + (cls ? " " + cls : "");
};
const out = (text, cls) => {
  const n = $("#model-out");
  n.textContent = text;
  n.className = "core-out" + (cls ? " " + cls : "");
};

/* ---------- 连接状态条 ---------- */
const actBtn = (label, fn, ghost) => el("button", {
  class: "cbtn cbtn--sm" + (ghost ? " cbtn--ghost" : ""),
  type: "button",
  text: label,
  onclick: fn,
});

function setConn(state, title, desc, actions = []) {
  $("#core-conn").dataset.state = state;
  $("#conn-title").textContent = title;
  $("#conn-desc").textContent = desc || "";
  const box = $("#conn-acts");
  box.textContent = "";
  for (const a of actions) box.append(a);
}

function showSetup(on) {
  const box = $("#core-setup");
  if (box) box.hidden = !on;
}

/* 未连接时，模型卡不该看起来能用 */
function setModelEnabled(on) {
  for (const id of ["#btn-test", "#btn-save-model", "#btn-clear-model"]) {
    const b = $(id); if (b) b.disabled = !on;
  }
  const hint = $("#model-hint");
  if (hint) hint.textContent = on
    ? "选择服务商，或填 OpenAI 兼容端点。API Key 只发给后端加密保存，不写入浏览器。"
    : "后端还没连上。先按上面的步骤启动一次本机服务，这里就可以填 Key 了。";
}

async function probe(target) {
  const l = target || getCoreLink();
  setConn("checking", "正在确认后端…", l.backend || "本机没有服务时会自动降级");
  const h = await coreHealth(l);
  if (!h.ok) {
    setConn("down", "没有连上后端", h.error || "本机服务没有响应", [
      actBtn("重新检测", () => reconnect()),
      actBtn("启动说明", () => showSetup(true), true),
    ]);
    showSetup(true);
    setModelEnabled(false);
    return false;
  }
  if (h.tokenRequired && !l.token) {
    setConn("warn", "后端已连接，但缺少访问令牌", `${l.backend} 开启了鉴权`, [
      actBtn("填写令牌", () => { $("#core-adv").open = true; $("#in-token").focus(); }, true),
    ]);
    showSetup(false);
    setModelEnabled(false);
    return false;
  }
  setConn("ok", "已连接本机服务", `${l.backend} · 地址自动确认，无需填写`);
  showSetup(false);
  setModelEnabled(true);
  return true;
}

/* 依次试候选地址：本机 8080 → 同源 → 已记住 → 声明 */
async function reconnect() {
  setConn("checking", "正在检测本机服务…", "尝试 localhost:8080 等地址");
  const r = await detect();
  if (!r.ok) {
    setConn("down", "没有检测到本机服务", "如果还没启动，按下面的步骤做一次即可", [
      actBtn("再试一次", () => reconnect()),
      actBtn("启动说明", () => showSetup(true), true),
    ]);
    showSetup(true);
    setModelEnabled(false);
    return false;
  }
  $("#in-backend").value = r.base;
  return probe({ backend: r.base, token: readStored().token });
}

async function loadModel(target) {
  const l = target || getCoreLink();
  try {
    const c = await readConfig(l);
    if (c.baseUrl) $("#in-baseurl").value = c.baseUrl;
    if (c.model) $("#in-model").value = c.model;
    pill($("#key-state"), c.hasKey ? "已配置密钥" : "未配置密钥", c.hasKey ? "is-ok" : "is-warn");
    if (c.hasKey) {
      $("#in-key").placeholder = "已保存（留空则保持不变）";
      out(`后端已连接 · ${c.model || "模型已配置"}`, "is-ok");
    } else {
      out("后端已连接 · 还没有保存模型密钥。", "is-bad");
    }
    return true;
  } catch (e) {
    const unauthorized = e.status === 401 || /令牌|未授权/.test(e.message);
    pill($("#key-state"), unauthorized ? "需要访问令牌" : "读取失败", unauthorized ? "is-warn" : "is-bad");
    if (unauthorized) out("后端开启了鉴权，请在「高级」里填一次 PW_TOKEN。", "is-bad");
    else out(e.message, "is-bad");
    return false;
  }
}

/* ---------- 服务商预设 ---------- */
const FALLBACK_PROVIDERS = [
  { id: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1/chat/completions", model: "gpt-4o-mini" },
  { id: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1/chat/completions", model: "deepseek-chat" },
  { id: "zhipu", label: "智谱 GLM", baseUrl: "https://open.bigmodel.cn/api/paas/v4/chat/completions", model: "glm-4-flash" },
  { id: "qwen", label: "通义千问", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", model: "qwen-plus" },
  { id: "moonshot", label: "Moonshot", baseUrl: "https://api.moonshot.cn/v1/chat/completions", model: "moonshot-v1-8k" },
  { id: "anthropic", label: "Anthropic", baseUrl: "https://api.anthropic.com/v1/messages", model: "claude-3-5-sonnet-latest" },
  { id: "custom", label: "自定义", baseUrl: "", model: "" },
];

function paintProviders(list) {
  const box = $("#providers");
  box.textContent = "";
  for (const p of list) {
    box.append(el("button", {
      class: "core-provider" + ($("#in-baseurl").value === p.baseUrl ? " is-on" : ""),
      type: "button",
      text: p.label,
      onclick: () => {
        if (p.baseUrl) $("#in-baseurl").value = p.baseUrl;
        if (p.model) $("#in-model").value = p.model;
        $$(".core-provider").forEach((b) => b.classList.remove("is-on"));
        box.querySelectorAll(".core-provider").forEach((b) => b.classList.toggle("is-on", b.textContent === p.label));
        out("已填入 " + p.label + " 预设，填 API Key 后保存即可。");
      },
    }));
  }
}

async function loadProviders() {
  let list = [];
  try { list = await listProviders(getCoreLink()); } catch { /* 后端不可用时用本地预设 */ }
  paintProviders(list.length ? list : FALLBACK_PROVIDERS);
}

/* ---------- 任务列表 ---------- */
async function loadTasks() {
  const box = $("#tasks");
  const items = [];
  const l = getCoreLink();
  try {
    if (l.backend) {
      const res = await fetch(l.backend + "/api/core/tasks", {
        headers: l.token ? { Authorization: "Bearer " + l.token } : {},
        signal: AbortSignal.timeout(6000),
      });
      const d = await res.json();
      for (const t of (d.tasks || []).slice(-8).reverse()) items.push(t);
    }
  } catch { /* 后端不可用则只看本机记录 */ }
  try {
    const local = JSON.parse(localStorage.getItem("pw.ai.tasks") || "[]");
    for (const t of local.slice(0, 6)) if (!items.some((x) => x.id === t.id)) items.push(t);
  } catch { /* ignore */ }

  if (!items.length) {
    box.textContent = "";
    box.append(el("div", { class: "core-task core-dim", text: "还没有策展任务。在「上传论文」里点生成即可。" }));
    pill($("#task-state"), "空闲");
    return;
  }
  box.textContent = "";
  for (const t of items.slice(0, 10)) {
    const done = t.status === "done", err = t.status === "error";
    box.append(el("div", { class: "core-task" + (done ? " is-done" : err ? " is-error" : "") },
      el("span", {}, el("b", { text: t.id.slice(0, 12) }), " ", t.stage || t.status),
      el("span", { class: "core-dim", text: done ? `${t.acts ?? "?"} 幕 / ${t.zones ?? "?"} 展区` : err ? (t.error || "失败").slice(0, 40) : `${Math.round((t.progress || 0) * 100)}%` })));
  }
  pill($("#task-state"), items.some((t) => t.status === "running") ? "进行中" : "空闲",
    items.some((t) => t.status === "running") ? "is-warn" : "");
}

/* ---------- 高级：手动地址 / 令牌 ---------- */
const advLink = () => ({
  backend: $("#in-backend").value.trim() || getCoreLink().backend,
  token: $("#in-token").value.trim() || readStored().token,
});

$("#btn-probe").addEventListener("click", async () => {
  const l = advLink();
  if (l.backend) saveCoreLink(l);
  if (await probe(l)) {
    await loadModel(l);
    await loadProviders();
    await loadTasks();
  }
});

$("#btn-save-link").addEventListener("click", async () => {
  const l = advLink();
  saveCoreLink(l);
  if (await probe(l)) {
    await loadModel(l);
    await loadProviders();
    await loadTasks();
  }
});

/* ---------- 模型配置 ---------- */
$("#btn-test").addEventListener("click", async () => {
  const btn = $("#btn-test");
  btn.disabled = true; out("测试中…");
  try {
    const r = await testConnection({
      provider: "custom",
      baseUrl: $("#in-baseurl").value.trim(),
      model: $("#in-model").value.trim(),
      apiKey: $("#in-key").value.trim() || undefined,
    }, getCoreLink());
    out(`连接可用 · ${r.ms}ms · 回显「${r.echo || "ok"}」`, "is-ok");
    pill($("#key-state"), "密钥可用", "is-ok");
  } catch (e) {
    out("测试失败：" + e.message, "is-bad");
    pill($("#key-state"), "测试失败", "is-bad");
  } finally { btn.disabled = false; }
});

$("#btn-save-model").addEventListener("click", async () => {
  const btn = $("#btn-save-model");
  btn.disabled = true;
  try {
    const r = await writeConfig({
      provider: "custom",
      baseUrl: $("#in-baseurl").value.trim(),
      model: $("#in-model").value.trim(),
      apiKey: $("#in-key").value.trim() || undefined,
    }, getCoreLink());
    $("#in-key").value = "";
    $("#in-key").placeholder = "已保存（留空则保持不变）";
    pill($("#key-state"), r.hasKey ? "已配置密钥" : "未配置密钥", r.hasKey ? "is-ok" : "is-warn");
    out("配置已保存，密钥在后端加密存储。", "is-ok");
  } catch (e) { out("保存失败：" + e.message, "is-bad"); }
  finally { btn.disabled = false; }
});

$("#btn-clear-model").addEventListener("click", async () => {
  try {
    await clearConfig(getCoreLink());
    $("#in-key").value = "";
    $("#in-key").placeholder = "sk-…";
    pill($("#key-state"), "已清除", "is-warn");
    out("模型配置已清除。");
  } catch (e) { out("清除失败：" + e.message, "is-bad"); }
});

/* ---------- 初始化 ----------
 * 地址能确定就静默连接（同源访问时一定成功，不产生控制台错误）；
 * 确定不了就显示启动说明，不主动乱发请求。 */
(async () => {
  const ctx = baseFromContext();
  $("#in-token").value = ctx.token || "";
  if (ctx.base) $("#in-backend").value = ctx.base;

  paintProviders(FALLBACK_PROVIDERS);
  setModelEnabled(false);

  if (!ctx.base) {
    setConn("none", "还没有检测到本机服务", "地址不用你填。线上版没有模型后端，启动本机服务后会自动连上。", [
      actBtn("检测本机服务", () => reconnect()),
      actBtn("怎么启动", () => showSetup(true), true),
    ]);
    showSetup(true);
    return;
  }

  if (await probe({ backend: ctx.base, token: ctx.token })) {
    await loadModel({ backend: ctx.base, token: ctx.token });
    await loadProviders();
    await loadTasks();
    setInterval(loadTasks, 4000);
  } else {
    // 记住的地址失效了：再扫一遍本机端口
    await reconnect();
  }
})();
