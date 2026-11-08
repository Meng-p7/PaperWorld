/* PaperWorld · 首页空间站外景
 *
 * 全部由本地 three.js 程序化搭建，不加载外部 GLB 或远程贴图。
 * 结构：环形居住舱、24 个舱段、径向桁架、中央脊柱、对接通道与导向瓣、
 *       对开舱门、太阳翼、散热板、天线与外部货舱。
 * 材质：程序化 albedo / bump / roughness + PMREM 环境反射 + 柔和投影。
 * 镜头：远景 → 侧向接近 → 对接舱门；桌面与竖屏分别构图。
 * 降级：WebGL 不可用返回 null；低帧率自动降低 DPR/阴影；reduced-motion 静态。
 */
import * as THREE from "../../vendor/three/three.module.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

function guessTier() {
  const coarse = matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
  const mem = navigator.deviceMemory || 4;
  if (coarse && (mem <= 4 || (navigator.hardwareConcurrency || 4) <= 4)) return "low";
  if (coarse || mem <= 4) return "medium";
  return "high";
}

function seeded(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

function canvasTex(w, h, draw, { srgb = true, repeat = [1, 1], aniso = 4 } = {}) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* 舱壁：浅色金属板 + 接缝 + 铆钉 + 警示标 + 轻微使用痕迹 */
function hullMaps(size) {
  const rnd = seeded(20261108);
  const albedo = canvasTex(size, size, (g, s) => {
    g.fillStyle = "#a9b1bb"; g.fillRect(0, 0, s, s);
    const cols = 4, rows = 4, cw = s / cols, ch = s / rows;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const v = 162 + Math.floor(rnd() * 20);
      g.fillStyle = `rgb(${v},${v + 4},${v + 10})`;
      g.fillRect(x * cw + 3, y * ch + 3, cw - 6, ch - 6);
      g.fillStyle = "rgba(255,255,255,.08)";
      g.fillRect(x * cw + 4, y * ch + 4, cw - 8, 1.5);
    }
    g.strokeStyle = "#5c6571"; g.lineWidth = Math.max(2, s / 220);
    for (let i = 0; i <= cols; i++) { g.beginPath(); g.moveTo(i * cw, 0); g.lineTo(i * cw, s); g.stroke(); }
    for (let i = 0; i <= rows; i++) { g.beginPath(); g.moveTo(0, i * ch); g.lineTo(s, i * ch); g.stroke(); }
    g.fillStyle = "#454d58";
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++)
      for (const [dx, dy] of [[10, 10], [cw - 10, 10], [10, ch - 10], [cw - 10, ch - 10]]) {
        g.beginPath(); g.arc(x * cw + dx, y * ch + dy, Math.max(1.4, s / 260), 0, Math.PI * 2); g.fill();
      }
    for (let i = 0; i < 8; i++) {
      g.fillStyle = "rgba(65,72,82,.55)";
      g.fillRect(rnd() * s, rnd() * s, s * (0.04 + rnd() * 0.08), s * 0.008);
    }
    g.strokeStyle = "rgba(44,50,58,.28)"; g.lineWidth = s / 280;
    for (let i = 0; i < 70; i++) {
      const x = rnd() * s, y = rnd() * s;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - .5) * s * .05, y + (rnd() - .5) * s * .018); g.stroke();
    }
    // 小面积警示条与检修口
    g.fillStyle = "#2a3139"; g.fillRect(s * .06, s * .78, s * .18, s * .1);
    g.strokeStyle = "#c9a45a"; g.lineWidth = Math.max(1, s / 200);
    for (let x = s * .06; x < s * .24; x += s * .03) {
      g.beginPath(); g.moveTo(x, s * .88); g.lineTo(x + s * .015, s * .78); g.stroke();
    }
  }, { repeat: [2, 1] });

  const bump = canvasTex(size, size, (g, s) => {
    g.fillStyle = "#8a8a8a"; g.fillRect(0, 0, s, s);
    const cw = s / 4, ch = s / 4;
    g.strokeStyle = "#3b3b3b"; g.lineWidth = Math.max(2, s / 260);
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(i * cw, 0); g.lineTo(i * cw, s); g.stroke();
      g.beginPath(); g.moveTo(0, i * ch); g.lineTo(s, i * ch); g.stroke();
    }
    g.fillStyle = "#686868";
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++)
      for (const [dx, dy] of [[10, 10], [cw - 10, 10], [10, ch - 10], [cw - 10, ch - 10]]) {
        g.beginPath(); g.arc(x * cw + dx, y * ch + dy, 2.4, 0, Math.PI * 2); g.fill();
      }
  }, { srgb: false, repeat: [2, 1] });

  const rough = canvasTex(Math.max(128, size >> 1), Math.max(128, size >> 1), (g, s) => {
    g.fillStyle = "#9a9a9a"; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 400; i++) {
      const v = 115 + Math.floor(rnd() * 80);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(rnd() * s, rnd() * s, 2 + rnd() * 10, 1 + rnd() * 2);
    }
  }, { srgb: false, repeat: [2, 1] });
  return { albedo, bump, rough };
}

/* 太阳翼：电池片、汇流条与板间缝 */
function solarTexture(size = 512) {
  const rnd = seeded(9401);
  const albedo = canvasTex(size, size / 2, (g, w, h) => {
    g.fillStyle = "#071527"; g.fillRect(0, 0, w, h);
    const cols = 12, rows = 6, cw = w / cols, ch = h / rows;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const v = 32 + Math.floor(rnd() * 22);
      g.fillStyle = `rgb(${v},${v + 22},${v + 52})`;
      g.fillRect(x * cw + 2, y * ch + 2, cw - 4, ch - 4);
      g.fillStyle = "rgba(120,180,255,.08)";
      g.fillRect(x * cw + 3, y * ch + 3, cw - 6, 2);
    }
    g.strokeStyle = "rgba(160,196,230,.35)"; g.lineWidth = 2;
    for (let i = 0; i <= cols; i++) { g.beginPath(); g.moveTo(i * cw, 0); g.lineTo(i * cw, h); g.stroke(); }
    for (let i = 0; i <= rows; i++) { g.beginPath(); g.moveTo(0, i * ch); g.lineTo(w, i * ch); g.stroke(); }
    g.fillStyle = "rgba(190,215,240,.55)";
    for (let i = 0; i < 12; i++) g.fillRect(0, i * h / 12, w, 1);
  }, { repeat: [1, 1] });
  const rough = canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = "#5d5d5d"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(130,130,130,${0.12 + rnd() * 0.2})`; g.fillRect(rnd() * w, rnd() * h, 10, 2); }
  }, { srgb: false });
  return { albedo, rough };
}

/* 散热板与多层隔热膜 */
function foilTexture(size = 256) {
  const rnd = seeded(7721);
  return canvasTex(size, size, (g, s) => {
    g.fillStyle = "#9c9385"; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) {
      const v = 110 + Math.floor(rnd() * 80);
      g.fillStyle = `rgba(${v},${v - 4},${v - 12},${.1 + rnd() * .25})`;
      g.beginPath();
      g.moveTo(rnd() * s, rnd() * s);
      g.lineTo(rnd() * s, rnd() * s);
      g.lineTo(rnd() * s, rnd() * s);
      g.fill();
    }
    g.strokeStyle = "rgba(60,55,48,.2)"; g.lineWidth = 1;
    for (let i = 0; i < 14; i++) { g.beginPath(); g.moveTo(0, i * s / 14); g.lineTo(s, i * s / 14); g.stroke(); }
  }, { repeat: [2, 2] });
}

function pbr({ map, bump, rough, color = 0xffffff, metalness = 0.65, roughness = 0.52, env = 1 }) {
  return new THREE.MeshStandardMaterial({
    color, map, bumpMap: bump, bumpScale: bump ? 0.35 : 0,
    roughnessMap: rough, metalness, roughness, envMapIntensity: env,
  });
}

function cylinderBetween(a, b, radius, mat, segments = 8) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const dir = vb.clone().sub(va), len = dir.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, segments), mat);
  mesh.position.copy(va).add(vb).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return mesh;
}

/* 一组可复用梁：一次 InstancedMesh 画完桁架 */
function beamBatch(items, mat) {
  const geo = new THREE.CylinderGeometry(1, 1, 1, 7);
  const inst = new THREE.InstancedMesh(geo, mat, items.length);
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion(), mid = new THREE.Vector3(), dir = new THREE.Vector3(), sc = new THREE.Vector3();
  items.forEach(([a, b, r], i) => {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    dir.copy(vb).sub(va);
    const len = dir.length();
    mid.copy(va).add(vb).multiplyScalar(0.5);
    q.setFromUnitVectors(up, dir.normalize());
    sc.set(r, len, r);
    inst.setMatrixAt(i, new THREE.Matrix4().compose(mid, q, sc));
  });
  inst.instanceMatrix.needsUpdate = true;
  return inst;
}

function buildStation({ tex = 512, detail = true } = {}) {
  const root = new THREE.Group();
  root.rotation.set(-0.23, 0.22, 0.02);

  const hullTex = hullMaps(tex);
  const solarTex = solarTexture(Math.max(256, tex));
  const foil = foilTexture(Math.max(128, tex >> 1));
  const mats = {
    hull: pbr({ ...hullTex, metalness: 0.55, roughness: 0.58, env: 1.05 }),
    hull2: pbr({ ...hullTex, color: 0xd4d9df, metalness: 0.48, roughness: 0.66, env: .8 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x252e3a, metalness: .75, roughness: .46, envMapIntensity: .9 }),
    trim: new THREE.MeshStandardMaterial({ color: 0xb5bec9, metalness: .82, roughness: .36, envMapIntensity: 1.1 }),
    solar: new THREE.MeshStandardMaterial({ map: solarTex.albedo, roughnessMap: solarTex.rough, color: 0xdcecff, emissive: 0x071a33, emissiveIntensity: .65, metalness: .35, roughness: .36, envMapIntensity: 1.1 }),
    foil: new THREE.MeshStandardMaterial({ map: foil, metalness: .62, roughness: .52, envMapIntensity: .75 }),
    radiator: new THREE.MeshStandardMaterial({ color: 0xd5d7d2, metalness: .25, roughness: .72, envMapIntensity: .45 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x24303a, metalness: .2, roughness: .18, transparent: true, opacity: .42, envMapIntensity: 1.2 }),
  };
  const windowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.85, 1.36, .9) });
  const cyanMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(.42, .95, 1.15) });
  const redMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, .26, .18) });

  /* ---------- 主环 ---------- */
  const R = 12.5;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 1.14, 22, 128), mats.hull);
  ring.castShadow = detail; ring.receiveShadow = true;
  root.add(ring);
  for (const rr of [R - 1.0, R + 1.0]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.1, 8, 128), mats.trim);
    root.add(band);
  }

  /* 24 个圆柱舱段：长轴沿环切向，形成连续的居住环；正面带舷窗 */
  const N = detail ? 24 : 16;
  const moduleGeo = new THREE.CapsuleGeometry(0.82, 2.05, 5, 12);
  const modules = new THREE.InstancedMesh(moduleGeo, mats.hull, N);
  const windows = new THREE.InstancedMesh(new THREE.BoxGeometry(.95, .11, .05), windowMat, N * (detail ? 2 : 1));
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3();
  let wi = 0;
  const Z = new THREE.Vector3(0, 0, 1);
  const profile = [1.04, .94, 1.0, .9, 1.06, .96];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const sy = profile[i % profile.length];
    const mr = R + 1.16;
    const x = Math.cos(a) * mr, y = Math.sin(a) * mr;
    // Capsule 的 Y 轴是长轴，绕 Z 旋转 a 后正好沿环的切向。
    Q.setFromAxisAngle(Z, a);
    M.compose(P.set(x, y, 0), Q, S.set(1, sy, 1));
    modules.setMatrixAt(i, M);
    const count = detail ? 2 : 1;
    for (let k = 0; k < count; k++) {
      const ox = (k ? .58 : -.58);
      const wx = x - Math.sin(a) * ox;
      const wy = y + Math.cos(a) * ox;
      Q.setFromAxisAngle(Z, a + Math.PI / 2);
      M.compose(P.set(wx, wy, .92), Q, S.set(1, 1, 1));
      windows.setMatrixAt(wi++, M);
      Q.setFromAxisAngle(Z, a);
    }
  }
  modules.instanceMatrix.needsUpdate = true; windows.instanceMatrix.needsUpdate = true;
  modules.castShadow = detail;
  root.add(modules, windows);

  /* ---------- 辐条：双梁 + 斜撑 ---------- */
  const beams = [];
  const SPOKES = 6;
  for (let i = 0; i < SPOKES; i++) {
    const a = (i / SPOKES) * Math.PI * 2 + 0.14;
    const c = Math.cos(a), s = Math.sin(a);
    for (const dz of [-.42, .42]) {
      beams.push([[c * 2.3, s * 2.3, dz], [c * (R - 1.05), s * (R - 1.05), dz], .17]);
    }
    for (let k = 0; k < 3; k++) {
      const r1 = 3.1 + k * 3.1, r2 = r1 + 1.55;
      beams.push([[c * r1, s * r1, -.42], [c * r2, s * r2, .42], .055]);
      beams.push([[c * r1, s * r1, .42], [c * r2, s * r2, -.42], .055]);
    }
  }
  const beamMesh = beamBatch(beams, mats.trim);
  root.add(beamMesh);

  /* ---------- 中央脊柱 ---------- */
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(2.35, 2.55, 6.8, 32), mats.hull2);
  hub.rotation.x = Math.PI / 2; hub.castShadow = true;
  root.add(hub);
  for (const z of [-3.1, -1.25, 1.25, 3.15]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(2.53, .1, 8, 48), mats.trim);
    band.position.z = z; root.add(band);
  }
  const hubCap = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, .35, 32), mats.trim);
  hubCap.rotation.x = Math.PI / 2; hubCap.position.z = 3.45; root.add(hubCap);
  const corePort = new THREE.Mesh(new THREE.TorusGeometry(1.65, .11, 8, 40), cyanMat);
  corePort.position.z = 3.65; root.add(corePort);
  /* 后方服务舱 */
  const service = new THREE.Mesh(new THREE.CylinderGeometry(2.05, 2.2, 4.6, 28), mats.foil);
  service.rotation.x = Math.PI / 2; service.position.z = -5.6; service.castShadow = true;
  root.add(service);
  const serviceCap = new THREE.Mesh(new THREE.CylinderGeometry(2.05, 1.75, .5, 28), mats.trim);
  serviceCap.rotation.x = Math.PI / 2; serviceCap.position.z = -8.0; root.add(serviceCap);
  const serviceRing = new THREE.Mesh(new THREE.TorusGeometry(2.2, .12, 8, 36), mats.trim);
  serviceRing.position.z = -4.7; root.add(serviceRing);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + .4;
    const pod = new THREE.Mesh(new THREE.BoxGeometry(1.15, .86, 2.2), mats.dark);
    pod.position.set(Math.cos(a) * 2.5, Math.sin(a) * 2.5, -6.1);
    pod.rotation.z = a;
    root.add(pod);
  }

  /* ---------- 对接通道 ---------- */
  const hatchZ = 17.05;
  const baseFlange = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.55, .7, 28), mats.trim);
  baseFlange.rotation.x = Math.PI / 2; baseFlange.position.z = 4.25; root.add(baseFlange);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(1.26, 1.45, 12.5, 28, 1, true), mats.hull);
  arm.rotation.x = Math.PI / 2; arm.position.z = 10.6; arm.castShadow = true;
  root.add(arm);
  for (let z = 5.2; z < 16.5; z += 1.8) {
    const rr = new THREE.Mesh(new THREE.TorusGeometry(1.34, .075, 8, 32), mats.trim);
    rr.position.z = z; root.add(rr);
    const seg = new THREE.Mesh(new THREE.TorusGeometry(1.31, .055, 6, 28), mats.dark);
    seg.position.z = z - .55; root.add(seg);
  }
  for (const a of [0.3, Math.PI / 2 + .3, Math.PI + .3, -Math.PI / 2 + .3]) {
    const x = Math.cos(a) * 1.32, y = Math.sin(a) * 1.32;
    root.add(cylinderBetween([x, y, 4.4], [x, y, 16.5], .045, mats.trim, 6));
  }
  /* 四片导向瓣与对接靶 */
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    const petal = new THREE.Mesh(new THREE.BoxGeometry(.18, .95, 1.5), mats.trim);
    petal.position.set(Math.cos(a) * 1.55, Math.sin(a) * 1.55, hatchZ - 1.25);
    petal.rotation.z = a - Math.PI / 2;
    petal.rotation.x = Math.cos(a) * .35;
    petal.rotation.y = Math.sin(a) * .35;
    root.add(petal);
  }
  const targetMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(.7, .82, .9) });
  for (const [r, th] of [[.55, .035], [.34, .03]]) {
    const target = new THREE.Mesh(new THREE.TorusGeometry(r, th, 6, 32), targetMat);
    target.position.z = hatchZ + .1; root.add(target);
  }
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(.92, .035, .02), targetMat);
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(.035, .92, .02), targetMat);
  crossH.position.z = crossV.position.z = hatchZ + .11;
  root.add(crossH, crossV);

  /* 舱门：两扇对开面板 + 指示灯 + 门后暖光 */
  const glow = new THREE.Mesh(new THREE.CircleGeometry(1.24, 32),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(.5, .3, .12), transparent: true, opacity: .16 }));
  glow.position.z = hatchZ - .24; glow.rotation.y = Math.PI; root.add(glow);
  const doors = [];
  const doorGeo = new THREE.BoxGeometry(1.26, 2.55, .14);
  for (const side of [-1, 1]) {
    const d = new THREE.Mesh(doorGeo, mats.dark);
    d.position.set(side * .63, 0, hatchZ);
    d.userData.closedX = side * .63;
    d.castShadow = true;
    root.add(d);
    doors.push(d);
    for (let k = 0; k < 3; k++) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(1.15, .06, .04), mats.trim);
      rib.position.set(side * .63, -.72 + k * .72, hatchZ + .1);
      root.add(rib);
    }
  }
  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(.08, 10, 10), side < 0 ? redMat : cyanMat);
    lamp.position.set(side * 1.78, -1.35, hatchZ - .3);
    root.add(lamp);
  }
  const hatchLight = new THREE.PointLight(0xffc98c, 3, 18, 2);
  hatchLight.position.set(0, 0, 15.2);
  root.add(hatchLight);

  /* ---------- 太阳翼：每侧三块，独立框架与根部万向节 ---------- */
  const wingGeo = new THREE.BoxGeometry(3.7, 5.9, .06);
  const wingPanels = new THREE.InstancedMesh(wingGeo, mats.solar, 6);
  const barGeo = new THREE.BoxGeometry(3.82, .18, .16);
  const wingBars = new THREE.InstancedMesh(barGeo, mats.trim, 12);
  const spineGeo = new THREE.BoxGeometry(.12, 6.02, .16);
  const wingSpines = new THREE.InstancedMesh(spineGeo, mats.trim, 12);
  let wpi = 0, wbi = 0, wsi = 0;
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const x = side * (7.85 + k * 3.92);
      const y = .35, z = -3.0;
      M.compose(P.set(x, y, z), Q.identity(), S.set(1, 1, 1));
      wingPanels.setMatrixAt(wpi++, M);
      for (const dy of [-2.98, 2.98]) {
        M.compose(P.set(x, y + dy, z), Q.identity(), S.set(1, 1, 1));
        wingBars.setMatrixAt(wbi++, M);
      }
      for (const dx of [-1.88, 1.88]) {
        M.compose(P.set(x + dx, y, z), Q.identity(), S.set(1, 1, 1));
        wingSpines.setMatrixAt(wsi++, M);
      }
    }
    const gimbal = new THREE.Mesh(new THREE.CylinderGeometry(.38, .38, .9, 16), mats.trim);
    gimbal.rotation.z = Math.PI / 2; gimbal.position.set(side * 3.2, .35, -3.0); root.add(gimbal);
    root.add(cylinderBetween([side * 3.4, .35, -3.0], [side * 19.0, .35, -3.0], .09, mats.trim, 8));
    root.add(cylinderBetween([side * 3.4, -.15, -3.0], [side * 19.0, -.15, -3.0], .07, mats.dark, 8));
  }
  wingPanels.instanceMatrix.needsUpdate = true; wingBars.instanceMatrix.needsUpdate = true; wingSpines.instanceMatrix.needsUpdate = true;
  root.add(wingPanels, wingBars, wingSpines);

  /* ---------- 散热板 ---------- */
  for (const side of [-1, 1]) {
    const group = new THREE.Group();
    group.position.set(side * 5.2, side * 3.4, -4.3);
    group.rotation.z = side * .45;
    for (let k = 0; k < 4; k++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(5.0, .05, 1.15), mats.radiator);
      fin.position.set(0, 0, k * 1.35);
      fin.rotation.x = .18;
      group.add(fin);
    }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(5.3, .12, .12), mats.trim);
    rail.position.set(0, 0, -.7);
    group.add(rail);
    root.add(group);
  }

  /* ---------- 天线与外部操作件 ---------- */
  const dish = new THREE.Mesh(new THREE.SphereGeometry(1.15, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2.3), mats.trim);
  dish.position.set(0, -3.2, -3.4); dish.rotation.x = -1.15; root.add(dish);
  const feed = new THREE.Mesh(new THREE.CylinderGeometry(.05, .11, 1.1, 8), mats.dark);
  feed.position.set(0, -2.3, -2.55); feed.rotation.x = .55; root.add(feed);
  for (const [x, y] of [[0, -2.8], [2.1, -1.7], [-2.1, -1.7]]) {
    root.add(cylinderBetween([0, -1.6, -3.0], [x, y, -3.0], .035, mats.trim, 6));
  }
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    const hand = cylinderBetween(
      [Math.cos(a) * 2.55, Math.sin(a) * 2.55, 2.1],
      [Math.cos(a) * 2.55, Math.sin(a) * 2.55, 3.1], .028, mats.trim, 5);
    root.add(hand);
  }

  return { root, doors, glow, hatchZ, hatchLight, materials: mats, textures: { hullTex, solarTex, foil } };
}

export function createEntranceScene({ canvas }) {
  if (!canvas) return null;
  const probe = document.createElement("canvas");
  if (!(probe.getContext("webgl2") || probe.getContext("webgl"))) return null;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch { return null; }
  if (!renderer.getContext()) return null;

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const glProbe = renderer.getContext();
  const dbg = glProbe.getExtension("WEBGL_debug_renderer_info");
  const gpu = dbg ? String(glProbe.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : "";
  const softwareGL = /swiftshader|llvmpipe|software|basic render/i.test(gpu);
  let tier = softwareGL ? "low" : guessTier();
  const Q = {
    high: { dpr: 1.65, shadow: true, shadowSize: 1024, tex: 512, detail: true },
    medium: { dpr: 1.25, shadow: true, shadowSize: 512, tex: 256, detail: true },
    low: { dpr: .82, shadow: false, shadowSize: 0, tex: 256, detail: false },
  }[tier];

  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, Q.dpr));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .92;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = Q.shadow;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x050912, 0.0018);
  const camera = new THREE.PerspectiveCamera(48, 1, .1, 900);

  /* 环境反射：冷色顶光 + 暖色底部，让金属有层次而不是纯灰 */
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(40, 20, 20),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(.015, .025, .05), side: THREE.BackSide })));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(12, 1.5),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 3.0, 4.0), side: THREE.DoubleSide }));
    strip.position.set(Math.sin(a) * 24, 10, Math.cos(a) * 24);
    strip.lookAt(0, 4, 0);
    envScene.add(strip);
  }
  const warm = new THREE.Mesh(new THREE.PlaneGeometry(14, 5),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.3, .6), side: THREE.DoubleSide }));
  warm.position.set(0, -8, 0); warm.rotation.x = Math.PI / 2; envScene.add(warm);
  const envRT = pmrem.fromScene(envScene, .04);
  scene.environment = envRT.texture;

  const built = buildStation({ tex: Q.tex, detail: Q.detail });
  const station = new THREE.Group();
  station.add(built.root);
  scene.add(station);

  scene.add(new THREE.HemisphereLight(0xa8c4e4, 0x20262f, .62));
  const sun = new THREE.DirectionalLight(0xfff4e8, 2.55);
  sun.position.set(46, 32, 58);
  sun.castShadow = Q.shadow;
  if (Q.shadow) {
    sun.shadow.mapSize.set(Q.shadowSize, Q.shadowSize);
    sun.shadow.camera.left = -44; sun.shadow.camera.right = 44;
    sun.shadow.camera.top = 44; sun.shadow.camera.bottom = -44;
    sun.shadow.bias = -.0007;
    sun.shadow.normalBias = .035;
  }
  scene.add(sun);
  const earth = new THREE.DirectionalLight(0x6c9bd2, .7);
  earth.position.set(-36, -22, 24); scene.add(earth);
  const rim = new THREE.DirectionalLight(0x9fc8ff, 1.15);
  rim.position.set(-28, 8, -46); scene.add(rim);
  if (tier === "low") { earth.visible = false; rim.visible = false; }

  function simplifyMaterials() {
    // 软件 WebGL / 极低端：用带贴图的 Lambert 取代 PBR，保留轮廓与颜色，减少片元成本。
    scene.traverse((o) => {
      const mat = o.material;
      if (!mat || Array.isArray(mat)) return;
      if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
        o.material = new THREE.MeshLambertMaterial({
          map: mat.map || null,
          color: mat.color ? mat.color.clone() : 0xffffff,
          transparent: mat.transparent,
          opacity: mat.opacity,
          side: mat.side,
        });
      }
    });
  }
  if (tier === "low") simplifyMaterials();

  let W = 1, Hh = 1, centerX = 0, progress = 0;
  let frame = 0, last = 0, fps = 0, fpsN = 0, fpsT = 0, perf = {}, destroyed = false;
  let contextLost = false, shadowBaked = false;

  function layout() {
    W = canvas.clientWidth || innerWidth;
    Hh = canvas.clientHeight || innerHeight;
    renderer.setSize(W, Hh, false);
    const portrait = W / Hh < .82;
    camera.fov = portrait ? 60 : 48;
    camera.aspect = W / Hh;
    centerX = portrait ? 0 : 9.5;
    station.position.set(centerX, portrait ? 3.4 : 0, 0);
    camera.updateProjectionMatrix();
  }

  function placeCamera() {
    const p = clamp(progress, 0, 1);
    const portrait = W / Hh < .82;
    const cx = portrait ? 0 : centerX;
    let cam;
    if (p < .52) {
      const t = smooth(p / .52);
      cam = [
        lerp(cx * .55 + 4, cx * .82, t),
        lerp(portrait ? 13 : 9, portrait ? 8 : 5.2, t),
        lerp(portrait ? 132 : 82, portrait ? 72 : 50, t),
      ];
    } else if (p < .82) {
      const t = smooth((p - .52) / .30);
      cam = [lerp(cx * .82, cx, t), lerp(portrait ? 8 : 5.2, 2.6, t), lerp(portrait ? 72 : 50, 44, t)];
    } else {
      const t = smooth((p - .82) / .18);
      cam = [cx + (portrait ? 2.4 : 5.2) * t, lerp(2.6, 2.9, t), lerp(45, 40, t)];
    }
    const shift = portrait ? 0 : 7;
    const tx = p < .52 ? cx - shift : lerp(cx - shift, cx, smooth(clamp((p - .52) / .30, 0, 1)));
    const ty = p < .6 ? (portrait ? 3.4 : 1.8) : 1.7;
    const tz = p < .6 ? 0 : built.hatchZ - .5;
    camera.position.set(cam[0], cam[1], cam[2]);
    camera.lookAt(tx, ty, tz);
    camera.rotateZ(Math.sin(p * Math.PI) * .018);
    renderer.toneMappingExposure = p > .78 ? lerp(.92, .68, smooth(clamp((p - .78) / .22, 0, 1))) : .92;
    const open = clamp((p - .55) / .3, 0, 1);
    built.doors.forEach((d) => { d.position.x = d.userData.closedX * (1 + open * 2.2); });
    built.glow.material.opacity = .1 + open * .24;
    built.hatchLight.intensity = 2 + open * 3;
  }

  function renderOnce() { if (!contextLost) renderer.render(scene, camera); }
  function resize() { layout(); placeCamera(); if (reduced) renderOnce(); }

  function loop(now) {
    if (destroyed || contextLost) return;
    const cpu = performance.now();
    renderer.info.reset();
    const dt = Math.min(.05, (now - last) / 1000 || 0);
    last = now;
    if (!reduced) {
      station.rotation.z = Math.sin(now * .00006) * .01;
      station.rotation.y = Math.sin(now * .00009) * .012;
    }
    placeCamera();
    renderOnce();
    // 静态场景的阴影只算首帧；后续镜头运动不再重复 shadow pass。
    if (Q.shadow && !shadowBaked) { renderer.shadowMap.autoUpdate = false; shadowBaked = true; }
    perf.calls = renderer.info.render.calls;
    perf.triangles = renderer.info.render.triangles;
    perf.cpuMs = +((perf.cpuMs || 0) * .9 + (performance.now() - cpu) * .1).toFixed(2);
    fpsN++;
    if (now - fpsT > 1000) {
      fps = fpsN * 1000 / (now - fpsT);
      fpsN = 0; fpsT = now;
      perf.fps = Math.round(fps);
      if (fps < 34 && tier !== "low" && now > 5000) {
        tier = tier === "high" ? "medium" : "low";
        const q = { medium: { dpr: 1.25, shadow: true }, low: { dpr: .82, shadow: false } }[tier];
        renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q.dpr));
        renderer.shadowMap.enabled = q.shadow;
        sun.castShadow = q.shadow;
        renderer.shadowMap.needsUpdate = q.shadow;
        shadowBaked = false;
        earth.visible = tier !== "low";
        rim.visible = tier !== "low";
        if (tier === "low") simplifyMaterials();
        resize();
      }
    }
    frame = requestAnimationFrame(loop);
  }

  const onContextLost = (e) => {
    e.preventDefault();
    contextLost = true;
    cancelAnimationFrame(frame);
    canvas.dispatchEvent(new CustomEvent("pw:scene-lost", { bubbles: true }));
  };
  canvas.addEventListener("webglcontextlost", onContextLost, false);

  addEventListener("resize", resize, { passive: true });
  const onVis = () => {
    if (document.hidden) cancelAnimationFrame(frame);
    else if (!reduced && !destroyed && !contextLost) { last = performance.now(); frame = requestAnimationFrame(loop); }
  };
  document.addEventListener("visibilitychange", onVis);

  layout(); placeCamera(); renderOnce();
  if (!reduced) { last = performance.now(); fpsT = last; frame = requestAnimationFrame(loop); }

  return {
    backend: "webgl",
    ready: true,
    lost: () => contextLost,
    setCamera(z) {
      progress = clamp(z, 0, 1);
      if (reduced) { placeCamera(); renderOnce(); }
    },
    getPerf: () => ({ ...perf, tier, gpu, dpr: renderer.getPixelRatio(), res: [canvas.width, canvas.height] }),
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frame);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
        for (const m of mats) {
          for (const k of ["map", "bumpMap", "roughnessMap", "metalnessMap", "emissiveMap", "normalMap"]) if (m[k]) m[k].dispose();
          m.dispose();
        }
      });
      envRT.dispose(); pmrem.dispose(); renderer.dispose();
    },
  };
}
