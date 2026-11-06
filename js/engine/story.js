/* PaperWorld · 科研故事层
 * 把论文讲成普通人愿意看完的故事：五幕 + 三层内容（通俗 / 技术 / 原文）。
 * 通俗与技术是策展语（界面标注非原文）；结论由原文承担，可点开回到 PDF 原页高亮。
 */
import { el, $, $$, initTheme, initTopbar, initReveal, initMobileNav } from "../core/ui.js";
import { initDrawer, evChip, openEvidence, openPage } from "../core/drawer.js";
import { loadExhibition } from "../core/store.js";
import { mountInteractive } from "../interactives.js";
import { mountGeneric } from "./generic.js";
import { ALOHA_STORY, buildLocalStory } from "./stories/aloha.js";

const qs = new URLSearchParams(location.search);
const exhibitId = qs.get("e");
const suffix = exhibitId ? "?e=" + encodeURIComponent(exhibitId) : "";
const ALONE = ["chunking", "results", "ablation", "users", "costs"];

let BP = null;
let STORY = null;
let layer = qs.get("layer") === "tech" || qs.get("layer") === "evidence" ? qs.get("layer") : "story";

async function resolveBlueprint() {
  if (exhibitId) {
    const saved = await loadExhibition(exhibitId);
    return saved?.blueprint || null;
  }
  try { return await (await fetch("assets/data/aloha.json")).json(); }
  catch { return null; }
}

function resolveStory(bp) {
  if (bp.story && Array.isArray(bp.story.acts) && bp.story.acts.length) return { ...bp.story, source: "blueprint" };
  if (bp.meta?.id === "aloha-act-2023") return { ...ALOHA_STORY, source: "curated" };
  return buildLocalStory(bp);
}

/* ---------------- 单幕 ---------------- */
function actNode(act, i) {
  const sec = el("section", { class: "act reveal", id: "act-" + act.id });
  const rail = el("div", { class: "act__rail" },
    el("span", { class: "act__n", text: act.n || `ACT 0${i + 1}` }),
    el("i", { class: "act__line" }));
  const body = el("div", { class: "act__body" });

  body.append(el("div", { class: "act__tag", text: act.tagline || act.title }));
  body.append(el("h2", { class: "act__title", text: act.title }));

  if (act.figure?.src) {
    body.append(el("figure", { class: "act__fig" },
      el("div", { class: "act__img" },
        el("img", { src: act.figure.src, alt: act.figure.caption || "", loading: i ? "lazy" : "eager" }),
        act.figure.page ? el("button", { class: "plate__badge", text: `原文 P.${act.figure.page}`, onclick: () => openPage(act.figure.page) }) : null),
      act.figure.caption ? el("figcaption", { class: "plate__cap" }, el("span", { class: "fig", text: "FIG." }), act.figure.caption) : null));
  }

  // 通俗解读
  if (act.plain) {
    body.append(el("div", { class: "act__plain" },
      el("span", { class: "editorial__tag", text: "通俗解读 · 非原文" }),
      el("p", { class: "act__plain-x", text: act.plain })));
  }
  // 技术细节
  if (act.tech) {
    body.append(el("div", { class: "act__tech" },
      el("span", { class: "editorial__tag", text: "技术细节 · 非原文" }),
      el("p", { class: "act__tech-x", text: act.tech })));
  }
  // 关键数字（只用论文里出现过的）
  if (act.stat?.value) {
    const st = el("div", { class: "act__stat" },
      el("div", { class: "act__stat-v", text: act.stat.value }),
      el("div", { class: "act__stat-l", text: act.stat.label || "" }));
    if (act.stat.ev) st.append(" ", evChip(act.stat.ev));
    body.append(st);
  }
  // 原文证据层
  const evBox = el("div", { class: "act__ev" });
  const quotes = (act.quotes || []).map((id) => BP.evidence?.[id]).filter(Boolean);
  if (quotes.length) {
    evBox.append(el("div", { class: "act__ev-h", text: `这一幕的原文依据 · ${quotes.length} 条` }));
    for (const [k, e] of quotes.entries()) {
      evBox.append(el("div", { class: "act__ev-item" },
        el("div", { class: "act__ev-q", text: e.quote }),
        el("div", { class: "act__ev-f" },
          el("span", { class: "mono micro dimmer", text: `${e.section || "—"} · P.${e.page}` }),
          el("button", {
            class: "ev", text: `P.${e.page}`,
            onclick: () => openEvidence(act.quotes[k]),
          }))));
    }
  } else {
    evBox.append(el("p", { class: "small dimmer", text: "本幕暂无可引用的原文语句。" }));
  }
  body.append(evBox);

  // 证据 chips（故事层常驻）
  if (act.quotes?.length) {
    const chips = el("div", { class: "act__chips" }, el("span", { class: "act__chips-l", text: "溯源" }));
    for (const id of act.quotes) chips.append(evChip(id));
    body.append(chips);
  }
  // 互动装置
  if (act.interact) {
    const shell = el("div", { class: "block ix act__ix" },
      el("div", { class: "ix__bar" },
        el("div", { class: "ix__t", text: ALONE.includes(act.interact) ? "互动装置 · 上手试一下" : "互动装置 · 从原文抽一条" }),
        el("div", { class: "ix__hint", text: "可交互 · INTERACTIVE" })),
      el("div", { class: "ix__body" }));
    body.append(shell);
    const inner = shell.querySelector(".ix__body");
    requestAnimationFrame(() => {
      if (ALONE.includes(act.interact)) mountInteractive(act.interact, inner, openEvidence);
      else mountGeneric(act.interact, inner, { BP, openEvidence, openPage });
    });
  }

  sec.append(rail, body);
  return sec;
}

/* ---------------- 三层切换 ---------------- */
function setLayer(next) {
  layer = next;
  const root = $("#story");
  root.dataset.layer = layer;
  $$(".layertab").forEach((b) => b.classList.toggle("is-on", b.dataset.layer === layer));
  const map = {
    story: "只看通俗故事",
    tech: "展开技术细节与互动装置",
    evidence: "逐条原文与页码证据",
  };
  $("#layer-note").textContent = map[layer] || "";
  const u = new URL(location.href);
  u.searchParams.set("layer", layer);
  history.replaceState(null, "", u);
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
  $("#story-sub").textContent = STORY.acts[0]?.tagline || "一篇论文，五幕故事";
  $("#story-meta").innerHTML =
    `<b>${STORY.acts.length}</b> 幕故事 · <b>${quoteCount}</b> 条原文引用 · <b>${evCount}</b> 条证据 · ` +
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

  $$(".layertab").forEach((b) => b.addEventListener("click", () => setLayer(b.dataset.layer)));
  setLayer(layer);

  initTheme();
  initTopbar();
  initReveal();
  initMobileNav();
}
boot();
