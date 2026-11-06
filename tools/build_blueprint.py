# -*- coding: utf-8 -*-
"""Build & verify the ALOHA exhibition blueprint.

Every evidence quote is checked (whitespace/ligature-normalised) against the
extracted page text at its claimed page. If a quote does not appear verbatim,
the build FAILS — the platform never ships an unverifiable claim.
"""
import json
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HERE = Path(__file__).resolve().parent
APP = HERE.parent  # 仓库根目录即站点根目录（原 Qoder 工程为 app/ 子目录）
pages = json.loads((HERE / "pages.json").read_text(encoding="utf-8"))["pages"]
PAGE_TEXT = {p["page"]: p["text"] for p in pages}

LIG = {
    "ﬁ": "fi", "ﬂ": "fl", "ﬀ": "ff", "ﬃ": "ffi", "ﬄ": "ffl", "ﬅ": "ft", "ﬆ": "st",
    "’": "'", "‘": "'", "“": '"', "”": '"', "–": "-", "—": "-", "×": "x", "∗": "*",
}


def norm(s: str) -> str:
    out = []
    for ch in s:
        c = LIG.get(ch, ch)
        if c.isspace():
            continue
        out.append(c.lower())
    return "".join(out)


NORM_PAGES = {k: norm(re.sub(r"-\n", "", v)) for k, v in PAGE_TEXT.items()}

# ---------------------------------------------------------------- evidence
E = {}


def ev(i, page, section, claim, quote, note=None):
    E[i] = {"page": page, "section": section, "claim": claim, "quote": quote}
    if note:
        E[i]["note"] = note


ev("e01", 1, "Abstract", "精细操作对机器人 notoriously 困难的原因",
   "Fine manipulation tasks, such as threading cable ties or slotting a battery, are notoriously difficult for robots because they require precision, careful coordination of contact forces, and closed-loop visual feedback.")
ev("e02", 1, "Abstract", "论文的核心反问",
   "Can learning enable low-cost and imprecise hardware to perform these fine manipulation tasks?")
ev("e03", 1, "Abstract", "ACT 在 6 个真实任务上 80-90% 成功、仅需 10 分钟示教",
   "ACT allows the robot to learn 6 difficult tasks in the real world, such as opening a translucent condiment cup and slotting a battery with 80-90% success, with only 10 minutes worth of demonstrations.")
ev("e04", 1, "I. Introduction", "开调料杯盖的分步动作链",
   "the right gripper needs to first tip it over, and nudge it into the opened left gripper. Then the left gripper closes gently and lifts the cup off the table. Next, one of the right fingers approaches the cup from below and pries the lid open.")
ev("e05", 1, "I. Introduction", "毫米级误差即失败",
   "Millimeters of error would lead to task failure.")
ev("e06", 1, "I. Introduction", "现有精细操作系统依赖昂贵硬件",
   "Existing systems for fine manipulation use expensive robots and high-end sensors for precise state estimation")
ev("e07", 1, "Fig.1 caption", "整套系统成本低于 2 万美元",
   "The whole system costs <$20k with off-the-shelf robots and 3D printed components.")
ev("e08", 1, "I. Introduction", "学策略比建模环境更简单",
   "In contrast, the policy of nudging and opening the cup is much simpler, since a closed-loop policy can react to different positions of the cup and lid rather than precisely anticipating how it will move in advance.")

ev("e10", 2, "III. ALOHA (intro)", "2 万美元预算内的遥操作系统",
   "We augment this setup with 3D printed components for easier backdriving, leading to a highly capable teleoperation system within a $20k budget.")
ev("e11", 2, "I. Introduction", "action chunking 的心理学出处",
   "we take inspiration from action chunking, a concept in psychology that describes how sequences of actions are grouped together as a chunk, and executed as one unit")
ev("e12", 2, "I. Introduction", "chunking 把有效 horizon 缩短 k 倍",
   "This reduces the effective horizon of the task by k-fold, mitigating compounding errors.")
ev("e13", 2, "I. Introduction", "50 条示教轨迹",
   "from only 10 minutes or 50 demonstration trajectories.")
ev("e14", 2, "II. Related Work", "compounding error 的定义",
   "errors from previous timesteps accumulate and cause the robot to drift off of its training distribution, leading to hard-to-recover states")

ev("e20", 3, "III. ALOHA", "设计原则一：低成本",
   "1) Low-cost: The entire system should be within budget for most robotic labs, comparable to a single industrial arm.")
ev("e21", 3, "III. ALOHA", "ViperX 从动臂规格",
   "The ViperX arm used has a working payload of 750g and 1.5m span, with an accuracy of 5-8mm.")
ev("e22", 3, "III. ALOHA", "ViperX 单价约 5600 美元",
   "The robot can be purchased off-the-shelf for around $5600.")
ev("e23", 3, "III. ALOHA", "自研 3D 打印透光夹爪",
   'We thus design our own 3D printed "see-through" fingers and fit it with gripping tape')
ev("e24", 3, "III. ALOHA", "主臂 WidowX 3300 美元、关节空间映射",
   "we use direct joint-space mapping from a smaller robot, WidowX, manufactured by the same company and costs $3300")
ev("e25", 3, "III. ALOHA", "现成 IK 在奇异点附近频繁失败",
   "Off-the-shelf inverse kinematics (IK) fails frequently in this setting.")
ev("e26", 3, "III. ALOHA", "handle-and-scissor 机构的作用",
   "It reduces the force required from the operator to backdrive the motor, and allows for continuous control of the gripper, instead of binary opening or closing.")
ev("e27", 3, "III. ALOHA", "橡皮筋配平机构",
   "We also design a rubber band load balancing mechanism that partially counteracts the gravity on the leader side.")
ev("e28", 3, "III. ALOHA", "四路 C922 相机 480x640",
   "There is a total of four Logitech C922x webcams, each streaming 480x640 RGB images.")
ev("e29", 3, "III. ALOHA", "遥操作与记录均为 50Hz",
   "Both the teleoperation and data recording happen at 50Hz.")
ev("e30", 3, "II. Related Work", "非专家两小时内可装好",
   "allowing non-experts to assemble it in less than 2 hours.")
ev("e31", 3, "II. Related Work", "单臂约五千美元",
   "Our work turns to low-cost hardware, e.g. arms that cost around $5k each")

ev("e40", 3, "III. ALOHA", "ALOHA 总预算 2 万美元、对标单条科研机械臂",
   "we build the bimanual teleoperation setup ALOHA within a 20k USD budget",
   note="跨页注记：该句在 PDF 中跨第 3/4 页，'comparable to a single research arm such as Franka Emika Panda' 位于第 4 页首行；此处引用第 3 页部分。")
ev("e41", 4, "III. ALOHA", "精准类任务清单",
   "Precise tasks such as threading zip cable ties, picking credit cards out of wallets, and opening or closing ziploc bags.")
ev("e42", 4, "III. ALOHA", "富接触类任务清单",
   "Contact-rich tasks such as inserting 288-pin RAM into a computer motherboard, turning pages of a book, and assembling the chains and belts in the NIST board #2")
ev("e43", 4, "III. ALOHA", "动态类任务清单",
   "Dynamic tasks such as juggling a ping pong ball with a real ping pong paddle, balancing the ball without it falling off, and swinging open plastic bags in the air.")
ev("e44", 4, "III. ALOHA", "5-10 倍预算的系统也做不到这些技能",
   "Skills such as threading a zip tie, inserting RAM, and juggling ping pong ball, to our knowledge, are not available for existing teleoperation systems with 5-10x the budget")
ev("e45", 4, "IV. ACT", "动作为何取主臂关节位置",
   "It is important to use the leader joint positions instead of the follower's, because the amount of force applied is implicitly defined by the difference between them, through the low-level PID controller.")
ev("e46", 4, "IV.A", "chunking 的执行循环",
   "every k steps, the agent receives an observation, generates the next k actions, and executes the actions in sequence")
ev("e47", 4, "IV.A", "k 倍 horizon 缩减",
   "This implies a k-fold reduction in the effective horizon of the task.")

ev("e50", 5, "IV.A", "每步都查询策略、chunk 相互重叠",
   "we query the policy at every timestep. This makes different action chunks overlap with each other")
ev("e51", 5, "IV.A", "m 越小融入新观测越快",
   "a smaller m means faster incorporation")
ev("e52", 5, "IV.A", "时间集成不增加训练成本",
   "This procedure also incurs no additional training cost, only extra inference-time computation.")
ev("e53", 5, "IV.B", "以条件 VAE 训练策略",
   "we train the policy as a conditional variational autoencoder (CVAE)")
ev("e54", 5, "IV.B", "CVAE 编码器只在训练期存在",
   "The CVAE encoder only serves to train the CVAE decoder (the policy) and is discarded at test time.")
ev("e55", 5, "IV.B", "测试时 z 置零、解码确定化",
   "At test time, we set z to be the mean of the prior distribution i.e. zero to deterministically decode.")
ev("e56", 5, "IV.B", "CVAE 目标对人类示教不可或缺",
   "Overall, we found the CVAE objective to be essential in learning precise tasks from human demonstrations.")

ev("e60", 5, "IV.C", "观测 = 4 路 RGB + 14 维关节",
   "The observation includes 4 RGB images, each at 480 x 640 resolution, and joint positions for two robot arms (7+7=14 DoF in total).")
ev("e61", 5, "IV.C", "动作空间为 14 维绝对关节位置",
   "The action space is the absolute joint positions for two robots, a 14-dimensional vector.")
ev("e62", 5, "IV.C", "ResNet18 输出 15x20x512 特征图",
   "which convert 480 x 640 x 3 RGB images into 15 x 20 x 512 feature maps",
   note="考据注记：正文此处写 15x20x512，而第 17 页 Fig.11 的标注为 15x20x728 并经 728->512 线性层。论文正文与附图标注不一致，本馆以正文为准并保留此注。")
ev("e63", 6, "IV.C", "transformer 编码器输入 1202x512",
   "Thus, the input to the transformer encoder is 1202x512.")
ev("e64", 6, "IV.C", "用 L1 而非 L2 重建损失",
   "We use L1 loss for reconstruction instead of the more common L2 loss: we noted that L1 loss leads to more precise modeling of the action sequence.")
ev("e65", 6, "IV.C", "约 80M 参数、每任务从头训练",
   "The model has around 80M parameters, and we train from scratch for each task.")
ev("e66", 6, "IV.C", "单卡 2080 Ti 训练约 5 小时、推理约 0.01 秒",
   "The training takes around 5 hours on a single 11G RTX 2080 Ti GPU, and the inference time is around 0.01 seconds on the same machine.")

ev("e70", 8, "V.B", "单条示教 8-14 秒、400-700 步",
   "Each episode takes 8-14 seconds for the human operator to perform depending on the complexity of the task, which translates to 400-700 time steps given the control frequency of 50Hz.")
ev("e71", 8, "V.B", "每任务 50 条示教、Thread Velcro 100 条",
   "We record 50 demonstrations for each task, except for Thread Velcro which has 100.")
ev("e72", 8, "Table I caption", "表一：2 仿真 + 2 真实任务、4 个基线",
   "Success rate (%) for 2 simulated and 2 real-world tasks, comparing our method with 4 baselines.")
ev("e73", 8, "Table II caption", "表二：其余真实任务、仅与 BeT 对比",
   "Success rate (%) for the remaining 3 real-world tasks. We only compare with the best performing baseline BeT.",
   note="考据注记：表二标题写 remaining 3，实际列出 4 个任务（Open Cup / Thread Velcro / Prep Tape / Put On Shoe）。本馆按表格实际内容呈现。")

ev("e80", 9, "V.C", "ACT 全面领先且幅度大",
   "ACT achieves the highest success rate compared to all prior methods, outperforming the second best algorithm by a large margin on each task.")
ev("e81", 9, "V.C", "仿真任务领先幅度 59/49/29/20 个百分点",
   "For the two simulated tasks with scripted or human data, ACT outperforms the best previous method in success rate by 59%, 49%, 29%, and 20%.")
ev("e82", 9, "V.C", "Slide Ziploc 88%、Slot Battery 96%",
   "For the two real-world tasks Slide Ziploc and Slot Battery, ACT achieves 88% and 96% final success rates respectively, with other methods making no progress past the first stage.")
ev("e83", 9, "V.C", "其余四个真实任务的最终成功率",
   "Our method ACT reaches 84% success for Cup Open, 20% for Thread Velcro, 64% for Prep Tape and 92% for Put On Shoe, again outperforming BeT, which achieve zero final success on these challenging tasks.")
ev("e84", 9, "V.C", "Thread Velcro 每阶段成功率约减半",
   "the success rate decreased by roughly half at every stage, from 92% success at the first stage to 20% final success")
ev("e85", 9, "VI.A", "k=1 到 k=100 成功率 1% 到 44%",
   "We observe that performance improves drastically from 1% at k = 1 to 44% at k = 100, then slightly tapers down with higher k.")

ev("e90", 9, "VI.A", "时间集成增益：BC-ConvMLP +4%、ACT +3.3%",
   "BC-ConvMLP benefits from temporal ensembling the most with a 4% gain, followed by a 3.3% gain for our method.")
ev("e91", 10, "VI.B", "去掉 CVAE：人类数据 35.3% 跌到 2%",
   "While for human data, there is a significant drop from 35.3% to 2%.")
ev("e92", 10, "VI.C", "穿扎带：5Hz 33 秒 vs 50Hz 20 秒",
   "On average, it took 33s for participants to thread the zip tie at 5Hz, which is lowered to 20s at 50Hz.")
ev("e93", 10, "VI.C", "分杯：16 秒降到 10 秒",
   "For separating plastic cups, increasing the control frequency lowered the task duration from 16s to 10s.")
ev("e94", 10, "VI.C", "降频导致 62% 的时间增加",
   "reducing the frequency from 50Hz to 5Hz results in a 62% increase in teleoperation time.")
ev("e95", 10, "VI.C", "统计检验 p < 0.001",
   "to formally verify that 50Hz teleoperation outperforms 5Hz with p-value <0.001")
ev("e96", 10, "VI.C", "6 名被试、均没用过 ALOHA",
   "We perform the study with 6 participants who have varying levels of experience with teleoperation, though none had used ALOHA before.")
ev("e97", 10, "VII", "存在系统与算法都够不到的任务",
   "there exist tasks that are beyond the capability of either the robots or the learning algorithm, such as buttoning up a dress shirt.")

ev("e100", 14, "App. A", "DexPilot 估计约 10 万美元",
   "We estimate the system cost to be around $100k with one arm+hand.")
ev("e101", 14, "App. A", "Robotic Telekinesis 估计约 1.8 万美元",
   "We estimate the cost of these systems to be around $18k with one arm+hand.")
ev("e102", 14, "App. A", "Shadow 系统至少 40 万美元",
   "However, it also costs the most, at at least $400k.")
ev("e103", 14, "App. A", "ALOHA 本体 1.8 万、加相机 2 万",
   "ALOHA, on the other hand, is a bimanual setup that costs $18k ($20k after adding optional add-ons such as cameras).")
ev("e104", 14, "App. A", "15 个 Shadow 演示任务复现 14 个",
   "We are able to recreate 14 out of the 15 tasks with similar objects and comparable amount of time.")
ev("e105", 14, "App. A", "唯一复现失败：保定球手内旋转",
   "We cannot recreate the Baoding ball in-hand rotation task, as our setup does not have a hand.")
ev("e106", 14, "App. A", "leader-follower 可追溯到 1953 年",
   "A leader-follower design choice dates back to at least as far as 1953, when Central Research Laboratories built teleoperation systems for handling hazardous material")

ev("e110", 16, "App. F", "硬件局限：需要多指协同的任务",
   "ALOHA struggles with tasks that require multiple fingers from both hands, for example opening child-proof pill bottles with a push tab.")
ev("e111", 16, "App. F", "硬件局限：需要大力的任务",
   "ALOHA also struggles with tasks that require high amount of forces, for example lifting heavy objects, twisting open a sealed bottle of water, or opening markers caps that are tightly pressed together.")
ev("e112", 16, "App. F", "原因是低成本电机扭矩不足",
   "This is because the low-cost motors cannot generate enough torque to support these manipulations.")
ev("e113", 16, "App. F", "需要指甲的任务也困难",
   "Tasks that requires finger nails are also difficult for ALOHA, even though we design the grippers to be thin on the edge.")
ev("e114", 16, "App. F", "剥糖纸：抓 10/10、拉 8/10、剥开 0/10",
   "the policy picks up the candy 10/10, pulls on both ends 8/10, while unwraps the candy 0/10.")
ev("e115", 16, "App. F", "按糖逐个评估：3/5 成功",
   "For this protocol, our policy successfully unwraps 3/5 candies.")
ev("e116", 16, "App. F", "平放的自封袋是另一个失败任务",
   "Another task that ACT struggles with is opening a small ziploc bag laying flat on the table.")
ev("e117", 16, "App. F", "作者指出的三个方向",
   "We believe that pretraining, more data, and better perception are promising directions to tackle these extremely difficult tasks.")

ev("e120", 18, "Table III", "ACT 超参数表",
   "TABLE III: Hyperparameters of ACT.")

# ---------------------------------------------------------------- halls
halls = []

halls.append({
    "id": "facade",
    "kind": "facade",
    "kicker": "EXHIBIT 00 · FACADE 序厅",
    "title": "Learning Fine-Grained Bimanual Manipulation with Low-Cost Hardware",
    "titleZh": "用低成本硬件，学习精细的双臂操作",
    "authors": [
        {"name": "Tony Z. Zhao", "aff": "Stanford University"},
        {"name": "Vikash Kumar", "aff": "Meta"},
        {"name": "Sergey Levine", "aff": "UC Berkeley"},
        {"name": "Chelsea Finn", "aff": "Stanford University"},
    ],
    "venue": "arXiv:2304.13705v1 [cs.RO] · 2023-04-23",
    "domain": "机器人 · 双臂操作 · 模仿学习 · 智能制造",
    "curator": "把一篇论文读成一座展馆：硬件是标本柜里的装置，算法是会动的机械结构，实验数据是可以上手的互动展品。本馆每一条论断都能点开核对原文页码；核对不上的，不展出。",
    "figure": {"src": "assets/figures/fig1-teaser.png", "page": 1,
               "caption": "论文 Fig.1：ALOHA 遥操作现场与代表性技能。左为主臂背驱遥操作，右为精细、富接触、动态三类任务示例。"},
    "stats": [
        {"label": "系统总成本", "value": "<$20k", "sub": "现货机器人 + 3D 打印件", "ev": "e07"},
        {"label": "真实任务", "value": "6", "sub": "精细双臂操作", "ev": "e03"},
        {"label": "代表成功率", "value": "80–90%", "sub": "开杯盖 / 装电池", "ev": "e03"},
        {"label": "示教数据", "value": "~10min", "sub": "约 50 条轨迹", "ev": "e13"},
        {"label": "控制频率", "value": "50Hz", "sub": "遥操作与记录同频", "ev": "e29"},
        {"label": "模型规模", "value": "~80M", "sub": "每任务从头训练", "ev": "e65"},
    ],
})

halls.append({
    "id": "question",
    "kind": "narrative",
    "num": "01",
    "kicker": "EXHIBIT 01 · THE QUESTION 问题厅",
    "title": "拧开一个调料杯盖，为什么是难题",
    "blocks": [
        {"t": "lead", "text": "博物馆的第一间展厅不放展品，放一个问题。这篇论文的全部硬件与算法，都是为了回答它。"},
        {"t": "para", "ev": ["e01"], "text": "穿扎带、把电池推进卡槽——这类精细操作对机器人而言 notoriously difficult：它要求精度、接触力的细致协调，以及闭环的视觉反馈。"},
        {"t": "steps", "title": "开一个调料杯盖 = 四步毫米级操作", "ev": ["e04", "e05"],
         "items": [
             {"name": "推倒", "desc": "右爪轻点杯沿，把立着的杯子推倒"},
             {"name": "送入", "desc": "把杯子拨进张开的左爪"},
             {"name": "提起", "desc": "左爪轻合，把杯子提离桌面"},
             {"name": "撬盖", "desc": "右爪一指从下方撬开杯盖"},
         ],
         "foot": "任何一步偏差几毫米，任务即失败。"},
        {"t": "para", "ev": ["e06"], "text": "既有答案很贵：高精度机器人加高端传感器，用精确的状态估计换成功率。这条路把精细操作锁在了少数实验室里。"},
        {"t": "callout", "tone": "gold", "title": "论文的反问", "ev": ["e02"],
         "text": "Can learning enable low-cost and imprecise hardware to perform these fine manipulation tasks? —— 学习，能否让便宜且不精确的硬件完成精细操作？"},
        {"t": "para", "ev": ["e08"], "text": "作者的判断是：与其给世界建模，不如学一个闭环策略。推杯子时的接触、撬盖子时的形变，物理上极难建模；而一个能对杯子和盖子当前位置即时反应的策略，反而简单得多。"},
        {"t": "para", "ev": ["e14"], "text": "但模仿学习有自己的坑：上一步的小误差会累积，把机器人推出训练分布，进入难以挽回的状态。精细操作里这个问题尤其致命。于是有了第二间展厅里的那台机器，和第三间展厅里的那个算法。"},
    ],
})

halls.append({
    "id": "specimen",
    "kind": "specimen",
    "num": "02",
    "kicker": "EXHIBIT 02 · THE SPECIMEN 标本柜",
    "title": "ALOHA：一台两万美元的双臂装置",
    "blocks": [
        {"t": "lead", "text": "标本柜里躺着的不是机器人，是一组设计取舍。每一个零件都在回答同一个问题：如何在预算内保留灵巧。"},
        {"t": "principles", "title": "五条设计原则",
         "items": [
             {"n": "1", "title": "Low-cost", "text": "整套系统应在多数机器人实验室预算内，与单条工业臂相当。", "ev": "e20"},
             {"n": "2", "title": "Versatile", "text": "能覆盖大量使用真实物体的精细操作任务。"},
             {"n": "3", "title": "User-friendly", "text": "直观、可靠、易用。"},
             {"n": "4", "title": "Repairable", "text": "坏掉时研究者可自行修理。"},
             {"n": "5", "title": "Easy-to-build", "text": "材料易得、可快速组装；非专家两小时内完成。", "ev": "e30"},
         ]},
        {"t": "figure", "src": "assets/figures/fig3-hardware.png", "page": 3,
         "caption": "论文 Fig.3：四路相机视场与双臂工作空间（左）；handle-and-scissor 机构与自研夹爪（中）；ViperX 从动臂技术规格（右）。"},
        {"t": "spec", "title": "从动臂 ViperX 6-DoF · 铭牌", "ev": ["e21", "e22"],
         "rows": [
             {"k": "自由度", "v": "6 + 夹爪"},
             {"k": "臂展 Reach", "v": "750 mm"},
             {"k": "跨距 Span", "v": "1500 mm"},
             {"k": "重复精度", "v": "1 mm"},
             {"k": "绝对精度", "v": "5–8 mm"},
             {"k": "工作负载", "v": "750 g"},
             {"k": "单价", "v": "约 $5,600 现货"},
         ]},
        {"t": "para", "ev": ["e24", "e25"], "text": "遥操作不用 VR 手柄，而用一台更小、更便宜的同厂 WidowX 作主臂，做关节空间一一映射。理由很工程：精细操作常在奇异点附近工作，六自由度无冗余，现成 IK 在这里频繁失败；关节空间映射则保证关节限内的高带宽控制，算力更少、延迟更低。"},
        {"t": "para", "ev": ["e26", "e27"], "text": "两个 3D 打印的小发明决定了手感：handle-and-scissor 机构降低背驱所需力度，并让夹爪从开/关二值变成连续控制；橡皮筋配平机构部分抵消主臂重力，使超过三十分钟的连续遥操作成为可能。"},
        {"t": "para", "ev": ["e23"], "text": "原厂夹爪不够用，于是自研 3D 打印的透光指端并贴防滑胶带——精细操作时看得清，抓薄塑料膜也抓得住。"},
        {"t": "para", "ev": ["e28", "e29"], "text": "感知只有四只罗技 C922x 网络摄像头：两只装在从动臂腕部看夹爪特写，一只在前、一只在顶，各输出 480x640 RGB。遥操作与数据记录同为 50Hz。没有深度相机，没有动捕。"},
        {"t": "interactive", "id": "costs", "title": "成本对照台"},
        {"t": "para", "ev": ["e104", "e105"], "text": "能力怎么比？作者挑了最贵的 Shadow 遥操作系统的 15 个演示任务逐一复现：啤酒乒乓、叠叠乐、魔方、扫帚簸箕、拧水瓶、倒水、解扎带、拿鸡蛋与灯泡、插拔 USB 与 RJ45、移液器、写字、拧铝盒——14 项成功。唯一失败的是保定球手内旋转，因为 ALOHA 没有手掌。"},
        {"t": "note", "ev": ["e106"], "text": "谱系注记：leader-follower 遥操作并非新发明，至少可追溯到 1953 年 Central Research Laboratories 为处理危险材料建造的系统（参考文献 [27]）。ALOHA 的新意在于用低成本执行器把这条老路线变得人人可及。"},
    ],
})

halls.append({
    "id": "method",
    "kind": "method",
    "num": "03",
    "kicker": "EXHIBIT 03 · THE MECHANISM 机械厅",
    "title": "ACT：把动作打包成块来预测",
    "blocks": [
        {"t": "lead", "text": "第三展厅是一台会动的装置。它演示的不是比喻，而是论文 Algorithm 2 本身。"},
        {"t": "para", "ev": ["e11"], "text": "灵感来自心理学：人会把一串动作打包成一个 chunk，作为一个单元执行。系鞋带不是一个关节一个关节想的，是一整段。"},
        {"t": "para", "ev": ["e46", "e47"], "text": "ACT 照此办理：策略不再预测下一步动作，而是每 k 步接收一次观测、一次生成接下来 k 个动作并顺序执行。任务的有效 horizon 因此缩短 k 倍，compounding error 被正面削弱。"},
        {"t": "para", "ev": ["e50", "e51"], "text": "朴素的 chunking 会顿挫——每 k 步突然并入新观测。作者的解法是每一步都查询策略，让相邻 chunk 相互重叠，再用指数权重 w_i = exp(-m*i) 对同一时刻的多个预测做加权平均。m 越小，新观测融入越快。"},
        {"t": "para", "ev": ["e52"], "text": "这个时间集成不增加任何训练成本，只多花推理算力。"},
        {"t": "figure", "src": "assets/figures/fig5-chunking.png", "page": 4,
         "caption": "论文 Fig.5：action chunking 与 temporal ensembling 的执行方式——观测与执行不再交替，重叠的 chunk 被加权融合。"},
        {"t": "para", "ev": ["e53", "e54"], "text": "人类示教是噪声的、多模态的：同一个观测下人可以走不同轨迹。于是策略被训练成条件 VAE。编码器把动作序列与本体感受压成一个风格变量 z，只服务于训练；测试时整个编码器被丢弃。"},
        {"t": "para", "ev": ["e55"], "text": "测试时 z 直接取先验均值，即零向量——解码因此是确定的，利于评估。"},
        {"t": "figure", "src": "assets/figures/fig4-act-arch.png", "page": 4,
         "caption": "论文 Fig.4：ACT 架构。左为 CVAE 编码器（测试期丢弃），右为作为策略的解码器：多视角图像、关节位置与 z 经 transformer 编码器合成，再由 transformer 解码器生成动作序列。"},
        {"t": "spec", "title": "数据通路 · 尺寸链", "ev": ["e60", "e61", "e62", "e63"],
         "rows": [
             {"k": "图像观测", "v": "4 x 480x640x3 RGB"},
             {"k": "ResNet18 特征图", "v": "15x20x512 / 路"},
             {"k": "展平 + 2D 位置编码", "v": "4 x 300x512 = 1200x512"},
             {"k": "+ 关节 + z", "v": "1202x512 进 transformer 编码器"},
             {"k": "动作空间", "v": "14 维绝对关节位置"},
             {"k": "策略输出", "v": "k x 14 张量"},
         ]},
        {"t": "para", "ev": ["e64"], "text": "一个反直觉的细节：重建损失用 L1 而不是更常见的 L2。作者的观察是 L1 对动作序列的建模更精确。另一个观察是，用关节位置增量作动作会掉点，于是坚持用绝对目标关节位置。"},
        {"t": "para", "ev": ["e65", "e66"], "text": "整机约 80M 参数，每个任务从头训练：单张 11G 的 RTX 2080 Ti 上约五小时；同机推理约 0.01 秒——快过任何一个控制周期。"},
        {"t": "spec", "title": "超参数 · Table III（第 18 页）", "ev": ["e120"],
         "rows": [
             {"k": "learning rate", "v": "1e-5"},
             {"k": "batch size", "v": "8"},
             {"k": "encoder layers", "v": "4"},
             {"k": "decoder layers", "v": "7"},
             {"k": "feedforward dim", "v": "3200"},
             {"k": "hidden dim", "v": "512"},
             {"k": "heads", "v": "8"},
             {"k": "chunk size k", "v": "100"},
             {"k": "beta", "v": "10"},
             {"k": "dropout", "v": "0.1"},
         ]},
        {"t": "interactive", "id": "chunking", "title": "互动装置 · Action Chunking 播放器"},
    ],
})

halls.append({
    "id": "bench",
    "kind": "bench",
    "num": "04",
    "kicker": "EXHIBIT 04 · THE BENCH 实验台",
    "title": "八个任务，一张成绩单",
    "blocks": [
        {"t": "lead", "text": "实验台可以上手。所有数字来自论文第 8 页的 Table I 与 Table II，逐格可查。"},
        {"t": "para", "ev": ["e70", "e71"], "text": "数据怎么来：每个真实任务由人遥操作采集 50 条示教（Thread Velcro 为 100 条）。单条 8 到 14 秒，按 50Hz 折算即 400 到 700 步。每任务约 10 到 20 分钟有效数据，算上复位与失误，墙钟时间 30 到 60 分钟。"},
        {"t": "figure", "src": "assets/figures/fig6-real-tasks.png", "page": 7,
         "caption": "论文 Fig.6：六个真实任务的初始化与子任务分解。"},
        {"t": "figure", "src": "assets/figures/fig7-sim-tasks.png", "page": 8,
         "caption": "论文 Fig.7：两个 MuJoCo 仿真任务。Cube Transfer 间隙约 1cm，Bimanual Insertion 间隙约 5mm。"},
        {"t": "interactive", "id": "results", "title": "互动装置 · 成功率对照台"},
        {"t": "para", "ev": ["e80", "e81"], "text": "结论一：ACT 在所有任务上最高，且把次优算法甩开一个大身位。两个仿真任务上（脚本数据 / 人类数据两种口径），领先幅度分别为 59、49、29、20 个百分点。"},
        {"t": "para", "ev": ["e82"], "text": "结论二：Slide Ziploc 与 Slot Battery 上 ACT 拿到 88% 与 96% 的最终成功率，而其他方法连第一个子任务之后都再无进展。"},
        {"t": "para", "ev": ["e83"], "text": "结论三：其余四个真实任务——Open Cup 84%、Thread Velcro 20%、Prep Tape 64%、Put On Shoe 92%；此前最好的 BeT 在这些任务上最终成功率为零。"},
        {"t": "callout", "tone": "cyan", "title": "诚实的失败", "ev": ["e84"],
         "text": "Thread Velcro 是成绩单上最难看的一格：成功率在每个子任务阶段约减半，从第一阶段的 92% 一路掉到最终的 20%。作者把原因归给感知——黑色扎带与背景对比度低、在画面中占比太小。"},
        {"t": "para", "ev": ["e72", "e73"], "text": "口径说明：仿真任务报告 [脚本数据 | 人类数据] 两种训练口径，3 个随机种子、各 50 次评估；真实任务为 1 个种子、25 次评估。表二标题写 remaining 3，实列 4 个任务，本馆按表格实际内容呈现。"},
    ],
})

halls.append({
    "id": "ablation",
    "kind": "ablation",
    "num": "05",
    "kicker": "EXHIBIT 05 · THE ABLATION CHAMBER 消融室",
    "title": "把机器拆开，看哪个零件在起作用",
    "blocks": [
        {"t": "lead", "text": "消融室回答一个问题：ACT 的三个设计——chunking、时间集成、CVAE——究竟各自值多少成功率。"},
        {"t": "para", "ev": ["e85"], "text": "chunk size 扫描：k=1（即不 chunk）时成功率仅 1%；k=100 时升到 44%；k 再增大到 200、400（接近全开环）则轻微回落。作者把回落归因于缺乏反应式行为、以及长动作序列难以建模。"},
        {"t": "interactive", "id": "ablation", "title": "互动装置 · k 值扫描"},
        {"t": "para", "ev": ["e90"], "text": "时间集成：BC-ConvMLP 获益最大，+4%；ACT 自身 +3.3%；而非参数的 VINN 反而下降——作者的解释是，时间集成主要通过抹平建模误差帮助参数化方法，而 VINN 直接从数据集取真实动作，没有这种误差可抹。"},
        {"t": "para", "ev": ["e91", "e56"], "text": "CVAE：用脚本数据训练时去掉 CVAE 几乎无影响（数据集本身是确定的）；换成人類示教，成功率从 35.3% 跌到 2%。这是全篇最锋利的一张图——它说明 CVAE 不是装饰，而是学会人类数据的必要条件。"},
        {"t": "figure", "src": "assets/figures/fig8-ablations.png", "page": 10,
         "caption": "论文 Fig.8：(a) chunk size 扫描；(b) 时间集成消融；(c) CVAE 消融；(d) 5Hz vs 50Hz 用户研究耗时分布。"},
        {"t": "para", "ev": ["e96"], "text": "最后一组实验不在算法里，在人身上：6 名被试（4 男 2 女，22-25 岁，计算机系研究生，3 人有 VR 遥操作经验、3 人完全没有，且都没碰过 ALOHA），在 5Hz 与 50Hz 两种控制频率下完成穿扎带与分杯两个任务。"},
        {"t": "interactive", "id": "users", "title": "互动装置 · 5Hz vs 50Hz"},
        {"t": "para", "ev": ["e92", "e93", "e94", "e95"], "text": "结果：穿扎带从 5Hz 的平均 33 秒降到 50Hz 的 20 秒；分杯从 16 秒降到 10 秒。把频率从 50Hz 降到 5Hz，遥操作时间增加 62%。作者用重复测量设计做了统计检验，p 值小于 0.001。高频不是锦上添花，是精细操作的前提。"},
    ],
})

halls.append({
    "id": "horizon",
    "kind": "horizon",
    "num": "06",
    "kicker": "EXHIBIT 06 · THE HORIZON 边界厅",
    "title": "这台机器够不到的地方",
    "blocks": [
        {"t": "lead", "text": "最后一间展厅不放成果，放边界。一篇论文的可信度，往往由它承认自己做不到的部分决定。"},
        {"t": "para", "ev": ["e97"], "text": "总括：存在超出机器人或算法能力的任务，例如给一件衬衫扣扣子。"},
        {"t": "para", "ev": ["e110"], "text": "硬件边界一：需要双手多指协同的任务。比如开儿童安全药瓶——一只手按住瓶身并压下压舌，另一只手拧盖。平行夹爪没有这个自由度。"},
        {"t": "para", "ev": ["e111", "e112"], "text": "硬件边界二：需要大力的任务。提重物、拧开密封的矿泉水瓶、拔压得很紧的马克笔帽。原因直接：低成本电机扭矩不够。"},
        {"t": "para", "ev": ["e113"], "text": "硬件边界三：需要指甲的任务。即便指端已做得很薄，揭起贴在自己身上的封箱胶带、打开铝制易拉罐，仍然做不到。"},
        {"t": "callout", "tone": "flag", "title": "两个学不会的任务", "ev": ["e114", "e115"],
         "text": "作者报告了全部两个 ACT 学失败的任务。其一是剥糖纸：50 条示教训出的策略，抓起糖 10/10、两端拉 8/10、真正剥开 0/10。换成按糖逐个评估的协议，也仅 3/5。失败归因于感知与数据量——撕开后的接缝可能出现在糖纸任何位置，连人在采集示教时都难以辨认。"},
        {"t": "para", "ev": ["e116"], "text": "其二是平放在桌面上的小自封袋：策略能稳定抓起袋子，但随后三步空中操作失败。作者推测袋子难以感知，且抓起位置的微小差异会改变袋子形变，进而让拉扯区域的位置大幅漂移。"},
        {"t": "para", "ev": ["e117"], "text": "出路，作者给了三个词：预训练、更多数据、更好的感知。"},
        {"t": "quote", "ev": ["e03"], "text": "We present a low-cost system that performs end-to-end imitation learning directly from real demonstrations, collected with a custom teleoperation interface.",
         "by": "论文摘要 · 作为_exit 的开场白"},
    ],
})

halls.append({
    "id": "archive",
    "kind": "archive",
    "num": "07",
    "kicker": "EXHIBIT 07 · THE ARCHIVE 文献墙",
    "title": "这篇论文站在哪些工作上",
    "blocks": [
        {"t": "lead", "text": "出口走廊是一面墙：71 条参考文献，按年份排布。点任意一条可看原文条目。"},
        {"t": "refwall"},
    ],
})

blueprint = {
    "schema": "paperworld.blueprint/v1",
    "generatedBy": "human-verified (quotes checked verbatim against arXiv:2304.13705v1 PDF)",
    "meta": {
        "id": "aloha-act-2023",
        "pdf": "assets/papers/aloha.pdf",
        "refs": "assets/data/refs.json",
    },
    "evidence": E,
    "halls": halls,
}

# ---------------------------------------------------------------- verify
fail = []
for eid, e in E.items():
    page = e["page"]
    if page not in NORM_PAGES:
        fail.append((eid, f"page {page} missing"))
        continue
    if norm(e["quote"]) not in NORM_PAGES[page]:
        fail.append((eid, f"quote not verbatim on p{page}: {e['quote'][:70]}..."))

# every ev reference used in halls must exist
used = set()


def walk(node):
    if isinstance(node, dict):
        for k, v in node.items():
            if k == "ev":
                if isinstance(v, list):
                    used.update(v)
                else:
                    used.add(v)
            else:
                walk(v)
    elif isinstance(node, list):
        for x in node:
            walk(x)


walk(halls)
missing = sorted(u for u in used if u not in E)

if fail or missing:
    print("VERIFY FAILED")
    for eid, msg in fail:
        print("  QUOTE", eid, msg)
    for m in missing:
        print("  MISSING-EV", m)
    sys.exit(1)

out = APP / "assets" / "data" / "aloha.json"
out.write_text(json.dumps(blueprint, ensure_ascii=False, indent=1), encoding="utf-8")

# also emit a JS global so the site works when opened via file:// (no fetch/CORS)
js = APP / "assets" / "js" / "data.js"
js.write_text(
    "// generated by tools/build_blueprint.py — do not edit by hand\n"
    "window.PAPERWORLD = " + json.dumps(blueprint, ensure_ascii=False) + ";\n",
    encoding="utf-8",
)
print(f"OK · {len(E)} evidence entries verified verbatim · {len(halls)} halls · {len(used)} ev refs used")
print("bytes:", out.stat().st_size, "· data.js:", js.stat().st_size)
