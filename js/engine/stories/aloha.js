/* PaperWorld · ALOHA / ACT 首展的科研故事蓝图
 *
 * 五幕结构：为什么研究 → 有趣的想法 → 怎么做 → 效果如何 → 有什么意义。
 * 每一幕的 plain / tech 是「通俗解读 / 技术细节」，属于策展语（界面会标注非原文）；
 * 真正的结论由 quotes 里的原文承担，每个 id 都能在 evidence 表里查到页码与原句。
 * 数字只用论文里出现过的：80–90%、<$20k、50Hz、~80M、88% / 96%、33→20 秒 等。
 */

export const ALOHA_STORY = {
  acts: [
    {
      id: "why", n: "ACT 01", title: "为什么研究",
      tagline: "拧开一个调料杯盖，为什么机器人做不来",
      plain: "人类觉得「顺手」的动作，对机器人是噩梦。穿一根扎带、把电池推进卡槽，都要指尖精度、手上力道、眼睛盯着随时修正。差几毫米就失败。而市面上能做这件事的设备，价格是几十万美元起。",
      tech: "精细操作要求精度、接触力的细致协调与闭环视觉反馈；主流方案靠高精度机械臂 + 高端传感器做精确状态估计。论文把它称作 notoriously difficult，并给出一个反问：能否用学习，让便宜、不准的硬件也能做。",
      quotes: ["e01", "e05", "e04", "e06", "e02"],
      figure: { src: "assets/figures/fig1-teaser.png", page: 1, caption: "论文 Fig.1：左侧是背驱遥操作现场，右侧是精细、富接触、动态三类代表性任务。" },
      stat: { value: "<$20k", label: "整套系统成本（论文 Fig.1 图注）", ev: "e07" },
      form: "hero",
    },
    {
      id: "idea", n: "ACT 02", title: "有趣的想法",
      tagline: "不给世界建模，改学一个「会反应」的策略",
      plain: "他们的想法有点反直觉：与其把杯子、盖子、摩擦力全都算清楚，不如让机器人像人一样「上手就试」。而且一次别只学一步动作——把一串动作打包成一个「动作块」，像心理学里说的 chunk 那样一次做出来。",
      tech: "关键洞察是闭环策略比精确环境建模更简单：策略可以对杯子与盖子的当前状态即时反应。动作上采用 action chunking——每步查询策略但一次输出 k 步动作、相互重叠，把任务的有效 horizon 缩短 k 倍以缓解误差累积。",
      quotes: ["e08", "e11", "e12", "e13", "e14"],
      figure: { src: "assets/figures/fig5-chunking.png", page: 5, caption: "论文 Fig.5：action chunking 与 temporal ensemble。每步查策略、chunk 重叠、按新旧加权平均。" },
      stat: { value: "50 条", label: "每任务示教轨迹（约 10 分钟）", ev: "e13" },
      form: "timeline",
      interact: "chunking",
    },
    {
      id: "how", n: "ACT 03", title: "怎么做",
      tagline: "一台两万美元的双臂装置，加一个会打包动作的 Transformer",
      plain: "硬件上，他们用便宜的机械臂加 3D 打印件，再配四台摄像头；软件上，机器人看四路画面和自己的关节位置，学会一次输出一小段动作。整套东西一台显卡就能训，单个动作 0.01 秒就算出来。",
      tech: "ALOHA：主臂背驱从动臂，ViperX 从动臂精度 5–8mm，橡皮筋配平与 handle-and-scissor 机构降低操作阻力，四路 C922 相机 480×640，遥操作与记录同为 50Hz。ACT：观测 = 4 路 RGB + 14 维关节，动作为 14 维绝对关节位置，ResNet18 提特征、Transformer 编码解码、以条件 VAE 训练，L1 重建损失，约 80M 参数每任务从头训练。",
      quotes: ["e20", "e21", "e26", "e29", "e53", "e60", "e65", "e66"],
      figure: { src: "assets/figures/fig3-hardware.png", page: 3, caption: "论文 Fig.3：ALOHA 硬件——背驱遥操作、3D 打印夹爪与配平机构、四路相机。" },
      stat: { value: "~80M", label: "模型参数（每任务从头训练）", ev: "e65" },
      form: "compare",
      interact: "chunking",
    },
    {
      id: "result", n: "ACT 04", title: "效果如何",
      tagline: "六个真实任务、八成到九成成功率",
      plain: "开杯盖、装电池、拉自封袋、穿扎带、贴胶带、穿鞋……在六个真实任务上，成功率大多在八成到九成。和几个常见方法比，优势不是一点半点。把动作块关掉、把示教里的「不一致」抹平掉，成绩立刻垮掉——说明这两样东西真的在起作用。",
      tech: "真实任务中 Slide Ziploc 88%、Slot Battery 96%；仿真任务相对基线领先 59/49/29/20 个百分点。消融显示 k 从 1 增到 100 成功率由 1% 升到 44%，时间集成带来 +3.3~4% 增益，去掉 CVAE 则人类数据 35.3% 跌到 2%。用户研究：5Hz 遥操作比 50Hz 慢 62%（p < 0.001）。",
      quotes: ["e03", "e82", "e80", "e81", "e85", "e90", "e91", "e92", "e95"],
      figure: { src: "assets/figures/fig6-real-tasks.png", page: 2, caption: "论文 Fig.6：真实任务与遥操作示教现场。" },
      stat: { value: "88% / 96%", label: "Slide Ziploc / Slot Battery 成功率", ev: "e82" },
      form: "stat",
      interact: "results",
    },
    {
      id: "meaning", n: "ACT 05", title: "有什么意义",
      tagline: "把精细操作从少数实验室里放出来",
      plain: "最有意思的不是它有多强，而是它有多便宜、以及它承认自己做不了什么。一套两万美元的设备，能复现另一套贵十几倍系统里的大部分技能。作者也老实写了两个学不会的任务：剥糖纸、抓平放的自封袋。",
      tech: "ALOHA 本体约 1.8 万美元、含相机约 2 万，复现了 Shadow 系统 15 个演示任务中的 14 个（唯一失败是保定球手内旋转）。硬件边界：需要多指协同、需要较大力、需要指甲的任务受限于低成本电机扭矩。未来方向：预训练、更多数据、更好的感知。",
      quotes: ["e103", "e104", "e44", "e110", "e114", "e116", "e117"],
      figure: { src: "assets/figures/fig9-teleop-gallery.png", page: 2, caption: "论文附录中的遥操作技能墙：翻书页、开自封袋、分杯子、插内存条、撕茶包。" },
      stat: { value: "14 / 15", label: "复现 Shadow 系统演示任务数", ev: "e104" },
      form: "wall",
    },
  ],
};

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
    { id: "why", n: "ACT 01", title: "为什么研究", dimIds: ["background", "question"], tagline: "这篇论文想解决什么问题" },
    { id: "idea", n: "ACT 02", title: "有趣的想法", dimIds: ["innovation"], tagline: "作者提出了什么不一样的做法" },
    { id: "how", n: "ACT 03", title: "怎么做", dimIds: ["method"], tagline: "技术路线与实现方式" },
    { id: "result", n: "ACT 04", title: "效果如何", dimIds: ["result", "experiment"], tagline: "实验与结论" },
    { id: "meaning", n: "ACT 05", title: "有什么意义", dimIds: ["limitation"], tagline: "边界与值得继续看的地方" },
  ];

  const acts = spec.map((s) => {
    const ids = s.dimIds.flatMap((d) => pick(d, 3)).slice(0, 4);
    const count = s.dimIds.reduce((n, d) => n + (byId.get(d)?.count || 0), 0);
    return {
      id: s.id, n: s.n, title: s.title, tagline: s.tagline,
      plain: `这一幕由六维度分析自动归入 ${count} 条原文依据，分布在${range(ids)}。下面每句都是 PDF 原文直引、未经改写，点页码可以回到原页核对。`,
      tech: `对应维度：${s.dimIds.map((d) => byId.get(d)?.name || d).join(" / ")}。识别到的原文措辞信号：${(s.dimIds.flatMap((d) => byId.get(d)?.signals || []).slice(0, 4).join(" / ")) || "版面位置与信息量"}。`,
      quotes: ids,
      figure: null,
      stat: null,
      form: "hero",
    };
  }).filter((a) => a.quotes.length);

  return {
    acts,
    meta: {
      source: "local",
      note: `本故事由本地六维度分析组装，共 ${acts.reduce((n, a) => n + a.quotes.length, 0)} 条原文引用；接入 AI Core 后可生成更连贯的叙事。`,
    },
  };
}
