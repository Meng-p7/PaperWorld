/* PaperWorld · 提取式策展引擎
 *
 * 设计契约（这是整个产品「不编」的实现）：
 *   1. 展厅里的每一句「原文」都是 PDF 文本项拼回来的逐字字符串，绝不改写、翻译、补写；
 *   2. 每个原文块都挂一条 evidence，含页码与原句，可在原页高亮定位；
 *   3. 编辑写的过渡文字一律用 `editorial` 块，界面上明确标注「策展语 · 非原文」；
 *   4. 数值图表只画「原文里出现过的数」，不插值、不推测、不补缺失锚点。
 *
 * 因此本引擎不会凭空产生一个结论。它做的是：从原文里挑句子、排序、布展、锚定。
 */

const TOPIC_WORDS = [
  ["机器人", /robot|manipulat|arm|gripper|teleop/i],
  ["机器学习", /learning|policy|imitation|reinforcement|transformer|neural/i],
  ["视觉", /vision|image|camera|perception|visual/i],
  ["仿真", /simulation|sim2real|mujoco/i],
  ["数据集", /dataset|benchmark|corpus/i],
  ["制造", /manufactur|assembly|industrial|factory/i],
];

function detectTopics(text) {
  const hits = TOPIC_WORDS.filter(([, re]) => re.test(text)).map(([n]) => n);
  return (hits.length ? hits : ["学术研究"]).slice(0, 4).join(" · ");
}

function splitAbstract(s) {
  return (s || "").replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z“"(])/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 45 && x.length <= 330 && !/^[a-z(]/.test(x));
}

const LIMIT_RE = /\b(?:limitation|future work|fail|cannot|does not|however|remain|challenge|only|unable|difficult|bias|restricted)\b/i;
const NUM_RE = /\d/;
const METHOD_RE = /\b(?:we (?:propose|present|introduce|design|use|train)|method|architecture|system|framework|algorithm|model|hardware)\b/i;

export function curate(ex, { sourceName = "上传的论文.pdf" } = {}) {
  const evidence = {};
  const refsInline = ex.refs || [];
  let n = 0;
  const addEv = (s, label) => {
    const id = "a" + String(++n).padStart(3, "0");
    evidence[id] = {
      page: s.page,
      section: s.section || "—",
      claim: label || "自动摘录的原文语句（未经改写）",
      quote: s.text,
      verified: true,
      origin: "extractive",
    };
    return id;
  };
  const vblock = (s, label) => ({ t: "verbatim", text: s.text, ev: addEv(s, label) });
  const ed = (text) => ({ t: "editorial", text });

  const pool = [...ex.sentences];
  const take = (filter, k, exclude = new Set()) => {
    const picked = [];
    for (const s of pool) {
      if (picked.length >= k) break;
      if (exclude.has(s.text) || !filter(s)) continue;
      picked.push(s);
      exclude.add(s.text);
    }
    return picked;
  };

  const used = new Set();
  const abstractParts = splitAbstract(ex.abstract).slice(0, 5).map((text) => ({
    text, page: 1, section: "Abstract", score: 9,
  }));
  const problem = [...abstractParts];
  for (const s of take((s) => s.score >= 5 || /first page|首页/i.test(s.section), 3, used)) {
    if (problem.length < 5 && !problem.some((p) => p.text === s.text)) problem.push(s);
  }
  const method = take((s) => s.score >= 3 && METHOD_RE.test(s.text), 5, used);
  const numeric = take((s) => NUM_RE.test(s.text) && s.score >= 3 && /%|\$\d|\d+\s?(?:Hz|ms|kg|mm)/.test(s.text), 5, used);
  const limits = take((s) => LIMIT_RE.test(s.text), 4, used);
  const closing = take((s) => s.page >= Math.max(2, ex.pageCount - 3), 3, used);
  for (const s of closing) if (limits.length < 5 && !limits.includes(s)) limits.push(s);

  const sections = (ex.sections || []).slice(0, 14);
  const figures = (ex.figures || []).slice(0, 6);
  const thumbs = ex.thumbs || new Map();
  const teaser = thumbs.get(1) || null;

  const date = new Date().toISOString().slice(0, 10);
  const meta = {
    id: "auto",
    title: ex.title,
    pdf: ex.url,
    pages: ex.pageCount,
    sourceName,
    generatedAt: date,
    mode: "extractive",
    engine: "PaperWorld 本地解析 · 提取式策展 v1",
    refsInline,
    colophon: `本展由 PaperWorld 在本地浏览器中依据《${sourceName}》自动生成。全部原文语句逐字取自 PDF 文本层并标注页码；策展语为编辑性文字，已单独标注。论文不上传服务器，刷新页面后仍可从本机展览库重新打开。`,
  };

  const halls = [];

  /* ---- 序厅 ---- */
  const stats = [
    { label: "原文页数", value: String(ex.pageCount), sub: "逐页解析文本层" },
    { label: "可溯源展签", value: "—", sub: "点击即可回到原页", dynamic: "evidence" },
    { label: "识别章节", value: String(sections.length), sub: "按版面字号还原" },
    { label: "图表标注", value: String((ex.figures || []).length), sub: "Fig. / Table / Algorithm" },
    { label: "数值线索", value: String((ex.numbers || []).length), sub: "原文中出现的百分比等" },
    { label: "参考文献", value: String(refsInline.length), sub: "按条目切分" },
  ];
  halls.push({
    id: "facade", kind: "facade", num: "00",
    kicker: "EXHIBIT 00 · FACADE 序厅",
    title: ex.title,
    titleZh: "由本地解析引擎自动布展 · 正文全部为原文直引",
    authors: [{ name: (ex.authors || []).length ? ex.authors.join(" · ") : "论文作者", aff: "见原文首页" }],
    venue: `${sourceName} · ${ex.pageCount} 页 · 布展于 ${date}`,
    domain: detectTopics(ex.abstract + " " + ex.title + " " + ex.sentences.slice(0, 40).map((s) => s.text).join(" ")),
    curator: "这是一台「不写新句子」的策展机：它只从你的 PDF 里挑出句子、排好顺序、标上页码。金框里是原文，灰字是策展语——两者在展馆里永远不会混在一起。点任意页码标记，可以直接回到论文原页看高亮。",
    stats,
    figure: teaser ? {
      src: teaser, page: 1,
      caption: (figures[0] ? figures[0].caption : "论文第 1 页版面（由原 PDF 实时渲染）").slice(0, 220),
    } : null,
  });

  /* ---- 01 命题 ---- */
  halls.push({
    id: "question", kind: "narrative", num: "01",
    kicker: "EXHIBIT 01 · THE QUESTION 命题厅",
    title: "这篇论文想回答什么",
    blocks: [
      ed("进门第一间，只放原文本身。以下每句都逐字摘自论文摘要或首页，未经改写、未经翻译；右侧页码标记可回到原页核对。"),
      ...problem.map((s) => vblock(s, "论文原始表述（摘要 / 首页）")),
      { t: "interactive", id: "auto-quotes", title: "随机展签 · 从原文抽一句", engine: "auto" },
    ],
  });

  /* ---- 02 结构 ---- */
  const chapterQuotes = sections.slice(0, 4).map((sec) => {
    const s = take((x) => x.page === sec.page && x.score >= 2, 1, used)[0]
      || take((x) => x.page === sec.page, 1, used)[0];
    return { sec, s };
  }).filter((x) => x.s);
  halls.push({
    id: "structure", kind: "method", num: "02",
    kicker: "EXHIBIT 02 · THE BLUEPRINT 结构厅",
    title: "论文的骨架，与它自己怎么说",
    blocks: [
      ed("先把论文当作一栋建筑：下面是按版面字号还原出的章节顺序。点章节可以直接翻到原文对应页。"),
      { t: "interactive", id: "auto-sections", title: "章节地图 · CHAPTER MAP", engine: "auto" },
      ...chapterQuotes.map(({ sec, s }) => ({ t: "chapter", title: sec.title, page: sec.page, blocks: [vblock(s, `章节「${sec.title.slice(0, 30)}」附近的原文`)] })),
      ...method.slice(0, 3).map((s) => vblock(s, "方法 / 系统描述的原文语句")),
    ],
  });

  /* ---- 03 数据 ---- */
  halls.push({
    id: "bench", kind: "bench", num: "03",
    kicker: "EXHIBIT 03 · THE BENCH 数据台",
    title: "论文里写下的数字",
    blocks: [
      ed("这里只画论文里真的出现过的数。没有报告的取值不会补、不会插值；条形只是把原句里的数字按大小排开。"),
      { t: "interactive", id: "auto-numbers", title: "数值扫描 · NUMBER SCAN", engine: "auto" },
      ...numeric.map((s) => vblock(s, "包含实验数值的原文语句")),
      ed("数值脱离上下文容易被误读，所以每一条数值下面都保留了它所在的完整原句与页码。"),
    ],
  });

  /* ---- 04 图谱 ---- */
  const plates = figures.filter((f) => thumbs.has(f.page)).slice(0, 4).map((f) => ({
    t: "figure", src: thumbs.get(f.page), page: f.page, caption: f.caption.slice(0, 220),
  }));
  halls.push({
    id: "plates", kind: "specimen", num: "04",
    kicker: "EXHIBIT 04 · THE PLATES 图谱厅",
    title: "插图、表格与它们的原文标注",
    blocks: [
      ed("图注是论文自己的话。图像由原 PDF 页面在本地渲染得到；点右上角标记可查看完整原页。"),
      ...(plates.length ? plates : [ed("这篇 PDF 未检测到 Fig./Table 标注，或该页无法渲染缩略图，因此本厅不摆出推测性的插图。")]),
      ...figures.slice(0, 2).map((f) => ({ t: "verbatim", text: f.caption.slice(0, 300), ev: addEv({ text: f.caption.slice(0, 300), page: f.page, section: "Figure caption" }, "原图注（逐字）") })),
    ],
  });

  /* ---- 05 边界 ---- */
  halls.push({
    id: "horizon", kind: "horizon", num: "05",
    kicker: "EXHIBIT 05 · THE HORIZON 边界厅",
    title: "作者承认的难处",
    blocks: [
      ed("一间诚实的展厅要留出「做不到」的位置。以下句子含局限、失败或未来工作信号，由程序筛选后逐字呈现；若原文没有这类表述，宁可少摆几件。"),
      ...(limits.length ? limits.map((s) => vblock(s, "含局限 / 展望信号的原文语句"))
        : [ed("未在 PDF 文本层里检出明确的局限表述。本厅不代作者补写。")]),
    ],
  });

  /* ---- 06 原文库 ---- */
  halls.push({
    id: "archive", kind: "archive", num: "06",
    kicker: "EXHIBIT 06 · THE ARCHIVE 原文库",
    title: "回到纸张本身",
    blocks: [
      ed("最后一间是原文库。每一页都能在这里打开；点开的页面会在证据抽屉里按原尺寸渲染，并尽可能把引文高亮出来。"),
      { t: "interactive", id: "auto-pagemap", title: "原文页图 · PAGE MAP", engine: "auto" },
      refsInline.length
        ? { t: "refwall" }
        : ed("未在文本层检出按 [n] 编号的参考文献条目。"),
    ],
  });

  return {
    schema: "paperworld.blueprint/v1",
    generatedBy: "PaperWorld local extractive curation (verbatim PDF text, no generative rewriting)",
    meta, evidence, halls,
    // 供通用互动装置使用的原始数据（不入库，仅本次会话）
    __raw: { sections, numbers: (ex.numbers || []).slice(0, 60), pageCount: ex.pageCount },
  };
}
