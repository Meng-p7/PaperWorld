/* PaperWorld · AI Core 客户端
 * 前后端分离：浏览器只与自己的 AI Core 后端通信，API Key 由后端加密保存。
 * 本模块只存「后端地址 + 访问令牌」，绝不把模型密钥写进 localStorage。
 */

const KEY = "pw.ai.core.v1";

export function getCoreLink() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || "{}");
    return {
      backend: (c.backend || "").trim().replace(/\/+$/, ""),
      token: typeof c.token === "string" ? c.token : "",
    };
  } catch { return { backend: "", token: "" }; }
}
export function saveCoreLink(link) {
  localStorage.setItem(KEY, JSON.stringify({
    backend: (link.backend || "").trim().replace(/\/+$/, ""),
    token: link.token || "",
  }));
}
export function clearCoreLink() { localStorage.removeItem(KEY); }

function headers(token, json = true) {
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: "Bearer " + token } : {}),
  };
}

async function call(path, { method = "GET", body, link, timeout = 20000 } = {}) {
  const l = link || getCoreLink();
  const base = l.backend || "";
  if (!base) throw new Error("尚未配置 AI Core 后端地址");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(base + path, {
      method,
      headers: headers(l.token, body != null),
      body: body != null ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { /* 非 JSON */ }
    if (!res.ok) {
      const msg = data?.error || `请求失败（HTTP ${res.status}）`;
      const err = new Error(res.status === 401
        ? "后端已开启鉴权：请在「后端连接」里填写访问令牌（PW_TOKEN）"
        : msg);
      err.status = res.status;
      err.code = data?.code || (res.status === 401 ? "UNAUTHORIZED" : undefined);
      throw err;
    }
    return data;
  } catch (e) {
    if (e.name === "AbortError") throw new Error("请求超时，后端没有响应");
    if (e.message === "Failed to fetch") throw new Error("连不上后端，请确认地址与是否已启动服务");
    throw e;
  } finally { clearTimeout(timer); }
}

export async function coreHealth(link) {
  const l = link || getCoreLink();
  const base = l.backend || "";
  if (!base) return { ok: false, error: "未配置后端地址" };
  try {
    const res = await fetch(base + "/health", { headers: headers(l.token), signal: AbortSignal.timeout(8000) });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && data.ok, ...data };
  } catch (e) { return { ok: false, error: e.message || "连不上后端" }; }
}

export async function coreStatus(link) { return call("/api/core/status", { link }); }

export async function listProviders(link) {
  const d = await call("/api/core/providers", { link });
  return d.providers || [];
}

export async function readConfig(link) {
  return call("/api/core/config", { link });
}

export async function writeConfig(payload, link) {
  return call("/api/core/config", { method: "POST", body: payload, link });
}

export async function clearConfig(link) {
  return call("/api/core/config", { method: "DELETE", link });
}

export async function testConnection(payload, link) {
  return call("/api/core/test", { method: "POST", body: payload, link, timeout: 30000 });
}

export async function submitCurate(payload, link) {
  return call("/api/core/curate", { method: "POST", body: payload, link, timeout: 30000 });
}

export async function pollTask(taskId, link) {
  return call(`/api/core/task/${encodeURIComponent(taskId)}`, { link, timeout: 15000 });
}

/* 轮询直到任务结束；返回 task */
export async function waitTask(taskId, { onTick, interval = 1200, maxWait = 180000, link } = {}) {
  const t0 = Date.now();
  for (;;) {
    const d = await pollTask(taskId, link);
    const t = d.task;
    onTick && onTick(t);
    if (t.status === "done" || t.status === "error") return t;
    if (Date.now() - t0 > maxWait) throw new Error("任务等待超时");
    await new Promise((r) => setTimeout(r, interval));
  }
}
