/* PaperWorld · AI Core 配置页控制器 */
import { $, $$, el, initMobileNav } from "./core/ui.js";
import { createStarfield } from "./cosmos/starfield.js";
import {
  getCoreLink, saveCoreLink,
  coreHealth, coreStatus, listProviders, readConfig,
  writeConfig, clearConfig, testConnection,
} from "./engine/ai.js";

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
const link = () => ({ backend: $("#in-backend").value.trim(), token: $("#in-token").value.trim() });

/* ---------- 连接 ---------- */
async function probe() {
  const l = link();
  pill($("#link-state"), "探测中…");
  const h = await coreHealth(l);
  if (!h.ok) { pill($("#link-state"), h.error ? "连不上" : "异常", "is-bad"); out("后端不可达：" + (h.error || "未知错误"), "is-bad"); return false; }
  pill($("#link-state"), h.tokenRequired ? "已连接 · 需令牌" : "已连接", h.tokenRequired ? "is-warn" : "is-ok");
  out(h.tokenRequired ? "后端可达 · 填写访问令牌后保存连接。" : "后端已连接。", "is-ok");
  return true;
}

async function loadModel() {
  try {
    const c = await readConfig(link());
    if (c.baseUrl) $("#in-baseurl").value = c.baseUrl;
    if (c.model) $("#in-model").value = c.model;
    pill($("#key-state"), c.hasKey ? "已配置密钥" : "未配置密钥", c.hasKey ? "is-ok" : "is-warn");
    if (c.hasKey) $("#in-key").placeholder = "已保存（留空则保持不变）";
    return true;
  } catch (e) {
    const unauthorized = e.status === 401 || /令牌|未授权/.test(e.message);
    pill($("#key-state"), unauthorized ? "需要访问令牌" : "读取失败", unauthorized ? "is-warn" : "is-bad");
    if (unauthorized) out("后端已开启鉴权，请在上方「访问令牌」填入 PW_TOKEN 后点「保存连接」。", "is-bad");
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
      text: p.label,
      onclick: () => {
        if (p.baseUrl) $("#in-baseurl").value = p.baseUrl;
        if (p.model) $("#in-model").value = p.model;
        $$(".core-provider").forEach((b) => b.classList.remove("is-on"));
        box.querySelectorAll(".core-provider").forEach((b) => b.classList.toggle("is-on", b.textContent === p.label));
        out("已填入 " + p.label + " 预设，请填写 API Key 后保存。");
      },
    }));
  }
}

async function loadProviders() {
  let list = [];
  try { list = await listProviders(link()); } catch { /* 后端不可用时用本地预设 */ }
  paintProviders(list.length ? list : FALLBACK_PROVIDERS);
}

/* ---------- 任务列表（后端 + 本机记录） ---------- */
async function loadTasks() {
  const box = $("#tasks");
  const items = [];
  try {
    const l = link();
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

/* ---------- 事件 ---------- */
$("#btn-save-link").addEventListener("click", async () => {
  saveCoreLink(link());
  out("连接已保存到本机。");
  await probe();
  await loadModel();
  await loadProviders();
  await loadTasks();
});
$("#btn-probe").addEventListener("click", async () => {
  if (await probe()) { await loadModel(); await loadProviders(); await loadTasks(); }
});

$("#btn-test").addEventListener("click", async () => {
  const btn = $("#btn-test");
  btn.disabled = true; out("测试中…");
  try {
    const r = await testConnection({
      provider: "custom",
      baseUrl: $("#in-baseurl").value.trim(),
      model: $("#in-model").value.trim(),
      apiKey: $("#in-key").value.trim() || undefined,
    }, link());
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
    }, link());
    $("#in-key").value = "";
    $("#in-key").placeholder = "已保存（留空则保持不变）";
    pill($("#key-state"), r.hasKey ? "已配置密钥" : "未配置密钥", r.hasKey ? "is-ok" : "is-warn");
    out("配置已保存，密钥在后端加密存储。", "is-ok");
  } catch (e) { out("保存失败：" + e.message, "is-bad"); }
  finally { btn.disabled = false; }
});

$("#btn-clear-model").addEventListener("click", async () => {
  try {
    await clearConfig(link());
    $("#in-key").value = "";
    $("#in-key").placeholder = "sk-…";
    pill($("#key-state"), "已清除", "is-warn");
    out("模型配置已清除。");
  } catch (e) { out("清除失败：" + e.message, "is-bad"); }
});

/* ---------- 初始化 ----------
 * 没有保存过后端地址时不主动发请求：避免首次打开就产生连接错误，
 * 也让用户先填地址、再点「探测后端」。 */
(async () => {
  const l = getCoreLink();
  if (!l.backend) {
    $("#in-backend").value = "http://localhost:8080";
    pill($("#link-state"), "未连接", "is-warn");
    out("填写后端地址后点「探测后端」。");
    paintProviders(FALLBACK_PROVIDERS);
    return;
  }
  $("#in-backend").value = l.backend;
  $("#in-token").value = l.token;
  await probe();
  await loadModel();
  await loadProviders();
  await loadTasks();
  setInterval(loadTasks, 4000);
})();
