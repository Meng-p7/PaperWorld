/* PaperWorld · 科研故事层
 * 把论文讲成普通人愿意看完的故事：四幕主线（难题/解法/结果/价值与局限）+ 每幕可展开深入阅读。
 * 通俗与技术是策展语（界面标注非原文）；结论由原文承担，可点开回到 PDF 原页高亮。
 */
import { el, $, $$, initTheme, initTopbar, initReveal, initMobileNav } from "../core/ui.js";
import { initDrawer, evChip, openEvidence, openPage } from "../core/drawer.js";
import { loadExhibition } from "../core/store.js";
import { mountInteractive } from "../interactives.js";
import { mountGeneric } from "./generic.js";
import { ALOHA_STORY, buildLocalStory, normalizeActs } from "./stories/aloha.js";

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

function resolveStory(bp) {
  if (bp.story && Array.isArray(bp.story.acts) && bp.story.acts.length) return { ...bp.story, acts: normalizeActs(bp.story.acts), source: "blueprint" };
  if (bp.meta?.id === "aloha-act-2023") return { ...ALOHA_STORY, source: "curated" };
  return buildLocalStory(bp);
}

/* ---------------- 单幕：主线短故事 + 可展开深入阅读 ---------------- */
function actNode(act, i) {
  const sec = el("section", { class: "act reveal", id: "act-" + act.id });
  const rail = el("div", { class: "act__rail" },
    el("span", { class: "act__n", text: act.n || `ACT 0${i + 1}` }),
    el("i", { class: "act__line" }));
  const body = el("div", { class: "act__body" });

  body.append(el("div", { class: "act__tag", text: act.tagline || act.title }));
  body.append(el("h2", { class: "act__title", text: act.title }));

  const figs = act.figures || (act.figure ? [act.figure] : []);
  for (const f of figs) {
    if (!f?.src) continue;
    body.append(el("figure", { class: "act__fig" },
      el("div", { class: "act__img" },
        el("img", { src: f.src, alt: f.caption || "", loading: i ? "lazy" : "eager" }),
        f.page ? el("button", { class: "plate__badge", text: `原文 P.${f.page}`, onclick: () => openPage(f.page) }) : null),
      f.caption ? el("figcaption", { class: "plate__cap" }, el("span", { class: "fig", text: "FIG." }), f.caption) : null));
  }

  // 主线：简短通俗故事
  if (act.plain) body.append(el("p", { class: "act__plain-x", text: act.plain }));

  // 主线：一个最有价值的数字
  if (act.stat?.value) {
    const st = el("div", { class: "act__stat" },
      el("div", { class: "act__stat-v", text: act.stat.value }),
      el("div", { class: "act__stat-l", text: act.stat.label || "" }));
    if (act.stat.ev) st.append(" ", evChip(act.stat.ev));
    body.append(st);
  }
  // 主线：少量原文证据 chips
  const mainQuotes = (act.quotes || []).slice(0, 2);
  if (mainQuotes.length) {
    const chips = el("div", { class: "act__chips" }, el("span", { class: "act__chips-l", text: "原文依据" }));
    for (const id of mainQuotes) chips.append(evChip(id));
    body.append(chips);
  }

  // 深入阅读层：技术细节 / 完整数据 / 全部原文证据 / 互动装置
  const deep = el("details", { class: "act__deep" });
  deep.append(el("summary", { text: "深入阅读 · 技术细节 / 完整数据 / 原文证据" }));
  const deepBody = el("div", { class: "act__deep-body" });
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
    el("a", { href: "hall.html" + suffix, style: "color:var(--gold)", text: "进入完整展馆 →" })));
  deep.append(deepBody);
  body.append(deep);

  sec.append(rail, body);
  return sec;
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
  const title = BP.meta?.title || facade?.title || BP.halls?.[0]?.title || "未命名论文";
  $("#story-title").textContent = title;
  $("#story-sub").textContent = STORY.acts[0]?.tagline || "一篇论文，四幕故事 · 约 2–3 分钟";
  $("#story-meta").innerHTML =
    `<b>${STORY.acts.length}</b> 幕故事 · 约 <b>2–3</b> 分钟 · <b>${quoteCount}</b> 条原文引用 · <b>${evCount}</b> 条证据 · ` +
    (BP.meta?.pages ? `<b>${BP.meta.pages}</b> 页原文` : "");
  if (STORY.meta?.note) $("#story-note").textContent = STORY.meta.note;

  const nav = $("#act-nav");
  STORY.acts.forEach((a, i) => {
    nav.append(el("a", { href: "#act-" + a.id, text: `${a.n || "0" + (i + 1)} ${a.title}` }));
  });

  const main = $("#story");
  STORY.acts.forEach((a, i) => main.append(actNode(a, i)));

  $("#enter-hall").href = "hall.html" + suffix;
  $("#enter-station").href = "station.html" + suffix;
  $("#enter-parse").href = "parse.html";

  initTheme();
  initTopbar();
  initReveal();
  initMobileNav();
}
boot();
