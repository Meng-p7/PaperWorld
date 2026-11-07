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
  acts: [
    {
      id: "problem", n: "ACT 01", title: ACT_TITLES.problem,
      tagline: "拧开一个调料杯盖，机器人为什么做不来",
      plain: "穿一根扎带、把电池推进卡槽，人要指尖精度、手上力道、眼睛盯着随时修正；差几毫米就失败。而能做这件事的设备，往往几十万美元起。论文问：能不能让便宜、不准的硬件也学会？",
      tech: "精细操作要求精度、接触力的细致协调与闭环视觉反馈；主流方案靠高精度机械臂 + 高端传感器做精确状态估计。论文称之为 notoriously difficult，并给出反问：能否用学习让低成本、不精确的硬件完成精细操作。开杯盖需推倒→送入→提起→撬盖四步毫米级动作链。",
      quotes: ["e01", "e05", "e02", "e06"],
      figures: [{ src: "assets/figures/fig1-teaser.png", page: 1, caption: "论文 Fig.1：背驱遥操作现场与精细 / 富接触 / 动态三类代表任务。" }],
      stat: { value: "<$20k", label: "整套系统成本（论文 Fig.1 图注）", ev: "e07" },
    },
    {
      id: "solution", n: "ACT 02", title: ACT_TITLES.solution,
      tagline: "两万美元的双臂装置 + 会「打包动作」的 Transformer",
      plain: "硬件上用便宜机械臂加 3D 打印件、四台摄像头，人手把着小臂带大臂示教；软件上让机器人看四路画面，一次输出一小段动作（动作块），而不是抖一步算一步。整套一台显卡就能训。",
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
      plain: "开杯盖、装电池、拉自封袋、穿扎带、贴胶带、穿鞋——六个真实任务成功率大多八到九成，明显好于常见方法。把动作块关掉、或抹平示教里的不一致，成绩立刻垮掉：说明这两样真的在起作用。",
      tech: "真实任务 Slide Ziploc 88%、Slot Battery 96%；仿真相对基线领先 59/49/29/20 个百分点。消融：k 从 1→100 成功率 1%→44%；时间集成 +3.3~4%；去掉 CVAE 人类数据 35.3%→2%。用户研究：5Hz 比 50Hz 慢 62%（p<0.001）。完整表格与超参见完整展馆 / 深入阅读。",
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
      plain: "最有意思的不是它多强，而是多便宜：两万美元复现了贵十几倍系统的大部分技能。作者也写明两个学不会的任务——剥糖纸、抓平放的自封袋；需要多指、大力、指甲的动作仍受限于低成本电机。",
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
  const plan = bp.meta?.plan || [];
  const byId = new Map(dims.map((d) => [d.id, d]));
  const pick = (id, n = 3) => (byId.get(id)?.quoteIds || []).slice(0, n);
  const range = (ids) => {
    const pages = ids.map((id) => bp.evidence?.[id]?.page).filter(Boolean);
    return pages.length ? `第 ${Math.min(...pages)}–${Math.max(...pages)} 页` : "未检出";
  };
  const pagesOf = (ids) => ids.map((id) => bp.evidence?.[id]?.page).filter(Boolean);

  const spec = [
    { id: "problem", dimIds: ["background", "question"], tagline: "这篇论文想解决什么问题" },
    { id: "solution", dimIds: ["innovation", "method"], tagline: "作者提出了什么不一样的做法" },
    { id: "results", dimIds: ["result", "experiment"], tagline: "实验与结论" },
    { id: "impact", dimIds: ["limitation"], tagline: "边界与值得继续看的地方" },
  ];

  const acts = spec.map((s, i) => {
    const ids = s.dimIds.flatMap((d) => pick(d, 2)).slice(0, 4);
    const count = s.dimIds.reduce((n, d) => n + (byId.get(d)?.count || 0), 0);
    return {
      id: s.id, n: `ACT 0${i + 1}`, title: ACT_TITLES[s.id], tagline: s.tagline,
      plain: `这一幕由六维度分析自动归入 ${count} 条原文依据，分布在${range(ids)}。下面每句都是 PDF 原文直引、未经改写，点页码可以回到原页核对。`,
      tech: `对应维度：${s.dimIds.map((d) => byId.get(d)?.name || d).join(" / ")}。识别到的原文措辞信号：${(s.dimIds.flatMap((d) => byId.get(d)?.signals || []).slice(0, 4).join(" / ")) || "版面位置与信息量"}。`,
      quotes: ids,
      figures: [],
      stat: null,
    };
  }).filter((a) => a.quotes.length);

  return {
    acts,
    meta: {
      source: "local",
      note: `本故事由本地六维度分析按四幕组装，共 ${acts.reduce((n, a) => n + a.quotes.length, 0)} 条原文引用；接入 AI Core 后可生成更连贯的叙事。`,
    },
  };
}
