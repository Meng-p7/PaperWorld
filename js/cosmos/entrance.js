/* PaperWorld 2.0 · 宇宙入口控制器
 * 镜头推进 → 曲速 → 对接，然后进入空间站。
 * 所有统计数字来自真实蓝图，不写死。
 */
import { createStarfield } from "./starfield.js";
import { createCamera } from "./camera.js";
import { $ } from "../core/ui.js";

const sky = $("#sky");
const particles = $("#particles");
const loader = $("#loader");
const loaderText = $("#loader-text");
const hero = $("#hero");
const stationArt = $("#station-art");
const bar = $("#cam-bar");
const flash = $("#flash");
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

const field = createStarfield({ sky, particles, mode: "entrance" });
let leaving = false;

const cam = createCamera({
  duration: reduce ? 1 : 2900,
  reduced: reduce,
  onUpdate(z, warp) {
    field.setCamera(z, warp);
    // 前景内容随镜头推进后退、虚化
    const k = Math.min(1, z * 1.35);
    hero.style.transform = `scale(${1 + z * 0.42})`;
    hero.style.opacity = String(Math.max(0, 1 - k * 1.25));
    hero.style.filter = k > 0.05 ? `blur(${Math.min(9, k * 9)}px)` : "";
    stationArt.style.transform = `scale(${1 + z * 1.5})`;
    stationArt.style.opacity = String(Math.max(0, 0.78 - z * 0.9));
    bar.style.width = (z * 100).toFixed(1) + "%";
  },
  onStage(stage) {
    document.querySelectorAll(".camstage__i").forEach((n) =>
      n.classList.toggle("is-on", n.dataset.stage === stage));
    loaderText.textContent = stage === "WARP" ? "曲速中 · WARP ENGAGED"
      : stage === "DOCK" ? "对接空间站 · DOCKING"
        : "正在校准星图 · CALIBRATING STAR MAP";
  },
  onComplete() {
    if (leaving) return;
    leaving = true;
    flash.classList.add("is-on");
    setTimeout(() => { location.href = "station.html" + (location.search || ""); }, reduce ? 0 : 330);
  },
});

/* ---------- 交互 ---------- */
$("#launch").addEventListener("click", () => cam.engage());
$("#skip").addEventListener("click", () => cam.skip());

// 滚轮 / 触摸推进（页面本身无滚动条）
addEventListener("wheel", (e) => {
  if (leaving) return;
  cam.drive(Math.min(0.16, Math.abs(e.deltaY) * 0.00062) * (e.deltaY > 0 ? 1 : -0.45));
}, { passive: true });

let touchY = null;
addEventListener("touchstart", (e) => { touchY = e.touches[0]?.clientY ?? null; }, { passive: true });
addEventListener("touchmove", (e) => {
  if (touchY == null || leaving) return;
  const y = e.touches[0]?.clientY ?? touchY;
  const d = touchY - y;
  touchY = y;
  if (Math.abs(d) > 2) cam.drive(Math.min(0.1, Math.abs(d) * 0.0016) * (d > 0 ? 1 : -0.45));
}, { passive: true });

addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown" || e.key === "PageDown") cam.drive(0.14);
  if (e.key === " " || e.key === "Enter") { if (document.activeElement === document.body) { e.preventDefault(); cam.engage(); } }
  if (e.key === "Escape") cam.skip();
});

/* ---------- 真实展馆索引 ---------- */
async function loadMeta() {
  try {
    const bp = await (await fetch("assets/data/aloha.json")).json();
    const halls = (bp.halls || []).length;
    const ev = Object.keys(bp.evidence || {}).length;
    $("#meta-stat").innerHTML = `<b>${halls}</b> 间展区 · <b>${ev}</b> 条可溯源证据`;
  } catch {
    $("#meta-stat").textContent = "展馆索引暂时不可读 · 仍可进入";
  }
}
loadMeta();

/* ---------- 加载态 ---------- */
const start = performance.now();
function ready() {
  const wait = Math.max(0, 560 - (performance.now() - start));
  setTimeout(() => {
    loader.classList.add("is-done");
    loaderText.textContent = `渲染后端 · ${field.backend === "webgl" ? "WEBGL / GPU" : "CANVAS 2D / 兼容模式"}`;
  }, wait);
}
if (document.readyState === "complete") ready();
else addEventListener("load", ready, { once: true });
