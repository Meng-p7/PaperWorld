/* PaperWorld 2.0 · 空间站展区中枢
 * 展区节点、编号、证据数全部来自真实 blueprint（内置首展或本机自动展）。
 * 点击节点 → 镜头对接 → 进入 hall.html 对应展区。
 */
import { el, $, initMobileNav } from "../core/ui.js";
import { loadExhibition } from "../core/store.js";
import { createStarfield } from "./starfield.js";

const qs = new URLSearchParams(location.search);
const exhibitId = qs.get("e");
const suffix = exhibitId ? "?e=" + encodeURIComponent(exhibitId) : "";
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const mobile = innerWidth < 760;

const field = createStarfield({ sky: $("#sky"), particles: $("#particles"), mode: "ambient" });
$("#backend").textContent = field.backend === "webgl" ? "WEBGL / GPU" : "CANVAS 2D / 兼容模式";

/* ---------- 读取真实蓝图 ---------- */
async function resolveBlueprint() {
  if (exhibitId) {
    const saved = await loadExhibition(exhibitId);
    if (saved?.blueprint) return saved.blueprint;
    return null;
  }
  try { return await (await fetch("assets/data/aloha.json")).json(); }
  catch { return null; }
}

function collectEv(node, acc) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { node.forEach((x) => collectEv(x, acc)); return; }
  for (const [k, v] of Object.entries(node)) {
    if (k === "ev") {
      for (const id of Array.isArray(v) ? v : [v]) if (typeof id === "string") acc.add(id);
    } else collectEv(v, acc);
  }
}

function zoneMeta(h) {
  const acc = new Set();
  collectEv(h.blocks || [], acc);
  return { count: acc.size, pages: (h.blocks || []).length };
}

function label(h) {
  const k = h.kicker || "";
  const m = k.match(/·\s*([A-Z ]+)\s/);
  return (m ? m[1] : (h.kind || "ZONE")).trim().slice(0, 24);
}

/* ---------- 渲染展区节点 ---------- */
function buildMap(bp) {
  const halls = (bp.halls || []).filter(Boolean);
  const corridor = $("#corridor");
  corridor.textContent = "";
  $("#station-title").textContent = bp.meta?.title || halls[0]?.title || "未命名展馆";
  const evTotal = Object.keys(bp.evidence || {}).length;
  $("#station-meta").innerHTML =
    `${bp.meta?.mode === "extractive" ? "自动布展" : "人工策展"} · <b>${halls.length}</b> 间展区 · <b>${evTotal}</b> 条证据` +
    (bp.meta?.pages ? ` · <b>${bp.meta.pages}</b> 页原文` : "");

  halls.forEach((h, i) => {
    const { count, pages } = zoneMeta(h);
    const depth = Math.floor(i / 2);
    const col = i % 2;
    const node = el("button", {
      class: "zone", dataset: { id: h.id, index: String(i) },
      "aria-label": `进入展区 ${h.num || i} ${h.title}`,
    },
      el("div", { class: "zone__n", text: `ZONE ${h.num || String(i).padStart(2, "0")} · ${label(h)}` }),
      el("div", { class: "zone__t", text: h.title }),
      el("div", { class: "zone__x", text: (h.kicker || "").replace(/^EXHIBIT \d+\s*·\s*/, "").slice(0, 76) || "展区" }),
      el("div", { class: "zone__f" },
        el("span", {}, ...(h.kind === "facade"
          ? [`序厅 · ${(h.stats || []).length} 项展览索引`]
          : ["证据 ", el("b", { text: String(count) }), ` · ${pages} 件展品`])),
        el("span", { class: "zone__enter", text: h.kind === "facade" ? "从序厅进入 →" : "进入 →" })));
    if (!mobile) {
      // 两列网格保证卡片绝不互相遮挡；只留很轻的 Z 位移与偏转做空间感
      node.style.transform = `translateZ(${-depth * 26}px) rotateY(${col ? -2.2 : 2.2}deg)`;
      node.style.transformOrigin = col ? "right center" : "left center";
    }
    node.addEventListener("click", () => dock(h.id, node));
    corridor.append(node);
  });
  return halls.length;
}

/* ---------- 镜头对接 ---------- */
let docking = false;
function dock(id, node) {
  if (docking) return;
  docking = true;
  const station = $("#station");
  if (!reduce && !mobile) {
    station.classList.add("is-docking");
    node.classList.add("is-focus");
    const corridor = $("#corridor");
    corridor.style.transform = "translate3d(0, 26px, 300px) scale(1.18)";
    setTimeout(() => $("#flash").classList.add("is-on"), 480);
    setTimeout(() => { location.href = `hall.html${suffix}#${id}`; }, 760);
  } else {
    $("#flash").classList.add("is-on");
    setTimeout(() => { location.href = `hall.html${suffix}#${id}`; }, reduce ? 0 : 180);
  }
}

/* ---------- 轻度视差 ---------- */
if (!mobile && !reduce) {
  const corridor = $("#corridor");
  $("#map").addEventListener("mousemove", (e) => {
    if (docking) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    corridor.style.transform = `rotateY(${x * 5}deg) rotateX(${-y * 4}deg) translateZ(${y * 18}px)`;
  });
  $("#map").addEventListener("mouseleave", () => {
    if (!docking) corridor.style.transform = "";
  });
}

/* ---------- 导航 ---------- */
$("#direct").addEventListener("click", () => { location.href = "hall.html" + suffix; });
$("#back").addEventListener("click", () => { location.href = "index.html"; });
addEventListener("keydown", (e) => { if (e.key === "Escape") location.href = "index.html"; });
initMobileNav();

/* ---------- 启动 ---------- */
(async () => {
  const bp = await resolveBlueprint();
  if (!bp) {
    $("#station-title").textContent = "展馆索引未找到";
    $("#corridor").append(el("div", { class: "zone", style: "position:static;transform:none" },
      el("div", { class: "zone__t", text: "这台设备上没有这场展览" }),
      el("div", { class: "zone__x", text: "可能是换了浏览器或清过站点数据。" }),
      el("div", { class: "zone__f" }, el("a", { class: "zone__enter", href: "parse.html", text: "去上传论文 →" }))));
  } else buildMap(bp);
  const start = performance.now();
  setTimeout(() => $("#loader").classList.add("is-done"), Math.max(0, 420 - (performance.now() - start)));
})();
