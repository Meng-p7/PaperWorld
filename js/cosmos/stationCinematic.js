/* PaperWorld · 空间站 · 电影级渲染（three.js，本地 vendor）
 *
 * 目标：接近科幻电影布光的沉浸感，而非低模灰盒。
 * 管线：线性 HDR 半浮点 RT → 亮部提取 → 两级高斯泛光 →
 *       ACES 色调映射 + 胶片分级（暗角/颗粒/色散/对比）→ sRGB。
 * 材质：PBR 金属 + 程序化 albedo/bump/roughness 贴图 + PMREM 环境反射。
 * 几何：分段壁板/接缝铆钉/环向管线/格栅地板/天花桁架/凹入舱门/发光铭牌/
 *       中央全息台；重复件全部 InstancedMesh 控制 draw call。
 * 氛围：指数雾 + 尘埃粒子 + 体积光锥 + 冷暖多光源 + 单盏投影聚光。
 * 兼容：导出 createStation3D({canvas,doors,onSelect})，返回形状与旧版一致；
 *       无 WebGL / 窄屏返回 null，交给上层降级（旧渲染器 / CSS 走廊）。
 */
import * as THREE from "../../vendor/three/three.module.js";

const R = 16, H = 7.2, SEG = 48;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function angDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/* ================= 程序化贴图 ================= */
function canvasTex(size, draw, { srgb = true, repeat = [1, 1] } = {}) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function hullTextures() {
  const rnd = (seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647)(42);
  const albedo = canvasTex(512, (g, s) => {
    g.fillStyle = "#9aa6b4"; g.fillRect(0, 0, s, s);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const v = 150 + Math.floor(rnd() * 26);
      g.fillStyle = `rgb(${v},${v + 6},${v + 12})`;
      g.fillRect(x * 128 + 3, y * 128 + 3, 122, 122);
    }
    g.strokeStyle = "#414c5a"; g.lineWidth = 3;
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, s); g.stroke();
      g.beginPath(); g.moveTo(0, i * 128); g.lineTo(s, i * 128); g.stroke();
    }
    g.fillStyle = "#1a2230";
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++)
      for (const [dx, dy] of [[12, 12], [116, 12], [12, 116], [116, 116]]) {
        g.beginPath(); g.arc(x * 128 + dx, y * 128 + dy, 3, 0, 7); g.fill();
      }
    for (let i = 0; i < 90; i++) {
      g.strokeStyle = `rgba(${180 + rnd() * 40},${190 + rnd() * 40},${210},${0.03 + rnd() * 0.05})`;
      g.lineWidth = 0.6 + rnd();
      const x = rnd() * s, y = rnd() * s;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 60, y + (rnd() - 0.5) * 18); g.stroke();
    }
    for (let i = 0; i < 5; i++) {
      const x = Math.floor(rnd() * 4) * 128 + 24, y = Math.floor(rnd() * 4) * 128 + 40;
      g.fillStyle = "#141b26"; g.fillRect(x, y, 80, 44);
      g.strokeStyle = "#232e40"; g.lineWidth = 2;
      for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(x + 4, y + 6 + k * 7); g.lineTo(x + 76, y + 6 + k * 7); g.stroke(); }
    }
  }, { repeat: [1, 1] });

  const bump = canvasTex(512, (g, s) => {
    g.fillStyle = "#808080"; g.fillRect(0, 0, s, s);
    g.strokeStyle = "#3a3a3a"; g.lineWidth = 4;
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, s); g.stroke();
      g.beginPath(); g.moveTo(0, i * 128); g.lineTo(s, i * 128); g.stroke();
    }
    g.fillStyle = "#5a5a5a";
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++)
      for (const [dx, dy] of [[12, 12], [116, 12], [12, 116], [116, 116]]) {
        g.beginPath(); g.arc(x * 128 + dx, y * 128 + dy, 4, 0, 7); g.fill();
      }
  }, { srgb: false, repeat: [1, 1] });

  const rough = canvasTex(256, (g, s) => {
    g.fillStyle = "#8c8c8c"; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 400; i++) {
      const v = 110 + Math.floor(Math.random() * 90);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(Math.random() * s, Math.random() * s, 2 + Math.random() * 8, 1 + Math.random() * 3);
    }
  }, { srgb: false, repeat: [1, 1] });
  return { albedo, bump, rough };
}

function floorTexture() {
  return canvasTex(512, (g, s) => {
    g.fillStyle = "#6b7889"; g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 16) {
      g.fillStyle = y % 32 ? "#7a8798" : "#667384";
      g.fillRect(0, y, s, 12);
      g.fillStyle = "#3c4659"; g.fillRect(0, y + 12, s, 4);
    }
    g.fillStyle = "#8b98a9";
    for (let x = 0; x < s; x += 128) g.fillRect(x, 0, 6, s);
    for (let i = 0; i < 120; i++) {
      g.fillStyle = `rgba(160,180,210,${0.02 + Math.random() * 0.05})`;
      g.fillRect(Math.random() * s, Math.random() * s, 20 + Math.random() * 60, 2);
    }
  }, { repeat: [10, 10] });
}

function signTexture(num, title) {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "#05070c"; g.fillRect(0, 0, 512, 128);
  g.strokeStyle = "#f2b45c"; g.lineWidth = 4; g.strokeRect(6, 6, 500, 116);
  g.fillStyle = "#f2b45c"; g.font = "600 34px monospace"; g.textBaseline = "middle";
  g.fillText(num, 22, 40);
  g.fillStyle = "#dfe9f5"; g.font = "500 26px sans-serif";
  g.fillText(title.slice(0, 10), 22, 88);
  g.fillStyle = "#66d9e8";
  for (let x = 392; x < 488; x += 6) g.fillRect(x, 20, (x % 12) ? 2 : 4, 88);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/* 把多个带变换的几何合并为一个（保留索引以复用顶点），可选逐件顶点色。
 * 用于舱门静态件合批：减少 draw call 与几何体数量，仍保留逐门视锥剔除。 */
function mergeGeos(items) {
  const pos = [], nor = [], uv = [], col = [], idx = [];
  const v = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3();
  let offset = 0;
  for (const { geo, matrix, color } of items) {
    nm.getNormalMatrix(matrix);
    const p = geo.attributes.position, no = geo.attributes.normal, u = geo.attributes.uv;
    const c = color || [1, 1, 1];
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(matrix); pos.push(v.x, v.y, v.z);
      n.fromBufferAttribute(no, i).applyMatrix3(nm).normalize(); nor.push(n.x, n.y, n.z);
      uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0);
      col.push(c[0], c[1], c[2]);
    }
    if (geo.index) {
      for (let i = 0; i < geo.index.count; i++) idx.push(geo.index.getX(i) + offset);
    } else {
      for (let i = 0; i < p.count; i++) idx.push(i + offset);
    }
    offset += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  out.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  out.setIndex(idx);
  return out;
}

/* 铭牌图集：n 块铭牌画进一张 512×(128n) 贴图，返回纹理与第 i 行的 UV 映射。 */
function signAtlas(doors) {
  const n = doors.length, rowH = 64;
  const c = document.createElement("canvas");
  c.width = 512; c.height = rowH * n;
  const g = c.getContext("2d");
  doors.forEach((d, i) => {
    g.save(); g.translate(0, i * rowH);
    g.fillStyle = "#05070c"; g.fillRect(0, 0, 512, rowH);
    g.strokeStyle = "#f2b45c"; g.lineWidth = 3; g.strokeRect(4, 4, 504, rowH - 8);
    g.fillStyle = "#f2b45c"; g.font = "600 22px monospace"; g.textBaseline = "middle";
    g.fillText(d.num, 14, 20);
    g.fillStyle = "#dfe9f5"; g.font = "500 16px sans-serif";
    g.fillText((d.title || "").slice(0, 12), 14, 44);
    g.fillStyle = "#66d9e8";
    for (let x = 400; x < 496; x += 6) g.fillRect(x, 10, (x % 12) ? 2 : 4, rowH - 20);
    g.restore();
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return { texture: t, mapV: (i, v) => (1 - (i + 1) / n) + v / n };
}

/* 全息壁板图形：分子网络 + 网格 + 刻度，黑底 additive。 */
function holoPanelTexture(seed) {
  return canvasTex(256, (g, s) => {
    g.fillStyle = "#02060c"; g.fillRect(0, 0, s, s);
    const rnd = (sd => () => (sd = (sd * 16807) % 2147483647) / 2147483647)(seed);
    g.strokeStyle = "rgba(60,180,220,0.25)"; g.lineWidth = 1;
    for (let x = 0; x < s; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, s); g.stroke(); }
    for (let y = 0; y < s; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); }
    const nodes = Array.from({ length: 26 }, () => [rnd() * s, rnd() * s]);
    g.strokeStyle = "rgba(90,220,255,0.7)"; g.lineWidth = 1;
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const d = Math.hypot(nodes[i][0] - nodes[j][0], nodes[i][1] - nodes[j][1]);
      if (d < 55) { g.beginPath(); g.moveTo(nodes[i][0], nodes[i][1]); g.lineTo(nodes[j][0], nodes[j][1]); g.stroke(); }
    }
    for (const [x, y] of nodes) {
      g.fillStyle = "rgba(140,240,255,0.95)"; g.beginPath(); g.arc(x, y, 2, 0, 7); g.fill();
      g.strokeStyle = "rgba(90,220,255,0.5)"; g.beginPath(); g.arc(x, y, 4.5, 0, 7); g.stroke();
    }
    g.fillStyle = "rgba(120,230,255,0.8)"; g.font = "10px monospace";
    g.fillText("MOLECULAR / STRUCTURE", 8, 12);
    g.fillText("SYNC 98.2%", 8, s - 8);
  }, { srgb: true });
}

/* ================= 几何装配 ================= */
function buildStation(scene, doors, mats) {
  const group = new THREE.Group();
  scene.add(group);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1);
  const Y = new THREE.Vector3(0, 1, 0);
  const place = (inst, i, x, y, z, ry = 0, extraQ = null, sx = 1, sy = 1, sz = 1) => {
    Q.setFromAxisAngle(Y, ry);
    if (extraQ) Q.multiply(extraQ);
    P.set(x, y, z); S.set(sx, sy, sz);
    M.compose(P, Q, S); inst.setMatrixAt(i, M);
  };

  /* --- 环形壁板（四层）--- */
  const panels = new THREE.InstancedMesh(new THREE.BoxGeometry(2.0, 1.7, 0.14), mats.hull, SEG * 4);
  let pi = 0;
  for (let i = 0; i < SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    for (let row = 0; row < 4; row++) place(panels, pi++, Math.sin(a) * R, 0.95 + row * 1.78, Math.cos(a) * R, a);
  }
  panels.instanceMatrix.needsUpdate = true; group.add(panels);

  /* --- 竖向接缝肋 --- */
  const ribs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, H, 0.3), mats.frame, SEG);
  for (let i = 0; i < SEG; i++) {
    const a = ((i + 0.5) / SEG) * Math.PI * 2;
    place(ribs, i, Math.sin(a) * (R - 0.1), H / 2, Math.cos(a) * (R - 0.1), a);
  }
  ribs.instanceMatrix.needsUpdate = true; group.add(ribs);

  /* --- 环向管线（两圈）--- */
  const rotZ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  const pipes = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.09, 2.1, 8), mats.pipe, SEG * 2);
  let qi = 0;
  for (let i = 0; i < SEG; i++) {
    const a = ((i + 0.5) / SEG) * Math.PI * 2;
    place(pipes, qi++, Math.sin(a) * (R - 0.35), 5.6, Math.cos(a) * (R - 0.35), a, rotZ);
    place(pipes, qi++, Math.sin(a) * (R - 0.35), 5.9, Math.cos(a) * (R - 0.35), a, rotZ);
  }
  pipes.instanceMatrix.needsUpdate = true; group.add(pipes);

  /* --- 地板 / 天花 --- */
  const floor = new THREE.Mesh(new THREE.CircleGeometry(R, 64), mats.floor);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; group.add(floor);
  const ceil = new THREE.Mesh(new THREE.CircleGeometry(R, 64), mats.ceil);
  ceil.rotation.x = Math.PI / 2; ceil.position.y = H; group.add(ceil);

  /* --- 地面发光导引环 --- */
  for (const [rad, col, inten] of [[5.1, 0x66d9e8, 0.9], [R - 1.3, 0x66d9e8, 0.6], [2.6, 0xf2b45c, 0.8]]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(rad, 0.045, 8, 96), mats.emissive(col, inten));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.02; group.add(ring);
  }
  const guides = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.02, R - 6), mats.emissive(0x66d9e8, 0.35), doors.length);
  doors.forEach((d, i) => place(guides, i, Math.sin(d.theta) * 10, 0.02, Math.cos(d.theta) * 10, d.theta));
  guides.instanceMatrix.needsUpdate = true; group.add(guides);

  /* --- 天花桁架 + 穹顶灯环 --- */
  const trusses = new THREE.InstancedMesh(new THREE.BoxGeometry(0.28, 0.4, R - 2), mats.frame, 16);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    place(trusses, i, Math.sin(a) * ((R + 2) / 2), H - 0.3, Math.cos(a) * ((R + 2) / 2), a);
  }
  trusses.instanceMatrix.needsUpdate = true; group.add(trusses);
  const dome = new THREE.Mesh(new THREE.TorusGeometry(3.0, 0.12, 10, 72), mats.emissive(0xf2b45c, 1.2));
  dome.rotation.x = Math.PI / 2; dome.position.y = H - 0.15; group.add(dome);
  const dome2 = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.05, 8, 72), mats.emissive(0xffe0b0, 1.6));
  dome2.rotation.x = Math.PI / 2; dome2.position.y = H - 0.15; group.add(dome2);

  /* --- 径向支柱 + 柱灯 --- */
  const pillars = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, H, 0.55), mats.frame, 12);
  const pilLights = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, H * 0.6, 0.1), mats.emissive(0x66d9e8, 0.7), 12);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.26;
    place(pillars, i, Math.sin(a) * (R - 1.1), H / 2, Math.cos(a) * (R - 1.1), a);
    place(pilLights, i, Math.sin(a) * (R - 1.45), H / 2, Math.cos(a) * (R - 1.45), a);
  }
  pillars.instanceMatrix.needsUpdate = true; pilLights.instanceMatrix.needsUpdate = true;
  pillars.castShadow = true; group.add(pillars, pilLights);

  /* --- 展区舱门（静态件按材质合批，逐门保留视锥剔除）--- */
  const geoCache = new Map();
  const box = (w, h, d) => { const k = `b${w},${h},${d}`; if (!geoCache.has(k)) geoCache.set(k, new THREE.BoxGeometry(w, h, d)); return geoCache.get(k); };
  const plane = (w, h) => { const k = `p${w},${h}`; if (!geoCache.has(k)) geoCache.set(k, new THREE.PlaneGeometry(w, h)); return geoCache.get(k); };
  const atlas = signAtlas(doors);
  const signMat = new THREE.MeshStandardMaterial({ map: atlas.texture, emissive: 0xffffff, emissiveMap: atlas.texture, emissiveIntensity: 1.1, metalness: 0.2, roughness: 0.6 });
  const emisMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xffffff });
  const signItems = [];
  const doorMeta = doors.map((d, idx) => {
    const th = d.theta;
    const x = Math.sin(th) * (R - 1.6), z = Math.cos(th) * (R - 1.6);
    const doorM = new THREE.Matrix4().compose(
      new THREE.Vector3(x, 0, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), th),
      new THREE.Vector3(1, 1, 1));
    const w = 1.55, h = 2.75;
    const buckets = { hull: [], frame: [], door: [], emis: [], hazard: [] };
    const put = (bucket, geo, px, py, pz, color = null, ry = 0, rx = 0) => {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0));
      const local = new THREE.Matrix4().compose(new THREE.Vector3(px, py, pz), q, new THREE.Vector3(1, 1, 1));
      buckets[bucket].push({ geo, matrix: doorM.clone().multiply(local), color });
    };
    put("hull", box(w * 2 + 0.8, h + 0.9, 0.3), 0, (h + 0.9) / 2, 0.5);
    put("frame", box(0.34, h + 0.5, 0.5), -w - 0.2, (h + 0.5) / 2, 0.1);
    put("frame", box(0.34, h + 0.5, 0.5), w + 0.2, (h + 0.5) / 2, 0.1);
    put("frame", box(w * 2 + 0.8, 0.4, 0.5), 0, h + 0.35, 0.1);
    put("door", box(w - 0.04, h, 0.12), -w / 2, h / 2 + 0.1, 0.28);
    put("door", box(w - 0.04, h, 0.12), w / 2, h / 2 + 0.1, 0.28);
    const cyan = new THREE.Color(0x66d9e8).multiplyScalar(0.7);
    put("emis", box(0.05, h, 0.14), 0, h / 2 + 0.1, 0.28, [cyan.r, cyan.g, cyan.b]);
    for (let k = 0; k < 3; k++) put("frame", box(w * 2 - 0.1, 0.08, 0.16), 0, 0.7 + k * 0.9, 0.3);
    const gold = new THREE.Color(0xf2b45c);
    put("emis", box(0.06, h, 0.06), -w - 0.02, h / 2 + 0.1, -0.05, [gold.r, gold.g, gold.b]);
    put("emis", box(0.06, h, 0.06), w + 0.02, h / 2 + 0.1, -0.05, [gold.r, gold.g, gold.b]);
    put("emis", box(w * 2, 0.06, 0.06), 0, h + 0.12, -0.05, [gold.r, gold.g, gold.b]);
    put("frame", box(w * 2 + 0.6, 0.16, 1.4), 0, 0.08, -0.8);
    put("hazard", plane(w * 2 + 0.4, 0.5), 0, 0.17, -1.1, null, 0, -Math.PI / 2);
    const st = new THREE.Color(idx % 2 ? 0x6fe3a5 : 0x66d9e8).multiplyScalar(1.2);
    put("emis", box(0.1, 0.5, 0.1), -w - 0.45, 1.5, -0.1, [st.r, st.g, st.b]);
    const sg = plane(w * 2, w * 0.5).clone();
    const uvA = sg.attributes.uv;
    for (let i2 = 0; i2 < uvA.count; i2++) uvA.setY(i2, atlas.mapV(idx, uvA.getY(i2)));
    const slocal = new THREE.Matrix4().compose(
      new THREE.Vector3(0, h + 0.85, -0.1),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI),
      new THREE.Vector3(1, 1, 1));
    signItems.push({ geo: sg, matrix: doorM.clone().multiply(slocal) });
    const g = new THREE.Group();
    const mk = (bucket, mat, cast) => {
      if (!buckets[bucket].length) return;
      const m = new THREE.Mesh(mergeGeos(buckets[bucket]), mat); m.castShadow = cast; g.add(m);
    };
    mk("hull", mats.hull, false);
    mk("frame", mats.frame, true);
    mk("door", mats.door, false);
    mk("emis", emisMat, false);
    mk("hazard", mats.hazard, false);
    group.add(g);
    return { ...d, theta: th, pos: [x, 5.3, z], center: [x, 1.6, z], group: g };
  });
  group.add(new THREE.Mesh(mergeGeos(signItems), signMat));

  /* --- 中央展舱：玻璃罩 + 旋转涡扇展品 + 全息环 --- */
  const holo = new THREE.Group();
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.8, 0.5, 32), mats.frame);
  ped.position.y = 0.25; ped.castShadow = true; holo.add(ped);
  const pedRing = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.05, 8, 48), mats.emissive(0x66d9e8, 1.0));
  pedRing.rotation.x = Math.PI / 2; pedRing.position.y = 0.52; holo.add(pedRing);
  // 玻璃罩（薄透明高光壳，不用 transmission 以省一次透射 pass）
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(1.45, 1.45, 3.0, 40, 1, true),
    new THREE.MeshPhysicalMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.10, roughness: 0.06, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 1.6, depthWrite: false }));
  glass.position.y = 2.0; holo.add(glass);
  for (const yy of [0.55, 3.5]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.05, 8, 48), mats.emissive(0x9fe8f5, 1.2));
    rim.rotation.x = Math.PI / 2; rim.position.y = yy; holo.add(rim);
  }
  // 涡扇展品： nacelle +  instanced 叶片 + spinner
  const engine = new THREE.Group(); engine.position.y = 2.0; holo.add(engine);
  const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 1.5, 28, 1, true), mats.pipe);
  nacelle.rotation.x = Math.PI / 2; engine.add(nacelle);
  const fan = new THREE.Group(); fan.position.z = 0.55; engine.add(fan);
  const bladeGeo = new THREE.BoxGeometry(0.10, 0.78, 0.03);
  const blades = new THREE.InstancedMesh(bladeGeo, mats.pipe, 18);
  const bm = new THREE.Matrix4(), bq = new THREE.Quaternion(), bp = new THREE.Vector3(), bs = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    bq.setFromEuler(new THREE.Euler(0, 0.5, a));
    bp.set(Math.cos(a) * 0.45, Math.sin(a) * 0.45, 0);
    bm.compose(bp, bq, bs); blades.setMatrixAt(i, bm);
  }
  blades.instanceMatrix.needsUpdate = true; fan.add(blades);
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 20), mats.pipe);
  spinner.rotation.x = Math.PI / 2; spinner.position.z = 0.3; fan.add(spinner);
  group.add(holo);

  /* --- 全息壁板（门间墙面，分子/网格图形；共享一张贴图）--- */
  const holoTex = holoPanelTexture(1000);
  const holoPanelMat = new THREE.MeshBasicMaterial({ map: holoTex });
  doors.forEach((d, i) => {
    const th = d.theta + Math.PI / doors.length;
    const panel = new THREE.Mesh(plane(4.2, 2.4), holoPanelMat);
    panel.position.set(Math.sin(th) * (R - 0.6), 2.8, Math.cos(th) * (R - 0.6));
    panel.rotation.y = th + Math.PI;
    group.add(panel);
  });

  return { group, doorMeta, holo: { fan } };
}

/* ================= 体积光锥 ================= */
function lightCone(radius, height, color, intensity) {
  const geo = new THREE.ConeGeometry(radius, height, 24, 1, true);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(color) }, uInt: { value: intensity }, uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      void main(){ vUv=uv; vN=normalize(normalMatrix*normal); vec4 wp=modelMatrix*vec4(position,1.0); vW=wp.xyz;
        gl_Position=projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      uniform vec3 uColor; uniform float uInt; uniform float uTime;
      void main(){
        vec3 V=normalize(cameraPosition - vW);
        float rim=pow(abs(dot(normalize(vN),V)),1.2);
        float fall=pow(vUv.y,1.8);
        float flick=0.92+0.08*sin(uTime*1.7+vW.x*0.7);
        float a=fall*(0.25+0.75*rim)*uInt*flick;
        gl_FragColor=vec4(uColor*a, a);
      }`,
  });
  return new THREE.Mesh(geo, mat);
}

/* ================= 后处理 ================= */
const QUAD_VS = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }`;
function fsPass(frag, uniforms) {
  return new THREE.ShaderMaterial({ uniforms, vertexShader: QUAD_VS, fragmentShader: frag, depthTest: false, depthWrite: false });
}
const BRIGHT_FS = `varying vec2 vUv; uniform sampler2D tSrc; uniform float uThresh;
  void main(){ vec3 c=texture2D(tSrc,vUv).rgb; float l=max(max(c.r,c.g),c.b);
    float k=smoothstep(uThresh,uThresh+0.6,l); gl_FragColor=vec4(c*k,1.0); }`;
const BLUR_FS = `varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uDir;
  void main(){ vec3 s=texture2D(tSrc,vUv).rgb*0.227027;
    s+=texture2D(tSrc,vUv+uDir*1.384615).rgb*0.316216; s+=texture2D(tSrc,vUv-uDir*1.384615).rgb*0.316216;
    s+=texture2D(tSrc,vUv+uDir*3.230769).rgb*0.070270; s+=texture2D(tSrc,vUv-uDir*3.230769).rgb*0.070270;
    gl_FragColor=vec4(s,1.0); }`;
const COMPOSITE_FS = `varying vec2 vUv;
  uniform sampler2D tScene; uniform sampler2D tB1; uniform sampler2D tB2; uniform sampler2D tStreak;
  uniform float uBloom; uniform float uTime; uniform float uExposure; uniform vec2 uRes;
  vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0); }
  float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  void main(){
    vec2 uv=vUv; vec2 d=uv-0.5; float r2=dot(d,d);
    float ca=0.0016*r2;
    vec3 col;
    col.r=texture2D(tScene,uv+d*ca).r;
    col.g=texture2D(tScene,uv).g;
    col.b=texture2D(tScene,uv-d*ca).b;
    col+= (texture2D(tB1,uv).rgb*0.65 + texture2D(tB2,uv).rgb*0.55) * uBloom;
    col+= texture2D(tStreak,uv).rgb * vec3(0.35,0.62,1.0) * 0.55;
    col*=uExposure;
    col=aces(col);
    col=pow(col,vec3(0.96,1.0,1.04));
    col=mix(col, col*vec3(1.05,1.0,0.94), smoothstep(0.5,1.0,dot(col,vec3(0.333))));
    col=(col-0.5)*1.06+0.5;
    col*=1.0 - smoothstep(0.35,0.95,r2*1.9)*0.55;
    col+= (hash(uv*uRes+uTime)-0.5)*0.028;
    col=clamp(col,0.0,1.0);
    vec3 srgb=mix(col*12.92, 1.055*pow(col,vec3(1.0/2.4))-0.055, step(0.0031308,col));
    gl_FragColor=vec4(srgb,1.0);
  }`;

/* ================= 主入口 ================= */
export function createStation3D({ canvas, doors, onSelect }) {
  if (innerWidth < 760) return null; // 窄屏交给 CSS 走廊
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  } catch { return null; }
  if (!renderer.getContext()) return null;
  const isWebGL2 = renderer.capabilities.isWebGL2;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.info.autoReset = false; // 累计一帧内所有 pass 的 draw call
  const tCreate = performance.now();
  let firstFrameMs = 0;
  const gl = renderer.getContext();
  const dbgExt = gl.getExtension("WEBGL_debug_renderer_info");
  const gpuString = dbgExt ? gl.getParameter(dbgExt.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04060b);
  scene.fog = new THREE.FogExp2(0x05070d, 0.016);
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 90);

  /* --- 环境反射（PMREM）--- */
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(30, 16, 16),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.08, 0.14), side: THREE.BackSide })));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(3.5, 4.2, 5.5), side: THREE.DoubleSide }));
    strip.position.set(Math.sin(a) * 18, 8, Math.cos(a) * 18); strip.lookAt(0, 4, 0); envScene.add(strip);
  }
  const warm = new THREE.Mesh(new THREE.PlaneGeometry(10, 3),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(4.0, 2.6, 1.2), side: THREE.DoubleSide }));
  warm.position.set(0, -6, 0); warm.rotation.x = Math.PI / 2; envScene.add(warm);
  scene.environment = pmrem.fromScene(envScene, 0.035).texture;

  /* --- 材质 --- */
  const tex = hullTextures();
  const mats = {
    hull: new THREE.MeshStandardMaterial({ map: tex.albedo, bumpMap: tex.bump, bumpScale: 0.6, roughnessMap: tex.rough, metalness: 0.5, roughness: 0.5, envMapIntensity: 0.8 }),
    frame: new THREE.MeshStandardMaterial({ color: 0x39445c, metalness: 0.85, roughness: 0.5, envMapIntensity: 1.1 }),
    pipe: new THREE.MeshStandardMaterial({ color: 0x6a7688, metalness: 0.9, roughness: 0.45, envMapIntensity: 1.2 }),
    door: new THREE.MeshStandardMaterial({ color: 0x1c2434, metalness: 0.85, roughness: 0.45, bumpMap: tex.bump, bumpScale: 0.3, envMapIntensity: 0.8 }),
    floor: new THREE.MeshStandardMaterial({ map: floorTexture(), metalness: 0.55, roughness: 0.28, envMapIntensity: 1.2 }),
    ceil: new THREE.MeshStandardMaterial({ color: 0x141b28, metalness: 0.6, roughness: 0.7 }),
    hazard: new THREE.MeshStandardMaterial({ color: 0x2a2f3a, metalness: 0.4, roughness: 0.8 }),
    emissive: (hex, inten) => {
      const k = hex + ":" + inten;
      if (!mats._emiCache) mats._emiCache = new Map();
      if (!mats._emiCache.has(k)) mats._emiCache.set(k, new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(inten) }));
      return mats._emiCache.get(k);
    },
    sign: (num, title) => {
      const t = signTexture(num, title);
      return new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 1.1, metalness: 0.2, roughness: 0.6 });
    },
  };
  mats.hazard.map = canvasTex(128, (g, s) => {
    g.fillStyle = "#181d26"; g.fillRect(0, 0, s, s);
    g.fillStyle = "#c9922e";
    for (let x = -s; x < s * 2; x += 32) { g.beginPath(); g.moveTo(x, s); g.lineTo(x + 16, s); g.lineTo(x + 16 + s, 0); g.lineTo(x + s, 0); g.fill(); }
  }, { repeat: [4, 1] });
  mats.hazard.needsUpdate = true;

  const built = buildStation(scene, doors, mats);

  /* --- 灯光 --- */
  scene.add(new THREE.HemisphereLight(0x9fb4cc, 0x2a3138, 1.25));
  const center = new THREE.PointLight(0xffd2a0, 18, 40, 2); center.position.set(0, 5.2, 0); scene.add(center);
  const cool = new THREE.PointLight(0x9fe8f5, 90, 30, 2); cool.position.set(0, 2.4, 11); scene.add(cool);
  const key = new THREE.SpotLight(0xeaf6ff, 420, 40, 1.0, 0.7, 1.6);
  key.position.set(0, H - 0.4, 0); key.target.position.set(0, 0, 0);
  key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0005;
  scene.add(key, key.target);
  built.doorMeta.forEach((d, i) => {
    const pl = new THREE.PointLight(i % 2 ? 0x66d9e8 : 0xf2b45c, 12, 8, 2);
    pl.position.set(d.center[0] * 0.86, 3.2, d.center[2] * 0.86); scene.add(pl);
  });

  // 场景静态：首帧正常算阴影，之后冻结（静态烘焙），不再每帧重算 shadow pass
  let shadowBaked = false;
  // 实例化批次的包围球需显式计算，视锥剔除才正确
  built.group.traverse((o) => { if (o.isInstancedMesh) o.computeBoundingSphere(); });

  /* 体积光锥 / 尘埃 / 透明全息环在本 MSAA+HalfFloat 组合下产生黑块伪影，
   * 已移除；氛围改由明亮布光 + 泛光 + 不发光屏幕承担。 */

  /* --- 渲染目标 / 后处理 --- */
  const rtOpts = { type: isWebGL2 ? THREE.HalfFloatType : THREE.UnsignedByteType, depthBuffer: true };
  const rtScene = new THREE.WebGLRenderTarget(2, 2, { ...rtOpts, samples: isWebGL2 ? 2 : 0 });
  const rtB1a = new THREE.WebGLRenderTarget(2, 2, rtOpts), rtB1b = new THREE.WebGLRenderTarget(2, 2, rtOpts);
  const rtB2a = new THREE.WebGLRenderTarget(2, 2, rtOpts), rtB2b = new THREE.WebGLRenderTarget(2, 2, rtOpts);
  const rtS2 = new THREE.WebGLRenderTarget(2, 2, rtOpts);
  const quadScene = new THREE.Scene();
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadGeo = new THREE.PlaneGeometry(2, 2);
  const brightMat = fsPass(BRIGHT_FS, { tSrc: { value: null }, uThresh: { value: 1.1 } });
  const blurMat = fsPass(BLUR_FS, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
  const compMat = fsPass(COMPOSITE_FS, {
    tScene: { value: null }, tB1: { value: null }, tB2: { value: null }, tStreak: { value: null },
    uBloom: { value: 0.45 }, uTime: { value: 0 }, uExposure: { value: 1.22 }, uRes: { value: new THREE.Vector2(1, 1) },
  });
  const quad = new THREE.Mesh(quadGeo, brightMat); quadScene.add(quad);
  const runPass = (mat, target) => { quad.material = mat; renderer.setRenderTarget(target); renderer.render(quadScene, quadCam); };

  let W = 2, Hh = 2;
  function resize() {
    W = canvas.clientWidth || innerWidth; Hh = canvas.clientHeight || innerHeight;
    renderer.setSize(W, Hh, false);
    camera.aspect = W / Hh; camera.updateProjectionMatrix();
    const dpr = renderer.getPixelRatio();
    const w = Math.max(2, Math.round(W * dpr)), h = Math.max(2, Math.round(Hh * dpr));
    rtScene.setSize(w, h);
    rtB1a.setSize(w >> 1, h >> 1); rtB1b.setSize(w >> 1, h >> 1);
    rtB2a.setSize(w >> 2, h >> 2); rtB2b.setSize(w >> 2, h >> 2);
    rtS2.setSize(w >> 2, h >> 2);
    compMat.uniforms.uRes.value.set(w, h);
  }

  /* --- 相机 / 交互（沿用原手感）--- */
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let yaw = 0, pitch = -0.06, yawV = 0, pitchV = 0, moveZ = -6, bob = 0, t0 = performance.now();
  let dragging = false, lastX = 0, lastY = 0, idle = 0;
  let focused = null, docking = false, dockT = 0, dockFrom = null, dockTo = null;
  let raf = 0, destroyed = false;

  const eye = () => [Math.sin(yaw) * moveZ, 1.72 + bob, Math.cos(yaw) * moveZ];
  function pick() {
    let best = null, bd = 0.34;
    for (const d of built.doorMeta) {
      const diff = Math.abs(angDiff(yaw, d.theta));
      if (Math.abs(pitch) < 0.42 && diff < bd) { bd = diff; best = d; }
    }
    return best;
  }

  /* --- DOM 铭牌 --- */
  const plateLayer = canvas.parentElement.querySelector(".station-plates") || (() => {
    const d = document.createElement("div"); d.className = "station-plates"; canvas.parentElement.append(d); return d;
  })();
  const plates = built.doorMeta.map((d) => {
    const el = document.createElement("button");
    el.className = "station-plate";
    const i = document.createElement("i");
    const b = document.createElement("b"); b.textContent = d.num;
    const sp = document.createElement("span"); sp.textContent = d.title;
    el.append(i, b, sp);
    el.addEventListener("click", (ev) => { ev.stopPropagation(); enter(d); });
    plateLayer.append(el); return el;
  });
  const v3 = new THREE.Vector3();
  function updatePlates() {
    built.doorMeta.forEach((d, i) => {
      v3.set(d.pos[0], d.pos[1], d.pos[2]).project(camera);
      const p = plates[i];
      if (v3.z > 1 || v3.z < -1) { p.style.opacity = "0"; p.style.pointerEvents = "none"; return; }
      const sx = (v3.x * 0.5 + 0.5) * W, sy = (0.5 - v3.y * 0.5) * Hh;
      if (sx < -120 || sx > W + 120 || sy < -80 || sy > Hh + 80) { p.style.opacity = "0"; p.style.pointerEvents = "none"; return; }
      const e = eye();
      const dist = Math.hypot(d.pos[0] - e[0], d.pos[2] - e[2]);
      const edge = clamp(Math.min(sx, W - sx) / 90, 0, 1);
      const vis = clamp(1.15 - dist / 26, 0, 1) * edge;
      p.style.opacity = String(vis);
      p.style.pointerEvents = vis > 0.35 ? "auto" : "none";
      p.style.transform = `translate(-50%,-50%) translate(${sx}px, ${sy}px)`;
      p.classList.toggle("is-on", focused && focused.num === d.num);
    });
  }

  function enter(d) {
    if (docking) return;
    docking = true; dockT = 0; dockFrom = { yaw, z: moveZ }; dockTo = d;
    setTimeout(() => onSelect && onSelect(d), reduced ? 0 : 1150);
  }

  /* --- 事件 --- */
  canvas.addEventListener("mousedown", (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; idle = 0; canvas.classList.add("is-grab"); });
  addEventListener("mouseup", () => { dragging = false; canvas.classList.remove("is-grab"); });
  addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY;
    yawV = -dx * 0.0022; pitchV = -dy * 0.0018;
    yaw += yawV; pitch = clamp(pitch + pitchV, -0.62, 0.62); idle = 0;
  });
  canvas.addEventListener("click", () => { if (focused && !docking) enter(focused); });
  canvas.addEventListener("touchstart", (e) => { dragging = true; lastX = e.touches[0].clientX; lastY = e.touches[0].clientY; idle = 0; }, { passive: true });
  canvas.addEventListener("touchmove", (e) => {
    if (!dragging) return;
    const dx = e.touches[0].clientX - lastX, dy = e.touches[0].clientY - lastY;
    lastX = e.touches[0].clientX; lastY = e.touches[0].clientY;
    yawV = -dx * 0.0030; pitchV = -dy * 0.0026;
    yaw += yawV; pitch = clamp(pitch + pitchV, -0.62, 0.62); idle = 0;
  }, { passive: true });
  canvas.addEventListener("touchend", () => { dragging = false; }, { passive: true });
  addEventListener("wheel", (e) => { if (docking) return; moveZ = clamp(moveZ + (e.deltaY > 0 ? -0.55 : 0.55), -9, 3.2); idle = 0; }, { passive: true });
  addEventListener("resize", resize, { passive: true });

  /* --- 帧循环 --- */
  let fpsAcc = 0, fpsN = 0, qualityChecked = false;
  let perfFpsT = performance.now(), perfFpsN = 0, perfFps = 0;
  let perfCpuAcc = 0, perfCpuN = 0, perfCpuMs = 0;
  function frame(now) {
    if (destroyed) return;
    const cpuT = performance.now();
    renderer.info.reset();
    if (!firstFrameMs) firstFrameMs = performance.now() - tCreate;
    perfFpsN++;
    if (now - perfFpsT >= 1000) { perfFps = perfFpsN * 1000 / (now - perfFpsT); perfFpsN = 0; perfFpsT = now; }
    const dt = Math.min(0.05, (now - t0) / 1000); t0 = now;
    if (!reduced) bob = Math.sin(now * 0.0006) * 0.045;
    if (docking && dockTo) {
      dockT = Math.min(1, dockT + dt / 1.15);
      const e = 1 - Math.pow(1 - dockT, 3);
      yaw = dockFrom.yaw + angDiff(dockTo.theta, dockFrom.yaw) * e;
      pitch += (0 - pitch) * e * 0.2;
      moveZ = dockFrom.z + (11.2 - dockFrom.z) * e;
    } else if (!dragging) {
      yaw += yawV; pitch = clamp(pitch + pitchV, -0.62, 0.62);
      yawV *= 0.93; pitchV *= 0.93; idle += dt;
      if (idle > 3.2 && !reduced) yaw += dt * 0.035;
    }
    const e = eye();
    camera.position.set(e[0], e[1], e[2]);
    const f = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
    camera.lookAt(e[0] + f[0], e[1] + f[1], e[2] + f[2]);

    const tt = now * 0.001;
    if (built.holo.fan) built.holo.fan.rotation.z = tt * 2.4;
    center.intensity = 18 + Math.sin(tt * 2.1) * 1.5;

    renderer.setRenderTarget(rtScene);
    renderer.render(scene, camera);
    if (!shadowBaked) { renderer.shadowMap.autoUpdate = false; shadowBaked = true; }
    brightMat.uniforms.tSrc.value = rtScene.texture; runPass(brightMat, rtB1a);
    blurMat.uniforms.tSrc.value = rtB1a.texture; blurMat.uniforms.uDir.value.set(1 / rtB1a.width, 0); runPass(blurMat, rtB1b);
    blurMat.uniforms.tSrc.value = rtB1b.texture; blurMat.uniforms.uDir.value.set(0, 1 / rtB1b.height); runPass(blurMat, rtB1a);
    blurMat.uniforms.tSrc.value = rtB1a.texture; blurMat.uniforms.uDir.value.set(2 / rtB2a.width, 0); runPass(blurMat, rtB2a);
    blurMat.uniforms.tSrc.value = rtB2a.texture; blurMat.uniforms.uDir.value.set(0, 2 / rtB2a.height); runPass(blurMat, rtB2b);
    // 变形镜头横向光晕（单 pass，复用 half-res 亮部）
    blurMat.uniforms.tSrc.value = rtB1a.texture; blurMat.uniforms.uDir.value.set(9 / rtS2.width, 0); runPass(blurMat, rtS2);
    compMat.uniforms.tScene.value = rtScene.texture;
    compMat.uniforms.tB1.value = rtB1a.texture;
    compMat.uniforms.tB2.value = rtB2b.texture;
    compMat.uniforms.tStreak.value = rtS2.texture;
    compMat.uniforms.uTime.value = tt;
    runPass(compMat, null);

    focused = pick();
    updatePlates();

    if (!qualityChecked) {
      fpsAcc += dt; fpsN++;
      if (fpsAcc > 2) {
        qualityChecked = true;
        if (fpsN / fpsAcc < 34) { renderer.setPixelRatio(1); resize(); }
      }
    }
    perfCpuAcc += performance.now() - cpuT; perfCpuN++;
    if (perfCpuN >= 30) { perfCpuMs = perfCpuAcc / perfCpuN; perfCpuAcc = 0; perfCpuN = 0; }
    raf = requestAnimationFrame(frame);
  }

  resize();
  raf = requestAnimationFrame(frame);

  // 页面隐藏时停帧，省电省 GPU
  const onVis = () => {
    if (document.hidden) cancelAnimationFrame(raf);
    else if (!destroyed) { t0 = performance.now(); raf = requestAnimationFrame(frame); }
  };
  document.addEventListener("visibilitychange", onVis);

  function getPerf() {
    const texSet = new Set();
    scene.traverse((o) => {
      const m = o.material;
      if (!m) return;
      for (const k of ["map", "bumpMap", "roughnessMap", "normalMap", "emissiveMap", "alphaMap", "metalnessMap"]) {
        if (m[k] && m[k].image) texSet.add(m[k]);
      }
    });
    let texBytes = 0;
    for (const t of texSet) texBytes += (t.image.width || 0) * (t.image.height || 0) * 4;
    const rts = [rtScene, rtB1a, rtB1b, rtB2a, rtB2b, rtS2];
    let rtBytes = 0;
    for (const r of rts) rtBytes += r.width * r.height * 8; // RGBA16F
    const ri = renderer.info;
    return {
      fps: Math.round(perfFps),
      cpuMs: +perfCpuMs.toFixed(2),
      loadMs: Math.round(firstFrameMs),
      calls: ri.render.calls,
      triangles: ri.render.triangles,
      points: ri.render.points,
      textures: ri.memory.textures,
      geometries: ri.memory.geometries,
      programs: ri.programs ? ri.programs.length : 0,
      texBytes, rtBytes,
      gpu: gpuString, webgl2: isWebGL2,
      dpr: renderer.getPixelRatio(),
      res: [canvas.width, canvas.height],
    };
  }

  return {
    kind: "webgl-cinematic",
    doors: built.doorMeta,
    get focused() { return focused; },
    enter,
    getPerf,
    destroy() {
      destroyed = true; cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
      renderer.dispose(); pmrem.dispose();
      rtScene.dispose(); rtB1a.dispose(); rtB1b.dispose(); rtB2a.dispose(); rtB2b.dispose(); rtS2.dispose();
    },
  };
}
