/* PaperWorld · 工作室控制器：上传 → 解析 → 布展 → 归档 */
import { el, $, initTheme, initTopbar, initMobileNav } from "./core/ui.js";
import { extractPdf } from "./engine/extract.js";
import { curate } from "./engine/curate.js";
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
  { t: "识别论文骨架", d: "标题、作者、摘要、章节、图注、数值线索、参考文献", at: 70 },
  { t: "生成可溯源展签", d: "每条原文语句绑定页码与逐字引文", at: 88 },
  { t: "布展并归档", d: "写入本机展览库，随时可以重新进入", at: 100 },
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

async function run(blob, sourceName) {
  if (!blob || blob.size < 1024) { fail(new Error("文件看起来是空的。")); return; }
  if (blob.size > 60 * 1024 * 1024) { fail(new Error("文件超过 60MB，请先压缩或换一篇。")); return; }
  resetUI();
  $pct.style.color = "var(--gold)";
  try {
    const ex = await extractPdf(blob, ({ percent, detail }) => setProgress(percent, detail));
    if (!ex.sentences.length) {
      throw new Error("没有从这份 PDF 里读到可用的文字。扫描件需要先做 OCR。");
    }
    setProgress(90, `得到 ${ex.sentences.length} 条原文语句`);
    const bp = curate(ex, { sourceName });
    setProgress(95, "写入本机展览库…");
    const id = makeId();
    await saveExhibition({ id, blueprint: bp, blob });
    setProgress(100);

    $("#result-title").textContent = bp.meta.title;
    $("#result-note").textContent =
      `已生成 ${bp.halls.length} 间展厅、${Object.keys(bp.evidence).length} 条可溯源展签。正文全部是 PDF 原文直引，编辑性文字单独标注。展览与论文都只存在这台设备上。`;
    const stats = [
      ["页数", ex.pageCount], ["原文展签", Object.keys(bp.evidence).length],
      ["章节", (bp.__raw?.sections || []).length], ["图注", ex.figures.length],
      ["数值线索", ex.numbers.length], ["参考文献", ex.refs.length],
    ];
    const box = $("#result-stats");
    box.textContent = "";
    for (const [l, v] of stats) box.append(el("div", { class: "result__s" },
      el("div", { class: "result__v", text: String(v) }),
      el("div", { class: "result__l", text: l })));
    $("#enter").href = "index.html?e=" + encodeURIComponent(id);
    $result.classList.remove("is-hidden");
    renderGallery();
    $result.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (err) {
    fail(err);
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
  if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") { fail(new Error("请放入 PDF 文件。")); return; }
  $filename.textContent = `已选择 · ${f.name} · ${(f.size / 1048576).toFixed(1)} MB`;
  run(f, f.name);
});

$("#demo").addEventListener("click", async (e) => {
  e.stopPropagation();
  const btn = $("#demo");
  btn.disabled = true;
  btn.textContent = "正在取回内置论文…";
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
  $pipeline.classList.add("is-hidden");
  $filename.textContent = "";
  $file.value = "";
  $drop.scrollIntoView({ behavior: "smooth", block: "center" });
});

/* ---------- 展览库 ---------- */
function renderGallery() {
  $gallery.textContent = "";
  $gallery.append(el("article", { class: "gcard" },
    el("div", { class: "gcard__tag", text: "CURATED · 人工策展示范展" }),
    el("div", { class: "gcard__t", text: "Learning Fine-Grained Bimanual Manipulation with Low-Cost Hardware" }),
    el("div", { class: "gcard__m", text: "ALOHA / ACT · 8 间展厅 · 81 条逐字核对的引文 · 5 台互动装置 · 11 幅论文原图" }),
    el("div", { class: "gcard__a" }, el("a", { class: "btn btn--sm", href: "index.html", text: "进入展馆 →" }))));

  for (const x of listExhibitions()) {
    const date = new Date(x.created).toLocaleDateString("zh-CN");
    $gallery.append(el("article", { class: "gcard" },
      el("div", { class: "gcard__tag", text: "AUTO · 本地自动布展" }),
      el("div", { class: "gcard__t", text: x.title }),
      el("div", { class: "gcard__m", text: `${x.source} · ${x.pages} 页 · ${x.evidenceCount} 条展签 · ${date}` }),
      el("div", { class: "gcard__a" },
        el("a", { class: "btn btn--sm", href: "index.html?e=" + encodeURIComponent(x.id), text: "进入展馆 →" }),
        el("button", {
          class: "btn btn--ghost btn--sm", text: "移除",
          onclick: async () => { await deleteExhibition(x.id); renderGallery(); },
        }))));
  }
}
renderGallery();
