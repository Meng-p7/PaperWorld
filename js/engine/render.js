/* PaperWorld · 展览渲染引擎
 * 同一套渲染器同时服务「策展过的示范展」与「用户上传后自动生成的展」。
 * 区别只在 blueprint 数据；渲染逻辑不写死任何一篇论文。
 */
import { el, $, initTopbar, initReveal, initMobileNav } from "../core/ui.js";
import { initDrawer, openEvidence, openPage, withEv } from "../core/drawer.js";
import { mountInteractive } from "../interactives.js";
import { mountGeneric } from "./generic.js";
import { loadExhibition } from "../core/store.js";

let BP = null;
let REFS = [];

/* 完整资料只做一件事：保住原有内容，但把原来的七个编号展区归到四幕主题下。
 * 默认阅读主线是 story.html；hall.html 是主动进入的档案。 */
const ARCHIVE_GROUPS = [
  { id: "problem", title: "第一幕 · 为什么研究", desc: "研究背景、核心问题与问题的难点。" },
  { id: "solution", title: "第二幕 · 怎么做", desc: "硬件系统与技术路线合并阅读。" },
  { id: "results", title: "第三幕 · 效果如何", desc: "实验结果与消融分析放在同一主题下。" },
  { id: "impact", title: "第四幕 · 价值与局限", desc: "研究意义、边界与仍做不到的事。" },
  { id: "refs", title: "参考文献与其他资料", desc: "原文页图、引用来源与档案入口。" },
];
const HALL_GROUP = {
  question: "problem", background: "problem",
  specimen: "solution", method: "solution", innovation: "solution", plates: "solution",
  bench: "results", ablation: "results", experiment: "results", result: "results",
  horizon: "impact", limitation: "impact",
  archive: "refs",
};
function groupOfHall(h) {
  if (HALL_GROUP[h.id]) return HALL_GROUP[h.id];
  const raw = String(h.id || "").replace(/^dim-/, "");
  return HALL_GROUP[raw] || (h.kind === "archive" ? "refs" : "refs");
}
function groupedHalls() {
  const map = new Map(ARCHIVE_GROUPS.map((g) => [g.id, []]));
  for (const h of BP.halls || []) {
    if (h.kind === "facade") continue;
    map.get(groupOfHall(h)).push(h);
  }
  return map;
}

/* ---------------- 载入展览 ---------------- */
async function resolveBlueprint() {
  const id = new URLSearchParams(location.search).get("e");
  if (id) {
    const saved = await loadExhibition(id);
    if (!saved) return { error: "这个展览不在本机展览库里（可能是在另一台设备或清过浏览器数据）。" };
    return saved;
  }
  if (!window.PAPERWORLD) {
    try { window.PAPERWORLD = await (await fetch("assets/data/aloha.json")).json(); }
    catch { return { error: "展览数据未加载。" }; }
  }
  enhanceBuiltin(window.PAPERWORLD);
  return { blueprint: window.PAPERWORLD };
}

/* 示范展的视觉加料：不改动已校验的正文与证据，只补陈列方式 */
function enhanceBuiltin(bp) {
  if (bp.__enhanced) return;
  bp.__enhanced = true;
  bp.meta.pages = 18;
  bp.meta.paperLabel = "arXiv:2304.13705v1";
  bp.meta.mode = "curated";
  bp.meta.colophon = bp.meta.colophon || null;
  bp.meta.hero = {
    src: "assets/figures/fig1-teaser.png",
    label: "SPECIMEN 00 · ALOHA 双臂遥操作现场",
    meta: "FIG.1 / P.1 · 低成本硬件上的精细操作",
  };
  for (const h of bp.halls) {
    if (h.kind === "facade") h.figure = null; // 图已放到入口陈列窗，避免重复
    if (h.id === "specimen") {
      h.blocks.splice(2, 0, {
        t: "mosaic", src: "assets/figures/fig9-teleop-gallery.png", page: 2,
        badge: "16 TASKS", caption: "论文附录中的遥操作技能墙：翻书页、开自封袋、分杯子、插内存条、撕茶包……这套两万美元的装置能演示的精细动作谱系。",
      });
    }
    if (h.id === "method") {
      h.blocks.splice(2, 0, {
        t: "scrollplate", src: "assets/figures/fig11-detail-arch.png", page: 5,
        title: "ACT 架构全图 · 可滚动展开",
        caption: "论文 Fig.11：Transformer 编码器 / 解码器与 action chunking 的完整结构。向下滚动查看下半部分。",
      });
    }
  }
}

/* ---------------- 块渲染 ---------------- */
const blocks = {
  lead: (b) => el("p", { class: "block lead reveal", text: b.text }),
  para: (b) => withEv(el("p", { class: "block para reveal", text: b.text }), b.ev),
  note: (b) => withEv(el("p", { class: "block note reveal", text: b.text }), b.ev),
  quote: (b) => withEv(
    el("blockquote", { class: "block quote reveal" },
      el("span", { text: b.text }),
      b.by ? el("span", { class: "by", text: b.by }) : null), b.ev),
  callout: (b) => withEv(
    el("div", { class: `block callout reveal callout--${b.tone || "gold"}` },
      el("div", { class: "callout__t", text: b.title }),
      el("div", { class: "callout__x", text: b.text })), b.ev),
  steps: (b) => {
    const wrap = el("div", { class: "block steps reveal" });
    b.items.forEach((s, i) => wrap.append(el("div", { class: "step" },
      el("div", { class: "step__n", text: `STEP ${i + 1}` }),
      el("div", { class: "step__name", text: s.name }),
      el("div", { class: "step__desc", text: s.desc }))));
    if (b.foot) wrap.append(el("div", { class: "steps__foot" }, b.foot, b.ev ? withEv(el("span"), b.ev) : null));
    return wrap;
  },
  figure: (b) => el("figure", { class: "block plate reveal" },
    el("div", { class: "plate__img" },
      el("img", { src: b.src, alt: b.caption, loading: "lazy" }),
      el("button", { class: "plate__badge", text: `原文 P.${b.page}`, onclick: () => openPage(b.page) })),
    el("figcaption", { class: "plate__cap" }, el("span", { class: "fig", text: "FIG." }), b.caption)),
  mosaic: (b) => el("figure", { class: "block mosaic reveal" },
    el("div", { class: "mosaic__img" },
      el("img", { src: b.src, alt: b.caption, loading: "lazy" }),
      el("div", { class: "mosaic__scan" }),
      el("div", { class: "mosaic__badge", text: b.badge || "SPECIMEN WALL" }),
      el("button", { class: "plate__badge", text: `原文 P.${b.page}`, onclick: () => openPage(b.page) })),
    el("figcaption", { class: "plate__cap" }, el("span", { class: "fig", text: "WALL." }), b.caption)),
  scrollplate: (b) => el("figure", { class: "block scrollplate reveal" },
    el("div", { class: "scrollplate__bar" },
      el("span", { class: "tag", text: b.title }),
      el("span", { class: "mono micro dimmer", text: "↓ 向下滚动查看全图" })),
    el("div", { class: "scrollplate__body" }, el("img", { src: b.src, alt: b.caption, loading: "lazy" })),
    el("figcaption", { class: "plate__cap" }, el("span", { class: "fig", text: "BLUEPRINT." }), b.caption)),
  spec: (b) => withEv(
    el("div", { class: "block spec reveal" },
      el("div", { class: "spec__t", text: b.title }),
      el("dl", { style: "margin:0" }, b.rows.map((r) =>
        el("div", { class: "spec__row" }, el("dt", { text: r.k }), el("dd", { text: r.v }))))), b.ev),
  principles: (b) => el("div", { class: "block principles reveal" },
    b.items.map((p) => withEv(
      el("div", { class: "principle" },
        el("div", { class: "principle__n", text: p.n }),
        el("div", { class: "principle__t", text: p.title }),
        el("div", { class: "principle__x", text: p.text })), p.ev))),
  /* 自动展览专用：原文 / 策展语严格分色 */
  verbatim: (b) => el("div", { class: "block verbatim reveal" },
    el("div", { class: "verbatim__tag", text: "原文 · VERBATIM · 逐字摘录" }),
    el("p", { class: "verbatim__x", text: b.text }),
    el("div", { class: "verbatim__foot" }, withEv(el("span", { class: "small dimmer", text: "点击页码核对原页 →" }), b.ev))),
  editorial: (b) => el("div", { class: "block editorial reveal" },
    el("span", { class: "editorial__tag", text: "策展语 · 非原文" }),
    el("p", { text: b.text })),
  /* 2.0：维度展签 / 全息展品（自动展的动态展区使用） */
  dimension: (b) => el("div", { class: "block dimension reveal" },
    el("div", { class: "dimension__n", text: b.n || "DIMENSION" }),
    el("div", { class: "dimension__body" },
      el("div", { class: "dimension__t", text: b.title }),
      el("div", { class: "dimension__x", text: b.text })),
    el("div", { class: "dimension__pages", text: b.pages || "" })),
  exhibit: (b) => el("div", { class: "block exhibit reveal" },
    el("div", { class: "exhibit__t", text: b.title || "AI 策展语 · 非原文" }),
    el("div", { class: "exhibit__x", text: b.text })),
  chapter: (b) => el("div", { class: "block chapter reveal" },
    el("div", { class: "chapter__head" },
      el("span", { class: "chapter__t", text: b.title }),
      el("button", { class: "ev", text: `P.${b.page}`, onclick: () => openPage(b.page) })),
    ...(b.blocks || []).map((x) => blockRender(x))),
  interactive: (b) => {
    const body = el("div", { class: "ix__body" });
    const shell = el("div", { class: "block ix reveal" },
      el("div", { class: "ix__bar" },
        el("div", { class: "ix__t", text: b.title }),
        el("div", { class: "ix__hint", text: "可交互 · INTERACTIVE" })), body);
    const ctx = { BP, openEvidence, openPage };
    requestAnimationFrame(() => {
      if (b.engine === "auto") mountGeneric(b.id, body, ctx);
      else mountInteractive(b.id, body, openEvidence);
    });
    return shell;
  },
  refwall: () => {
    const wrap = el("div", { class: "block refwall reveal" });
    if (!REFS.length) wrap.append(el("p", { class: "small dimmer", text: "没有可用的参考文献条目。" }));
    for (const r of REFS) {
      const raw = typeof r === "string" ? r : (r.raw || "");
      wrap.append(el("div", { class: "ref", title: raw },
        el("span", { class: "ref__y", text: (r.year || r.page ? `P.${r.page}` : "") || "—" }),
        el("span", { class: "ref__n", text: `[${r.num || ""}]` }), raw));
    }
    return wrap;
  },
};
function blockRender(b) {
  const fn = blocks[b.t];
  return fn ? fn(b) : el("p", { class: "small dimmer", text: `未知块：${b.t}` });
}

/* ---------------- 完整资料：简洁封面 ---------------- */
function renderArchiveIntro(h) {
  const sec = el("section", { class: "archive-intro page", id: "archive-intro" });
  sec.append(
    el("p", { class: "archive-intro__eyebrow", text: "完整资料 · 主动进入的档案模式" }),
    el("h1", { class: "archive-intro__title", text: h?.title || BP.meta?.title || "论文档案" }),
    el("p", { class: "archive-intro__lead", text: "这里保留论文的原始分厅、全部原文证据、互动装置与参考文献。默认阅读请回到四幕科研故事。" }));
  const authors = (h?.authors || []).map((a) => a.name).filter(Boolean);
  if (authors.length) sec.append(el("p", { class: "archive-intro__meta", text: authors.join(" · ") }));
  const ev = Object.keys(BP.evidence || {}).length;
  sec.append(el("p", { class: "archive-intro__meta", text: `${BP.meta?.pages || "—"} 页原文 · ${ev} 条可核验证据 · ${(BP.halls || []).length} 个原始分厅` }));
  sec.append(el("div", { class: "archive-intro__links" },
    el("a", { class: "text-link", href: "story.html" + (new URLSearchParams(location.search).get("e") ? "?e=" + encodeURIComponent(new URLSearchParams(location.search).get("e")) : ""), text: "← 回到四幕科研故事" })));
  return sec;
}

/* ---------------- 展厅 ---------------- */
function renderHall(h) {
  const sec = el("section", { class: "hall page", id: h.id });
  sec.append(el("div", { class: "hall__head" },
    el("div", { class: "hall__num", text: h.num }),
    el("div", {},
      el("div", { class: "tag reveal", text: h.kicker }),
      el("h2", { class: "hall__title reveal", text: h.title }))));
  for (const b of h.blocks || []) sec.append(blockRender(b));
  return sec;
}

/* ---------------- 进度 ---------------- */
function buildProgress() {
  const bar = $("#progress");
  const onScroll = () => {
    const max = document.body.scrollHeight - innerHeight;
    bar.style.width = `${max > 0 ? (scrollY / max) * 100 : 0}%`;
  };
  onScroll();
  addEventListener("scroll", onScroll, { passive: true });
}

/* ---------------- 完整资料：四主题折叠 ---------------- */
function renderArchive(groups) {
  const main = $("#halls");
  const holder = el("div", { class: "archive-groups" });
  const hash = location.hash ? decodeURIComponent(location.hash.slice(1)) : "";
  const isSection = !hash || hash === "full-archive";
  const gidFromHash = hash.replace(/^group-/, "");
  const targetGroup = isSection
    ? null
    : ARCHIVE_GROUPS.find((g) => (groups.get(g.id) || []).some((h) => h.id === hash))
      || ARCHIVE_GROUPS.find((g) => g.id === gidFromHash);

  ARCHIVE_GROUPS.forEach((g, i) => {
    const halls = groups.get(g.id) || [];
    if (!halls.length) return;
    const details = el("details", { class: "archive-group", id: "group-" + g.id });
    // 只有目标主题（或未指定锚点时的第一个主题）默认展开，其余保持折叠。
    details.open = targetGroup ? targetGroup.id === g.id : i === 0;
    details.append(el("summary", { class: "archive-group__head" },
      el("span", { class: "archive-group__n", text: String(i + 1).padStart(2, "0") }),
      el("span", { class: "archive-group__t" },
        el("span", { class: "archive-group__title", text: g.title }),
        el("span", { class: "archive-group__desc", text: g.desc })),
      el("span", { class: "archive-group__c", text: `${halls.length} 个原始分厅` })));
    const body = el("div", { class: "archive-group__body" });
    for (const h of halls) body.append(renderHall(h));
    details.append(body);
    holder.append(details);
  });
  main.append(holder);
}

/* ---------------- 全息导航 + 主题定位 ---------------- */
function initHoloNav() {
  const holder = $("#holo-links");
  if (!holder) return;
  const eid = new URLSearchParams(location.search).get("e");
  const suffix = eid ? "?e=" + encodeURIComponent(eid) : "";
  const back = $("#holo-back");
  if (back) {
    back.href = "story.html" + suffix;
    back.textContent = "← 科研故事";
  }

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const flash = $("#hall-warp");
  const links = [];

  function warpTo(gid, hallId) {
    const group = document.getElementById("group-" + gid);
    if (!group) return;
    group.open = true;
    const target = hallId ? document.getElementById(hallId) : group;
    if (flash && !reduced) {
      flash.classList.add("is-on");
      setTimeout(() => flash.classList.remove("is-on"), 230);
    }
    document.documentElement.style.scrollBehavior = "auto";
    (target || group).scrollIntoView({ behavior: "instant", block: "start" });
    scrollBy(0, -122);
    setTimeout(() => { document.documentElement.style.scrollBehavior = ""; }, 80);
    links.forEach((a) => a.classList.toggle("is-on", a.dataset.group === gid));
  }

  for (const g of ARCHIVE_GROUPS) {
    const a = el("a", {
      href: "#group-" + g.id, dataset: { group: g.id },
      text: g.title.replace(/^第.幕 · /, ""),
      onclick: (e) => { e.preventDefault(); warpTo(g.id); },
    });
    holder.append(a);
    links.push(a);
  }

  const hash = location.hash ? decodeURIComponent(location.hash.slice(1)) : "";
  if (hash && hash !== "full-archive") {
    const hall = document.getElementById(hash);
    const gid = hall ? ARCHIVE_GROUPS.find((g) => hall.closest("#group-" + g.id))?.id : hash.replace(/^group-/, "");
    setTimeout(() => { if (gid) warpTo(gid, hall && hall.id !== hash ? hash : null); }, 180);
  } else {
    links[0]?.classList.add("is-on");
  }
  addEventListener("hashchange", () => {
    const gid = location.hash.replace(/^#group-/, "");
    if (ARCHIVE_GROUPS.some((g) => g.id === gid)) warpTo(gid);
  });
}

/* ---------------- 挂载完整档案 ----------------
 * 独立页面（hall.html）与整合后的展览页（story.html）共用这一段渲染。
 * embedded=true 时只渲染档案本体，标题、主题跳转与页脚交给外层。 */
export async function mountArchive({ bp = null, embedded = false } = {}) {
  const result = bp ? { blueprint: bp } : await resolveBlueprint();
  if (result.error) {
    const host = $("#halls");
    if (!host) return;
    host.append(el("section", { class: "facade page" },
      el("div", { class: "tag", text: "展览未找到" }),
      el("h1", { class: "h1", text: "这台设备上没有这场展览" }),
      el("p", { class: "lead", text: result.error }),
      el("a", { class: "btn", href: "parse.html", text: "去上传一篇论文" })));
    initTopbar();
    return;
  }
  BP = result.blueprint;
  if (!embedded) initDrawer({
    evidence: BP.evidence || {},
    pdf: BP.meta.pdf,
    paperLabel: BP.meta.paperLabel || BP.meta.sourceName || "原 PDF",
    pages: BP.meta.pages || 18,
  });
  if (!embedded) document.title = `PaperWorld · ${BP.meta.title || BP.halls[0].title}`.slice(0, 110);

  if (BP.meta.mode === "extractive") {
    const badge = el("span", { class: "auto-badge", text: BP.meta.curationLabel || "AUTO · 自动布展" });
    $(".brand")?.append(badge);
  }

  if (Array.isArray(BP.meta.refsInline) && BP.meta.refsInline.length) REFS = BP.meta.refsInline;
  else if (BP.meta.refs) {
    try { REFS = await (await fetch(BP.meta.refs, { cache: "no-cache" })).json(); } catch { REFS = []; }
  }

  const facade = (BP.halls || []).find((h) => h.kind === "facade");
  const main = $("#halls");
  if (!main) return;
  if (!embedded) main.append(renderArchiveIntro(facade));
  renderArchive(groupedHalls());

  // 馆末说明：自动生成展用 meta.colophon，示范展保留原有版本
  const col = $(".footer .colophon-text");
  if (col) col.textContent = BP.meta.colophon
    || "完整资料保留论文的原始分厅与全部原文证据；默认阅读路径是四幕科研故事。全部引文可点页码回到论文原页核对，版权归原作者所有。";
  const stamp = $(".footer .colophon-stamp");
  if (stamp) stamp.textContent = `${Object.keys(BP.evidence).length} 条证据 · ${(BP.halls || []).length} 个原始分厅 · 完整资料`;

  if (!embedded) {
    buildProgress();
    initTopbar();
    initReveal();
    initMobileNav();
  }
  initHoloNav();
}

/* 独立档案页：保留旧入口可用；整合后的展览页由 story.js 主动调用 */
if (!document.body.classList.contains("story-page")) mountArchive();
