/* PaperWorld · 共享证据抽屉
 * 展馆阅读层（hall）与科研故事层（story）共用同一套溯源界面：
 * 点任意页码标记 → 弹出原句与页码 → 再点一次直接渲染那一页 PDF 并高亮引文。
 * 这是整个产品「不编」承诺的界面化。
 */
import { el, $ } from "./ui.js";
import { renderPage } from "./pdfview.js";

let cfg = { evidence: {}, pdf: null, paperLabel: "原 PDF", pages: 18 };
let drawer = null, drawerBody = null, drawerTitle = null, scrim = null;

export function initDrawer(options = {}) {
  cfg = { ...cfg, ...options };
  drawer = $("#drawer");
  drawerBody = $("#drawer-body");
  drawerTitle = $("#drawer-title");
  scrim = $("#scrim");
  if (!drawer || !drawerBody || !scrim) return false;
  scrim.addEventListener("click", closeDrawer);
  addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });
  return true;
}

export function closeDrawer() {
  drawer?.classList.remove("is-open");
  scrim?.classList.remove("is-open");
}

function paperLabel() { return cfg.paperLabel || "原 PDF"; }

export function openEvidence(id) {
  const e = cfg.evidence[id];
  if (!e || !drawer) return;
  drawerTitle.textContent = `证据 · P.${e.page}`;
  drawerBody.textContent = "";
  drawerBody.append(
    el("div", { class: "row center between wrap" },
      el("span", {
        class: "tag",
        text: e.origin === "extractive" ? "原文直引 · 逐字摘录" : "VERIFIED · 已逐字核对",
        style: "color:var(--verify)",
      }),
      el("span", { class: "mono micro dimmer", text: `#${id}` })),
    el("div", { class: "tag", text: e.section || "—" }),
    el("div", { class: "quote" }, e.quote),
    el("dl", { class: "meta-grid" },
      el("dt", { text: "页码" }), el("dd", { class: "mono", text: `第 ${e.page} 页` }),
      el("dt", { text: "支撑论断" }), el("dd", { text: e.claim || "—" }),
      el("dt", { text: "核对方式" }), el("dd", {
        text: e.origin === "extractive"
          ? "句子直接取自 PDF 文本层，未经改写"
          : `逐字比对 ${paperLabel()} PDF 文本`,
      })));
  if (e.note) drawerBody.append(el("p", { class: "block note", style: "margin:0", text: e.note }));
  drawerBody.append(el("button", {
    class: "btn btn--sm", text: "在原文页中高亮此引文",
    onclick: () => openPage(e.page, e.quote),
  }));
  drawer.classList.add("is-open");
  scrim.classList.add("is-open");
}

export function openPage(page, quote) {
  if (!drawer) return;
  drawerTitle.textContent = `原文 · 第 ${page} 页`;
  drawerBody.textContent = "";
  const stage = el("div", { class: "pdfview" });
  const total = cfg.pages || 18;
  const bar = el("div", { class: "pdfview__bar" },
    el("span", { text: `PAGE ${page} / ${total}` }),
    el("span", { text: quote ? "高亮 = 引文" : paperLabel() }));
  const holder = el("div", { style: "padding:10px;background:#fff;min-height:80px" });
  stage.append(bar, holder);
  drawerBody.append(stage);
  if (quote) drawerBody.append(el("div", { class: "quote" }, quote));
  drawerBody.append(el("button", { class: "btn btn--ghost btn--sm", text: "返回", onclick: closeDrawer }));
  drawer.classList.add("is-open");
  scrim.classList.add("is-open");
  if (!cfg.pdf) { holder.textContent = "本机未找到这份 PDF，无法渲染原页。"; return; }
  renderPage(holder, cfg.pdf, page, { highlight: quote || null, maxWidth: 420 })
    .then(({ hits }) => { bar.lastChild.textContent = hits ? `高亮 ${hits} 处` : "已渲染（未定位到引文）"; })
    .catch((err) => { holder.textContent = "PDF 渲染失败：" + err.message; });
}

/* 证据标记：正文里每个论断挂的小页码 */
export function evChip(id) {
  const e = cfg.evidence[id];
  if (!e) return el("span", { class: "ev ev--unverified", text: "?", title: "证据缺失" });
  return el("button", {
    class: "ev",
    text: `P.${e.page}`,
    title: e.claim || e.quote?.slice(0, 60),
    onclick: (ev) => { ev.stopPropagation(); openEvidence(id); },
  });
}

export function withEv(node, ids) {
  if (!ids) return node;
  const list = Array.isArray(ids) ? ids : [ids];
  for (const id of list) node.append(" ", evChip(id));
  return node;
}

export function getEvidence() { return cfg.evidence; }
