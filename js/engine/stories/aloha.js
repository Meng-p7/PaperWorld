/* PaperWorld · ALOHA / ACT 首展的科研故事蓝图
 *
 * 四幕结构：为什么这是一个难题 → 研究者如何解决 → 实验结果如何 → 价值与局限。
 * 每一幕的 plain / tech 是「通俗解读 / 技术细节」，属于策展语（界面会标注非原文）；
 * 真正的结论由 quotes 里的原文承担，每个 id 都能在 evidence 表里查到页码与原句。
 * 数字只用论文里出现过的：80–90%、<$20k、50Hz、~80M、88% / 96%、33→20 秒 等。
 */

export const ACT_IDS = ["problem", "solution", "results", "impact"];
export const ACT_TITLES = {
  problem: "为什么这是一个难题",
  solution: "研究者如何解决",
  results: "实验结果如何",
  impact: "价值与局限",
};

export const ALOHA_STORY = {
  meta: {
    source: "curated",
    titleZh: "低成本双臂，如何学会精细操作",
    note: "人工策展的四幕短故事。通俗讲解与技术细节均为非原文；关键结论由可定位到 PDF 页码的原句支撑。",
  },
  acts: [
    {
      id: "problem", n: "ACT 01", title: ACT_TITLES.problem,
      tagline: "拧开一个调料杯盖，机器人为什么做不来",
      plain: "穿扎带、装电池，差几毫米就会失败；能做这些事的设备又往往价格高昂。这篇论文追问：便宜、并不精准的硬件，能不能靠学习完成精细操作？",
      tech: "精细操作要求精度、接触力的细致协调与闭环视觉反馈；主流方案靠高精度机械臂 + 高端传感器做精确状态估计。论文称之为 notoriously difficult，并给出反问：能否用学习让低成本、不精确的硬件完成精细操作。开杯盖需推倒→送入→提起→撬盖四步毫米级动作链。",
      quotes: ["e01", "e05", "e02", "e06"],
      figures: [{ src: "assets/figures/fig1-teaser.png", page: 1, caption: "论文 Fig.1：背驱遥操作现场与精细 / 富接触 / 动态三类代表任务。" }],
      stat: { value: "<$20k", label: "整套系统成本（论文 Fig.1 图注）", ev: "e07" },
    },
    {
      id: "solution", n: "ACT 02", title: ACT_TITLES.solution,
      tagline: "两万美元的双臂装置 + 会「打包动作」的 Transformer",
      plain: "研究者把低成本机械臂、3D 打印件和四台摄像头组成 ALOHA，再让 ACT 一次预测一小段动作，而不是每抖一步才想下一步。硬件示教与动作块，合起来抑制误差累积。",
      tech: "ALOHA：主臂背驱从动臂，ViperX 精度 5–8mm，橡皮筋配平 + handle-and-scissor 降低操作阻力，四路 C922 相机 480×640，遥操作与记录同 50Hz。ACT：观测 = 4 路 RGB + 14 维关节，动作 = 14 维绝对关节位置；ResNet18 提特征 + Transformer 编码解码，以条件 VAE 训练、L1 重建；action chunking 每步查询但输出 k 步重叠动作块，把有效 horizon 缩短 k 倍缓解误差累积；约 80M 参数每任务从头训练。",
      quotes: ["e20", "e21", "e29", "e11", "e12", "e65"],
      figures: [
        { src: "assets/figures/fig3-hardware.png", page: 3, caption: "论文 Fig.3：ALOHA 硬件——背驱遥操作、3D 打印夹爪与配平、四路相机。" },
        { src: "assets/figures/fig4-act-arch.png", page: 4, caption: "论文 Fig.4：ACT 架构（CVAE 编码器训练期用、测试期丢弃）。" },
      ],
      stat: { value: "~80M", label: "模型参数（每任务从头训练）", ev: "e65" },
      interact: "chunking",
    },
    {
      id: "results", n: "ACT 03", title: ACT_TITLES.results,
      tagline: "六个真实任务，八成到九成成功率",
      plain: "六个真实任务的成功率大多达到八至九成。消融实验进一步显示：去掉动作块，或抹平示教中的自然差异，成绩会明显下降——提升并非只来自更大的模型。",
      tech: "真实任务 Slide Ziploc 88%、Slot Battery 96%；仿真相对基线领先 59/49/29/20 个百分点。消融：k 从 1→100 成功率 1%→44%；时间集成 +3.3~4%；去掉 CVAE 人类数据 35.3%→2%。用户研究：5Hz 比 50Hz 慢 62%（p<0.001）。完整表格与超参见完整资料 / 深入阅读。",
      quotes: ["e03", "e82", "e85", "e91"],
      figures: [
        { src: "assets/figures/fig6-real-tasks.png", page: 7, caption: "论文 Fig.6：六个真实任务与子任务分解。" },
        { src: "assets/figures/fig8-ablations.png", page: 10, caption: "论文 Fig.8：chunk size / 时间集成 / CVAE / 控制频率消融。" },
      ],
      stat: { value: "88% / 96%", label: "Slide Ziploc / Slot Battery 成功率", ev: "e82" },
      interact: "results",
    },
    {
      id: "impact", n: "ACT 04", title: ACT_TITLES.impact,
      tagline: "把精细操作放出来，也老实承认做不到的事",
      plain: "它用两万美元复现了高价系统的大部分技能，但作者也明确写下失败：剥糖纸、抓起平放的自封袋仍做不到。低成本让研究更可复现，也留下了真实的硬件边界。",
      tech: "ALOHA 本体约 1.8 万、含相机约 2 万美元，复现 Shadow 系统 15 个演示任务中的 14 个（唯一失败：保定球手内旋转）。硬件边界：多指协同 / 较大力 / 指甲类任务受限于电机扭矩。未来方向：预训练、更多数据、更好感知。",
      quotes: ["e103", "e104", "e114", "e117"],
      figures: [{ src: "assets/figures/fig9-teleop-gallery.png", page: 15, caption: "论文附录遥操作技能墙：翻书、开袋、分杯、插内存、撕茶包等。" }],
      stat: { value: "14 / 15", label: "复现 Shadow 系统演示任务数", ev: "e104" },
    },
  ],
};

/* 旧五幕 → 新四幕 归一（兼容已保存的蓝图 / 旧 AI 输出）。 */
export function normalizeActs(acts) {
  if (!Array.isArray(acts) || !acts.length) return [];
  const map = { why: "problem", idea: "solution", how: "solution", result: "results", meaning: "impact" };
  const buckets = new Map(ACT_IDS.map((id) => [id, []]));
  for (const a of acts) {
    const id = ACT_IDS.includes(a.id) ? a.id : map[a.id];
    if (!id) continue;
    buckets.get(id).push(a);
  }
  const out = [];
  ACT_IDS.forEach((id, i) => {
    const group = buckets.get(id);
    if (!group.length) return;
    out.push({
      id, n: `ACT 0${i + 1}`, title: ACT_TITLES[id],
      tagline: group[0].tagline || group[0].title || ACT_TITLES[id],
      plain: group.map((g) => g.plain).filter(Boolean).join(" "),
      tech: group.map((g) => g.tech).filter(Boolean).join(" "),
      quotes: [...new Set(group.flatMap((g) => g.quotes || []))].slice(0, 6),
      figures: group.flatMap((g) => g.figures || (g.figure ? [g.figure] : [])).slice(0, 2),
      stat: group.find((g) => g.stat)?.stat || null,
      interact: group.find((g) => g.interact)?.interact || null,
    });
  });
  return out;
}

/* 自动展的本地简版故事：只用蓝图里已有的维度与证据，绝不编造新事实。
 * plain/tech 全部是可验证元信息 + 引导语，结论由 quotes 的原文承担。 */
export function buildLocalStory(bp) {
  const dims = bp.meta?.analysis?.dimensions || [];
  const byId = new Map(dims.map((d) => [d.id, d]));
  const focus = bp.meta?.analysis?.focus || null;
  const typeLabel = bp.meta?.analysis?.type?.label || "研究";
  const pick = (id, n = 3) => (byId.get(id)?.quoteIds || []).slice(0, n);
  const range = (ids) => {
    const pages = ids.map((id) => bp.evidence?.[id]?.page).filter(Boolean);
    return pages.length ? `第 ${Math.min(...pages)}–${Math.max(...pages)} 页` : "未检出";
  };

  const spec = [
    { id: "problem", dimIds: ["background", "question"] },
    { id: "solution", dimIds: ["innovation", "method"] },
    { id: "results", dimIds: ["result", "experiment"] },
    { id: "impact", dimIds: ["limitation"] },
  ];

  const acts = spec.map((s, i) => {
    const ids = s.dimIds.flatMap((d) => pick(d, 2)).slice(0, 4);
    const count = s.dimIds.reduce((n, d) => n + (byId.get(d)?.count || 0), 0);
    const title = focus?.titles?.[s.id] || ACT_TITLES[s.id];
    const cue = focus?.cues?.[s.id] || ACT_TITLES[s.id];
    const has = ids.length > 0;
    return {
      id: s.id, n: `ACT 0${i + 1}`, title,
      tagline: cue,
      plain: has
        ? `这一幕看${typeLabel}论文的「${cue}」。本机从原文里找到 ${count} 条可核对依据，主要在${range(ids)}。下面先给原句，读懂它再决定要不要展开技术细节。`
        : `本幕没有检出足以支撑「${cue}」的原文依据，因此不生成结论。可以到完整档案逐页核对；接入模型后，模型也只能使用已抽取的原文。`,
      tech: has
        ? `对应维度：${s.dimIds.map((d) => byId.get(d)?.name || d).join(" / ")}。识别信号：${(s.dimIds.flatMap((d) => byId.get(d)?.signals || []).slice(0, 4).join(" / ")) || "版面位置与信息量"}。这里只描述原文如何被归类，不替论文补充结论。`
        : "",
      quotes: ids, figures: [], stat: null,
    };
  });

  return {
    acts,
    meta: {
      source: "local",
      titleZh: `一篇${typeLabel}论文，四幕读完`,
      note: `本地类型分析 · 共 ${acts.reduce((n, a) => n + a.quotes.length, 0)} 条原文引用。在设置里接入模型后可生成更连贯的叙事。`,
    },
  };
}

/* 全站共享的唯一故事模型：空间站与 story.html 必须读取同一份四幕数据。
 * 旧蓝图可能只有五幕或缺少某一幕；统一归并并补齐四幕，缺证据时明确写“未检出”，不编内容。 */
export function ensureFourActs(acts, focus = null) {
  const byId = new Map((Array.isArray(acts) ? acts : []).map((a) => [a.id, a]));
  return ACT_IDS.map((id, i) => byId.get(id) || {
    id, n: `ACT 0${i + 1}`,
    title: focus?.titles?.[id] || ACT_TITLES[id],
    tagline: focus?.cues?.[id] || ACT_TITLES[id],
    plain: "本幕暂未检出足够的原文依据。可以打开完整资料，回到论文原文继续查看。",
    tech: "", quotes: [], figures: [], stat: null, interact: null,
  });
}

/* 自动展的故事本身不编图。这里只把蓝图里已有的论文插图 / 原页渲染图
 * 分配给没有配图的幕，确保「多用论文图片」仍然来自真实材料。 */
function collectStoryFigures(bp) {
  const seen = new Set();
  const out = [];
  for (const h of bp.halls || []) {
    for (const b of h.blocks || []) {
      if (b.t !== "figure" || !b.src || seen.has(b.src)) continue;
      seen.add(b.src);
      out.push({ src: b.src, page: b.page, caption: (b.caption || "").slice(0, 220) });
    }
  }
  return out.slice(0, 4);
}

export function resolveStory(bp) {
  let story;
  if (bp.story && Array.isArray(bp.story.acts) && bp.story.acts.length) {
    story = { ...bp.story, acts: normalizeActs(bp.story.acts), source: "blueprint" };
  } else if (bp.meta?.id === "aloha-act-2023") {
    story = { ...ALOHA_STORY, source: "curated" };
  } else {
    story = buildLocalStory(bp);
  }
  const focus = bp.meta?.analysis?.focus || null;
  const acts = ensureFourActs(story.acts, focus);
  const pool = collectStoryFigures(bp);
  acts.forEach((a, i) => {
    if (!(a.figures || []).length && pool[i]) a.figures = [pool[i]];
  });
  return { ...story, acts };
}
