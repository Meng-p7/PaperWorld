/* PaperWorld 2.0 · 镜头推进控制器
 * 把「滚动 / 点击」映射成一段有节奏的镜头运动：巡航 → 曲速 → 对接。
 * 只负责数值，不碰 DOM；渲染交给 starfield 与页面里的 HUD。
 */

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

export function createCamera({ duration = 2600, reduced = false, onUpdate, onStage, onComplete } = {}) {
  let z = 0;
  let playing = false;
  let done = false;
  let raf = 0;
  let t0 = 0;
  let z0 = 0;
  let stage = "CRUISE";

  function warpAt(v) {
    if (v < 0.24) return 0;
    if (v < 0.60) return ease((v - 0.24) / 0.36);
    if (v < 0.86) return 1;
    return clamp(1 - (v - 0.86) / 0.14);
  }
  function stageAt(v) {
    return v < 0.24 ? "CRUISE" : v < 0.86 ? "WARP" : "DOCK";
  }
  function emit() {
    const w = warpAt(z);
    const s = stageAt(z);
    if (s !== stage) { stage = s; onStage && onStage(s, z); }
    onUpdate && onUpdate(z, w, stage);
  }
  function finish() {
    if (done) return;
    done = true;
    playing = false;
    cancelAnimationFrame(raf);
    z = 1;
    emit();
    onComplete && onComplete();
  }

  function step(now) {
    if (!playing) return;
    const p = clamp((now - t0) / duration);
    z = clamp(z0 + (1 - z0) * ease(p));
    emit();
    if (p >= 1) { finish(); return; }
    raf = requestAnimationFrame(step);
  }

  return {
    get z() { return z; },
    get stage() { return stage; },
    get done() { return done; },
    /* 滚动/手势：把增量推给镜头，推到底自动完成 */
    drive(delta) {
      if (done) return;
      playing = false;
      cancelAnimationFrame(raf);
      z = clamp(z + delta);
      emit();
      if (z >= 0.995) finish();
    },
    /* 点击「启动探索」：播放完整镜头 */
    engage() {
      if (done || playing) return;
      if (reduced) { finish(); return; }
      playing = true;
      z0 = z;
      t0 = performance.now();
      raf = requestAnimationFrame(step);
    },
    /* 跳过动画：立即对接 */
    skip() { finish(); },
  };
}
