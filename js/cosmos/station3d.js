/* PaperWorld 3.0 · 第一人称空间站（原生 WebGL，零依赖）
 *
 * 站在环形大厅中央：拖动转头看四周的展区舱门，镜头带惯性平滑跟随，
 * 舱门上方的铭牌写着真实展区名；对准舱门后点击推门进入。
 *
 * 建筑构成：环形走廊内壁 / 同心地板 / 穹顶 / 径向支柱 / 展区舱门 / 灯带 / 距离雾。
 * 光照：一盏方向光 + 两盏点光 + 自发光灯带，刻意压低亮度避免霓虹廉价感。
 * 降级：WebGL 不可用或移动端窄屏时返回 null，交给 CSS 走廊兜底。
 */

/* ---------------- mat4 ---------------- */
function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}
function lookAt(eye, center, up) {
  let zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
  let len = Math.hypot(zx, zy, zz) || 1; zx /= len; zy /= len; zz /= len;
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
  len = Math.hypot(xx, xy, xz) || 1; xx /= len; xy /= len; xz /= len;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  return new Float32Array([
    xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
    -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
    -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
    -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1,
  ]);
}
function mulPoint(m, p) {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12] * p[3],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13] * p[3],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14] * p[3],
    m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15] * p[3],
  ];
}
function mulMat(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function angDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/* ---------------- 着色器 ---------------- */
const VERT = `
attribute vec3 aPos; attribute vec3 aNormal; attribute vec3 aColor; attribute float aEmi;
uniform mat4 uProj; uniform mat4 uView;
varying vec3 vNormal; varying vec3 vColor; varying vec3 vWorld; varying float vEmi;
void main(){
  vNormal = aNormal; vColor = aColor; vWorld = aPos; vEmi = aEmi;
  gl_Position = uProj * uView * vec4(aPos, 1.0);
}`;
const FRAG = `
precision mediump float;
varying vec3 vNormal; varying vec3 vColor; varying vec3 vWorld; varying float vEmi;
uniform vec3 uEye; uniform vec3 uFogColor; uniform float uFogDensity;
uniform vec3 uLightDir; uniform vec3 uLightColor;
uniform vec3 uP0; uniform vec3 uC0; uniform vec3 uP1; uniform vec3 uC1;
void main(){
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uEye - vWorld);
  float diff = max(dot(N, uLightDir), 0.0);
  vec3 col = vColor * (0.30 + diff * uLightColor * 1.15);
  vec3 L0 = uP0 - vWorld; float d0 = length(L0);
  col += vColor * uC0 * max(dot(N, L0/d0), 0.0) / (1.0 + 0.10*d0 + 0.032*d0*d0);
  vec3 L1 = uP1 - vWorld; float d1 = length(L1);
  col += vColor * uC1 * max(dot(N, L1/d1), 0.0) / (1.0 + 0.10*d1 + 0.032*d1*d1);
  vec3 H = normalize(uLightDir + V);
  col += uLightColor * pow(max(dot(N, H), 0.0), 30.0) * 0.16;
  col += vColor * vEmi * 2.3;
  float dist = length(uEye - vWorld);
  float fog = 1.0 - exp(-uFogDensity * dist * dist);
  gl_FragColor = vec4(mix(col, uFogColor, clamp(fog, 0.0, 1.0)), 1.0);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn("[station3d]", gl.getShaderInfoLog(s)); return null; }
  return s;
}

/* ---------------- 几何 ---------------- */
function buildGeometry(doors) {
  const V = [];
  const push = (p, n, c, e) => { V.push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2], e); };
  const tri = (a, b, c, n, col, e) => { push(a, n, col, e); push(b, n, col, e); push(c, n, col, e); };
  const quad = (a, b, c, d, n, col, e) => { tri(a, b, c, n, col, e); tri(a, c, d, n, col, e); };
  const box = (cx, cy, cz, sx, sy, sz, col, e) => {
    const x = sx / 2, y = sy / 2, z = sz / 2;
    quad([cx - x, cy - y, cz + z], [cx + x, cy - y, cz + z], [cx + x, cy + y, cz + z], [cx - x, cy + y, cz + z], [0, 0, 1], col, e);
    quad([cx + x, cy - y, cz - z], [cx - x, cy - y, cz - z], [cx - x, cy + y, cz - z], [cx + x, cy + y, cz - z], [0, 0, -1], col, e);
    quad([cx - x, cy - y, cz - z], [cx - x, cy - y, cz + z], [cx - x, cy + y, cz + z], [cx - x, cy + y, cz - z], [-1, 0, 0], col, e);
    quad([cx + x, cy - y, cz + z], [cx + x, cy - y, cz - z], [cx + x, cy + y, cz - z], [cx + x, cy + y, cz + z], [1, 0, 0], col, e);
    quad([cx - x, cy + y, cz + z], [cx + x, cy + y, cz + z], [cx + x, cy + y, cz - z], [cx - x, cy + y, cz - z], [0, 1, 0], col, e);
    quad([cx - x, cy - y, cz - z], [cx + x, cy - y, cz - z], [cx + x, cy - y, cz + z], [cx - x, cy - y, cz + z], [0, -1, 0], col, e);
  };

  const R = 16, H = 7.2, SEG = 56;
  const wall = [0.185, 0.225, 0.315];
  const floorA = [0.125, 0.155, 0.225];
  const floorB = [0.155, 0.190, 0.270];
  const ceil = [0.115, 0.145, 0.215];
  const pillar = [0.205, 0.250, 0.340];
  const frame = [0.265, 0.315, 0.415];
  const panel = [0.085, 0.115, 0.185];
  const glowCyan = [0.28, 0.66, 0.88];
  const glowGold = [0.92, 0.68, 0.32];

  // 环形走廊内壁（法线朝圆心）
  for (let i = 0; i < SEG; i++) {
    const a0 = (i / SEG) * Math.PI * 2, a1 = ((i + 1) / SEG) * Math.PI * 2;
    const p = (ang, r, y) => [Math.sin(ang) * r, y, Math.cos(ang) * r];
    const n = (ang) => [-Math.sin(ang), 0, -Math.cos(ang)];
    quad(p(a0, R, 0), p(a1, R, 0), p(a1, R, H), p(a0, R, H), n((a0 + a1) / 2), wall, 0);
    // 顶部收口
    quad(p(a0, R, H), p(a1, R, H), p(a1, R - 1.4, H), p(a0, R - 1.4, H), [0, -0.35, 0], ceil, 0);
    // 地板扇形
    quad(p(a0, 0, 0), p(a1, 0, 0), p(a1, R, 0), p(a0, R, 0), [0, 1, 0], i % 2 ? floorA : floorB, 0);
    // 天花板扇形
    quad(p(a0, 0, H), p(a0, R - 1.4, H), p(a1, R - 1.4, H), p(a1, 0, H), [0, -1, 0], ceil, 0);
  }

  // 中央观测平台
  for (let i = 0; i < 32; i++) {
    const a0 = (i / 32) * Math.PI * 2, a1 = ((i + 1) / 32) * Math.PI * 2;
    const p = (ang, r, y) => [Math.sin(ang) * r, y, Math.cos(ang) * r];
    quad(p(a0, 4.4, 0.16), p(a1, 4.4, 0.16), p(a1, 4.4, 0), p(a0, 4.4, 0), [0, 0, 0], floorB, 0);
    quad(p(a0, 0, 0.16), p(a1, 0, 0.16), p(a1, 4.4, 0.16), p(a0, 4.4, 0.16), [0, 1, 0], [0.165, 0.205, 0.285], 0);
    quad(p(a0, 4.4, 0.16), p(a1, 4.4, 0.16), p(a1, 4.4, 0), p(a0, 4.4, 0), [Math.sin(a0), 0, Math.cos(a0)], [0.185, 0.225, 0.305], 0);
  }

  // 灯带：地面内环 + 天花板环 + 中央光环
  for (let i = 0; i < 40; i++) {
    const a0 = (i / 40) * Math.PI * 2, a1 = ((i + 1) / 40) * Math.PI * 2;
    const p = (ang, r, y) => [Math.sin(ang) * r, y, Math.cos(ang) * r];
    quad(p(a0, 5.2, 0.18), p(a1, 5.2, 0.18), p(a1, 5.05, 0.18), p(a0, 5.05, 0.18), [0, 1, 0], glowCyan, 1);
    quad(p(a0, R - 1.2, H - 0.08), p(a1, R - 1.2, H - 0.08), p(a1, R - 1.5, H - 0.08), p(a0, R - 1.5, H - 0.08), [0, -1, 0], glowCyan, 0.85);
  }
  // 中央穹顶灯
  for (let i = 0; i < 28; i++) {
    const a0 = (i / 28) * Math.PI * 2, a1 = ((i + 1) / 28) * Math.PI * 2;
    const p = (ang, r, y) => [Math.sin(ang) * r, y, Math.cos(ang) * r];
    quad(p(a0, 3.2, H - 0.12), p(a1, 3.2, H - 0.12), p(a1, 2.7, H - 0.12), p(a0, 2.7, H - 0.12), [0, -1, 0], glowGold, 0.9);
  }

  // 径向支柱
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2;
    const x = Math.sin(ang) * (R - 1.1), z = Math.cos(ang) * (R - 1.1);
    box(x, H / 2, z, 0.55, H, 0.55, pillar, 0);
    // 支柱灯
    box(Math.sin(ang) * (R - 1.45), H / 2, Math.cos(ang) * (R - 1.45), 0.12, H * 0.62, 0.12, glowCyan, 0.75);
  }

  // 展区舱门
  const doorMeta = doors.map((d, i) => {
    const theta = d.theta;
    const x = Math.sin(theta) * (R - 1.6), z = Math.cos(theta) * (R - 1.6);
    const inward = [-Math.sin(theta), 0, -Math.cos(theta)];
    const right = [Math.cos(theta), 0, -Math.sin(theta)];
    const w = 1.55, h = 2.75, t = 0.22;
    // 门框（左、右、上）
    box(x + right[0] * w, 1.45, z + right[2] * w, t, h, t, frame, 0);
    box(x - right[0] * w, 1.45, z - right[2] * w, t, h, t, frame, 0);
    box(x, 2.9, z, w * 2 + t, 0.3, t, frame, 0);
    // 门楣灯（金色）
    box(x, 3.12, z, w * 2 - 0.1, 0.1, t * 0.6, glowGold, 0.9);
    // 门内深色面板
    const pw = w - 0.06, ph = 2.62;
    const px = x + inward[0] * 0.06, pz = z + inward[2] * 0.06;
    quad(
      [px - right[0] * pw, 0.12, pz - right[2] * pw],
      [px + right[0] * pw, 0.12, pz + right[2] * pw],
      [px + right[0] * pw, 0.12 + ph, pz + right[2] * pw],
      [px - right[0] * pw, 0.12 + ph, pz - right[2] * pw],
      inward, panel, 0.32);
    // 门槛台阶
    box(x + inward[0] * 1.1, 0.12, z + inward[2] * 1.1, w * 1.7, 0.24, 1.5, [0.175, 0.215, 0.295], 0);
    return { ...d, theta, pos: [x, 1.9, z], center: [x, 1.6, z] };
  });

  return { data: new Float32Array(V), count: V.length / 10, doors: doorMeta };
}

/* ---------------- 场景 ---------------- */
export function createStation3D({ canvas, doors, onSelect }) {
  let gl = null;
  try {
    gl = canvas.getContext("webgl", { antialias: true, alpha: false, depth: true, powerPreference: "high-performance" })
      || canvas.getContext("experimental-webgl", { antialias: true, alpha: false });
  } catch { gl = null; }
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  const geom = buildGeometry(doors);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, geom.data, gl.STATIC_DRAW);
  const stride = 10 * 4;
  const attr = (name, size, off) => {
    const loc = gl.getAttribLocation(prog, name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, off * 4);
  };
  attr("aPos", 3, 0); attr("aNormal", 3, 3); attr("aColor", 3, 6); attr("aEmi", 1, 9);

  const U = {};
  for (const k of ["uProj", "uView", "uEye", "uFogColor", "uFogDensity", "uLightDir", "uLightColor", "uP0", "uC0", "uP1", "uC1"]) {
    U[k] = gl.getUniformLocation(prog, k);
  }
  gl.enable(gl.DEPTH_TEST);
  // 不剔除背面：场景由手工三角形拼成，绕序不统一；关掉 cull 才能让环形墙面/地板/穹顶都画出来
  gl.disable(gl.CULL_FACE);

  /* 相机 */
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let yaw = 0, pitch = -0.06, yawV = 0, pitchV = 0;
  let moveZ = 0, bob = 0, t0 = performance.now();
  let dragging = false, lastX = 0, lastY = 0, idle = 0;
  let focused = null, docking = false, dockT = 0, dockFrom = null, dockTo = null;
  let W = 0, H = 0, raf = 0, destroyed = false;

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 1.6);
    W = canvas.clientWidth || innerWidth; H = canvas.clientHeight || innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function eye() {
    return [Math.sin(yaw) * moveZ, 1.72 + bob, Math.cos(yaw) * moveZ];
  }
  function forward() {
    return [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
  }

  function pick() {
    let best = null, bestDiff = 0.34;
    for (const d of geom.doors) {
      const diff = Math.abs(angDiff(yaw, d.theta));
      const vert = Math.abs(pitch) < 0.42;
      if (vert && diff < bestDiff) { bestDiff = diff; best = d; }
    }
    return best;
  }

  function project(p, proj, view) {
    const v = mulPoint(view, [p[0], p[1], p[2], 1]);
    const c = mulPoint(proj, v);
    if (c[3] <= 0.01) return null;
    return { x: (c[0] / c[3] * 0.5 + 0.5) * W, y: (0.5 - c[1] / c[3] * 0.5) * H, w: c[3] };
  }

  function frame(now) {
    if (destroyed) return;
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
      yawV *= 0.93; pitchV *= 0.93;
      idle += dt;
      if (idle > 3.2 && !reduced) yaw += dt * 0.035; // 空闲缓慢环视
    }

    const e = eye(), f = forward();
    const view = lookAt(e, [e[0] + f[0], e[1] + f[1], e[2] + f[2]], [0, 1, 0]);
    const proj = perspective(1.02, W / H, 0.1, 90);

    gl.clearColor(0.020, 0.032, 0.062, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(prog);
    gl.uniformMatrix4fv(U.uProj, false, proj);
    gl.uniformMatrix4fv(U.uView, false, view);
    gl.uniform3f(U.uEye, e[0], e[1], e[2]);
    gl.uniform3f(U.uFogColor, 0.020, 0.032, 0.062);
    gl.uniform1f(U.uFogDensity, 0.0011);
    gl.uniform3f(U.uLightDir, -0.32, 0.86, -0.40);
    gl.uniform3f(U.uLightColor, 0.88, 0.95, 1.12);
    gl.uniform3f(U.uP0, 0, 3.1, 0);
    gl.uniform3f(U.uC0, 1.25, 0.95, 0.52);
    gl.uniform3f(U.uP1, 0, 2.2, 12.5);
    gl.uniform3f(U.uC1, 0.42, 0.82, 1.18);
    gl.drawArrays(gl.TRIANGLES, 0, geom.count);

    focused = pick();
    updatePlates(proj, view, e);
    raf = requestAnimationFrame(frame);
  }

  /* ---------------- DOM 铭牌 ---------------- */
  const plateLayer = canvas.parentElement.querySelector(".station-plates") || (() => {
    const d = document.createElement("div");
    d.className = "station-plates";
    canvas.parentElement.append(d);
    return d;
  })();
  const plates = geom.doors.map((d) => {
    const el = document.createElement("button");
    el.className = "station-plate";
    el.innerHTML = `<i></i><b>${d.num}</b><span>${d.title}</span>`;
    el.addEventListener("click", (ev) => { ev.stopPropagation(); enter(d); });
    plateLayer.append(el);
    return el;
  });

  function updatePlates(proj, view, e) {
    geom.doors.forEach((d, i) => {
      const s = project(d.pos, proj, view);
      const p = plates[i];
      if (!s || s.x < -120 || s.x > W + 120 || s.y < -80 || s.y > H + 80) { p.style.opacity = "0"; p.style.pointerEvents = "none"; return; }
      const dist = Math.hypot(d.pos[0] - e[0], d.pos[2] - e[2]);
      const edge = clamp(Math.min(s.x, W - s.x) / 90, 0, 1); // 靠近视口边缘时淡出，避免半截铭牌
      const vis = clamp(1.15 - dist / 26, 0, 1) * edge;
      p.style.opacity = String(vis);
      p.style.pointerEvents = vis > 0.35 ? "auto" : "none";
      p.style.transform = `translate(-50%,-50%) translate(${s.x}px, ${s.y}px)`;
      p.classList.toggle("is-on", focused && focused.num === d.num);
    });
  }

  /* ---------------- 交互 ---------------- */
  function enter(d) {
    if (docking) return;
    docking = true; dockT = 0;
    dockFrom = { yaw, z: moveZ };
    dockTo = d;
    setTimeout(() => onSelect && onSelect(d), reduced ? 0 : 1150);
  }
  canvas.addEventListener("mousedown", (e) => {
    dragging = true; lastX = e.clientX; lastY = e.clientY; idle = 0;
    canvas.classList.add("is-grab");
  });
  addEventListener("mouseup", () => { dragging = false; canvas.classList.remove("is-grab"); });
  addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    yawV = -dx * 0.0022; pitchV = -dy * 0.0018;
    yaw += yawV; pitch = clamp(pitch + pitchV, -0.62, 0.62);
    idle = 0;
  });
  canvas.addEventListener("click", () => { if (focused && !docking) enter(focused); });
  canvas.addEventListener("touchstart", (e) => {
    dragging = true; lastX = e.touches[0].clientX; lastY = e.touches[0].clientY; idle = 0;
  }, { passive: true });
  canvas.addEventListener("touchmove", (e) => {
    if (!dragging) return;
    const dx = e.touches[0].clientX - lastX, dy = e.touches[0].clientY - lastY;
    lastX = e.touches[0].clientX; lastY = e.touches[0].clientY;
    yawV = -dx * 0.0030; pitchV = -dy * 0.0026;
    yaw += yawV; pitch = clamp(pitch + pitchV, -0.62, 0.62);
    idle = 0;
  }, { passive: true });
  canvas.addEventListener("touchend", () => { dragging = false; }, { passive: true });
  addEventListener("wheel", (e) => {
    if (docking) return;
    moveZ = clamp(moveZ + (e.deltaY > 0 ? -0.55 : 0.55), -1.6, 3.2);
    idle = 0;
  }, { passive: true });

  addEventListener("resize", resize, { passive: true });
  resize();
  raf = requestAnimationFrame(frame);

  return {
    kind: "webgl",
    doors: geom.doors,
    get focused() { return focused; },
    enter,
    destroy() { destroyed = true; cancelAnimationFrame(raf); },
  };
}
