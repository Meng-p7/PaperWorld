/* PaperWorld · 互动装置
 * chunking  : 论文 Algorithm 2 的忠实实现（action chunking + temporal ensemble）
 * results   : Table I / II 真实数据对照台
 * ablation  : k 值扫描（仅呈现原文报告的锚点）+ 有效 horizon 推导
 * users     : 5Hz vs 50Hz 用户研究
 * costs     : 系统成本对照
 */
import { el, $ } from "./core/ui.js";

/* ---------------- canvas helper ---------------- */
function fitCanvas(cv) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = cv.clientWidth || 600;
  const h = cv.clientHeight || 240;
  cv.width = w * dpr;
  cv.height = h * dpr;
  const ctx = cv.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}
function cssv(n) {
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim();
}

/* ================= chunking player ================= */
function mountChunking(root) {
  const T = 240; // 演示步数（示意）
  const state = { k: 20, m: 0.3, ensemble: true, t: 0, playing: true, seed: 7 };

  const cv = el("canvas", { style: "height:250px" });
  const kOut = el("b");
  const mOut = el("b");
  const hzOut = el("span", { class: "mono", style: "color:var(--gold)" });

  const kRange = el("input", {
    type: "range", min: "1", max: "100", value: String(state.k),
    oninput: (e) => { state.k = +e.target.value; kOut.textContent = state.k; reset(); },
  });
  const mRange = el("input", {
    type: "range", min: "0", max: "1", step: "0.05", value: String(state.m),
    oninput: (e) => { state.m = +e.target.value; mOut.textContent = state.m.toFixed(2); reset(); },
  });
  const ensBtn = el("button", {
    class: "btn btn--ghost btn--sm",
    onclick: () => { state.ensemble = !state.ensemble; ensBtn.textContent = state.ensemble ? "Temporal Ensemble: ON" : "Temporal Ensemble: OFF"; reset(); },
    text: "Temporal Ensemble: ON",
  });
  const playBtn = el("button", {
    class: "btn btn--sm",
    onclick: () => { state.playing = !state.playing; playBtn.textContent = state.playing ? "暂停" : "播放"; },
    text: "暂停",
  });

  root.append(
    cv,
    el("div", { class: "ctl" },
      el("div", { class: "ctl__g" },
        el("div", { class: "ctl__l" }, el("span", { text: "chunk size k" }), kOut), kRange),
      el("div", { class: "ctl__g" },
        el("div", { class: "ctl__l" }, el("span", { text: "ensemble decay m" }), mOut), mRange),
      el("div", { style: "display:flex;gap:10px;align-items:center" }, playBtn, ensBtn),
      el("div", { class: "ctl__l", style: "min-width:200px" },
        el("span", { text: "有效 horizon（按单条 500 步推导）" }), hzOut),
    ),
    el("div", { class: "legend" },
      el("span", {}, el("i", { style: "background:var(--ink-3)" }), "目标轨迹（示意）"),
      el("span", {}, el("i", { style: "background:var(--gold)" }), "策略执行轨迹"),
      el("span", {}, el("i", { style: "background:var(--cyan)" }), "动作 chunk 覆盖"),
    ),
    el("p", { class: "small dimmer", style: "margin-top:10px",
      text: "实现对应论文 Algorithm 2：每步查询策略、chunk 相互重叠，对同一时刻的多个预测按 w_i = exp(-m·i) 加权平均（i 为预测的新旧次序，w_0 对应最旧的预测）。目标轨迹为示意数据，用于演示算法行为，非论文实验数据。" }),
  );
  kOut.textContent = state.k;
  mOut.textContent = state.m.toFixed(2);

  // deterministic pseudo-random per query
  function rnd(i) {
    let x = Math.sin(i * 127.1 + state.seed * 311.7) * 43758.5453;
    return x - Math.floor(x);
  }
  function target(t) {
    return 0.5 + 0.32 * Math.sin(t / 34) + 0.12 * Math.sin(t / 11 + 1.7);
  }

  let queries = []; // {start, bias}
  let exec = [];

  function reset() {
    queries = [];
    exec = new Array(T).fill(null);
    state.t = 0;
    simulate();
  }

  function simulate() {
    // run the whole episode deterministically for current params
    queries = [];
    exec = new Array(T).fill(null);
    const buffers = new Array(T).fill(null).map(() => []); // per-timestep list of {pred, age-order}
    let qid = 0;
    for (let t = 0; t < T; t++) {
      // query policy every step if ensemble, else every k steps
      const doQuery = state.ensemble ? true : t % state.k === 0;
      if (doQuery) {
        const bias = (rnd(qid) - 0.5) * 0.34; // per-query prediction error
        queries.push({ start: t, bias, id: qid });
        qid++;
        for (let j = 0; j < state.k && t + j < T; j++) {
          buffers[t + j].push({ pred: target(t + j) + bias * (1 + j / state.k), q: queries.length - 1 });
        }
      }
      // execute: weighted average over predictions for timestep t, weight by age
      // age 0 = oldest prediction in buffer
      const list = buffers[t];
      if (list.length) {
        let num = 0, den = 0;
        for (let i = 0; i < list.length; i++) {
          const w = Math.exp(-state.m * i);
          num += w * list[i].pred;
          den += w;
        }
        exec[t] = num / den;
      }
    }
    hzOut.textContent = `≈ ${Math.round(500 / state.k)} 步/决策`;
  }

  function draw() {
    const { ctx, w, h } = fitCanvas(cv);
    ctx.clearRect(0, 0, w, h);
    const pad = 14;
    const X = (t) => pad + (t / (T - 1)) * (w - pad * 2);
    const Y = (v) => h - pad - v * (h - pad * 2 - 40) - 20;

    // chunk coverage bars
    const barH = 5;
    queries.forEach((q, i) => {
      const x0 = X(q.start);
      const x1 = X(Math.min(T - 1, q.start + state.k - 1));
      ctx.fillStyle = cssv("--cyan");
      ctx.globalAlpha = 0.35;
      ctx.fillRect(x0, h - 12 - (i % 3) * (barH + 1), x1 - x0, barH);
      ctx.globalAlpha = 1;
    });

    // target
    ctx.strokeStyle = cssv("--ink-3");
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let t = 0; t < T; t++) {
      const x = X(t), y = Y(target(t));
      t ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // executed up to state.t
    ctx.strokeStyle = cssv("--gold");
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    let started = false;
    for (let t = 0; t <= state.t && t < T; t++) {
      if (exec[t] == null) continue;
      const x = X(t), y = Y(exec[t]);
      started ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      started = true;
    }
    ctx.stroke();

    // playhead
    ctx.strokeStyle = cssv("--gold-line");
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(X(state.t), 6);
    ctx.lineTo(X(state.t), h - 6);
    ctx.stroke();
  }

  reset();
  let raf;
  function loop() {
    if (state.playing) {
      state.t += 1.4;
      if (state.t >= T) state.t = 0;
    }
    draw();
    raf = requestAnimationFrame(loop);
  }
  loop();
  addEventListener("resize", draw);
  root._cleanup = () => cancelAnimationFrame(raf);
}

/* ================= results bench ================= */
const TASKS = [
  { id: "cube", name: "Cube Transfer", kind: "sim", sub: ["Touched", "Lifted", "Transfer"],
    act: [[97, 82], [90, 60], [86, 50]],
    bases: { "BC-ConvMLP": [[34, 3], [17, 1], [1, 0]], BeT: [[60, 16], [51, 13], [27, 1]], "RT-1": [[44, 4], [33, 2], [2, 0]], VINN: [[13, 17], [9, 11], [3, 0]] } },
  { id: "insert", name: "Bimanual Insertion", kind: "sim", sub: ["Grasp", "Contact", "Insert"],
    act: [[93, 76], [90, 66], [32, 20]],
    bases: { "BC-ConvMLP": [[5, 0], [1, 0], [1, 0]], BeT: [[21, 0], [4, 0], [3, 0]], "RT-1": [[2, 0], [0, 0], [1, 0]], VINN: [[6, 0], [1, 0], [1, 0]] } },
  { id: "ziploc", name: "Slide Ziploc", kind: "real", sub: ["Grasp", "Pinch", "Open"],
    act: [92, 96, 88], bases: { "BC-ConvMLP": [0, 0, 0], BeT: [8, 0, 0], "RT-1": [4, 0, 0], VINN: [28, 0, 0] } },
  { id: "battery", name: "Slot Battery", kind: "real", sub: ["Grasp", "Place", "Insert"],
    act: [100, 100, 96], bases: { "BC-ConvMLP": [0, 0, 0], BeT: [4, 0, 0], "RT-1": [4, 0, 0], VINN: [20, 0, 0] } },
  { id: "cup", name: "Open Cup", kind: "real", sub: ["Tip Over", "Grasp", "Open Lid"],
    act: [100, 96, 84], bases: { BeT: [12, 0, 0] } },
  { id: "velcro", name: "Thread Velcro", kind: "real", sub: ["Lift", "Grasp", "Insert"],
    act: [92, 40, 20], bases: { BeT: [24, 0, 0] } },
  { id: "tape", name: "Prep Tape", kind: "real", sub: ["Grasp", "Cut", "Handover", "Hang"],
    act: [96, 92, 72, 64], bases: { BeT: [8, 0, 0, 0] } },
  { id: "shoe", name: "Put On Shoe", kind: "real", sub: ["Lift", "Insert", "Support", "Secure"],
    act: [100, 92, 92, 92], bases: { BeT: [12, 0, 0, 0] } },
];

function mountResults(root, openEv) {
  const sel = { task: TASKS[3], method: "ACT", split: 0 };

  const list = el("div", { class: "bench__tasks" });
  const chart = el("div", { class: "bench__chart" });
  const mchips = el("div", { style: "display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px" });
  const splitBtn = el("button", { class: "btn btn--ghost btn--sm" });

  root.append(el("div", { class: "bench" }, list, el("div", {}, mchips, splitBtn, chart)));

  function val(v) { return Array.isArray(v) ? v[sel.split] : v; }
  function fmt(v) { return Array.isArray(v) ? `${v[0]} | ${v[1]}` : String(v); }

  function renderTasks() {
    list.textContent = "";
    for (const t of TASKS) {
      list.append(el("button", {
        class: "btask" + (t.id === sel.task.id ? " is-on" : ""),
        onclick: () => { sel.task = t; if (!(sel.method in t.bases) && sel.method !== "ACT") sel.method = "ACT"; renderTasks(); renderChart(); },
      }, el("small", { text: t.kind === "sim" ? "SIM · TABLE I" : "REAL · TABLE I/II" }), t.name));
    }
  }

  function renderChips() {
    mchips.textContent = "";
    const methods = ["ACT", ...Object.keys(sel.task.bases)];
    for (const mname of methods) {
      mchips.append(el("button", {
        class: "btn btn--ghost btn--sm" + (sel.method === mname ? "" : " "),
        style: sel.method === mname ? "background:var(--gold);color:#0b0d10;border-color:transparent" : "",
        text: mname,
        onclick: () => { sel.method = mname; renderChips(); renderChart(); },
      }));
    }
  }

  function renderChart() {
    renderChips();
    const t = sel.task;
    splitBtn.style.display = t.kind === "sim" ? "" : "none";
    splitBtn.textContent = sel.split === 0 ? "口径：scripted data" : "口径：human data";
    splitBtn.onclick = () => { sel.split = 1 - sel.split; renderChart(); };

    chart.textContent = "";
    const src = sel.method === "ACT" ? t.act : t.bases[sel.method];
    t.sub.forEach((s, i) => {
      const v = val(src[i]);
      chart.append(el("div", { class: "brow" },
        el("div", { class: "brow__l", text: s }),
        el("div", { class: "brow__track" },
          el("div", { class: "brow__fill" + (sel.method === "ACT" ? "" : " brow__fill--base"), style: `width:${v}%` })),
        el("div", { class: "brow__v", text: fmt(src[i]) }),
      ));
    });
    chart.append(el("p", { class: "small dimmer", style: "margin:12px 0 0",
      text: t.kind === "sim"
        ? "仿真任务数值为 [scripted | human] 两种训练口径，3 种子、各 50 次评估。"
        : "真实任务为 1 种子、25 次评估。数值逐格取自论文第 8 页 Table I / Table II。" }));
    chart.append(el("button", {
      class: "ev", text: "P.8", style: "vertical-align:middle",
      onclick: () => openEv && openEv(t.kind === "sim" ? "e72" : "e73"),
    }));
  }

  renderTasks();
  renderChart();
}

/* ================= ablation ================= */
function mountAblation(root) {
  const anchors = [{ k: 1, v: 1 }, { k: 100, v: 44 }];
  const kOut = el("b");
  const vOut = el("span", { class: "mono", style: "color:var(--gold);font-size:20px" });
  const hOut = el("span", { class: "mono" });
  const kRange = el("input", {
    type: "range", min: "1", max: "400", value: "100",
    oninput: (e) => update(+e.target.value),
  });

  root.append(
    el("div", { class: "ctl", style: "margin:0 0 14px" },
      el("div", { class: "ctl__g", style: "flex:1;min-width:240px" },
        el("div", { class: "ctl__l" }, el("span", { text: "chunk size k" }), kOut), kRange),
      el("div", {}, el("div", { class: "ctl__l" }, el("span", { text: "原文报告成功率" })), vOut),
      el("div", {}, el("div", { class: "ctl__l" }, el("span", { text: "有效 horizon（500 步/条）" })), hOut),
    ),
    el("p", { class: "small dim", style: "margin:0 0 14px",
      text: "原文只报告了两个锚点：k=1 时 1%，k=100 时 44%；k=200、400（接近全开环）时轻微回落但未给数值。本装置不补画未报告的数值，只呈现锚点与有效 horizon 的推导。" }),
    el("div", { class: "legend" },
      el("span", {}, el("i", { style: "background:var(--gold);border-radius:50%" }), "原文报告锚点"),
      el("span", {}, el("i", { style: "background:var(--surface-3)" }), "回落区间（未给数值）"),
    ),
    el("canvas", { id: "abl-cv", style: "height:180px;margin-top:12px" }),
  );

  const cv = root.querySelector("#abl-cv");

  function update(k) {
    kOut.textContent = k;
    const a = anchors.find((x) => x.k === k);
    vOut.textContent = a ? `${a.v}%` : "未报告";
    hOut.textContent = `≈ ${Math.max(1, Math.round(500 / k))} 步/决策`;
    draw(k);
  }

  function draw(k) {
    const { ctx, w, h } = fitCanvas(cv);
    ctx.clearRect(0, 0, w, h);
    const pad = 26;
    const X = (kk) => pad + (Math.log10(kk) / Math.log10(400)) * (w - pad * 2);
    const Y = (v) => h - pad - (v / 50) * (h - pad * 2);

    // taper region
    ctx.fillStyle = cssv("--surface-3");
    ctx.globalAlpha = 0.5;
    ctx.fillRect(X(150), 8, X(400) - X(150), h - 16);
    ctx.globalAlpha = 1;

    // axis
    ctx.strokeStyle = cssv("--line-strong");
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, h - pad);
    ctx.lineTo(w - pad, h - pad);
    ctx.stroke();

    // anchors
    for (const a of anchors) {
      ctx.fillStyle = cssv("--gold");
      ctx.beginPath();
      ctx.arc(X(a.k), Y(a.v), 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = cssv("--ink-2");
      ctx.font = "11px monospace";
      ctx.fillText(`${a.v}%`, X(a.k) + 8, Y(a.v) - 6);
      ctx.fillText(`k=${a.k}`, X(a.k) - 12, h - pad + 14);
    }

    // playhead
    ctx.strokeStyle = cssv("--cyan");
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(X(k), 8);
    ctx.lineTo(X(k), h - pad);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  update(100);
  addEventListener("resize", () => draw(+kRange.value));
}

/* ================= users ================= */
function mountUsers(root) {
  const data = [
    { name: "穿扎带 thread zip tie", slow: 33, fast: 20, ev: "e92" },
    { name: "分杯 unstack cups", slow: 16, fast: 10, ev: "e93" },
  ];
  const max = 40;
  const wrap = el("div", { class: "users" });
  for (const d of data) {
    wrap.append(el("div", { class: "ucard" },
      el("div", { class: "ucard__t", text: d.name }),
      el("div", { class: "ubar ubar--slow" },
        el("span", { text: "5Hz" }),
        el("div", { class: "ubar__track" }, el("div", { class: "ubar__fill", style: `width:${(d.slow / max) * 100}%` })),
        el("span", { text: `${d.slow}s` })),
      el("div", { class: "ubar ubar--fast" },
        el("span", { text: "50Hz" }),
        el("div", { class: "ubar__track" }, el("div", { class: "ubar__fill", style: `width:${(d.fast / max) * 100}%` })),
        el("span", { text: `${d.fast}s` })),
    ));
  }
  root.append(wrap,
    el("p", { class: "small dim", style: "margin:14px 0 0",
      text: "6 名被试、每人每设置 2 分钟适应 + 3 次连续尝试。把频率从 50Hz 降到 5Hz，遥操作时间增加 62%；重复测量设计检验 p < 0.001。" }));
}

/* ================= costs ================= */
function mountCosts(root, openEv) {
  const rows = [
    { n: "ALOHA（本文）", note: "本体 $18k · 加相机等 $20k", v: 18000, us: true, ev: "e103" },
    { n: "Robotic Telekinesis", note: "单臂+手 估计", v: 18000, ev: "e101" },
    { n: "DexPilot", note: "单臂+手 估计", v: 100000, ev: "e100" },
    { n: "Shadow Teleoperation", note: "至少 $400k", v: 400000, ev: "e102" },
  ];
  const max = 400000;
  const wrap = el("div");
  for (const r of rows) {
    wrap.append(el("div", { class: "costrow" + (r.us ? " costrow--us" : "") },
      el("div", { class: "costrow__n" }, r.n, el("small", { text: r.note })),
      el("div", { class: "costrow__track" }, el("div", { class: "costrow__fill", style: `width:${(r.v / max) * 100}%` })),
      el("div", { class: "costrow__v" },
        `$${(r.v / 1000).toFixed(0)}k`,
        el("button", { class: "ev", text: `P.14`, style: "margin-left:6px", onclick: () => openEv && openEv(r.ev) })),
    ));
  }
  root.append(wrap,
    el("p", { class: "small dim", style: "margin:14px 0 0",
      text: "成本为论文附录 A 的估计值。ALOHA 以约 1/22 于 Shadow 系统的价格，复现了其 15 个演示任务中的 14 个。" }));
}

/* ================= dispatcher ================= */
export function mountInteractive(id, root, openEv) {
  switch (id) {
    case "chunking": return mountChunking(root);
    case "results": return mountResults(root, openEv);
    case "ablation": return mountAblation(root);
    case "users": return mountUsers(root);
    case "costs": return mountCosts(root, openEv);
    default: root.append(el("p", { class: "small dimmer", text: `未知装置：${id}` }));
  }
}
