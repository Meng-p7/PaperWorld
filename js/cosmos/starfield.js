/* PaperWorld 2.0 · 深空视觉引擎
 *
 * 两层：
 *   1) sky       — WebGL fragment shader 画星云 / 星球 / 星点 / 曲速光条；
 *                   WebGL 不可用时自动降级为 Canvas2D 静态星图。
 *   2) particles — Canvas2D 的 3D 透视粒子，随镜头 Z 推进向外飞掠。
 *
 * 设计约束：零依赖、尊重 prefers-reduced-motion、页面隐藏时停帧、
 * 移动端降粒子数与 DPR、任何一步失败都能安静降级而不是白屏。
 */

const VERT = `
attribute vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2  uRes;
uniform float uTime;
uniform float uZ;
uniform float uWarp;
uniform float uAmbient;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1.0,0.0)), u.x),
             mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for(int i=0;i<4;i++){ v += a*noise(p); p *= 2.03; a *= 0.5; }
  return v;
}
void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*uRes) / uRes.y;
  float t = uTime * (0.035 + 0.02*(1.0-uAmbient));
  float r = length(uv);
  vec2 dir = normalize(uv + vec2(0.0001));

  vec2 p = uv * (1.0 - 0.30*uZ) + vec2(t*0.35, -t*0.18);
  float n1 = fbm(p*2.1 + vec2(0.0, t));
  float n2 = fbm(p*4.3 - vec2(t*0.6, 0.0));
  float neb = smoothstep(0.40, 0.88, n1*0.68 + n2*0.42);

  vec3 col = vec3(0.012, 0.019, 0.046);
  col += vec3(0.09, 0.15, 0.36) * neb * 0.92;
  col += vec3(0.28, 0.09, 0.40) * pow(n2, 3.0) * 0.55;
  col += vec3(0.02, 0.28, 0.34) * pow(n1, 5.0) * 0.50;
  col *= 1.0 - 0.58*smoothstep(0.30, 1.20, r);

  // 静态星点（闪烁）
  vec2 g  = uv*92.0 + vec2(t*6.0, 0.0);
  vec2 gi = floor(g), gf = fract(g)-0.5;
  float h = hash(gi);
  float star = smoothstep(0.987, 1.0, h) * (0.45 + 0.55*(0.5+0.5*sin(uTime*1.6 + h*57.0)));
  star *= 1.0 - smoothstep(0.0, 0.13, length(gf));

  // 曲速：沿径向多次采样，把星点拉成光条
  float streak = 0.0;
  if(uWarp > 0.01){
    for(int i=0;i<5;i++){
      float fi = float(i)/5.0;
      vec2 q  = uv - dir*fi*0.42*uWarp;
      vec2 gg = q*92.0 + vec2(t*6.0, 0.0);
      float hh = hash(floor(gg));
      streak += smoothstep(0.993, 1.0, hh) * (1.0-fi) * 0.15;
    }
    streak *= uWarp;
  }
  col += vec3(0.76, 0.87, 1.0) * (star*(1.0-uWarp*0.45) + streak);

  // 远处行星 + 大气边缘光，镜头推进时放大并移出画面
  vec2 pc = vec2(0.46 + uAmbient*0.40, 0.20 - uAmbient*0.05) - vec2(uZ*0.16, -uZ*0.06);
  float pr = 0.19 + uZ*0.34;
  float d = length(uv - pc);
  float disc = 1.0 - smoothstep(pr*0.985, pr, d);
  float rim = exp(-pow((d-pr)*20.0, 2.0));
  vec3 planet = vec3(0.055, 0.085, 0.17) * disc;
  planet += vec3(0.20, 0.48, 0.76) * rim * 0.95;
  planet += vec3(0.30, 0.20, 0.50) * fbm(uv*7.0 + pc) * disc * 0.40;
  col += planet * (1.0 - uWarp*0.7) * mix(1.0, 0.30, uAmbient);

  // 曲速末端白光
  col += vec3(0.52, 0.72, 1.0) * pow(max(uWarp-0.70, 0.0)/0.30, 2.0) * 0.62;
  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn("[cosmos] shader:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function createGL(canvas) {
  let gl = null;
  try {
    gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, powerPreference: "low-power" })
      || canvas.getContext("experimental-webgl", { alpha: false, antialias: false });
  } catch { return null; }
  if (!gl) return null;
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn("[cosmos] link:", gl.getProgramInfoLog(prog));
    return null;
  }
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "aPos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  return {
    gl, prog,
    u: {
      res: gl.getUniformLocation(prog, "uRes"),
      time: gl.getUniformLocation(prog, "uTime"),
      z: gl.getUniformLocation(prog, "uZ"),
      warp: gl.getUniformLocation(prog, "uWarp"),
      ambient: gl.getUniformLocation(prog, "uAmbient"),
    },
  };
}

/* ---------- Canvas2D 降级星图 ---------- */
function drawFallback(ctx, w, h, time, z, warp, ambient = 0) {
  ctx.fillStyle = "#040711";
  ctx.fillRect(0, 0, w, h);
  const g = ctx.createRadialGradient(w * 0.62, h * 0.38, 10, w * 0.62, h * 0.38, Math.max(w, h) * 0.85);
  g.addColorStop(0, "rgba(88,74,178,0.42)");
  g.addColorStop(0.42, "rgba(30,62,140,0.30)");
  g.addColorStop(1, "rgba(3,6,17,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const g2 = ctx.createRadialGradient(w * 0.28, h * 0.72, 4, w * 0.28, h * 0.72, Math.max(w, h) * 0.6);
  g2.addColorStop(0, "rgba(18,128,150,0.22)");
  g2.addColorStop(1, "rgba(3,6,17,0)");
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, w, h);
  // 确定性伪随机星点
  for (let i = 0; i < 420; i++) {
    const x = ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1 * w;
    const y = ((Math.sin(i * 78.233) * 43758.5453) % 1 + 1) % 1 * h;
    const a = 0.15 + ((i * 37) % 60) / 100;
    ctx.fillStyle = `rgba(200,222,255,${a * (1 - warp * 0.4)})`;
    ctx.fillRect(x, y, warp > 0.2 ? 1 + warp * 9 : 1.2, 1.2);
  }
  // 行星（空间站 ambient 模式下淡化并右移，避免压住文字）
  ctx.globalAlpha = 1 - ambient * 0.78;
  const px = w * (0.78 + ambient * 0.22) - z * w * 0.12, py = h * 0.30 + z * h * 0.05;
  const pr = Math.min(w, h) * (0.14 + z * 0.22);
  const pg = ctx.createRadialGradient(px - pr * 0.35, py - pr * 0.35, pr * 0.1, px, py, pr);
  pg.addColorStop(0, "rgba(72,96,158,0.9)");
  pg.addColorStop(0.72, "rgba(18,28,58,0.95)");
  pg.addColorStop(1, "rgba(6,10,24,0.98)");
  ctx.fillStyle = pg;
  ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(96,168,238,0.55)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(px, py, pr + 2, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;
}

export function createStarfield({ sky, particles, mode = "entrance" }) {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mobile = innerWidth < 720;
  const dpr = Math.min(devicePixelRatio || 1, mobile ? 1.2 : 1.6);
  const pctx = particles.getContext("2d");
  let backend = "canvas2d", glctx = null, sctx = null, fallbackCanvas = null, skyCanvas = sky;

  // WebGL 与 2D 不能共存于同一 canvas：先试 WebGL，
  // 失败则另建一张 2D canvas 做降级（不能复用已被 webgl 占用的 sky）。
  try { glctx = createGL(sky); } catch { glctx = null; }
  if (glctx) {
    backend = "webgl";
  } else {
    sky.style.display = "none";
    fallbackCanvas = document.createElement("canvas");
    fallbackCanvas.className = sky.className + " cosmos__fallback";
    fallbackCanvas.setAttribute("aria-hidden", "true");
    sky.parentNode.insertBefore(fallbackCanvas, sky.nextSibling);
    skyCanvas = fallbackCanvas;
    sctx = fallbackCanvas.getContext("2d");
  }

  let W = 0, H = 0, raf = 0, last = 0, clock = 0, travel = 0;
  let z = 0, warp = 0, ambient = mode === "ambient" ? 1 : 0;
  let paused = false, degraded = false, fpsFrames = 0, fpsT0 = 0, frameNo = 0;

  const count = mobile ? 90 : mode === "ambient" ? 130 : 280;
  const pts = Array.from({ length: count }, (_, i) => ({
    x: (Math.sin(i * 91.17) * 43758.5 % 1 + 1) % 1 * 2 - 1,
    y: (Math.sin(i * 37.71) * 43758.5 % 1 + 1) % 1 * 2 - 1,
    z: (Math.sin(i * 13.31) * 43758.5 % 1 + 1) % 1 * 1.5,
    b: 0.35 + ((i * 17) % 65) / 100,
  }));

  function resize() {
    W = innerWidth; H = innerHeight;
    // 星云是低频画面，用 0.8× 降采样渲染再拉伸，shader 成本降约 36%；
    // 粒子是细线，保持原生 DPR 以免糊掉。
    const skyK = Math.min(1, dpr) * (degraded ? 0.55 : 0.8);
    skyCanvas.width = Math.round(W * skyK);
    skyCanvas.height = Math.round(H * skyK);
    particles.width = Math.round(W * dpr);
    particles.height = Math.round(H * dpr);
    for (const cv of [skyCanvas, particles]) {
      cv.style.width = W + "px";
      cv.style.height = H + "px";
    }
    if (glctx) {
      glctx.gl.viewport(0, 0, skyCanvas.width, skyCanvas.height);
    } else {
      sctx.setTransform(skyK, 0, 0, skyK, 0, 0);
    }
    pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render(performance.now(), true);
  }

  function drawParticles(dt) {
    pctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, fov = Math.min(W, H) * 0.52;
    const speed = reduced ? 0 : (mode === "ambient" ? 0.018 : 0.045) + warp * 1.9;
    travel += dt * speed;
    const streak = warp * 22 + (mode === "ambient" ? 0 : 1.2);
    for (const p of pts) {
      let zz = (p.z - travel) % 1.5;
      if (zz < 0) zz += 1.5;
      zz += 0.07;
      const k = fov / zz;
      const sx = cx + p.x * k, sy = cy + p.y * k;
      if (sx < -60 || sx > W + 60 || sy < -60 || sy > H + 60) continue;
      const dx = sx - cx, dy = sy - cy;
      const len = Math.hypot(dx, dy) || 1;
      const l = Math.min(46, (streak * 0.9) / zz);
      const a = Math.min(0.9, p.b * (1.0 - zz / 1.8) * (0.5 + warp * 0.5));
      pctx.strokeStyle = `rgba(184,216,255,${Math.max(0.04, a)})`;
      pctx.lineWidth = Math.min(2.2, 0.6 + 1.2 / zz);
      pctx.beginPath();
      pctx.moveTo(sx, sy);
      pctx.lineTo(sx + (dx / len) * l, sy + (dy / len) * l);
      pctx.stroke();
    }
  }

  function render(now, force = false, skipSky = false) {
    if (!force && paused) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    if (!reduced) clock += dt;
    if (!skipSky) {
      if (glctx) {
        const g = glctx.gl;
        g.uniform2f(glctx.u.res, skyCanvas.width, skyCanvas.height);
        g.uniform1f(glctx.u.time, clock);
        g.uniform1f(glctx.u.z, z);
        g.uniform1f(glctx.u.warp, warp);
        g.uniform1f(glctx.u.ambient, ambient);
        g.drawArrays(g.TRIANGLES, 0, 3);
      } else {
        drawFallback(sctx, W, H, clock, z, warp, ambient);
      }
    }
    drawParticles(dt);
  }

  function frame(now) {
    frameNo++;
    render(now, false, degraded && frameNo % 2 === 1);
    // 低性能设备自动降档：星云隔帧绘制、分辨率再降、粒子减半
    if (!fpsT0) { fpsT0 = now; fpsFrames = 0; }
    else {
      fpsFrames++;
      const span = now - fpsT0;
      if (span > 1600) {
        const fps = (fpsFrames * 1000) / span;
        if (fps < 42 && !degraded) {
          degraded = true;
          pts.length = Math.max(60, Math.round(count * 0.55));
          resize();
        }
        fpsT0 = now; fpsFrames = 0;
      }
    }
    raf = requestAnimationFrame(frame);
  }

  addEventListener("resize", resize, { passive: true });
  document.addEventListener("visibilitychange", () => {
    paused = document.hidden;
    if (!paused) last = performance.now();
  });
  resize();
  if (!reduced) raf = requestAnimationFrame(frame);

  return {
    backend,
    get reduced() { return reduced; },
    get degraded() { return degraded; },
    setCamera(nextZ, nextWarp) {
      z = Math.max(0, Math.min(1, nextZ));
      warp = Math.max(0, Math.min(1, nextWarp));
      if (reduced) render(performance.now(), true);
    },
    setMode(m) { ambient = m === "ambient" ? 1 : 0; },
    destroy() {
      cancelAnimationFrame(raf);
      removeEventListener("resize", resize);
      if (fallbackCanvas) fallbackCanvas.remove();
    },
  };
}
