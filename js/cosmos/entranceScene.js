/* PaperWorld · 首页空间站外景
 *
 * 用本地 vendored three.js 程序化搭一座有体积的空间站：
 * 环形居住舱、模块舱板与舷窗、中央脊柱、对接通道、舱门、太阳翼与散热板。
 * 镜头从远景推进到对接舱门，舱门在最后阶段打开；进馆后由 station.html 接管。
 *
 * 约束：不依赖 GLB、不加载外部贴图；移动端保留同一主体，只降分辨率/阴影。
 * 导出 { setCamera, ready, backend, getPerf, destroy } 给 entrance.js 驱动。
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

function metal(color, roughness = 0.5, metalness = 0.8) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, envMapIntensity: 0.8 });
}

function cylinderBetween(a, b, radius, mat, segments = 10) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const dir = vb.clone().sub(va);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(radius, radius, len, segments);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(va).add(vb).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return mesh;
}

function panelTexture() {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#0b1a2c"; g.fillRect(0, 0, 512, 256);
  const cell = 32;
  for (let y = 0; y < 256; y += cell) {
    for (let x = 0; x < 512; x += cell) {
      const v = 22 + Math.floor(Math.random() * 26);
      g.fillStyle = `rgb(${v - 8},${v + 8},${v + 30})`;
      g.fillRect(x + 2, y + 2, cell - 4, cell - 4);
      g.fillStyle = "rgba(120,170,220,.10)";
      g.fillRect(x + 3, y + 3, cell - 6, 3);
    }
  }
  g.strokeStyle = "rgba(160,190,220,.22)"; g.lineWidth = 2;
  for (let x = 0; x <= 512; x += cell) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
  for (let y = 0; y <= 256; y += cell) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function buildStation() {
  const root = new THREE.Group();
  root.rotation.set(-0.26, 0.16, 0.04);
  const hull = metal(0x8593a4, 0.70, 0.50);
  const dark = metal(0x263342, 0.58, 0.68);
  const trim = metal(0xb6c0cd, 0.50, 0.72);
  const solar = new THREE.MeshStandardMaterial({ map: panelTexture(), roughness: 0.34, metalness: 0.55, color: 0xdfeaff, emissive: 0x081727, emissiveIntensity: 0.55 });
  const win = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.15, 0.72) });
  const cyan = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.85, 1.1) });
  const red = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.25, 0.18) });

  /* 主环 + 外侧模块舱 */
  const R = 12.5;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 1.55, 22, 108), hull);
  root.add(ring);
  const moduleGeo = new THREE.BoxGeometry(4.4, 1.75, 3.4);
  const windowGeo = new THREE.BoxGeometry(1.15, 0.16, 0.08);
  const modules = new THREE.InstancedMesh(moduleGeo, hull, 28);
  const windows = [];
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const x = Math.cos(a) * R, y = Math.sin(a) * R;
    Q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), a);
    M.compose(P.set(x, y, 0), Q, S);
    modules.setMatrixAt(i, M);
    const w = new THREE.Mesh(windowGeo, i % 5 === 0 ? cyan : win);
    w.position.set(x * 1.015, y * 1.015, 1.78);
    w.rotation.z = a;
    windows.push(w);
  }
  modules.instanceMatrix.needsUpdate = true;
  root.add(modules, ...windows);

  /* 环外侧接缝与桁架 */
  const ribGeo = new THREE.TorusGeometry(R, 1.66, 8, 108);
  for (const z of [-1.05, 1.05]) {
    const rib = new THREE.Mesh(ribGeo, trim);
    rib.position.z = z;
    rib.scale.setScalar(1.005);
    root.add(rib);
  }
  /* 六根辐条 */
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.12;
    root.add(cylinderBetween([Math.cos(a) * 2.4, Math.sin(a) * 2.4, 0], [Math.cos(a) * (R - 1.2), Math.sin(a) * (R - 1.2), 0], 0.34, dark, 8));
  }

  /* 中央脊柱：轴沿 Z，从环形舱后面延伸至对接臂 */
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.9, 7.2, 32), hull);
  hub.rotation.x = Math.PI / 2;
  root.add(hub);
  for (const z of [-3.3, -1.4, 1.3, 3.2]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(2.86, 0.12, 8, 40), trim);
    band.position.z = z;
    root.add(band);
  }
  const hubCap = new THREE.Mesh(new THREE.CircleGeometry(2.7, 40), dark);
  hubCap.position.z = -3.62;
  root.add(hubCap);

  /* 对接通道：从中心脊柱向镜头方向伸出 */
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(1.28, 1.55, 13.6, 24, 1, true), hull);
  arm.rotation.x = Math.PI / 2;
  arm.position.z = 10.1;
  root.add(arm);
  for (let z = 4.2; z < 17; z += 2.1) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.42, 0.085, 8, 28), trim);
    ring.position.z = z;
    root.add(ring);
  }
  for (const a of [0.4, Math.PI / 2 + 0.3, Math.PI + 0.4, -Math.PI / 2 + 0.3]) {
    const tube = cylinderBetween([Math.cos(a) * 1.35, Math.sin(a) * 1.35, 3.6], [Math.cos(a) * 1.35, Math.sin(a) * 1.35, 16.6], 0.06, dark, 6);
    root.add(tube);
  }

  /* 舱门：外框 + 两扇门 + 门后暖光 */
  const hatchZ = 17.05;
  const frame = new THREE.Mesh(new THREE.TorusGeometry(1.58, 0.16, 10, 36), trim);
  frame.position.z = hatchZ;
  root.add(frame);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(1.36, 36), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.34, 0.20, 0.08), transparent: true, opacity: 0.20 }));
  glow.position.z = hatchZ - 0.22;
  glow.rotation.y = Math.PI;
  root.add(glow);
  const doorGeo = new THREE.BoxGeometry(1.34, 2.7, 0.16);
  const doors = [];
  for (const side of [-1, 1]) {
    const d = new THREE.Mesh(doorGeo, dark);
    d.position.set(side * 0.67, 0, hatchZ);
    d.userData.closedX = side * 0.67;
    root.add(d);
    doors.push(d);
  }
  const hatchStrip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.3, 0.04), cyan);
  hatchStrip.position.set(0, 0, hatchZ + 0.12);
  root.add(hatchStrip);
  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), side < 0 ? red : cyan);
    lamp.position.set(side * 2.0, -1.65, hatchZ - 0.3);
    root.add(lamp);
  }

  /* 太阳翼：左右各两组，带框架与贯穿式桁架 */
  const spine = new THREE.Mesh(new THREE.BoxGeometry(52, 0.42, 0.42), dark);
  spine.position.set(0, 0.4, -2.2);
  root.add(spine);
  for (let i = -12; i <= 12; i++) {
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.94, 0.12), trim);
    brace.position.set(i * 1.9, 0.4, -2.2);
    brace.rotation.z = i % 2 ? 0.55 : -0.55;
    root.add(brace);
  }
  for (const side of [-1, 1]) {
    for (let k = 0; k < 2; k++) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(10.6, 5.8, 0.08), solar);
      wing.position.set(side * (10.4 + k * 11.3), 0.4 - k * 0.22, -2.2);
      wing.rotation.z = side * 0.015;
      root.add(wing);
      const frameBar = new THREE.Mesh(new THREE.BoxGeometry(10.9, 0.16, 0.16), trim);
      frameBar.position.set(wing.position.x, wing.position.y + 2.9, wing.position.z);
      root.add(frameBar);
      const frameBar2 = frameBar.clone();
      frameBar2.position.y = wing.position.y - 2.9;
      root.add(frameBar2);
    }
    const boom = cylinderBetween([side * 3.0, 0, -2.2], [side * 32, 0, -2.2], 0.12, trim, 8);
    root.add(boom);
  }

  /* 背侧散热板与天线 */
  for (const side of [-1, 1]) {
    const rad = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.06, 7.4), trim);
    rad.position.set(side * 4.4, side * 2.6, -3.8);
    rad.rotation.x = 0.18;
    root.add(rad);
  }
  const dish = new THREE.Mesh(new THREE.SphereGeometry(1.05, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2.2), trim);
  dish.position.set(0, -3.0, -2.6);
  dish.rotation.x = -1.1;
  root.add(dish);
  const mast = cylinderBetween([0, -1.8, -2.6], [0, -3.1, -2.6], 0.06, dark, 6);
  root.add(mast);

  return { root, doors, glow, hatchZ };
}

export function createEntranceScene({ canvas }) {
  if (!canvas) return null;
  // 先探测 WebGL，避免 three.js 自己打印错误；不支持时由首页降级到静态深空背景。
  const probe = document.createElement("canvas");
  if (!(probe.getContext("webgl2") || probe.getContext("webgl"))) return null;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch { return null; }
  if (!renderer.getContext()) return null;

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mobile = innerWidth < 760 || innerWidth < innerHeight * 0.9;
  let tier = guessTier();
  const quality = {
    high: { dpr: 1.7, shadow: true, shadowSize: 1024 },
    medium: { dpr: 1.3, shadow: true, shadowSize: 512 },
    low: { dpr: 1, shadow: false, shadowSize: 0 },
  }[tier];

  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, quality.dpr));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.88;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = quality.shadow;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x050912, 0.0034);
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 900);

  const built = buildStation();
  const station = new THREE.Group();
  station.add(built.root);
  scene.add(station);

  scene.add(new THREE.HemisphereLight(0xa9c6e8, 0x1a2230, 0.85));
  const sun = new THREE.DirectionalLight(0xffffff, 2.25);
  sun.position.set(42, 34, 58);
  sun.castShadow = quality.shadow;
  if (quality.shadow) {
    sun.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
    sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
    sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
    sun.shadow.bias = -0.0006;
  }
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x7fb8ff, 0.75);
  rim.position.set(-40, -10, -30);
  scene.add(rim);
  const hatchLight = new THREE.PointLight(0xffc98c, 4, 22, 2);
  hatchLight.position.set(0, 0, 15);
  built.root.add(hatchLight);

  /* 中心位置：桌面端把主体偏到右侧，给左侧文案让出空间；移动端居中。 */
  let W = 1, Hh = 1, centerX = 0, progress = 0, warp = 0;
  let frame = 0, last = 0, fps = 0, fpsN = 0, fpsT = 0, perf = {}, dest = null;
  let destroyed = false;

  function layout() {
    W = canvas.clientWidth || innerWidth;
    Hh = canvas.clientHeight || innerHeight;
    renderer.setSize(W, Hh, false);
    const portrait = W / Hh < 0.82;
    camera.fov = portrait ? 60 : 48;
    camera.aspect = W / Hh;
    centerX = portrait ? 0 : 9.5;
    station.position.set(centerX, portrait ? 2.6 : 0, 0);
    camera.updateProjectionMatrix();
  }

  function placeCamera() {
    const p = clamp(progress, 0, 1);
    const portrait = W / Hh < 0.82;
    const cx = portrait ? 0 : centerX;
    let cam;
    if (p < 0.52) {
      const t = smooth(p / 0.52);
      cam = [
        lerp(cx * 0.55 + 4, cx * 0.82, t),
        lerp(portrait ? 13 : 9, portrait ? 8 : 5.2, t),
        lerp(portrait ? 132 : 92, portrait ? 72 : 54, t),
      ];
    } else if (p < 0.82) {
      const t = smooth((p - 0.52) / 0.30);
      cam = [lerp(cx * 0.82, cx, t), lerp(portrait ? 8 : 5.2, 2.6, t), lerp(portrait ? 72 : 54, 45, t)];
    } else {
      // 最后一段略带侧向靠近对接舱门，避免正对面把整个环形舱压成一堵亮墙。
      const t = smooth((p - 0.82) / 0.18);
      cam = [cx + (portrait ? 2.4 : 5.2) * t, lerp(2.6, 2.9, t), lerp(45, 40, t)];
    }
    // 桌面端把空间站放在画面右侧，给左侧文案留出干净的暗场；接近舱门时再回到中央。
    const shift = portrait ? 0 : 7;
    const tx = p < 0.52 ? cx - shift : lerp(cx - shift, cx, smooth(clamp((p - 0.52) / 0.30, 0, 1)));
    const ty = p < 0.6 ? (portrait ? 3.4 : 1.8) : 1.7;
    const tz = p < 0.6 ? 0 : built.hatchZ - 0.5;
    camera.position.set(cam[0], cam[1], cam[2]);
    camera.lookAt(tx, ty, tz);
    // 接近巨大舱壁时略压曝光，保留金属细节而不是一片白。
    renderer.toneMappingExposure = p > 0.78 ? lerp(0.88, 0.66, smooth(clamp((p - 0.78) / 0.22, 0, 1))) : 0.88;
    camera.rotateZ(Math.sin(p * Math.PI) * 0.018); // 极轻的滚转，避免像滑轨
    const open = clamp((p - 0.55) / 0.3, 0, 1);
    built.doors.forEach((d) => { d.position.x = d.userData.closedX * (1 + open * 2.2); });
    built.glow.material.opacity = 0.10 + open * 0.24;
    hatchLight.intensity = 2 + open * 3;
  }

  function resize() {
    layout();
    placeCamera();
    if (reduced) renderOnce();
  }

  function renderOnce() {
    renderer.render(scene, camera);
  }

  function loop(now) {
    if (destroyed) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    if (!reduced) {
      station.rotation.z = Math.sin(now * 0.00006) * 0.012;
      station.rotation.y = Math.sin(now * 0.00009) * 0.014;
    }
    placeCamera();
    renderOnce();
    fpsN++;
    if (now - fpsT > 1000) {
      fps = fpsN * 1000 / (now - fpsT);
      fpsN = 0; fpsT = now;
      perf.fps = Math.round(fps);
      // 低性能设备自动降档：先降分辨率，再关阴影；不改变主体构图。
      if (fps < 34 && tier !== "low" && now > 4500) {
        tier = tier === "high" ? "medium" : "low";
        const q = { medium: { dpr: 1.3, shadow: true }, low: { dpr: 1, shadow: false } }[tier];
        renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q.dpr));
        renderer.shadowMap.enabled = q.shadow;
        sun.castShadow = q.shadow;
        resize();
      }
    }
    if (dest) dest();
    frame = requestAnimationFrame(loop);
  }

  function start() {
    if (reduced) { placeCamera(); renderOnce(); return; }
    last = performance.now(); fpsT = last;
    frame = requestAnimationFrame(loop);
  }

  addEventListener("resize", resize, { passive: true });
  const onVis = () => {
    if (document.hidden) cancelAnimationFrame(frame);
    else if (!reduced && !destroyed) { last = performance.now(); frame = requestAnimationFrame(loop); }
  };
  document.addEventListener("visibilitychange", onVis);

  layout();
  placeCamera();
  renderOnce();
  start();

  return {
    backend: "webgl",
    ready: true,
    setCamera(z, w) {
      progress = clamp(z, 0, 1);
      warp = w || 0;
      if (reduced) { placeCamera(); renderOnce(); }
    },
    getPerf: () => ({ ...perf, tier, dpr: renderer.getPixelRatio(), res: [canvas.width, canvas.height] }),
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frame);
      removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
      renderer.dispose();
    },
  };
}
