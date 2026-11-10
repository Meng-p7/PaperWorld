/* PaperWorld · AI Core 客户端
 * 前后端分离：浏览器只与自己的 AI Core 后端通信，API Key 由后端加密保存。
 * 本模块只存「后端地址 + 访问令牌」，绝不把模型密钥写进 localStorage。
 */

import { baseFromContext, writeStored } from "../core/endpoint.js";

/* 后端地址不再由用户填写：这里直接从运行环境解析（同源 / 声明 / 记住的 / 本机 8080）。 */
export function getCoreLink() {
  const { base, token } = baseFromContext();
  return { backend: base, token };
}
export function saveCoreLink(link) { writeStored({ backend: link.backend, token: link.token }); }

function headers(token, json = true) {
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: "Bearer " + token } : {}),
  };
}

async function call(path, { method = "GET", body, link, timeout = 20000 } = {}) {
  const l = link || getCoreLink();
  const base = l.backend || "";
  if (!base) throw new Error("本机还没有可用的后端服务");
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
        ? "后端已开启鉴权：在「设置」的高级里填一次访问令牌"
        : msg);
      err.status = res.status;
      err.code = data?.code || (res.status === 401 ? "UNAUTHORIZED" : undefined);
      throw err;
    }
    return data;
  } catch (e) {
    if (e.name === "AbortError") throw new Error("请求超时，后端没有响应");
    if (e.message === "Failed to fetch") throw new Error("连不上后端服务：本机服务可能没有启动");
    throw e;
  } finally { clearTimeout(timer); }
}

export async function coreHealth(link) {
  const l = link || getCoreLink();
  const base = l.backend || "";
  if (!base) return { ok: false, error: "本机服务未启动" };
  try {
    const res = await fetch(base + "/health", { headers: headers(l.token), signal: AbortSignal.timeout(8000) });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && data.ok, ...data };
  } catch (e) { return { ok: false, error: e.message || "连不上后端" }; }
}

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
