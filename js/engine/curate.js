/* PaperWorld 2.0 · 维度驱动策展引擎
 *
 * 与 1.0 的区别：不再用固定的「命题 / 结构 / 数据 / 图谱 / 边界」模板套所有论文，
 * 而是先由 analyze.js 判断这篇论文在六个研究维度上各有哪些原文依据，
 * 再据此**动态决定建几间展厅、每间放什么形式、每件展品是哪一句原文**。
 *
 * 不变的红线（与 1.0 完全一致，保证数据兼容）：
 *   1. blueprint 仍是 paperworld.blueprint/v1，meta/evidence/halls/blocks 结构不变；
 *   2. evidence 每条含 page / section / claim / quote / verified / origin，可被 pdfview 原页高亮；
 *   3. 原文块（verbatim）逐字取自 PDF，编辑性文字单独成块并标注；
 *   4. 数值装置只画原文出现过的数。
 */
import { analyze } from "./analyze.js";

const TOPIC_WORDS = [
  ["机器人", /robot|manipulat|arm|gripper|teleop/i],
  ["机器学习", /learning|policy|imitation|reinforcement|transformer|neural/i],
  ["视觉", /vision|image|camera|perception|visual/i],
  ["仿真", /simulation|sim2real|mujoco/i],
  ["数据集", /dataset|benchmark|corpus/i],
  ["智能制造", /manufactur|assembly|industrial|factory/i],
];
function detectTopics(text) {
  const hits = TOPIC_WORDS.filter(([, re]) => re.test(text)).map(([n]) => n);
  return (hits.length ? hits : ["学术研究"]).slice(0, 4).join(" · ");
}

const FORM_IX = {
  quotes: { id: "auto-quotes", title: "随机展签 · 从本维度原文抽一句" },
  sections: { id: "auto-sections", title: "章节地图 · CHAPTER MAP" },
  numbers: { id: "auto-numbers", title: "数值扫描 · NUMBER SCAN" },
};

export function curate(ex, { sourceName = "上传的论文.pdf", analysis = null } = {}) {
  const A = analysis || analyze(ex);
  const evidence = {};
  const refsInline = ex.refs || [];
  let n = 0;
  const addEv = (s, label) => {
    const id = "a" + String(++n).padStart(3, "0");
    evidence[id] = {
      page: s.page, section: s.section || "—",
      claim: label || "自动摘录的原文语句（未经改写）",
      quote: s.text, verified: true, origin: "extractive",
    };
    return id;
  };
  const vblock = (s, label) => ({ t: "verbatim", text: s.text, ev: addEv(s, label) });
  const ed = (text) => ({ t: "editorial", text });

  const sections = (ex.sections || []).slice(0, 14);
  const figures = (ex.figures || []).slice(0, 6);
  const thumbs = ex.thumbs || new Map();
  const teaser = thumbs.get(1) || null;
  const date = new Date().toISOString().slice(0, 10);

  const dims = A.dimensions.filter((d) => d.count > 0);
  const halls = [];

  /* ---------------- 序厅 ---------------- */
  const stats = [
    { label: "原文页数", value: String(ex.pageCount), sub: "逐页解析文本层" },
    { label: "可溯源展签", value: "—", sub: "点击即可回到原页", dynamic: "evidence" },
    { label: "识别维度", value: String(dims.length), sub: "六维度分析命中数" },
    { label: "识别章节", value: String(sections.length), sub: "按版面字号还原" },
    { label: "图表标注", value: String((ex.figures || []).length), sub: "Fig. / Table / Algorithm" },
    { label: "数值线索", value: String((ex.numbers || []).length), sub: "原文中出现的百分比等" },
  ];
  halls.push({
    id: "facade", kind: "facade", num: "00",
    kicker: "EXHIBIT 00 · FACADE 序厅",
    title: ex.title,
    titleZh: `按 ${dims.length} 个研究维度自动规划展区 · 正文全部为原文直引`,
    authors: [{ name: (ex.authors || []).length ? ex.authors.join(" · ") : "论文作者", aff: "见原文首页" }],
    venue: `${sourceName} · ${ex.pageCount} 页 · 布展于 ${date}`,
    domain: detectTopics(ex.abstract + " " + ex.title + " " + ex.sentences.slice(0, 40).map((s) => s.text).join(" ")),
    curator: "这座展馆的平面图不是模板：程序先读完整篇论文，判断它在研究背景、核心问题、创新点、技术路线、实验过程、结果与结论上各有哪些原文依据，再决定建几间展厅、每间摆哪几句。金框里是原文，标了「策展语」的是编辑性文字——两者永不混在一起。点任意页码标记，回到论文原页看高亮。",
    stats,
    figure: teaser ? {
      src: teaser, page: 1,
      caption: (figures[0] ? figures[0].caption : "论文第 1 页版面（由原 PDF 实时渲染）").slice(0, 220),
    } : null,
  });

  /* ---------------- 按维度动态规划展厅 ---------------- */
  const analysisMeta = [];
  const plan = [];
  dims.forEach((d, i) => {
    const num = String(i + 1).padStart(2, "0");
    const pages = d.pages.length ? `P.${Math.min(...d.pages)}–P.${Math.max(...d.pages)}` : "—";
    const quotes = d.sentences.map((s) => vblock(s, `维度「${d.name}」的原文依据`));
    const quoteIds = quotes.map((q) => q.ev);
    const ix = FORM_IX[d.form];

    const blocks = [
      {
        t: "dimension", n: `DIMENSION ${num} / ${d.en}`,
        title: d.name, text: d.basis,
        pages: `${pages} · ${d.count} 条原文`,
      },
      ed(`本展区由六维度分析自动归入 ${d.count} 条原文语句，展示形式按维度选为「${({ quotes: "随机展签", sections: "章节地图", numbers: "数值扫描", exhibit: "原文展墙", plain: "原文展墙" })[d.form]}」。下列每句都逐字摘自 PDF，未经改写与翻译。`),
      ...quotes,
    ];
    if (ix) blocks.push({ t: "interactive", id: ix.id, title: ix.title, engine: "auto" });

    const hid = "dim-" + d.id;
    halls.push({
      id: hid, kind: d.form, num,
      kicker: `EXHIBIT ${num} · ${d.en} ${d.name}`,
      title: d.name,
      blocks,
    });
    analysisMeta.push({
      id: d.id, name: d.name, en: d.en, count: d.count, pages: d.pages,
      basis: d.basis, signals: d.signals, quoteIds,
      representative: (evidence[quoteIds[0]]?.quote || "").slice(0, 160),
    });
    plan.push({ num, id: hid, title: d.name, count: d.count, form: d.form, pages });
  });

  /* ---------------- 图谱厅（有图注才建） ---------------- */
  const plates = figures.filter((f) => thumbs.has(f.page)).slice(0, 4).map((f) => ({
    t: "figure", src: thumbs.get(f.page), page: f.page, caption: f.caption.slice(0, 220),
  }));
  if (plates.length || figures.length) {
    const num = String(dims.length + 1).padStart(2, "0");
    halls.push({
      id: "plates", kind: "specimen", num,
      kicker: `EXHIBIT ${num} · THE PLATES 图谱厅`,
      title: "插图、表格与它们的原文标注",
      blocks: [
        ed("图注是论文自己的话。图像由原 PDF 页面在本地渲染得到；点右上角标记可查看完整原页。"),
        ...(plates.length ? plates : [ed("这篇 PDF 的插图页无法渲染缩略图，因此本厅不摆出推测性的图像。")]),
        ...figures.slice(0, 2).map((f) => ({
          t: "verbatim", text: f.caption.slice(0, 300),
          ev: addEv({ text: f.caption.slice(0, 300), page: f.page, section: "Figure caption" }, "原图注（逐字）"),
        })),
      ],
    });
    plan.push({ num, id: "plates", title: "图谱厅", count: figures.length, form: "plates", pages: [] });
  }

  /* ---------------- 原文库 ---------------- */
  const archNum = String(halls.length).padStart(2, "0");
  halls.push({
    id: "archive", kind: "archive", num: archNum,
    kicker: `EXHIBIT ${archNum} · THE ARCHIVE 原文库`,
    title: "回到纸张本身",
    blocks: [
      ed("最后一间是原文库。每一页都能在这里打开；点开的页面会在证据抽屉里按原尺寸渲染，并尽可能把引文高亮出来。"),
      { t: "interactive", id: "auto-pagemap", title: "原文页图 · PAGE MAP", engine: "auto" },
      refsInline.length ? { t: "refwall" } : ed("未在文本层检出按 [n] 编号的参考文献条目。"),
    ],
  });
  plan.push({ num: archNum, id: "archive", title: "原文库", count: refsInline.length, form: "archive", pages: [] });

  const meta = {
    id: "auto", title: ex.title, pdf: ex.url, pages: ex.pageCount,
    sourceName, generatedAt: date,
    mode: "extractive",                       // 保持与 1.0 渲染器兼容
    curation: "dimension-driven/v2",
    curationLabel: "AI 策展 · 六维度分析",
    engine: "PaperWorld 2.0 本地六维度分析 + 提取式策展",
    refsInline,
    analysis: {
      generatedBy: A.generatedBy, coverage: A.coverage,
      dimensions: analysisMeta,
    },
    plan,
    colophon: `本展由 PaperWorld 在本地浏览器中依据《${sourceName}》自动生成：先按六个研究维度分析原文语句，再据此规划 ${halls.length} 间展区。全部原文语句逐字取自 PDF 文本层并标注页码；策展语为编辑性文字，已单独标注。论文不上传服务器。`,
  };

  return {
    schema: "paperworld.blueprint/v1",
    generatedBy: "PaperWorld 2.0 dimension-driven extractive curation (verbatim PDF text)",
    meta, evidence, halls,
    __raw: { sections, numbers: (ex.numbers || []).slice(0, 60), pageCount: ex.pageCount },
  };
}

/* 把通过校验的模型策展结果写进已生成的蓝图：只加「AI 策展语」块 + 重排原文展品。
 * 模型永远不能新增 evidence，也不能改动任何 quote 文本。 */
export function applyPlan(bp, result) {
  if (!result?.applied || !Array.isArray(result.patches)) return bp;
  for (const p of result.patches) {
    const hall = bp.halls.find((h) => h.id === "dim-" + p.id);
    if (!hall) continue;
    const allVerbatim = hall.blocks.filter((b) => b.t === "verbatim");
    const vb = new Map(allVerbatim.map((b) => [b.ev, b]));
    // 模型没挑展品时保留本地全量原文，只补上它的讲解
    const picked = (p.quoteIds || []).length
      ? (p.quoteIds || []).map((id) => vb.get(id)).filter(Boolean)
      : allVerbatim;
    if (!picked.length) continue;
    const head = hall.blocks.filter((b) => ["dimension", "editorial"].includes(b.t));
    const tail = hall.blocks.filter((b) => !["dimension", "editorial", "verbatim", "exhibit"].includes(b.t));
    head.push({ t: "exhibit", title: "AI 策展语 · 模型生成 · 非原文", text: p.note });
    hall.blocks = [...head, ...picked, ...tail];
  }
  bp.meta.llm = { applied: true, message: result.message };
  return bp;
}

/* AI Core 后端策展结果：写入科研故事蓝图 + 展区讲解。
 * 引文 id 必须已在 evidence 表里（服务端已校验，这里再验一次）；讲解一律标为非原文。 */
export function applyAIPlan(bp, result) {
  if (!result) return bp;
  const allowed = new Set(Object.keys(bp.evidence || {}));
  const acts = [];
  const seen = new Set();
  const order = ["why", "idea", "how", "result", "meaning"];
  const list = Array.isArray(result.acts) ? result.acts : [];
  for (const id of order) {
    const a = list.find((x) => x && x.id === id && !seen.has(id));
    if (!a) continue;
    seen.add(id);
    const quotes = (Array.isArray(a.quoteIds) ? a.quoteIds : []).filter((x) => allowed.has(x)).slice(0, 4);
    acts.push({
      id, n: `ACT 0${order.indexOf(id) + 1}`,
      title: String(a.title || id).slice(0, 40),
      tagline: String(a.title || id).slice(0, 40),
      plain: String(a.plain || "").slice(0, 220),
      tech: String(a.tech || "").slice(0, 320),
      quotes,
      figure: null,
      stat: a.stat?.value ? { value: String(a.stat.value).slice(0, 24), label: String(a.stat.label || "").slice(0, 40), ev: quotes[0] } : null,
      form: "hero",
    });
  }
  if (acts.length) {
    bp.story = {
      acts,
      meta: {
        source: "ai-core",
        note: `科研故事由 AI Core 后端的模型生成（共 ${acts.reduce((n, a) => n + a.quotes.length, 0)} 条原文引用，均已回查证据表）；讲解文字标为「非原文」。`,
      },
    };
  }

  for (const z of Array.isArray(result.zones) ? result.zones : []) {
    const hall = bp.halls.find((h) => h.id === "dim-" + z.id);
    if (!hall) continue;
    const note = String(z.note || "").trim();
    if (!note || note.length > 220) continue;
    if (z.title && String(z.title).length <= 24) hall.title = String(z.title).trim();
    if (!hall.blocks.some((b) => b.t === "exhibit" && /AI 策展语/.test(b.title || ""))) {
      const at = Math.min(1, hall.blocks.length);
      hall.blocks.splice(at, 0, { t: "exhibit", title: "AI 策展语 · 模型生成 · 非原文", text: note });
    }
  }
  bp.meta.llm = { applied: true, message: result.message || "AI Core 后端策展完成" };
  return bp;
}
