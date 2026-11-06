/* PaperWorld · 通用互动装置（自动展览用）
 * 这些装置只重排「原文里已有的东西」：章节、数字、页码、原句。
 * 不生成新数据，不拟合曲线，不补全缺失取值。
 */
import { el } from "../core/ui.js";
import { renderPage } from "../core/pdfview.js";

/* ---------- 章节地图 ---------- */
function sections(root, ctx) {
  const list = (ctx.BP.__raw?.sections || []).slice(0, 16);
  if (!list.length) { root.append(el("p", { class: "small dimmer", text: "未在文本层识别出章节标题。" })); return; }
  const track = el("div", { class: "g-sect" });
  list.forEach((s, i) => {
    track.append(el("button", {
      class: "g-sect__i",
      onclick: () => ctx.openPage(s.page),
      title: `打开原文第 ${s.page} 页`,
    },
      el("span", { class: "g-sect__n", text: String(i + 1).padStart(2, "0") }),
      el("span", { class: "g-sect__t", text: s.title.slice(0, 48) }),
      el("span", { class: "g-sect__p", text: `P.${s.page}` })));
  });
  root.append(track,
    el("p", { class: "small dimmer", style: "margin:14px 0 0", text: `共识别 ${list.length} 个章节标记；章节名按 PDF 版面字号还原，可能与目录略有出入。点任一项打开对应原页。` }));
}

/* ---------- 数值扫描 ---------- */
function numbers(root, ctx) {
  const raw = (ctx.BP.__raw?.numbers || []);
  const pct = raw
    .map((x) => ({ ...x, num: parseFloat(String(x.value).replace(/[^\d.]/g, "")) }))
    .filter((x) => /%/.test(x.value) && Number.isFinite(x.num) && x.num <= 100)
    .sort((a, b) => b.num - a.num)
    .slice(0, 12);
  if (!pct.length) { root.append(el("p", { class: "small dimmer", text: "未在文本层检出百分比数值，本装置不生成替代数据。" })); return; }
  const wrap = el("div", { class: "g-num" });
  for (const x of pct) {
    wrap.append(el("button", {
      class: "g-num__r",
      title: x.context.slice(0, 120),
      onclick: () => ctx.openPage(x.page, x.context.slice(0, 280)),
    },
      el("span", { class: "g-num__p", text: `P.${x.page}` }),
      el("span", { class: "g-num__t" }, el("i", { style: `width:${Math.max(3, x.num)}%` })),
      el("span", { class: "g-num__v", text: x.value })));
  }
  root.append(wrap,
    el("p", { class: "small dimmer", style: "margin:14px 0 0", text: "条形只表示原文中该百分比的字面大小，彼此之间不构成可比实验。点任意一行可回到原页查看它所在的完整句子。" }));
}

/* ---------- 原文页图 ---------- */
function pagemap(root, ctx) {
  const total = Math.min(ctx.BP.__raw?.pageCount || ctx.BP.meta.pages || 1, 40);
  const pdf = ctx.BP.meta.pdf;
  const grid = el("div", { class: "g-map" });
  root.append(grid,
    el("p", { class: "small dimmer", style: "margin:14px 0 0", text: `共 ${ctx.BP.meta.pages || total} 页${(ctx.BP.meta.pages || total) > 40 ? "，此处列出前 40 页" : ""}。缩略图由原 PDF 在本地实时渲染，点任意一页可在证据抽屉里放大查看。` }));

  // 串行小队列：pdf.js 同时渲染十几页会互相抢资源，限流到 3 个并发
  const queue = [];
  let running = 0;
  function pump() {
    while (running < 3 && queue.length) {
      const { slot, p } = queue.shift();
      running++;
      renderPage(slot, pdf, p, { maxWidth: 170 })
        .catch(() => { slot.textContent = "渲染失败"; })
        .finally(() => { running--; pump(); });
    }
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      queue.push({ slot: e.target.querySelector(".g-map__img"), p: +e.target.dataset.page });
    }
    pump();
  }, { rootMargin: "220px" });

  for (let p = 1; p <= total; p++) {
    const tile = el("button", { class: "g-map__t", dataset: { page: String(p) }, onclick: () => ctx.openPage(p) },
      el("div", { class: "g-map__img" }),
      el("div", { class: "g-map__n", text: `PAGE ${String(p).padStart(2, "0")}` }));
    grid.append(tile);
    io.observe(tile);
  }
}

/* ---------- 随机展签 ---------- */
function quotes(root, ctx) {
  const entries = Object.entries(ctx.BP.evidence || {}).filter(([, e]) => e.quote && e.quote.length > 45);
  if (!entries.length) { root.append(el("p", { class: "small dimmer", text: "本展暂无可抽取的原文展签。" })); return; }
  const card = el("div", { class: "g-quote" });
  const btn = el("button", { class: "btn btn--ghost btn--sm", text: "再抽一张 ↻" });
  let last = -1;
  function draw() {
    let i = Math.floor(Math.random() * entries.length);
    if (entries.length > 1 && i === last) i = (i + 1) % entries.length;
    last = i;
    const [id, e] = entries[i];
    card.textContent = "";
    card.append(
      el("div", { class: "tag", text: `展签 #${id} · 原文直引` }),
      el("blockquote", { class: "g-quote__x", text: e.quote }),
      el("div", { class: "row center between wrap", style: "margin-top:14px" },
        el("span", { class: "mono micro dimmer", text: `${e.section || "—"} · PAGE ${e.page}` }),
        el("button", { class: "ev", text: `P.${e.page}`, onclick: () => ctx.openEvidence(id) })),
    );
  }
  btn.onclick = draw;
  root.append(card, el("div", { style: "margin-top:14px" }, btn));
  draw();
}

export function mountGeneric(id, root, ctx) {
  switch (id) {
    case "auto-sections": return sections(root, ctx);
    case "auto-numbers": return numbers(root, ctx);
    case "auto-pagemap": return pagemap(root, ctx);
    case "auto-quotes": return quotes(root, ctx);
    default: root.append(el("p", { class: "small dimmer", text: `未知装置：${id}` }));
  }
}
