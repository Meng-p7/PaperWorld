/* PaperWorld 2.0 · 论文六维度分析
 *
 * 输入是 extractPdf() 从 PDF 文本层重建出的原文语句，输出是「这篇论文在哪几页、
 * 用哪些原句讲了什么维度」的结构化判断。它是真实的文本分析，不是预设文案：
 * 每个维度收纳的句子都是原文、带页码，句子数由论文实际内容决定，检不出就是 0。
 *
 * 句子只归入得分最高的一个主维度，避免同一句话在多个展区重复展出。
 */

export const DIMENSIONS = [
  {
    id: "background", name: "研究背景", en: "CONTEXT", optional: false,
    form: "quotes",
    rules: [
      [/\b(?:previously|prior work|existing (?:work|systems?|approaches?)|traditional|recent(?:ly)?|has been|have been|well-known|long-standing|state of the art|literature)\b/i, 3],
      [/\b(?:background|motivat\w*|context|setting|field of)\b/i, 2],
    ],
    early: 1.4,
  },
  {
    id: "question", name: "核心问题", en: "QUESTION", optional: false,
    form: "quotes",
    rules: [
      [/\?/, 3.2],
      [/\b(?:difficult|challenge|problem|however|remain|require|bottleneck|obstacle|hard to|need to)\b/i, 2.2],
    ],
    early: 2.2,
  },
  {
    id: "innovation", name: "创新点", en: "CONTRIBUTION", optional: false,
    form: "exhibit",
    rules: [
      [/\b(?:we propose|we present|we introduce|we develop|we design|novel|first|for the first time|our (?:approach|method|system|framework)|contribution|key idea|insight)\b/i, 3.6],
      [/\b(?:instead of|unlike|in contrast to|depart from)\b/i, 1.8],
    ],
    early: 0.8,
  },
  {
    id: "method", name: "技术路线", en: "METHOD", optional: false,
    form: "sections",
    rules: [
      [/\b(?:architecture|algorithm|framework|model|network|transformer|encoder|decoder|loss|training|we train|we use|we design|pipeline|module|objective)\b/i, 3],
      [/\b(?:policy|action chunk|observation|feature|embedding|token)\b/i, 1.4],
    ],
    early: 0,
  },
  {
    id: "experiment", name: "实验过程", en: "EXPERIMENT", optional: false,
    form: "numbers",
    rules: [
      [/\b(?:we evaluate|experiment\w*|setup|dataset|baseline|ablation|trial|episode|seed|evaluation protocol|teleoperation|hardware setup)\b/i, 3],
      [/\b(?:tasks?|demonstration|collected|recorded|subjects?|participants?)\b/i, 1.5],
    ],
    early: 0,
  },
  {
    id: "result", name: "结果与结论", en: "RESULT", optional: false,
    form: "numbers",
    rules: [
      [/\b\d{1,3}(?:\.\d+)?\s?%/, 4],
      [/\b(?:outperform|achieve\w*|improve\w*|success rate|significant|we show|results show|conclude|compared to|surpass)\b/i, 3],
      [/\b(?:table i|table ii|figure \d)\b/i, 1],
    ],
    early: 0,
  },
  {
    id: "limitation", name: "边界与展望", en: "HORIZON", optional: true,
    form: "plain",
    rules: [
      [/\b(?:limitation|future work|fail\w*|cannot|could not|does not|unable|restricted|remains? (?:a|to)|we leave)\b/i, 3.4],
      [/\b(?:however|but|only|difficult to|beyond the scope)\b/i, 1.2],
    ],
    early: 0,
  },
];

const MAX_PER_DIM = 5;

function scoreSentence(s, dim, pageCount) {
  let score = 0;
  const hits = [];
  for (const [re, weight] of dim.rules) {
    if (re.test(s.text)) { score += weight; hits.push(String(re.source).slice(0, 34)); }
  }
  if (dim.early && s.page <= 2) score += dim.early;
  if (/abstract/i.test(s.section || "")) score += 1.2;
  if (s.score) score += Math.min(2, s.score * 0.18); // 复用抽取阶段的信息量评分
  return { score, hits };
}

/* 生成可验证的判定说明：只描述命中信号与页码，不替论文下结论 */
function basis(dim, picked) {
  const signals = [...new Set(picked.flatMap((p) => p.hits))].slice(0, 3);
  const pages = [...new Set(picked.map((p) => p.s.page))].sort((a, b) => a - b);
  const sig = signals.length ? signals.join(" / ") : "版面位置与信息量";
  return `依据原文措辞信号（${sig}）归入本维度；共 ${picked.length} 条逐字摘录，分布在第 ${pages.join("、")} 页。`;
}

export function analyze(ex) {
  const pool = [...(ex.sentences || [])];
  const buckets = new Map(DIMENSIONS.map((d) => [d.id, []]));

  // 先给每句算各维度得分，只投给最高分维度
  for (const s of pool) {
    let best = null;
    for (const dim of DIMENSIONS) {
      const { score, hits } = scoreSentence(s, dim, ex.pageCount);
      if (score < 2.2) continue;
      if (!best || score > best.score) best = { dim, score, hits };
    }
    if (!best) continue;
    buckets.get(best.dim.id).push({ s, score: best.score, hits: best.hits });
  }

  // 摘要里的句子是论文最凝练的自述，优先补进「核心问题」与「创新点」
  const abstract = (ex.abstract || "").replace(/\s+/g, " ");
  const absSentences = abstract.split(/(?<=[.!?])\s+(?=[A-Z“"(])/)
    .map((x) => x.trim()).filter((x) => x.length >= 48 && x.length <= 330 && !/^[a-z(]/.test(x));
  for (const text of absSentences.slice(0, 4)) {
    const s = { text, page: 1, section: "Abstract", score: 9 };
    const dimId = /\?/.test(text) ? "question"
      : /\b(?:we propose|we present|we introduce|novel|our approach)\b|%\b|\d{1,3}\s?%/i.test(text) ? "innovation"
        : "background";
    const b = buckets.get(dimId);
    if (b && !b.some((x) => x.s.text === text)) b.push({ s, score: 9, hits: ["摘要原句"] });
  }

  const dimensions = [];
  for (const dim of DIMENSIONS) {
    const picked = buckets.get(dim.id)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_PER_DIM)
      .sort((a, b) => a.s.page - b.s.page);
    const pages = [...new Set(picked.map((p) => p.s.page))].sort((a, b) => a - b);
    dimensions.push({
      id: dim.id, name: dim.name, en: dim.en, form: dim.form, optional: dim.optional,
      count: picked.length, pages,
      basis: picked.length ? basis(dim, picked) : "未在 PDF 文本层检出该维度的原文依据，本展区不建立。",
      sentences: picked.map((p) => p.s),
      signals: [...new Set(picked.flatMap((p) => p.hits))].slice(0, 4),
    });
  }

  const assigned = dimensions.reduce((n, d) => n + d.count, 0);
  return {
    dimensions,
    coverage: { poolSize: pool.length, assigned, ratio: pool.length ? assigned / pool.length : 0 },
    generatedBy: "PaperWorld local dimension analysis (verbatim sentence classification)",
  };
}
