/* PaperWorld · 首页
 * 真实 3D 空间站外景：远景 → 接近 → 对接 → 进入空间站。
 * 首页只保留两个主要动作：进入空间站、上传论文；首展可直接进入四幕故事。
 */
import { createStarfield } from "./starfield.js";
import { createCamera } from "./camera.js";
import { createEntranceScene } from "./entranceScene.js";
import { $ } from "../core/ui.js";
import { initMobileNav } from "../core/ui.js";

const loader = $("#loader");
const loaderText = $("#loader-text");
const hero = $("#hero");
const bar = $("#cam-bar");
const flash = $("#flash");
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

createStarfield({ sky: $("#sky"), particles: $("#particles"), mode: "entrance" });
const canvas = $("#entrance-canvas");
const scene = createEntranceScene({ canvas });
if (!scene) canvas.style.display = "none";
window.__pwEntrance = scene; // 性能探针：window.__pwEntrance.getPerf()
canvas.addEventListener("pw:scene-lost", () => {
  scene?.destroy?.();
  canvas.style.display = "none";
  const hint = document.querySelector(".entrance__hint");
  if (hint) hint.textContent = "3D 渲染中断，已切换为静态深空背景 · 仍可进入空间站";
});
addEventListener("pagehide", () => scene?.destroy?.(), { once: true });

let leaving = false;
const cam = createCamera({
  duration: reduce ? 1 : 3600,
  reduced: reduce,
  onUpdate(z, warp) {
    scene?.setCamera(z, warp);
    // 文案随镜头后退并淡出，但始终保持可读，不做夸张缩放。
    const k = Math.min(1, z * 1.15);
    hero.style.transform = `translateY(${-k * 34}px)`;
    hero.style.opacity = String(Math.max(0, 1 - k * 1.35));
    bar.style.width = (z * 100).toFixed(1) + "%";
    document.body.classList.toggle("is-traveling", z > 0.015);
  },
  onStage(stage) {
    document.querySelectorAll(".camstage__i").forEach((n) =>
      n.classList.toggle("is-on", n.dataset.stage === stage));
    loaderText.textContent = stage === "WARP" ? "正在接近空间站" : stage === "DOCK" ? "对接舱门" : "正在接近空间站";
  },
  onComplete() {
    if (leaving) return;
    leaving = true;
    flash.classList.add("is-on");
    setTimeout(() => { location.href = "station.html" + (location.search || ""); }, reduce ? 0 : 320);
  },
});

function leaveNow() {
  if (leaving) return;
  leaving = true;
  location.href = "station.html" + (location.search || "");
}

/* ---------- 交互 ---------- */
$("#launch").addEventListener("click", () => cam.engage());
$("#skip").addEventListener("click", () => { if (cam.z > 0.02) cam.skip(); else leaveNow(); });

addEventListener("wheel", (e) => {
  if (leaving) return;
  cam.drive(Math.min(0.14, Math.abs(e.deltaY) * 0.00058) * (e.deltaY > 0 ? 1 : -0.45));
}, { passive: true });

let touchY = null;
addEventListener("touchstart", (e) => { touchY = e.touches[0]?.clientY ?? null; }, { passive: true });
addEventListener("touchmove", (e) => {
  if (touchY == null || leaving) return;
  const y = e.touches[0]?.clientY ?? touchY;
  const d = touchY - y;
  touchY = y;
  if (Math.abs(d) > 2) cam.drive(Math.min(0.1, Math.abs(d) * 0.0015) * (d > 0 ? 1 : -0.45));
}, { passive: true });

addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown" || e.key === "PageDown") cam.drive(0.12);
  if (e.key === "Escape") leaveNow();
});

/* ---------- 首展统计：只读真实蓝图，不写死数字 ---------- */
(async () => {
  try {
    const bp = await (await fetch("assets/data/aloha.json")).json();
    const ev = Object.keys(bp.evidence || {}).length;
    const first = $("#first-story");
    first.textContent = `首展 ALOHA / ACT · 四幕约 2 分钟 · ${ev} 条可核验证据 `;
    first.append(Object.assign(document.createElement("a"), { href: "story.html", textContent: "直接阅读 →" }));
  } catch { /* 保留静态说明 */ }
})();

initMobileNav();

/* ---------- 加载态 ---------- */
const start = performance.now();
function ready() {
  const wait = Math.max(0, 520 - (performance.now() - start));
  setTimeout(() => {
    loader.classList.add("is-done");
    loaderText.textContent = scene ? "点击进入空间站" : "兼容模式 · 仍可继续";
  }, wait);
}
if (document.readyState === "complete") ready();
else addEventListener("load", ready, { once: true });
