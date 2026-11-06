/* PaperWorld 2.0 · 可选模型策展适配器
 *
 * 默认完全不启用。用户在工作室里自行填写 OpenAI 兼容端点 / 模型 / 密钥后，
 * 才会调用一次，用来：① 写展区讲解（策展语）② 从已核验的原文里挑展品。
 *
 * 三条硬约束（代码里逐条校验，不是写在提示词里就算数）：
 *   1. 模型输出永远不会被当作原文展出，只渲染成标了「AI 策展语 · 非原文」的 exhibit 块；
 *   2. quoteIds 必须是本展 evidence 表里已存在的 id，一个多余的都不收；
 *   3. 讲解里不允许出现百分比等新数值，出现即丢弃该条，保留本地策展语。
 *
 * 调用失败 / 未配置 / 超时 / 返回不合规 → 静默降级到本地维度分析，并在界面如实说明。
 * 生成结果写进 blueprint 后就固定下来，浏览展馆时不再调用模型。
 */

const KEY = "pw.llm.v1";

export function getLLMConfig() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || "{}");
    return {
      endpoint: typeof c.endpoint === "string" ? c.endpoint.trim() : "",
      model: typeof c.model === "string" ? c.model.trim() : "",
      apiKey: typeof c.apiKey === "string" ? c.apiKey : "",
    };
  } catch { return { endpoint: "", model: "", apiKey: "" }; }
}
export function saveLLMConfig(c) {
  localStorage.setItem(KEY, JSON.stringify({
    endpoint: c.endpoint || "", model: c.model || "", apiKey: c.apiKey || "",
  }));
}
export function clearLLMConfig() { localStorage.removeItem(KEY); }
export function isLLMEnabled() {
  const c = getLLMConfig();
  return Boolean(c.endpoint && c.model);
}

const SYSTEM = `你是 PaperWorld 数字科研博物馆的策展助手。你的唯一任务：为一篇学术论文的若干「研究维度展区」写展区讲解，并从给定原文清单里挑选要摆出的展品。

铁律：
1. 你写的每一句都是「策展语」（编辑性文字），界面会明确标注为「AI 策展语 · 非原文」。不得冒充论文原文。
2. 不得陈述任何新的事实、数值、百分比、实验结论或作者观点。只提示阅读顺序、说明这一维度在讲哪一类内容、提醒读者核对页码。
3. 不得编造引文。quoteIds 只能来自输入清单中的 id，只能减少或重排，不能增加或改写。
4. note 不超过 90 个汉字，不要出现百分号或具体数字。
5. 只输出一个 JSON 对象，不要 Markdown 代码块、不要解释。格式：
{"zones":[{"id":"background","note":"……","quoteIds":["a001","a002"]}]}`;

function buildPayload(bp) {
  const dims = (bp.meta.analysis?.dimensions || []).filter((d) => d.count > 0);
  return {
    paperTitle: bp.meta.title,
    dimensions: dims.map((d) => ({
      id: d.id, name: d.name, pages: d.pages,
      candidates: (d.quoteIds || []).map((id) => ({
        id, page: bp.evidence[id]?.page, text: (bp.evidence[id]?.quote || "").slice(0, 110),
      })),
    })),
  };
}

function parseJSON(text) {
  const clean = String(text || "").replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const a = clean.indexOf("{"), b = clean.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("模型未返回 JSON");
  return JSON.parse(clean.slice(a, b + 1));
}

export async function enhancePlan(bp, { timeout = 15000 } = {}) {
  const cfg = getLLMConfig();
  if (!isLLMEnabled()) {
    return { applied: false, message: "未配置模型：使用本地维度分析与提取式策展（默认）", patches: [] };
  }
  const dims = (bp.meta.analysis?.dimensions || []).filter((d) => d.count > 0);
  if (!dims.length) return { applied: false, message: "没有可规划的维度", patches: [] };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(cfg.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cfg.apiKey ? { Authorization: "Bearer " + cfg.apiKey } : {}),
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.2,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: JSON.stringify(buildPayload(bp)) },
        ],
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? data.output_text ?? "";
    const obj = parseJSON(content);
    const zones = Array.isArray(obj.zones) ? obj.zones : [];
    const byId = new Map(dims.map((d) => [d.id, d]));
    const patches = [];
    const rejected = [];

    for (const z of zones) {
      const dim = byId.get(z?.id);
      if (!dim) { rejected.push("未知维度"); continue; }
      const note = String(z.note || "").trim();
      const ids = Array.isArray(z.quoteIds) ? z.quoteIds.filter((x) => typeof x === "string") : [];
      const allowed = new Set(dim.quoteIds || []);
      const validIds = ids.filter((id) => allowed.has(id));
      // 校验：讲解不得含新数值；展品 id 必须全部来自已核验清单
      const badNote = !note || note.length > 160 || /(\d+(?:\.\d+)?\s?%|\$\s?\d)/.test(note);
      const badIds = ids.length && (ids.length !== validIds.length || validIds.length === 0);
      if (badNote || badIds) { rejected.push(dim.id); continue; }
      patches.push({ id: dim.id, note, quoteIds: validIds });
    }
    if (!patches.length) {
      return { applied: false, message: `模型返回未通过校验（${rejected.length} 项被拒），已使用本地策展`, patches: [] };
    }
    return {
      applied: true,
      message: `模型已参与 ${patches.length} 个展区的讲解与展品挑选${rejected.length ? `；${rejected.length} 项未通过校验被丢弃` : ""}`,
      patches,
    };
  } catch (err) {
    const why = err.name === "AbortError" ? "请求超时" : (err.message || "网络错误");
    return { applied: false, message: `模型调用失败（${why}），已降级到本地维度分析`, patches: [] };
  } finally {
    clearTimeout(timer);
  }
}
