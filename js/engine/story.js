/* PaperWorld · 科研故事层
 * 把论文讲成普通人愿意看完的故事：四幕主线（难题/解法/结果/价值与局限）+ 每幕可展开深入阅读。
 * 通俗与技术是策展语（界面标注非原文）；结论由原文承担，可点开回到 PDF 原页高亮。
 */
import { el, $, initTheme, initTopbar, initReveal, initMobileNav } from "../core/ui.js";
import { initDrawer, evChip, openEvidence, openPage } from "../core/drawer.js";
import { loadExhibition } from "../core/store.js";
import { mountInteractive } from "../interactives.js";
import { mountGeneric } from "./generic.js";
import { resolveStory } from "./stories/aloha.js";

const qs = new URLSearchParams(location.search);
const exhibitId = qs.get("e");
const suffix = exhibitId ? "?e=" + encodeURIComponent(exhibitId) : "";
const ALONE = ["chunking", "results", "ablation", "users", "costs"];

let BP = null;
let STORY = null;

async function resolveBlueprint() {
  if (exhibitId) {
    const saved = await loadExhibition(exhibitId);
    return saved?.blueprint || null;
  }
  try { return await (await fetch("assets/data/aloha.json")).json(); }
  catch { return null; }
}

/* ---------------- 单幕：主线短故事 + 可展开深入阅读 ---------------- */
function actNode(act, i) {
  const sec = el("section", { class: "act reveal", id: "act-" + act.id });
  const rail = el("div", { class: "act__rail" },
    el("span", { class: "act__n", text: String(i + 1).padStart(2, "0") }),
    el("i", { class: "act__line" }));
  const body = el("div", { class: "act__body" });

  body.append(el("div", { class: "act__tag", text: act.tagline || act.title }));
  body.append(el("h2", { class: "act__title", text: act.title }));

  const figs = act.figures || (act.figure ? [act.figure] : []);
  const figureNode = (f, lazy = true) => el("figure", { class: "act__fig" },
    el("div", { class: "act__img" },
      el("img", { src: f.src, alt: f.caption || "", loading: lazy ? "lazy" : "eager" }),
      f.page ? el("button", { class: "plate__badge", text: `原文第 ${f.page} 页`, onclick: () => openPage(f.page) }) : null),
    f.caption ? el("figcaption", { class: "plate__cap" }, f.caption) : null);
  // 主线每幕最多一张核心图；其余图版收进深入阅读，避免主线变成长图报告。
  if (figs[0]?.src) body.append(figureNode(figs[0], i > 0));

  // 主线：简短通俗故事。明确标注这是策展/模型写的导读，不是论文原文。
  if (act.plain) {
    const ai = STORY?.meta?.source === "ai-core";
    body.append(el("div", { class: "act__plain-tag", text: ai ? "AI 导读 · 非原文" : "导读 · 非原文" }));
    body.append(el("p", { class: "act__plain-x", text: act.plain }));
  }

  // 主线：一个最有价值的数字
  if (act.stat?.value) {
    const st = el("div", { class: "act__stat" },
      el("div", { class: "act__stat-v", text: act.stat.value }),
      el("div", { class: "act__stat-l", text: act.stat.label || "" }));
    if (act.stat.ev) st.append(" ", evChip(act.stat.ev));
    body.append(st);
  }
  // 主线：少量原文证据 chips
  // 主线只放最多两条证据；同一页的多条引文合并显示，避免出现重复的 P.3 / P.3。
  const seenPage = new Set();
  const mainQuotes = (act.quotes || []).filter((id) => {
    const page = BP.evidence?.[id]?.page;
    if (!page || seenPage.has(page)) return false;
    seenPage.add(page);
    return true;
  }).slice(0, 2);
  if (mainQuotes.length) {
    const chips = el("div", { class: "act__chips" }, el("span", { class: "act__chips-l", text: "原文依据" }));
    for (const id of mainQuotes) chips.append(evChip(id));
    body.append(chips);
  }

  // 深入阅读层：技术细节 / 完整数据 / 全部原文证据 / 互动装置
  const deep = el("details", { class: "act__deep" });
  deep.append(el("summary", { text: "深入阅读 · 技术细节 / 完整数据 / 原文证据" }));
  const deepBody = el("div", { class: "act__deep-body" });
  for (const f of figs.slice(1)) if (f?.src) deepBody.append(figureNode(f));
  if (act.tech) {
    deepBody.append(el("div", { class: "act__tech" },
      el("span", { class: "editorial__tag", text: "技术细节 · 非原文" }),
      el("p", { class: "act__tech-x", text: act.tech })));
  }
  const quotes = (act.quotes || []).map((id) => BP.evidence?.[id]).filter(Boolean);
  if (quotes.length) {
    const evBox = el("div", { class: "act__ev" });
    evBox.append(el("div", { class: "act__ev-h", text: `本幕原文依据 · ${quotes.length} 条` }));
    for (const [k, e] of quotes.entries()) {
      evBox.append(el("div", { class: "act__ev-item" },
        el("div", { class: "act__ev-q", text: e.quote }),
        el("div", { class: "act__ev-f" },
          el("span", { class: "mono micro dimmer", text: `${e.section || "—"} · P.${e.page}` }),
          el("button", { class: "ev", text: `P.${e.page}`, onclick: () => openEvidence(act.quotes[k]) }))));
    }
    deepBody.append(evBox);
  }
  if (act.interact) {
    const shell = el("div", { class: "block ix act__ix" },
      el("div", { class: "ix__bar" },
        el("div", { class: "ix__t", text: "互动装置 · 上手试一下" }),
        el("div", { class: "ix__hint", text: "可交互 · INTERACTIVE" })),
      el("div", { class: "ix__body" }));
    deepBody.append(shell);
    const inner = shell.querySelector(".ix__body");
    deep.addEventListener("toggle", () => {
      if (deep.open && !inner.dataset.mounted) {
        inner.dataset.mounted = "1";
        if (ALONE.includes(act.interact)) mountInteractive(act.interact, inner, openEvidence);
        else mountGeneric(act.interact, inner, { BP, openEvidence, openPage });
      }
    });
  }
  deepBody.append(el("p", { class: "small dimmer" },
    "想看完整展厅、全部实验表格与超参数？",
    el("a", { href: "hall.html" + suffix, style: "color:var(--gold)", text: "查看完整资料 →" })));
  deep.append(deepBody);
  body.append(deep);

  sec.append(rail, body);
  return sec;
}

/* ---------------- 参考文献：统一放在四幕之后，默认折叠 ---------------- */
async function renderReferences() {
  const box = $("#story-refs");
  if (!box) return;
  let refs = Array.isArray(BP.meta?.refsInline) ? BP.meta.refsInline : [];
  if (!refs.length && BP.meta?.refs) {
    try { refs = await (await fetch(BP.meta.refs, { cache: "no-cache" })).json(); } catch { refs = []; }
  }
  const details = el("details", { class: "story-references" });
  details.append(el("summary", { text: `参考文献与原文档案${refs.length ? ` · ${refs.length} 条` : ""}` }));
  const body = el("div", { class: "story-references__body" });
  if (!refs.length) {
    body.append(el("p", { text: "未在文本层检出结构化参考文献。可在完整资料中逐页查看原文。" }));
  } else {
    const list = el("ol", { class: "story-references__list" });
    for (const r of refs) {
      const raw = typeof r === "string" ? r : (r.raw || "");
      if (raw) list.append(el("li", { text: raw }));
    }
    body.append(list);
  }
  body.append(el("a", { class: "text-link", href: "hall.html" + suffix, text: "打开完整资料与原文页图 →" }));
  details.append(body);
  box.append(details);
}

/* ---------------- 启动 ---------------- */
async function boot() {
  const bp = await resolveBlueprint();
  if (!bp) {
    $("#story").append(el("div", { class: "act" },
      el("h2", { class: "act__title", text: "这台设备上没有这场展览" }),
      el("p", { class: "lead", text: "可能是换了浏览器或清过站点数据。" }),
      el("a", { class: "btn", href: "parse.html", text: "去上传一篇论文" })));
    initTheme(); initTopbar(); initMobileNav();
    return;
  }
  BP = bp;
  STORY = resolveStory(bp);

  initDrawer({
    evidence: BP.evidence || {},
    pdf: BP.meta?.pdf,
    paperLabel: BP.meta?.paperLabel || BP.meta?.sourceName || "原 PDF",
    pages: BP.meta?.pages || 18,
  });

  const evCount = Object.keys(BP.evidence || {}).length;
  const quoteCount = STORY.acts.reduce((n, a) => n + (a.quotes || []).length, 0);
  document.title = `科研故事 · ${BP.meta?.title || "PaperWorld"}`.slice(0, 110);

  const facade = (BP.halls || []).find((h) => h.kind === "facade");
  const paperTitle = BP.meta?.title || facade?.title || BP.halls?.[0]?.title || "未命名论文";
  $("#story-title").textContent = STORY.meta?.titleZh || paperTitle;
  $("#story-sub").textContent = STORY.meta?.titleZh
    ? paperTitle
    : (STORY.acts[0]?.tagline || "一篇论文，四幕故事");
  $("#story-meta").innerHTML =
    `四幕 · 约 <b>2</b> 分钟 · <b>${quoteCount}</b> 条原文引用` +
    (evCount ? ` · <b>${evCount}</b> 条可核验证据` : "");
  $("#story-note").textContent = STORY.meta?.note || "通俗讲解与技术细节均为非原文；结论由可回到原页的原文承担。";

  const nav = $("#act-nav");
  STORY.acts.forEach((a, i) => {
    nav.append(el("a", { href: "#act-" + a.id, text: a.title || `第 ${i + 1} 幕` }));
  });

  const main = $("#story");
  STORY.acts.forEach((a, i) => main.append(actNode(a, i)));
  await renderReferences();

  $("#enter-station").href = "station.html" + suffix;
  $("#enter-parse").href = "parse.html";
  $("#foot-hall").href = "hall.html" + suffix;

  initTheme();
  initTopbar();
  initReveal();
  initMobileNav();

  // 从空间站的四幕舱门进入时，内容还没生成完就不能靠浏览器原生锚点定位。
  if (location.hash) {
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) requestAnimationFrame(() => target.scrollIntoView({ behavior: "instant", block: "start" }));
  }
}
boot();
