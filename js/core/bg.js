/* PaperWorld · 蓝图背景
 * 极淡的工程网格 + 缓慢漂移的节点星座 + 偶发扫描光。
 * 博物馆暗场里"图纸还活着"的感觉。尊重 prefers-reduced-motion。
 */

const canvas = document.getElementById("bg-canvas");
if (!canvas) throw new Error("bg-canvas missing");

const ctx = canvas.getContext("2d");
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

let W = 0;
let H = 0;
let dpr = 1;
let nodes = [];
let raf = 0;
let t = 0;

function css(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function resize() {
  dpr = Math.min(devicePixelRatio || 1, 2);
  W = innerWidth;
  H = innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  seed();
}

function seed() {
  const count = Math.round(Math.min(70, Math.max(26, (W * H) / 34000)));
  nodes = Array.from({ length: count }, () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    vx: (Math.random() - 0.5) * 0.16,
    vy: (Math.random() - 0.5) * 0.16,
    r: Math.random() * 1.5 + 0.5,
    p: Math.random() * Math.PI * 2,
  }));
}

function grid() {
  const step = 56;
  const line = css("--grid-line") || "rgba(140,170,200,.05)";
  ctx.strokeStyle = line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const ox = (t * 0.06) % step;
  for (let x = -step + ox; x < W + step; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
  }
  for (let y = 0; y < H + step; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
  }
  ctx.stroke();

  // 交点上的小十字标记，图纸感
  const dot = css("--grid-dot") || "rgba(160,190,220,.14)";
  ctx.fillStyle = dot;
  for (let x = -step + ox; x < W + step; x += step * 4) {
    for (let y = 0; y < H + step; y += step * 4) {
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }
  }
}

function constellation() {
  const gold = css("--gold") || "#f2b45c";
  const cyan = css("--cyan") || "#66d9e8";
  const linkDist = 130;

  for (const n of nodes) {
    n.x += n.vx;
    n.y += n.vy;
    if (n.x < -20) n.x = W + 20;
    if (n.x > W + 20) n.x = -20;
    if (n.y < -20) n.y = H + 20;
    if (n.y > H + 20) n.y = -20;
  }

  ctx.lineWidth = 1;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < linkDist * linkDist) {
        const alpha = (1 - Math.sqrt(d2) / linkDist) * 0.16;
        ctx.strokeStyle = hexA(cyan, alpha);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
  }

  for (const n of nodes) {
    const tw = 0.5 + 0.5 * Math.sin(t * 0.02 + n.p);
    ctx.fillStyle = hexA(gold, 0.1 + tw * 0.22);
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function hexA(hex, a) {
  // accept #rgb / #rrggbb
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function scan() {
  // 每 ~9 秒一道极淡的水平扫描光
  const period = 540;
  const ph = t % period;
  if (ph > 90) return;
  const y = (ph / 90) * (H + 200) - 100;
  const g = ctx.createLinearGradient(0, y - 60, 0, y + 60);
  const cyan = css("--cyan") || "#66d9e8";
  g.addColorStop(0, hexA(cyan, 0));
  g.addColorStop(0.5, hexA(cyan, 0.05));
  g.addColorStop(1, hexA(cyan, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, y - 60, W, 120);
}

function frame() {
  t++;
  ctx.clearRect(0, 0, W, H);
  grid();
  constellation();
  scan();
  raf = requestAnimationFrame(frame);
}

function staticFrame() {
  ctx.clearRect(0, 0, W, H);
  grid();
  // 只画节点不连线动画
  const gold = css("--gold") || "#f2b45c";
  for (const n of nodes) {
    ctx.fillStyle = hexA(gold, 0.18);
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

addEventListener("resize", () => {
  resize();
  if (reduced) staticFrame();
});

resize();
if (reduced) {
  staticFrame();
} else {
  raf = requestAnimationFrame(frame);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
    } else {
      raf = requestAnimationFrame(frame);
    }
  });
}

// 主题切换时重绘静态帧的颜色
addEventListener("pw:theme", () => {
  if (reduced) staticFrame();
});
