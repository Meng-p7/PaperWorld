/* PaperWorld 2.0 · 工作室控制器
 * 上传 → 解析 → 六维度分析 → 动态布展 →（可选模型讲解）→ 归档 → 进入空间展馆
 */
import { el, $, initTheme, initTopbar, initMobileNav } from "./core/ui.js";
import { extractPdf } from "./engine/extract.js";
import { analyze } from "./engine/analyze.js";
import { curate, applyPlan, applyAIPlan } from "./engine/curate.js";
import { enhancePlan, getLLMConfig, saveLLMConfig, clearLLMConfig, isLLMEnabled } from "./engine/llm.js";
import { getCoreLink, submitCurate, waitTask } from "./engine/ai.js";
import { saveExhibition, listExhibitions, deleteExhibition, makeId } from "./core/store.js";

initTheme();
initTopbar();
initMobileNav();

const $drop = $("#drop");
const $file = $("#file");
const $filename = $("#filename");
const $pipeline = $("#pipeline");
const $bar = $("#bar");
const $pct = $("#pct");
const $steps = $("#steps");
const $result = $("#result");
const $gallery = $("#gallery-grid");

const STEPS = [
  { t: "读取 PDF 结构", d: "在本机打开文档，取回页数与页面尺寸", at: 5 },
  { t: "逐页抽取文本层", d: "重建单/双栏阅读顺序，把文字项拼回行与段", at: 52 },
  { t: "识别骨架与图注", d: "标题、作者、摘要、章节、图注、数值线索、参考文献", at: 70 },
  { t: "六维度分析论文", d: "研究背景 / 核心问题 / 创新点 / 技术路线 / 实验过程 / 结果", at: 88 },
  { t: "动态规划展区与展品", d: "只建有原文依据的维度，按维度选展示形式", at: 94 },
  { t: "生成展签并归档", d: "每条原文语句绑定页码与逐字引文，写入本机展览库", at: 100 },
];

function renderSteps(pct, note) {
  let activeFound = false;
  $steps.textContent = "";
  STEPS.forEach((s, i) => {
    const done = pct >= s.at;
    const active = !done && !activeFound;
    if (active) activeFound = true;
    $steps.append(el("div", { class: "pstep" + (done ? " is-done" : active ? " is-on" : "") },
      el("div", { class: "pstep__dot", text: done ? "✓" : String(i + 1) }),
      el("div", {},
        el("div", { class: "pstep__t", text: s.t }),
        el("div", { class: "pstep__d", text: active && note ? note : s.d }))));
  });
}
function setProgress(pct, note) {
  pct = Math.max(0, Math.min(100, Math.round(pct)));
  $bar.style.width = pct + "%";
  $pct.textContent = pct + "%";
  renderSteps(pct, note);
}
function resetUI() {
  $pipeline.classList.remove("is-hidden");
  $result.classList.add("is-hidden");
  $("#analysis")?.classList.add("is-hidden");
  setProgress(0);
  $pipeline.scrollIntoView({ behavior: "smooth", block: "center" });
}
function fail(err) {
  console.error(err);
  $pct.textContent = "中断";
  $pct.style.color = "var(--flag)";
  $steps.append(el("div", { class: "callout callout--flag", style: "margin-top:14px;max-width:none" },
    el("div", { class: "callout__t", text: "布展没能完成" }),
    el("div", { class: "callout__x", text: String(err?.message || err) }),
    el("p", { class: "small dim", style: "margin:10px 0 0;font-family:var(--font-body);font-size:13px",
      text: "常见原因：PDF 是纯扫描图、文件加密、或浏览器存储配额不足。可以换一篇有文字层的论文再试。" })));
}

/* ---------- 策展解读面板 ---------- */
function renderAnalysis(bp, curation) {
  const box = $("#analysis");
  if (!box) return;
  box.classList.remove("is-hidden");
  $("#analysis-status").textContent = curation.message || "";
  $("#analysis-status").style.color = curation.source === "ai-core" ? "var(--verify)"
    : curation.source === "local" ? "var(--gold)" : "var(--ink-3)";

  const grid = $("#analysis-grid");
  grid.textContent = "";
  for (const d of bp.meta.analysis?.dimensions || []) {
    grid.append(el("div", { class: "adim" },
      el("div", { class: "adim__h" },
        el("span", { class: "adim__t", text: d.name }),
        el("span", { class: "adim__c", text: `${d.count} 条` })),
      el("div", { class: "adim__p", text: d.count ? `P.${d.pages.join(" / P.")} · ${d.en}` : "未检出原文依据" }),
      el("div", { class: "adim__q", text: d.representative || d.basis })));
  }

  const list = $("#plan-list");
  list.textContent = "";
  for (const p of bp.meta.plan || []) {
    list.append(el("div", { class: "planlist__r" },
      el("span", { class: "planlist__n", text: p.num }),
      el("span", { class: "planlist__t", text: `${p.title} · ${p.count} 件展品` }),
      el("span", { class: "planlist__m", text: ({ quotes: "随机展签", sections: "章节地图", numbers: "数值扫描", exhibit: "原文展墙", plain: "原文展墙", plates: "图谱", archive: "原文页图" })[p.form] || p.form })));
  }
}

/* ---------- 策展：优先 AI Core 后端，其次本机直连，最后本地提取式 ---------- */
function recordTask(t) {
  try {
    const list = JSON.parse(localStorage.getItem("pw.ai.tasks") || "[]");
    const i = list.findIndex((x) => x.id === t.id);
    const rec = { id: t.id, status: t.status, stage: t.stage, progress: t.progress, error: t.error, acts: t.result?.acts?.length, zones: t.result?.zones?.length };
    if (i >= 0) list[i] = { ...list[i], ...rec }; else list.unshift(rec);
    localStorage.setItem("pw.ai.tasks", JSON.stringify(list.slice(0, 12)));
  } catch { /* 任务记录失败不影响生成 */ }
}

async function runCuration(bp) {
  const link = getCoreLink();
  if (link.backend) {
    try {
      const payload = {
        title: bp.meta.title, pageCount: bp.meta.pages,
        dimensions: (bp.meta.analysis?.dimensions || []).map((d) => ({ id: d.id, name: d.name, count: d.count })),
        sentences: Object.entries(bp.evidence || {}).map(([id, e]) => ({ id, page: e.page, section: e.section, text: e.quote })),
      };
      setProgress(95, "提交 AI Core 策展任务…");
      const { taskId } = await submitCurate(payload, link);
      recordTask({ id: taskId, status: "running", stage: "已提交" });
      const t = await waitTask(taskId, {
        link,
        onTick: (tk) => { setProgress(95 + (tk.progress || 0) * 3.5, tk.stage || "模型理解论文…"); recordTask(tk); },
      });
      recordTask(t);
      if (t.status === "done" && t.result) {
        return {
          source: "ai-core",
          result: { ...t.result, message: `AI Core 后端策展完成（${t.result.model || "模型"}）` },
          message: `AI Core 模型策展：${t.result.acts?.length || 0} 幕科研故事、${t.result.zones?.length || 0} 个展区讲解，全部引文已回查证据表。`,
        };
      }
      throw new Error(t.error || "策展任务失败");
    } catch (e) {
      // 后端不可用/未配密钥/任务失败 → 降级，不阻塞生成
      console.warn("AI Core 策展降级：", e.message);
    }
  }
  if (isLLMEnabled()) {
    const r = await enhancePlan(bp);
    return { source: "local", result: r, message: r.message || "本机模型已参与展区讲解" };
  }
  return {
    source: "none", result: null,
    message: "未配置 AI Core 与模型，使用本地六维度分析完成提取式策展（真实、可溯源、不编造）。",
  };
}

async function run(blob, sourceName) {
  if (!blob || blob.size < 1024) { fail(new Error("文件看起来是空的。")); return; }
  if (blob.size > 60 * 1024 * 1024) { fail(new Error("文件超过 60MB，请先压缩或换一篇。")); return; }
  resetUI();
  $pct.style.color = "var(--gold)";
  try {
    const ex = await extractPdf(blob, ({ percent, detail }) => setProgress(percent, detail));
    if (!ex.sentences.length) throw new Error("没有从这份 PDF 里读到可用的文字。扫描件需要先做 OCR。");

    setProgress(88, `得到 ${ex.sentences.length} 条原文语句`);
    const A = analyze(ex);
    const hit = A.dimensions.filter((d) => d.count > 0).length;
    setProgress(92, `命中 ${hit} 个研究维度`);
    const bp = curate(ex, { sourceName, analysis: A });

    setProgress(94, "准备策展任务…");
    const curation = await runCuration(bp);
    if (curation.source === "ai-core" && curation.result) applyAIPlan(bp, curation.result);
    else if (curation.source === "local" && curation.result) applyPlan(bp, curation.result);

    setProgress(98, "写入本机展览库…");
    const id = makeId();
    await saveExhibition({ id, blueprint: bp, blob });
    setProgress(100);

    $("#result-title").textContent = bp.meta.title;
    $("#result-note").textContent =
      `已规划 ${bp.halls.length} 间展区、${Object.keys(bp.evidence).length} 条可溯源展签。` +
      curation.message + " 正文全部是 PDF 原文直引，编辑性文字与模型讲解单独标注。";
    const stats = [
      ["页数", ex.pageCount], ["原文展签", Object.keys(bp.evidence).length],
      ["命中维度", hit], ["识别章节", (bp.__raw?.sections || []).length],
      ["图注", ex.figures.length], ["参考文献", ex.refs.length],
    ];
    const box = $("#result-stats");
    box.textContent = "";
    for (const [l, v] of stats) box.append(el("div", { class: "result__s" },
      el("div", { class: "result__v", text: String(v) }),
      el("div", { class: "result__l", text: l })));

    $("#enter").href = "station.html?e=" + encodeURIComponent(id);
    $("#enter-story").href = "story.html?e=" + encodeURIComponent(id);
    $("#enter-read").href = "hall.html?e=" + encodeURIComponent(id);
    renderAnalysis(bp, curation);
    $result.classList.remove("is-hidden");
    renderGallery();
    $result.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (err) { fail(err); }
}

/* ---------- 上传交互 ---------- */
$drop.addEventListener("click", (e) => { if (e.target.closest("button")) return; $file.click(); });
$drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $file.click(); } });
$("#pick").addEventListener("click", (e) => { e.stopPropagation(); $file.click(); });
$file.addEventListener("change", () => {
  const f = $file.files?.[0];
  if (f) { $filename.textContent = `已选择 · ${f.name} · ${(f.size / 1048576).toFixed(1)} MB`; run(f, f.name); }
});
for (const ev of ["dragenter", "dragover"]) $drop.addEventListener(ev, (e) => { e.preventDefault(); $drop.classList.add("is-drag"); });
for (const ev of ["dragleave", "drop"]) $drop.addEventListener(ev, (e) => { e.preventDefault(); $drop.classList.remove("is-drag"); });
$drop.addEventListener("drop", (e) => {
  const f = e.dataTransfer?.files?.[0];
  if (!f) return;
  if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") { fail(new Error("请放入 PDF 文件。")); return; }
  $filename.textContent = `已选择 · ${f.name} · ${(f.size / 1048576).toFixed(1)} MB`;
  run(f, f.name);
});

$("#demo").addEventListener("click", async (e) => {
  e.stopPropagation();
  const btn = $("#demo");
  btn.disabled = true; btn.textContent = "正在取回内置论文…";
  try {
    const r = await fetch("assets/papers/aloha.pdf");
    if (!r.ok) throw new Error("内置论文读取失败 (" + r.status + ")");
    const blob = await r.blob();
    $filename.textContent = "内置演示 · ALOHA / ACT · arXiv:2304.13705v1";
    await run(blob, "ALOHA / ACT · arXiv:2304.13705v1.pdf");
  } catch (err) { fail(err); }
  finally { btn.disabled = false; btn.textContent = "用 ALOHA 论文试一次"; }
});

$("#again").addEventListener("click", () => {
  $result.classList.add("is-hidden");
  $("#analysis")?.classList.add("is-hidden");
  $pipeline.classList.add("is-hidden");
  $filename.textContent = ""; $file.value = "";
  $drop.scrollIntoView({ behavior: "smooth", block: "center" });
});

/* ---------- 可选模型设置 ---------- */
const cfg = getLLMConfig();
$("#llm-endpoint").value = cfg.endpoint;
$("#llm-model").value = cfg.model;
$("#llm-key").value = cfg.apiKey;
$("#llm-toggle").addEventListener("click", () => $("#llmcfg").classList.toggle("is-open"));
$("#llm-save").addEventListener("click", () => {
  saveLLMConfig({
    endpoint: $("#llm-endpoint").value.trim(),
    model: $("#llm-model").value.trim(),
    apiKey: $("#llm-key").value.trim(),
  });
  $("#llm-hint").textContent = isLLMEnabled()
    ? "已保存。下次生成时会调用一次模型；失败会自动降级，不影响展馆生成。"
    : "已清空端点/模型，当前使用本地维度分析（默认）。";
});
$("#llm-clear").addEventListener("click", () => {
  clearLLMConfig();
  for (const id of ["#llm-endpoint", "#llm-model", "#llm-key"]) $(id).value = "";
  $("#llm-hint").textContent = "已清除配置，恢复本地维度分析。";
});

/* ---------- 展览库 ---------- */
function renderGallery() {
  $gallery.textContent = "";
  $gallery.append(el("article", { class: "gcard" },
    el("div", { class: "gcard__tag", text: "CURATED · 人工策展示范展" }),
    el("div", { class: "gcard__t", text: "Learning Fine-Grained Bimanual Manipulation with Low-Cost Hardware" }),
    el("div", { class: "gcard__m", text: "ALOHA / ACT · 8 间展区 · 81 条逐字核对的引文 · 5 台互动装置" }),
    el("div", { class: "gcard__a" },
      el("a", { class: "btn btn--sm", href: "station.html", text: "进入空间站 →" }),
      el("a", { class: "btn btn--ghost btn--sm", href: "hall.html", text: "直接阅读" }))));

  for (const x of listExhibitions()) {
    const date = new Date(x.created).toLocaleDateString("zh-CN");
    const s = "?e=" + encodeURIComponent(x.id);
    $gallery.append(el("article", { class: "gcard" },
      el("div", { class: "gcard__tag", text: "AI 策展 · 六维度分析" }),
      el("div", { class: "gcard__t", text: x.title }),
      el("div", { class: "gcard__m", text: `${x.source} · ${x.pages} 页 · ${x.evidenceCount} 条展签 · ${date}` }),
      el("div", { class: "gcard__a" },
        el("a", { class: "btn btn--sm", href: "station.html" + s, text: "进入空间站 →" }),
        el("a", { class: "btn btn--ghost btn--sm", href: "hall.html" + s, text: "直接阅读" }),
        el("button", { class: "btn btn--ghost btn--sm", text: "移除",
          onclick: async () => { await deleteExhibition(x.id); renderGallery(); } }))));
  }
}
renderGallery();

/* ---------- AI Core 状态提示 ---------- */
(async () => {
  const strip = $("#core-strip");
  const text = $("#core-strip-text");
  const link = getCoreLink();
  if (!strip || !text) return;
  if (!link.backend) {
    text.textContent = "AI Core 未配置：将使用本地六维度分析完成提取式策展（真实、可溯源、不编造）。";
    return;
  }
  text.textContent = "正在探测 AI Core 后端…";
  try {
    const res = await fetch(link.backend + "/health", { signal: AbortSignal.timeout(6000) });
    const h = await res.json().catch(() => ({}));
    if (!res.ok || !h.ok) throw new Error(h.error || "后端异常");
    strip.classList.add("is-ok");
    text.textContent = h.tokenRequired
      ? `AI Core 已连接（${link.backend}）· 后端开启鉴权，需在 AI Core 页填入访问令牌。`
      : `AI Core 已连接（${link.backend}）· 生成时将由模型负责故事与展区讲解。`;
  } catch (e) {
    strip.classList.add("is-bad");
    text.textContent = `AI Core 后端不可达（${link.backend}）：${e.message}。将自动降级到本地提取式策展。`;
  }
})();
