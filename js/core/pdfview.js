/* PaperWorld · PDF 原页查看器
 * 用本地 pdf.js 渲染指定页，并把引文在页面上高亮出来。
 * 高亮定位：把页面文本项与引文都做"去空白 + 连字归一"，
 * 在拼接串上做子串匹配，再映射回文本项的矩形。
 */

let pdfjs = null;
const docCache = new Map();

async function loadPdfjs() {
  if (pdfjs) return pdfjs;
  const mod = await import("../../vendor/pdfjs/pdf.min.mjs");
  mod.GlobalWorkerOptions.workerSrc = new URL(
    "../../vendor/pdfjs/pdf.worker.min.mjs",
    import.meta.url
  ).href;
  pdfjs = mod;
  return mod;
}

export async function getPdf(url) {
  if (docCache.has(url)) return docCache.get(url);
  const mod = await loadPdfjs();
  const task = mod.getDocument(url).promise;
  docCache.set(url, task);
  return task;
}

/* ---------- 文本归一 ---------- */
const LIG = {
  "ﬁ": "fi",
  "ﬂ": "fl",
  "ﬀ": "ff",
  "ﬃ": "ffi",
  "ﬄ": "ffl",
  "ﬅ": "ft",
  "ﬆ": "st",
  "’": "'",
  "‘": "'",
  "“": '"',
  "”": '"',
  "–": "-",
  "—": "-",
  "×": "x",
};

function norm(s) {
  let out = "";
  for (const ch of s) {
    const c = LIG[ch] ?? ch;
    if (/\s/.test(c)) continue;
    out += c.toLowerCase();
  }
  return out;
}

/* ---------- 渲染一页 + 高亮 ---------- */
export async function renderPage(container, url, pageNo, { highlight = null, maxWidth = 420 } = {}) {
  container.textContent = "";
  const doc = await getPdf(url);
  const page = await doc.getPage(pageNo);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(2.2, maxWidth / base.width) * (devicePixelRatio || 1);
  const viewport = page.getViewport({ scale });

  const wrap = document.createElement("div");
  wrap.style.position = "relative";

  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = "100%";
  canvas.style.height = "auto";
  wrap.append(canvas);

  const overlay = document.createElement("canvas");
  overlay.width = canvas.width;
  overlay.height = canvas.height;
  overlay.style.cssText = "position:absolute;inset:0;width:100%;height:auto;pointer-events:none";
  wrap.append(overlay);

  container.append(wrap);

  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;

  let hits = 0;
  if (highlight) {
    hits = await paintHighlight(page, viewport, overlay, highlight);
  }
  return { page, viewport, hits };
}

async function paintHighlight(page, viewport, overlay, quote) {
  const tc = await page.getTextContent();
  const target = norm(quote);
  if (!target) return 0;

  // 拼接 + 偏移映射
  const items = [];
  let cum = "";
  for (const it of tc.items) {
    if (!it.str || !it.str.trim()) continue;
    const n = norm(it.str);
    if (!n) continue;
    items.push({ start: cum.length, end: cum.length + n.length, it });
    cum += n;
  }
  // 跨栏 / 连字 / 断字会让整句无法连续命中；按长度退让，取最长可定位前缀。
  let at = cum.indexOf(target);
  let len = target.length;
  if (at < 0) {
    for (const ratio of [0.85, 0.7, 0.55, 0.4]) {
      const probe = target.slice(0, Math.floor(target.length * ratio));
      if (probe.length < 24) break;
      const p = cum.indexOf(probe);
      if (p >= 0) { at = p; len = probe.length; break; }
    }
  }
  if (at < 0) return 0;
  const end = at + len;

  const rects = [];
  for (const { start, end: e, it } of items) {
    if (e <= at || start >= end) continue;
    const r = viewport.convertToViewportRectangle(it.transform);
    const x0 = Math.min(r[0], r[2]);
    const x1 = Math.max(r[0], r[2]);
    const y0 = Math.min(r[1], r[3]);
    const y1 = Math.max(r[1], r[3]);
    rects.push([x0, y0, x1, y1]);
  }
  if (!rects.length) return 0;

  const ctx = overlay.getContext("2d");
  const css = getComputedStyle(document.documentElement);
  const gold = css.getPropertyValue("--gold").trim() || "#f2b45c";
  ctx.fillStyle = hexA(gold, 0.3);
  ctx.strokeStyle = hexA(gold, 0.9);
  ctx.lineWidth = Math.max(1, overlay.width / 600);
  for (const [x0, y0, x1, y1] of rects) {
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  }
  return rects.length;
}

function hexA(hex, a) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
