/* PaperWorld · 展览渲染引擎
 * 同一套渲染器同时服务「策展过的示范展」与「用户上传后自动生成的展」。
 * 区别只在 blueprint 数据；渲染逻辑不写死任何一篇论文。
 */
import { el, $, $$, initTheme, initTopbar, initReveal, initMobileNav } from "../core/ui.js";
import { initDrawer, openEvidence, openPage, evChip, withEv } from "../core/drawer.js";
import { mountInteractive } from "../interactives.js";
import { mountGeneric } from "./generic.js";
import { loadExhibition } from "../core/store.js";

let BP = null;
let REFS = [];

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

/* ---------------- 序厅 ---------------- */
function renderFacade(h) {
  const sec = el("section", { class: "facade page", id: h.id });
  sec.append(
    el("div", { class: "tag reveal", text: h.kicker }),
    el("h1", { class: "facade__title reveal", text: h.title }),
    el("div", { class: "facade__zh reveal", text: h.titleZh }));

  const au = el("div", { class: "authors reveal" });
  for (const a of h.authors || []) au.append(el("span", { class: "au" }, el("b", { text: a.name }), el("span", { text: a.aff })));
  sec.append(au);
  sec.append(el("div", { class: "venue reveal" },
    el("span", { text: h.venue }), el("span", { class: "dot" }), el("span", { text: h.domain })));

  // 入口陈列窗：示范展用论文主图；自动展把首页 PDF 渲染成一个标本窗
  const fromPlate = h.figure && {
    src: h.figure.src,
    label: "SPECIMEN 00 · 论文首页（本地渲染）",
    meta: `PAGE 1 / ${BP.meta.pages || "?"} · ${BP.meta.paperLabel || BP.meta.sourceName || "原 PDF"}`,
  };
  const hero = BP.meta.hero || fromPlate;
  if (hero) {
    sec.append(el("div", { class: "stage reveal" + (!BP.meta.hero ? " stage--paper" : "") },
      el("img", { src: hero.src, alt: hero.label, loading: "eager" }),
      el("div", { class: "stage__scrim" }),
      el("div", { class: "stage__corner stage__corner--tl" }),
      el("div", { class: "stage__corner stage__corner--br" }),
      el("div", { class: "stage__top" },
        el("span", { class: "stage__label", text: hero.label }),
        el("span", { class: "stage__meta", text: hero.meta })),
      el("div", { class: "stage__cta" },
        el("a", { class: "btn", href: "#question", text: "开始参观 ↓" }),
        el("a", { class: "btn btn--ghost", href: "parse.html", text: "上传我的论文" })),
      el("div", { class: "stage__scroll" }, el("span", { text: "SCROLL TO EXPLORE" }), el("i"))));
  }

  sec.append(el("div", { class: "curator reveal" }, el("b", { text: "策展人语 · " }), h.curator));

  const stats = el("div", { class: "stats reveal" });
  for (const s of h.stats || []) {
    const value = s.dynamic === "evidence" ? String(Object.keys(BP.evidence).length) : s.value;
    stats.append(withEv(el("div", { class: "stat" },
      el("div", { class: "stat__v", text: value }),
      el("div", { class: "stat__l", text: s.label }),
      el("div", { class: "stat__s", text: s.sub })), s.ev));
  }
  sec.append(stats);
  if (h.figure && !hero) sec.append(blocks.figure(h.figure));
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

/* ---------------- 导览轨 + 进度 ---------------- */
function buildRail() {
  const rail = $("#rail");
  for (const h of BP.halls) rail.append(el("a", { href: `#${h.id}`, dataset: { hall: h.id }, title: h.title },
    el("i"), el("span", { text: h.num || "00" })));
  const links = $$("#rail a");
  const io = new IntersectionObserver((es) => {
    for (const e of es) if (e.isIntersecting)
      links.forEach((a) => a.classList.toggle("is-on", a.dataset.hall === e.target.id));
  }, { rootMargin: "-45% 0px -45% 0px" });
  BP.halls.forEach((h) => { const n = document.getElementById(h.id); if (n) io.observe(n); });
}
function buildProgress() {
  const bar = $("#progress");
  const onScroll = () => {
    const max = document.body.scrollHeight - innerHeight;
    bar.style.width = `${max > 0 ? (scrollY / max) * 100 : 0}%`;
  };
  onScroll();
  addEventListener("scroll", onScroll, { passive: true });
}

/* ---------------- 2.0 全息展区导航 + 空间转场 ---------------- */
function initHoloNav() {
  const holder = $("#holo-links");
  if (!holder) return;
  const eid = new URLSearchParams(location.search).get("e");
  const suffix = eid ? "?e=" + encodeURIComponent(eid) : "";
  $("#holo-back").href = "station.html" + suffix;

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const flash = $("#hall-warp");
  const links = [];

  function warpTo(hid) {
    const target = document.getElementById(hid);
    if (!target) return;
    if (flash && !reduced) {
      flash.classList.add("is-on");
      setTimeout(() => flash.classList.remove("is-on"), 230);
    }
    document.documentElement.style.scrollBehavior = "auto";
    target.scrollIntoView({ behavior: "instant", block: "start" });
    scrollBy(0, -128); // 让开固定顶栏 + 全息导航条
    setTimeout(() => { document.documentElement.style.scrollBehavior = ""; }, 80);
    links.forEach((a) => a.classList.toggle("is-on", a.dataset.hall === hid));
  }

  for (const h of BP.halls) {
    const a = el("a", {
      href: "#" + h.id, dataset: { hall: h.id },
      text: `${h.num || "00"} ${(h.title || "").slice(0, 12)}`,
      onclick: (e) => { e.preventDefault(); warpTo(h.id); },
    });
    holder.append(a);
    links.push(a);
  }

  // 从空间站带 #展区 进入：内容渲染完成后再定位
  if (location.hash) {
    const hid = decodeURIComponent(location.hash.slice(1));
    setTimeout(() => warpTo(hid), 160);
  } else {
    const io = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting)
        links.forEach((a) => a.classList.toggle("is-on", a.dataset.hall === e.target.id));
    }, { rootMargin: "-45% 0px -45% 0px" });
    BP.halls.forEach((h) => { const n = document.getElementById(h.id); if (n) io.observe(n); });
  }
}

/* ---------------- 启动 ---------------- */
async function boot() {
  const result = await resolveBlueprint();
  if (result.error) {
    $("#halls").append(el("section", { class: "facade page" },
      el("div", { class: "tag", text: "展览未找到" }),
      el("h1", { class: "h1", text: "这台设备上没有这场展览" }),
      el("p", { class: "lead", text: result.error }),
      el("a", { class: "btn", href: "parse.html", text: "去上传一篇论文" })));
    initTheme(); initTopbar();
    return;
  }
  BP = result.blueprint;
  initDrawer({
    evidence: BP.evidence || {},
    pdf: BP.meta.pdf,
    paperLabel: BP.meta.paperLabel || BP.meta.sourceName || "原 PDF",
    pages: BP.meta.pages || 18,
  });
  document.title = `PaperWorld · ${BP.meta.title || BP.halls[0].title}`.slice(0, 110);

  if (BP.meta.mode === "extractive") {
    const badge = el("span", { class: "auto-badge", text: BP.meta.curationLabel || "AUTO · 自动布展" });
    $(".brand")?.append(badge);
  }

  if (Array.isArray(BP.meta.refsInline) && BP.meta.refsInline.length) REFS = BP.meta.refsInline;
  else if (BP.meta.refs) {
    try { REFS = await (await fetch(BP.meta.refs)).json(); } catch { REFS = []; }
  }

  const main = $("#halls");
  for (const h of BP.halls) main.append(h.kind === "facade" ? renderFacade(h) : renderHall(h));

  // 馆末说明：自动生成展用 meta.colophon，示范展保留原文
  const col = $(".footer .colophon-text");
  if (col && BP.meta.colophon) col.textContent = BP.meta.colophon;
  const stamp = $(".footer .colophon-stamp");
  if (stamp) stamp.innerHTML = `PAPERWORLD · ${BP.meta.mode === "extractive" ? "AUTO EXHIBITION" : "EXHIBITION 00"}<br>${BP.meta.paperLabel || BP.meta.sourceName || "原 PDF"} · ${Object.keys(BP.evidence).length} EVIDENCE · ${BP.halls.length} HALLS`;

  buildRail();
  buildProgress();
  initTheme();
  initTopbar();
  initReveal();
  initMobileNav();
  initHoloNav();
}

boot();
