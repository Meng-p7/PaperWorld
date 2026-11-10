/* PaperWorld 2.0 · 工作室控制器
 * 上传 → 解析 → 六维度分析 → 动态布展 →（可选模型讲解）→ 归档 → 进入空间展馆
 */
import { el, $, initTopbar, initMobileNav } from "./core/ui.js";
import { extractPdf } from "./engine/extract.js";
import { analyze } from "./engine/analyze.js";
import { curate, applyAIPlan } from "./engine/curate.js";
import { getCoreLink, submitCurate, waitTask, readConfig } from "./engine/ai.js";
import { readStored, detect } from "./core/endpoint.js";
import { saveExhibition, listExhibitions, deleteExhibition, makeId } from "./core/store.js";

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
let busy = false;
let lastJob = null;
let lastBP = null;
let lastId = null;
let lastBlob = null;

const STEPS = [
  { t: "读取 PDF 结构", d: "在本机打开文档，取回页数与页面尺寸", at: 5 },
  { t: "逐页抽取文本层", d: "重建单/双栏阅读顺序，把文字项拼回行与段", at: 52 },
  { t: "识别骨架与图注", d: "标题、作者、摘要、章节、图注、数值线索、参考文献", at: 70 },
  { t: "识别类型与六维度", d: "先判断论文类型，再看研究背景 / 问题 / 方法 / 实验 / 结果 / 边界", at: 88 },
  { t: "规划四幕与完整资料", d: "按原文依据组织四幕故事，原始分厅归入完整资料", at: 94 },
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
  $("#retry-ai").hidden = true;
  $("#analysis")?.classList.add("is-hidden");
  $pct.style.color = "var(--gold)";
  setProgress(0);
  $pipeline.scrollIntoView({ behavior: "smooth", block: "center" });
}
function fail(err) {
  const msg = String(err?.message || err || "未知错误");
  const noText = /没有从这份 PDF|文字层|OCR|text/i.test(msg);
  const empty = /空的|过小/i.test(msg);
  const invalid = /Invalid PDF|structure|损坏|corrupt|format/i.test(msg);
  const tooBig = /超过 60MB|过大/i.test(msg);
  const storage = /配额|Quota|IndexedDB|存储/i.test(msg);
  const hint = empty
    ? "文件为空或只有几 KB。请确认它是完整的 PDF，再重新选择。"
    : invalid
    ? "这个文件不是完整或有效的 PDF。可以重新下载一份，或换一篇论文再试。"
    : noText
    ? "这份 PDF 可能是扫描件，或文字层不可复制。请换一份可选中文字的 PDF；扫描件需要先做 OCR。"
    : tooBig
      ? "请先压缩 PDF，或只上传论文正文部分。"
      : storage
        ? "浏览器存储空间不足。请在「本机展览库」里移除旧展览，或清理站点数据后再试。"
        : /AI Core|模型|任务|后端/i.test(msg)
          ? "模型只影响讲解，不应中断本地布展。可以到设置检查后端与密钥，或直接重试。"
          : "可以重试一次；如果仍失败，换一篇有文字层的 PDF，或到设置检查后端状态。";
  $pct.textContent = "中断";
  $pct.style.color = "var(--flag)";
  const actions = el("div", { class: "row wrap", style: "gap:8px;margin-top:14px" });
  if (lastJob) actions.append(el("button", { class: "btn btn--sm", text: "重新尝试",
    onclick: () => run(lastJob.blob, lastJob.name) }));
  actions.append(el("button", { class: "btn btn--ghost btn--sm", text: "换一份 PDF",
    onclick: () => { $file.value = ""; $file.click(); } }));
  if (/AI Core|模型|后端/i.test(msg)) actions.append(el("a", { class: "text-link", href: "core.html", text: "去设置看看 →" }));
  $steps.append(el("div", { class: "callout callout--flag", style: "margin-top:14px;max-width:none" },
    el("div", { class: "callout__t", text: "布展没能完成" }),
    el("div", { class: "callout__x", text: msg }),
    el("p", { class: "small dim", style: "margin:10px 0 0;font-family:var(--font-body);font-size:14px;line-height:1.8", text: hint }),
    actions));
}

/* ---------- 策展解读面板 ---------- */
function renderAnalysis(bp, curation) {
  const box = $("#analysis");
  if (!box) return;
  box.classList.remove("is-hidden");
  const type = bp.meta.analysis?.type;
  $("#analysis-status").textContent = `${type?.label ? type.label + " · " : ""}${curation.message || ""}`;
  $("#analysis-status").style.color = curation.source === "ai-core" && !curation.fallbackReason ? "var(--verify)"
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
  let link = getCoreLink();
  if (!link.backend) {
    // 静态托管时用户可能已在本地起了服务：静默试一次，不要求用户填地址。
    setProgress(93, "检查本机服务…");
    const r = await detect().catch(() => ({ ok: false }));
    if (r.ok) link = { backend: r.base, token: readStored().token };
  }
  if (link.backend) {
    try {
      const A = bp.meta.analysis || {};
      const payload = {
        title: bp.meta.title, pageCount: bp.meta.pages,
        paperType: A.type || null,
        storyFocus: A.focus || null,
        abstract: bp.__raw?.abstract || "",
        sections: (bp.__raw?.sections || []).map((s) => ({ title: s.title, page: s.page })),
        figures: (bp.__raw?.figures || []).slice(0, 8),
        dimensions: (A.dimensions || []).map((d) => ({ id: d.id, name: d.name, count: d.count, quoteIds: d.quoteIds || [] })),
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
        const aiActs = t.result.acts?.length || 0;
        const zones = t.result.zones?.length || 0;
        return {
          source: "ai-core",
          result: { ...t.result, message: `AI Core 后端策展完成（${t.result.model || "模型"}）` },
          message: aiActs === 4
            ? `AI Core 完成四幕故事${zones ? `与 ${zones} 个分厅讲解` : ""}；引文与保留数值均通过校验。`
            : `AI Core 通过 ${aiActs}/4 幕${zones ? `、${zones} 个分厅讲解` : ""}，其余幕改用本地原文证据补齐。`,
        };
      }
      throw new Error(t.error || "策展任务失败");
    } catch (e) {
      // 后端不可用/未配密钥/任务失败 → 降级，但把真实原因带回界面。
      console.warn("AI Core 策展降级：", e.message);
      return {
        source: "local", result: null, fallbackReason: e.message,
        message: `模型没能完成：${e.message}。已改用本地分析生成四幕，内容仍然只来自原文。可到设置检查后重新尝试。`,
      };
    }
  }
  return {
    source: "local", result: null,
    message: "未连接 AI Core，使用本地类型分析与原文证据组织四幕；接入模型后讲解会更连贯。",
  };
}

async function run(blob, sourceName) {
  if (busy) { $filename.textContent = "正在布展，请等当前任务完成…"; return; }
  lastJob = null;
  if (!blob || blob.size < 1024) { fail(new Error("文件看起来是空的。")); return; }
  if (blob.size > 60 * 1024 * 1024) { fail(new Error("文件超过 60MB，请先压缩或换一篇。")); return; }
  busy = true;
  lastJob = { blob, name: sourceName };
  for (const id of ["#pick", "#demo"]) { const b = $(id); if (b) b.disabled = true; }
  $drop.setAttribute("aria-busy", "true");
  $drop.classList.add("is-busy");
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

    setProgress(98, "写入本机展览库…");
    const id = makeId();
    await saveExhibition({ id, blueprint: bp, blob });
    lastBP = bp; lastId = id; lastBlob = blob;
    setProgress(100);

    $("#result-title").textContent = bp.meta.title;
    $("#result-note").textContent =
      `已生成四幕故事与 ${bp.halls.length} 个原始资料分厅，共 ${Object.keys(bp.evidence).length} 条可溯源证据。` +
      curation.message + " 原文与策展语分开标注，结论均可回到原页。";
    const stats = [
      ["论文类型", bp.meta.analysis?.type?.label || "通用研究"],
      ["页数", ex.pageCount], ["原文展签", Object.keys(bp.evidence).length],
      ["命中维度", hit], ["识别章节", (bp.__raw?.sections || []).length],
      ["图注", ex.figures.length], ["参考文献", ex.refs.length],
    ];
    const box = $("#result-stats");
    box.textContent = "";
    for (const [l, v] of stats) box.append(el("div", { class: "result__s" },
      el("div", { class: "result__v", text: String(v) }),
      el("div", { class: "result__l", text: l })));

    // 上传完成后直接进入整合后的展览：四幕在上，完整档案在同一页。
    const hrefSuffix = "?e=" + encodeURIComponent(id);
    $("#enter").href = "story.html" + hrefSuffix;
    const stationLink = $("#enter-station");
    if (stationLink) stationLink.href = "station.html" + hrefSuffix;
    $("#enter-read").href = "story.html" + hrefSuffix + "#full-archive";
    renderAnalysis(bp, curation);
    const retry = $("#retry-ai");
    if (retry) retry.hidden = curation.source !== "local";
    $result.classList.remove("is-hidden");
    renderGallery();
    $result.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (err) { fail(err); }
  finally {
    busy = false;
    for (const id of ["#pick", "#demo"]) { const b = $(id); if (b) b.disabled = false; }
    $drop.removeAttribute("aria-busy");
    $drop.classList.remove("is-busy");
  }
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
  if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") { lastJob = null; fail(new Error("请放入 PDF 文件。")); return; }
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

$("#retry-ai").addEventListener("click", async () => {
  if (!lastBP || !lastBlob || !lastId) return;
  if (!getCoreLink().backend) {
    $("#result-note").textContent = "还没有连上本机服务。先到「设置」启动一次，再回来点这里。";
    return;
  }
  const btn = $("#retry-ai");
  busy = true;
  btn.disabled = true;
  for (const id of ["#pick", "#demo"]) { const b = $(id); if (b) b.disabled = true; }
  $drop.setAttribute("aria-busy", "true");
  const old = btn.textContent;
  btn.textContent = "正在重试 AI 策展…";
  try {
    const curation = await runCuration(lastBP);
    if (curation.source === "ai-core" && curation.result) {
      applyAIPlan(lastBP, curation.result);
      await saveExhibition({ id: lastId, blueprint: lastBP, blob: lastBlob });
      $("#result-note").textContent = `AI 策展已更新。${curation.message} 原文与策展语仍然分开标注。`;
      btn.hidden = true;
      renderGallery();
    } else {
      $("#result-note").textContent = curation.message || "AI Core 仍未完成，继续保留本地四幕。";
    }
    renderAnalysis(lastBP, curation);
  } catch (e) {
    $("#result-note").textContent = `重试失败：${e.message}。可以检查 AI Core 后再试，或直接阅读本地四幕。`;
  } finally {
    busy = false;
    btn.disabled = false;
    btn.textContent = old;
    for (const id of ["#pick", "#demo"]) { const b = $(id); if (b) b.disabled = false; }
    $drop.removeAttribute("aria-busy");
  }
});

$("#again").addEventListener("click", () => {
  $result.classList.add("is-hidden");
  $("#retry-ai").hidden = true;
  $("#analysis")?.classList.add("is-hidden");
  $pipeline.classList.add("is-hidden");
  $filename.textContent = ""; $file.value = "";
  $drop.scrollIntoView({ behavior: "smooth", block: "center" });
});

/* ---------- 展览库 ---------- */
function renderGallery() {
  $gallery.textContent = "";
  $gallery.append(el("article", { class: "gcard" },
    el("div", { class: "gcard__tag", text: "示范展" }),
    el("div", { class: "gcard__t", text: "Learning Fine-Grained Bimanual Manipulation with Low-Cost Hardware" }),
    el("div", { class: "gcard__m", text: "ALOHA / ACT · 四幕故事 · 81 条逐字核对的引文" }),
    el("div", { class: "gcard__a" },
      el("a", { class: "btn btn--sm", href: "story.html", text: "阅读四幕故事 →" }),
      el("a", { class: "btn btn--ghost btn--sm", href: "station.html", text: "进空间站" }),
      el("a", { class: "text-link", href: "story.html#full-archive", text: "完整档案" }))));

  for (const x of listExhibitions()) {
    const date = new Date(x.created).toLocaleDateString("zh-CN");
    const s = "?e=" + encodeURIComponent(x.id);
    $gallery.append(el("article", { class: "gcard" },
      el("div", { class: "gcard__tag", text: "自动策展" }),
      el("div", { class: "gcard__t", text: x.title }),
      el("div", { class: "gcard__m", text: `${x.source} · ${x.pages} 页 · ${x.evidenceCount} 条展签 · ${date}` }),
      el("div", { class: "gcard__a" },
        el("a", { class: "btn btn--sm", href: "story.html" + s, text: "阅读四幕故事 →" }),
        el("a", { class: "btn btn--ghost btn--sm", href: "station.html" + s, text: "进空间站" }),
        el("a", { class: "text-link", href: "story.html" + s + "#full-archive", text: "完整档案" }),
        el("button", { class: "btn btn--ghost btn--sm", text: "移除",
          onclick: async () => { await deleteExhibition(x.id); renderGallery(); } }))));
  }
}
renderGallery();

/* ---------- 模型服务状态提示（地址不用用户填） ---------- */
(async () => {
  const strip = $("#core-strip");
  const text = $("#core-strip-text");
  if (!strip || !text) return;
  const link = getCoreLink();

  // 只有「本站点就是后端」时才在这里探测：同源一定成功，不产生控制台噪音。
  // 其它情况（线上托管 / 后端在别处）不主动发请求，只说明生成时会自动确认。
  if (!link.backend || link.backend !== location.origin) {
    text.textContent = "生成时会自动确认模型服务；连不上就用本地分析，不影响阅读。要接入自己的模型，在 AI Core 填一次 API Key。";
    return;
  }

  text.textContent = "正在确认模型服务…";
  try {
    const res = await fetch(link.backend + "/health", { signal: AbortSignal.timeout(6000) });
    const h = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`服务没有正常响应（HTTP ${res.status}）`);
    if (!h.ok) throw new Error(h.error || "服务异常");
    let cfg = null;
    try { cfg = await readConfig(link); }
    catch (e) {
      if (e.status === 401) {
        strip.classList.add("is-bad");
        text.textContent = "模型服务已连接，但缺少访问令牌。生成会先用本地分析；令牌在 AI Core 的「高级」里填一次。";
        return;
      }
      throw e;
    }
    if (!cfg.hasKey) {
      strip.classList.add("is-bad");
      text.textContent = "模型服务已连接，但还没有保存 API Key。生成会先用本地分析；在 AI Core 填一次 Key 就能用模型。";
      return;
    }
    strip.classList.add("is-ok");
    text.textContent = `模型已就绪 · ${cfg.model || "已配置"} · 生成时由模型写四幕，并逐条校验引文与数值。`;
  } catch (e) {
    strip.classList.add("is-bad");
    text.textContent = `本机模型服务没有响应：${e.message}。生成会自动使用本地分析，不影响阅读。`;
  }
})();
