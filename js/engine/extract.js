/* PaperWorld · 论文结构抽取引擎
 *
 * 纯浏览器端、零网络请求。用 pdf.js 逐页取回文本项，重建行/栏/段落，
 * 再识别标题、摘要、章节、图注、数值与参考文献。
 *
 * 重要：这里输出的所有「原文语句」都是从 PDF 文本项拼回来的字符串，
 * 不做任何改写、翻译或补写。策展层只做挑选与排序，不生产新事实。
 */
import { getPdf, renderPage } from "../core/pdfview.js";

const HEADING_RE = /^(?:(?:[IVXLCDM]+|[A-Z])\.\s+|(?:\d+(?:\.\d+)*\.?\s+)?)([A-Z][A-Za-z][A-Za-z\s\-:&/()]{2,60})\.?\s*$/;
const CAPTION_RE = /^\s*(fig(?:ure)?\.?\s*\d+|table\s+[IVXLC\d]+|algorithm\s*\d+)\b[\s.:—-]/i;
const REF_RE = /^\s*(?:\[\d+\]|\(\d+\)|\d+[.)])\s+\S/;
const NOISE_RE = /^(?:https?:|www\.|doi:|arxiv:|©|copyright|ieee|acm|proc\.|vol\.|pp\.|isbn|fig\.|table\s|algorithm\s)/i;

function isHeadingLine(text, fontH, medianH) {
  const t = text.trim();
  if (!t || t.length > 74) return false;
  const upper = t === t.toUpperCase() && /[A-Z]{3}/.test(t);
  const numbered = /^(?:[IVXLCDM]+\.\s+[A-Z]|\d+(?:\.\d+)*\.?\s+[A-Z])/.test(t);
  const big = fontH > medianH * 1.18;
  return (upper && !/^\d/.test(t)) || numbered || (big && t.length < 60);
}
function isCaption(text) { return CAPTION_RE.test(text); }
function isNoise(text) {
  const t = text.trim();
  return !t || NOISE_RE.test(t) || /^[\d\s.,:;()[\]\-–—/]+$/.test(t) ||
    /(?:https?:\/\/|@[a-z]+\.[a-z]{2})/i.test(t) || t.length < 8;
}

/* 把同一行的文本项拼回去：按 x 排序，用字符间距判断是否需要空格 */
function joinItems(items) {
  items.sort((a, b) => a.x - b.x);
  let out = "";
  let prevRight = null;
  for (const it of items) {
    const gap = prevRight == null ? 999 : it.x - prevRight;
    if (out && gap > 1.6 && !/\s$/.test(out) && !/^\s/.test(it.str)) out += " ";
    out += it.str;
    prevRight = it.x + (it.width || it.str.length * (it.fontH || 8) * 0.5);
  }
  return out.replace(/\s+/g, " ").trim();
}

/* 重建一页：判断单/双栏，各自按 y 归行，左栏读完再读右栏 */
function rebuildPage(tc, pageW) {
  const raw = [];
  for (const it of tc.items) {
    if (!it.str || !it.str.trim()) continue;
    const tr = it.transform || [1, 0, 0, 1, 0, 0];
    raw.push({
      str: it.str,
      x: tr[4],
      y: tr[5],
      fontH: Math.abs(it.height || tr[3] || 10),
      width: it.width || 0,
    });
  }
  if (!raw.length) return { lines: [], fonts: [] };

  const mid = pageW / 2;
  let left = 0, right = 0;
  for (const it of raw) (it.x < mid ? left++ : right++);
  const twoCol = left > raw.length * 0.22 && right > raw.length * 0.22 && pageW > 380;

  const buckets = twoCol
    ? [raw.filter((i) => i.x < mid), raw.filter((i) => i.x >= mid)]
    : [raw];

  const lines = [];
  for (const bucket of buckets) {
    const rows = new Map();
    for (const it of bucket) {
      const key = Math.round(it.y / 3.2);
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key).push(it);
    }
    const keys = [...rows.keys()].sort((a, b) => b - a); // pdf 坐标 y 向上
    for (const k of keys) {
      const items = rows.get(k);
      const text = joinItems(items);
      if (!text) continue;
      const fontH = Math.max(...items.map((i) => i.fontH));
      lines.push({ text, fontH, y: k, x: Math.min(...items.map((i) => i.x)) });
    }
  }
  const fonts = lines.map((l) => l.fontH).filter((x) => x > 3).sort((a, b) => a - b);
  const medianH = fonts.length ? fonts[Math.floor(fonts.length / 2)] : 10;
  for (const l of lines) l.heading = isHeadingLine(l.text, l.fontH, medianH);
  return { lines, medianH, twoCol };
}

/* 段落流：遇到标题/图注/噪声就断开，连续的普通行拼成一段 */
function paragraphs(lines) {
  const runs = [];
  let cur = [];
  for (const l of lines) {
    if (l.heading || isCaption(l.text) || isNoise(l.text)) {
      if (cur.length) { runs.push(cur.join(" ")); cur = []; }
      continue;
    }
    cur.push(l.text);
  }
  if (cur.length) runs.push(cur.join(" "));
  return runs;
}

/* 断句：保守，只在「句号/问号 + 空白 + 大写字母」处切，避免 e.g. / Fig. 误切 */
function sentences(text) {
  const parts = text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+(?=[A-Z“"(])/);
  const out = [];
  for (let p of parts) {
    p = p.trim();
    if (p.length < 45 || p.length > 330) continue;
    if (isNoise(p) || isCaption(p)) continue;
    if (!/[a-zA-Z]{4}/.test(p)) continue;
    // 以小写开头 = 多半是跨栏/跨行切断的残句，不做展签
    if (/^[a-z(]/.test(p)) continue;
    out.push(p);
  }
  return out;
}

const SIGNAL = [
  [/\b\d{1,3}(?:\.\d+)?\s?%/, 4], [/\$\s?\d/, 3], [/\b\d+(?:\.\d+)?\s?(?:Hz|ms|kg|mm|cm|M|k)\b/, 2],
  [/\bwe (?:propose|present|introduce|show|demonstrate|find|observe|evaluate|achieve)\b/i, 5],
  [/\b(?:outperform|improve|significant|state-of-the-art|baseline|ablation|success rate)\b/i, 3],
  [/\b(?:however|limitation|fail|future work|remain|challenge|cannot|does not)\b/i, 4],
  [/\b(?:result|experiment|accuracy|performance|cost|hardware|dataset)\b/i, 2],
];
function score(s) {
  let n = 0;
  for (const [re, w] of SIGNAL) if (re.test(s)) n += w;
  return n;
}

export async function extractPdf(blob, onProgress = () => {}) {
  const url = URL.createObjectURL(blob);
  const report = (pct, detail) => onProgress({ percent: pct, detail });
  report(4, "正在打开 PDF 结构…");

  const doc = await getPdf(url);
  const pageCount = doc.numPages;
  const pages = [];
  const allLines = [];

  for (let p = 1; p <= pageCount; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const { lines, medianH, twoCol } = rebuildPage(tc, vp.width);
    pages.push({ page: p, lines, width: vp.width, height: vp.height, twoCol, medianH });
    for (const l of lines) allLines.push({ ...l, page: p });
    report(4 + Math.round((p / pageCount) * 46), `逐页抽取文本 · ${p}/${pageCount} 页`);
  }

  report(54, "识别标题、作者与摘要…");
  const first = pages[0] || { lines: [], medianH: 10 };

  // 标题：首页前若干行里字号最大的连续行
  let title = "未命名论文";
  let titleEnd = 0;
  const head = first.lines.slice(0, 12);
  const maxH = Math.max(...head.map((l) => l.fontH), 0);
  if (maxH > first.medianH * 1.25) {
    const big = [];
    for (let i = 0; i < head.length; i++) {
      if (head[i].fontH > first.medianH * 1.25 && head[i].text.length > 4) { big.push(head[i].text); titleEnd = i + 1; }
      else if (big.length) break;
    }
    if (big.length) title = big.join(" ").replace(/\s+/g, " ").trim();
  }
  if (title === "未命名论文") {
    const candidate = head.find((l) => l.text.length > 18 && !isNoise(l.text));
    if (candidate) { title = candidate.text; titleEnd = head.indexOf(candidate) + 1; }
  }

  // 摘要
  const abstractIdx = allLines.findIndex((l) => l.page === 1 && /^\s*abstract\b/i.test(l.text));
  let abstract = "";
  let authors = [];
  if (abstractIdx >= 0) {
    const buf = [];
    // 注意：IEEE 风格把 "Abstract—" 和正文首句排在同一行，必须从 abstractIdx 这一行开始收
    for (let i = abstractIdx; i < allLines.length && buf.length < 50; i++) {
      const l = allLines[i];
      if (l.page > 1 && buf.length > 4) break;
      if (/^\s*(index terms|keywords|key words)\b/i.test(l.text)) break;
      if (l.heading && buf.length > 2) break;
      let t = l.text;
      if (i === abstractIdx) t = t.replace(/^\s*abstract\s*[—–\-:.]?\s*/i, "");
      if (t.trim()) buf.push(t.trim());
    }
    abstract = buf.join(" ").replace(/\s+/g, " ").trim();
    const absInHead = head.findIndex((l) => /^\s*abstract\b/i.test(l.text));
    const between = head.slice(titleEnd, absInHead >= 0 ? absInHead : Math.min(head.length, titleEnd + 7));
    // pdf.js 常把作者名与上标数字拆到不同 y 行（"1 3" / "Tony Z. Zhao Vikash Kumar"）。
    // 因此不靠数字定位，而是从首页标题后的短行里抽「名 姓」片段，并排除机构、图注、标题副行。
    // 认不出来就留空（策展层写「论文作者」），绝不把机构名当成人名。
    const NAME_G = /[A-Z][a-zA-Z'’-]+(?:\s+[A-Z]\.)?\s+[A-Z][a-zA-Z'’-]+/g;
    const BAD = /university|institute|laborator|\blab\b|college|department|school|corp|research|stanford|berkeley|google|meta|microsoft|deepmind|arxiv|http|figure|table|system|hardware|abstract/i;
    for (const l of between) {
      const line = l.text.trim();
      if (!line || line.length > 90 || BAD.test(line) || /[:$<>]/.test(line)) continue;
      if (/^[^A-Z]/.test(line) || /^(fig|table|abstract|index|keywords)/i.test(line)) continue;
      for (const nm of line.match(NAME_G) || []) {
        if (nm.length <= 46 && !BAD.test(nm)) authors.push(nm.trim());
      }
    }
    authors = [...new Set(authors)].slice(0, 8);
  }

  // 章节
  const sections = [];
  for (const l of allLines) {
    if (!l.heading) continue;
    const t = l.text.trim().replace(/\.+$/, "");
    if (t.length < 3 || t.length > 74) continue;
    if (/^(abstract|references|acknowledg|appendix|bibliography)/i.test(t)) continue;
    if (sections.length && sections[sections.length - 1].page === l.page && Math.abs(sections[sections.length - 1].y - l.y) < 2) continue;
    sections.push({ title: t, page: l.page, y: l.y });
  }

  // 图注 / 表注
  const figures = [];
  for (const pg of pages) {
    for (let i = 0; i < pg.lines.length; i++) {
      const l = pg.lines[i];
      if (!isCaption(l.text)) continue;
      const next = pg.lines[i + 1];
      const text = (l.text + (next && !next.heading && !isCaption(next.text) ? " " + next.text : ""))
        .replace(/\s+/g, " ").trim();
      figures.push({ label: l.text.trim().split(/[\s.:]/)[0] + ".", caption: text, page: pg.page });
      if (figures.length >= 24) break;
    }
    if (figures.length >= 24) break;
  }

  // 数值线索
  const numbers = [];
  for (const pg of pages) {
    for (const l of pg.lines) {
      if (isNoise(l.text) || l.text.length > 240) continue;
      const ms = l.text.match(/(?:\d{1,3}(?:\.\d+)?\s?%|\$\s?\d[\d,.]*\s?[kKmM]?|\b\d+(?:\.\d+)?\s?(?:Hz|fps|ms|kg|mm|cm)\b)/g);
      if (!ms) continue;
      for (const m of ms.slice(0, 3)) numbers.push({ value: m.trim(), context: l.text.trim(), page: pg.page });
      if (numbers.length >= 90) break;
    }
    if (numbers.length >= 90) break;
  }

  // 参考文献
  const refStart = allLines.findIndex((l) => /^(references|bibliography|参考文献)\b/i.test(l.text.trim()));
  const refs = [];
  if (refStart >= 0) {
    for (let i = refStart + 1; i < allLines.length && refs.length < 120; i++) {
      const t = allLines[i].text.trim();
      if (REF_RE.test(t) && t.length > 18) refs.push({ num: refs.length + 1, raw: t, page: allLines[i].page });
    }
  }

  report(68, "切分原文语句并计算展签…");
  // 原文语句池（全部逐字来自 PDF）
  const sentencesPool = [];
  const seen = new Set();
  for (const pg of pages) {
    for (const para of paragraphs(pg.lines)) {
      for (const s of sentences(para)) {
        const key = s.toLowerCase().replace(/\W/g, "").slice(0, 90);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        const nearSection = [...sections].reverse().find((x) => x.page <= pg.page);
        sentencesPool.push({
          text: s, page: pg.page,
          section: pg.page === 1 ? "Abstract / 首页" : (nearSection ? nearSection.title.slice(0, 60) : `第 ${pg.page} 页`),
          score: score(s) + (pg.page <= 2 ? 2 : 0),
        });
      }
    }
  }

  report(76, "生成版面缩略图…");
  // 只对前几页和含图注的页生成缩略图（内存态，不入库）
  const thumbs = new Map();
  const thumbPages = [...new Set([1, ...figures.slice(0, 4).map((f) => f.page)])].slice(0, 5);
  for (const p of thumbPages) {
    try {
      const holder = document.createElement("div");
      await renderPage(holder, url, p, { maxWidth: 460 });
      const cv = holder.querySelector("canvas");
      if (cv) thumbs.set(p, cv.toDataURL("image/jpeg", 0.78));
    } catch { /* 缩略图失败不影响主流程 */ }
  }

  report(86, "组装展厅蓝图…");
  return {
    url, pageCount, title: title.slice(0, 180), authors: authors.slice(0, 4),
    abstract: abstract.slice(0, 1600), sections, figures, numbers, refs,
    sentences: sentencesPool, thumbs,
    textPages: pages.length,
  };
}
