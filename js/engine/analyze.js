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

/* ---------------- 论文类型与四幕侧重 ----------------
 * 四幕主线不变，但不同类型论文的四幕关注点、标题与讲解重点应不同。
 * 这里只做“论文类型 → 叙事侧重”的映射，不生成任何论文事实。
 */
export const STORY_FOCUS = {
  robotics: {
    label: "机器人 / 具身系统",
    titles: { problem: "机器人为什么做不好这件事", solution: "硬件和算法怎样配合", results: "真实任务上做到了什么", impact: "能复现吗，边界在哪" },
    cues: { problem: "机器人难题与失败模式", solution: "硬件、算法与系统设计", results: "真实任务、实验数据与消融", impact: "成本、可复现性与仍做不到的事" },
  },
  algorithm: {
    label: "算法 / 机器学习",
    titles: { problem: "现有方法卡在哪里", solution: "方法的关键改动", results: "它在哪些基准上有效", impact: "代价、适用边界与下一步" },
    cues: { problem: "现有方法的瓶颈", solution: "模型、训练与推理设计", results: "基准、对比与消融", impact: "资源代价、适用条件与未解决问题" },
  },
  mechanical: {
    label: "机械 / 结构设计",
    titles: { problem: "设计上真正难的是什么", solution: "结构怎样被设计出来", results: "做出来表现如何", impact: "能不能制造、装进真实场景" },
    cues: { problem: "设计矛盾与工程约束", solution: "机构、结构、材料与制造", results: "样机测试、性能与可靠性", impact: "制造、成本与部署边界" },
  },
  materials: {
    label: "材料 / 化学",
    titles: { problem: "性能上的矛盾在哪里", solution: "成分与工艺怎么设计", results: "实测到了什么", impact: "离应用还差什么" },
    cues: { problem: "性能目标与现有材料瓶颈", solution: "成分、结构、合成与工艺", results: "表征、性能与稳定性", impact: "规模化、成本与应用条件" },
  },
  theory: {
    label: "理论 / 数学",
    titles: { problem: "要刻画或证明什么", solution: "证明路线是什么", results: "得到了什么结论", impact: "假设、适用范围与开放问题" },
    cues: { problem: "理论问题与已有边界", solution: "假设、定义与证明路线", results: "定理、界与推论", impact: "假设限制与未解决问题" },
  },
  review: {
    label: "综述 / 调研",
    titles: { problem: "这个领域为什么需要重新梳理", solution: "综述怎样组织文献", results: "证据呈现了哪些共识与分歧", impact: "空白与下一步" },
    cues: { problem: "领域分歧与研究缺口", solution: "分类框架与文献组织方式", results: "代表性证据、共识与冲突", impact: "研究空白与未来方向" },
  },
  benchmark: {
    label: "数据集 / 评测",
    titles: { problem: "现有评测缺什么", solution: "基准怎样被构造", results: "模型表现如何", impact: "这套评测能说明什么" },
    cues: { problem: "评测缺口与现有基准问题", solution: "数据、任务与评价协议", results: "基线、对比与误差分析", impact: "覆盖范围、偏差与使用边界" },
  },
  empirical: {
    label: "实验研究",
    titles: { problem: "研究问题是什么", solution: "研究怎样被设计", results: "观察到了什么", impact: "结论能推广到哪里" },
    cues: { problem: "研究问题与既有认识", solution: "实验、样本与方法", results: "主要发现与稳健性", impact: "外部效度、限制与后续研究" },
  },
};

const TYPE_RULES = [
  ["review", /(?:\bsurvey\b|\breview\b|\boverview\b|\btaxonomy\b|systematic literature|literature review|综述|研究进展|文献综述)/i, 5],
  ["theory", /(?:\btheorem\b|\bproof\b|\blemma\b|\bcorollary\b|\bconvergence\b|\bguarantee\b|\boptimality\b|\blower bound\b|\bupper bound\b|定理|证明|收敛|上界|下界)/i, 3.2],
  ["materials", /(?:\bmaterial\b|\balloy\b|\bpolymer\b|\bcomposite\b|\bceramic\b|\bsynthesis\b|\bmicrostructure\b|\bcharacterization\b|mechanical properties|材料|合金|聚合物|复合材料|微观结构|表征)/i, 3],
  ["mechanical", /(?:\bmechanism\b|\bkinematic\b|\bstructural design\b|finite element|\bmanufactur\b|\bprototype\b|\bactuator\b|\bgear\b|机构|有限元|结构设计|制造|样机|传动)/i, 2.7],
  ["robotics", /(?:\brobot\b|\bmanipulat\b|\bgripper\b|\bteleoperat\b|\bembodied\b|\blocomotion\b|\bhumanoid\b|\bquadruped\b|机器人|机械臂|夹爪|遥操作|具身|运动控制)/i, 3.2],
  ["benchmark", /(?:\bbenchmark\b|\bleaderboard\b|\bevaluation suite\b|\bdataset\b|基准测试|数据集|评测)/i, 2.5],
  ["algorithm", /(?:\balgorithm\b|\bmodel\b|\blearning\b|\btransformer\b|\boptimization\b|\bneural\b|\bpolicy\b|算法|模型|学习|优化|神经网络)/i, 1.5],
];

export function detectPaperType(ex) {
  const text = [ex.title, ex.abstract, ...(ex.sentences || []).slice(0, 60).map((s) => s.text)]
    .filter(Boolean).join(" ");
  const scores = TYPE_RULES.map(([id, re, w]) => {
    const hits = (text.match(new RegExp(re.source, "gi")) || []).length;
    return { id, score: Math.min(12, hits * w), hits };
  }).sort((a, b) => b.score - a.score);
  const top = scores[0];
  const second = scores[1];
  const type = top && top.score >= 2.4 ? top.id : "empirical";
  const profile = STORY_FOCUS[type] || STORY_FOCUS.empirical;
  return {
    id: type,
    label: profile.label,
    confidence: top && top.score ? Math.min(1, top.score / 12) : 0,
    signal: top && top.score ? `${top.hits} 个类型信号` : "按通用实验研究组织",
    runnerUp: second && second.score >= 2 ? (STORY_FOCUS[second.id]?.label || second.id) : null,
  };
}

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
  const type = detectPaperType(ex);
  return {
    dimensions,
    type,
    focus: STORY_FOCUS[type.id] || STORY_FOCUS.empirical,
    coverage: { poolSize: pool.length, assigned, ratio: pool.length ? assigned / pool.length : 0 },
    generatedBy: "PaperWorld local dimension analysis (verbatim sentence classification)",
  };
}
