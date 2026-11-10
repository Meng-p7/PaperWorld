/* PaperWorld · AI Core 端点解析
 *
 * 设计前提：普通用户不懂「后端地址」，也不该填。
 * 所以地址由代码在运行时自己确认，用户只面对一件事——填自己的 API Key。
 *
 * 解析优先级：
 *   1. DECLARED   —— 项目部署到自己的后端后，在这里写死一次（终端用户看不到）
 *   2. 已记住的地址 —— 高级用户手动指定过，或上次自动探测成功过
 *   3. 同源        —— 页面本身由后端托管（http://localhost:8080/…），零配置
 *   4. 本机 8080   —— 静态托管（如 GitHub Pages）但本机启动了服务
 */

const STORE_KEY = "pw.ai.core.v1";

/* 部署到公网后端后，把这里改成你的地址，例如 "https://pw-api.example.com"。
 * 留空则自动使用「同源」或「本机 8080」。终端用户永远不需要改这一行。 */
const DECLARED = "";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const LOCAL_PORTS = ["http://localhost:8080", "http://127.0.0.1:8080"];

const norm = (u) => String(u || "").trim().replace(/\/+$/, "");
const isHttp = () => /^https?:$/.test(location.protocol);
const isLocalOrigin = () => isHttp() && LOCAL_HOSTS.has(location.hostname);

export function readStored() {
  try {
    const c = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    return { backend: norm(c.backend), token: typeof c.token === "string" ? c.token : "" };
  } catch { return { backend: "", token: "" }; }
}

export function writeStored(patch = {}) {
  const cur = readStored();
  const next = {
    backend: patch.backend === undefined ? cur.backend : norm(patch.backend),
    token: patch.token === undefined ? cur.token : String(patch.token || ""),
  };
  try { localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch { /* 隐私模式下忽略 */ }
  return next;
}

/* 不联网就能确定的地址 */
export function baseFromContext() {
  const stored = readStored();
  if (DECLARED) return { base: norm(DECLARED), source: "declared", token: stored.token };
  if (stored.backend) return { base: stored.backend, source: "stored", token: stored.token };
  if (isLocalOrigin()) return { base: location.origin, source: "same-origin", token: stored.token };
  return { base: "", source: "none", token: stored.token };
}

/* 探测用的候选顺序：先贵的确定项，最后猜本机端口 */
function candidates() {
  const out = [];
  const push = (u) => { const n = norm(u); if (n && !out.includes(n)) out.push(n); };
  push(DECLARED);
  push(readStored().backend);
  // 同源地址由 baseFromContext() 直接给，走到这里说明它没通过健康检查，不必再试一次
  for (const p of LOCAL_PORTS) push(p);
  return out;
}

const looksLikeCore = (d) => Boolean(d && d.ok && /paperworld/i.test(String(d.service || "")));

/* 依次探测候选地址，返回第一个真正在跑的 PaperWorld 后端 */
export async function detect({ timeout = 2600 } = {}) {
  for (const base of candidates()) {
    try {
      const res = await fetch(base + "/health", { cache: "no-store", signal: AbortSignal.timeout(timeout) });
      const d = await res.json().catch(() => null);
      if (res.ok && looksLikeCore(d)) {
        writeStored({ backend: base });
        return { ok: true, base, tokenRequired: Boolean(d.tokenRequired) };
      }
    } catch { /* 该候选不可用，继续下一个 */ }
  }
  return { ok: false, base: "" };
}
