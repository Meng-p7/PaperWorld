/* PaperWorld · 空间站
 * 空间站的舱门不再对应 blueprint 的七个展区，而是来自同一份 story.acts：
 * 四幕科研故事 → 四个舱门 → story.html#act-xxx。
 * 完整七展区只在 hall.html（完整资料）中出现，不再出现在默认阅读路径。
 */
import { el, $, initMobileNav } from "../core/ui.js";
import { loadExhibition } from "../core/store.js";
import { createStarfield } from "./starfield.js";
import { createStation3D as createLegacyStation } from "./station3d.js";
import { resolveStory } from "../engine/stories/aloha.js";

const qs = new URLSearchParams(location.search);
const exhibitId = qs.get("e");
const suffix = exhibitId ? "?e=" + encodeURIComponent(exhibitId) : "";
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const mobile = innerWidth < 760;
const ACT_NUM = ["第一幕", "第二幕", "第三幕", "第四幕"];

const field = createStarfield({ sky: $("#sky"), particles: $("#particles"), mode: "ambient" });
$("#backend").textContent = field.backend === "webgl" ? "WebGL" : "兼容模式";

/* ---------- 读取真实蓝图与四幕故事 ---------- */
async function resolveBlueprint() {
  if (exhibitId) {
    const saved = await loadExhibition(exhibitId);
    return saved?.blueprint || null;
  }
  try { return await (await fetch("assets/data/aloha.json")).json(); }
  catch { return null; }
}

function quoteCount(act) { return (act.quotes || []).length; }

/* ---------- 无 3D / 无 WebGL 时的四幕列表 ---------- */
function buildMap(story) {
  const corridor = $("#corridor");
  corridor.textContent = "";
  story.acts.forEach((act, i) => {
    const node = el("button", {
      class: "zone", dataset: { id: "act-" + act.id, index: String(i) },
      "aria-label": `进入${ACT_NUM[i]}：${act.title}`,
    },
      el("div", { class: "zone__n", text: ACT_NUM[i] }),
      el("div", { class: "zone__t", text: act.title }),
      el("div", { class: "zone__x", text: (act.plain || act.tagline || "").slice(0, 92) }),
      el("div", { class: "zone__f" },
        el("span", {}, `${quoteCount(act)} 条原文依据`),
        el("span", { class: "zone__enter", text: "开始阅读 →" })));
    if (!mobile) {
      const depth = Math.floor(i / 2), col = i % 2;
      node.style.transform = `translateZ(${-depth * 26}px) rotateY(${col ? -2 : 2}deg)`;
      node.style.transformOrigin = col ? "right center" : "left center";
    }
    node.addEventListener("click", () => dock("act-" + act.id, node));
    corridor.append(node);
  });
}

/* ---------- 镜头对接 ---------- */
let docking = false;
function dock(id, node) {
  if (docking) return;
  docking = true;
  const station = $("#station");
  const go = () => { location.href = `story.html${suffix}#${id}`; };
  if (!reduce && !mobile) {
    station.classList.add("is-docking");
    if (node?.classList) node.classList.add("is-focus");
    const corridor = $("#corridor");
    if (corridor && getComputedStyle(corridor).display !== "none") {
      corridor.style.transform = "translate3d(0, 26px, 300px) scale(1.18)";
    }
    setTimeout(() => $("#flash").classList.add("is-on"), 380);
    setTimeout(go, 720);
  } else {
    $("#flash").classList.add("is-on");
    setTimeout(go, reduce ? 0 : 180);
  }
}

/* ---------- 第一人称空间站：舱门来自四幕 ---------- */
async function mountStation3D(acts) {
  const canvas = $("#station-canvas");
  if (!canvas) return null;
  const doors = acts.map((act, i) => ({
    num: ACT_NUM[i],
    title: (act.title || "").slice(0, 12),
    theta: (i / acts.length) * Math.PI * 2,
    id: "act-" + act.id,
    kind: "story",
  }));
  const onSelect = (d) => dock(d.id, null);
  let s3 = null;
  try {
    const { createStation3D: createCinematicStation } = await import("./stationCinematic.js");
    s3 = createCinematicStation({ canvas, doors, onSelect });
  } catch (err) {
    console.warn("[station] 电影级渲染不可用：", err.message);
  }
  if (!s3) {
    try { s3 = createLegacyStation({ canvas, doors, onSelect }); }
    catch (err) { console.warn("[station3d] 降级到四幕列表：", err.message); }
  }
  if (s3) {
    $("#map").style.display = "none";
    $("#station3d").classList.add("is-live");
    $("#backend").textContent = s3.kind === "webgl-cinematic" ? "3D · 电影级" : "3D";
    window.__pwStation = s3;
    return s3;
  }
  $("#station3d").style.display = "none";
  return null;
}

/* ---------- 轻度视差（仅无 3D 列表） ---------- */
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
$("#direct").addEventListener("click", () => { location.href = "story.html" + suffix; });
$("#back").addEventListener("click", () => { location.href = "index.html"; });
addEventListener("keydown", (e) => { if (e.key === "Escape") location.href = "index.html"; });
initMobileNav();

/* ---------- 启动 ---------- */
(async () => {
  const bp = await resolveBlueprint();
  const loader = $("#loader");
  if (!bp) {
    $("#station-paper").textContent = "这台设备上没有这场展览";
    $("#station-meta").textContent = "可能是换了浏览器或清过站点数据。";
    $("#corridor").append(el("div", { class: "zone", style: "position:static;transform:none" },
      el("div", { class: "zone__t", text: "没有可读的论文" }),
      el("div", { class: "zone__x", text: "可以上传一篇 PDF，或直接打开示范展。" }),
      el("div", { class: "zone__f" }, el("a", { class: "zone__enter", href: "parse.html", text: "上传论文 →" }))));
    loader.classList.add("is-done");
    return;
  }

  const story = resolveStory(bp);
  const paperTitle = bp.meta?.title || bp.halls?.[0]?.title || "未命名论文";
  $("#station-paper").textContent = paperTitle;
  const ev = Object.keys(bp.evidence || {}).length;
  $("#station-meta").textContent = `4 幕 · 约 2 分钟读完 · ${ev} 条可核验证据`;
  document.title = `空间站 · ${paperTitle}`.slice(0, 110);
  buildMap(story);
  await mountStation3D(story.acts);

  const start = performance.now();
  setTimeout(() => loader.classList.add("is-done"), Math.max(0, 400 - (performance.now() - start)));
})();
