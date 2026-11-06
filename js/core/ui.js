/* PaperWorld · 通用 UI 运行时：主题、顶栏、滚动揭示、DOM 小工具 */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (k === "dataset") Object.assign(node.dataset, v);
    else node.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

/* 段落内联标记：只支持 **加粗** 与 `等宽`，其余按纯文本处理。
 * 不用 innerHTML，避免任何注入面。 */
export function rich(text) {
  const frag = document.createDocumentFragment();
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) frag.append(text.slice(last, m.index));
    if (m[0].startsWith("**")) frag.append(el("strong", { text: m[0].slice(2, -2) }));
    else frag.append(el("code", { class: "mono", text: m[0].slice(1, -1) }));
    last = m.index + m[0].length;
  }
  if (last < text.length) frag.append(text.slice(last));
  return frag;
}

/* ---------- theme ---------- */
const THEME_KEY = "pw.theme";

export function currentTheme() {
  return document.documentElement.dataset.theme || "dark";
}

export function setTheme(mode) {
  document.documentElement.dataset.theme = mode;
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch {}
  dispatchEvent(new CustomEvent("pw:theme", { detail: { mode } }));
  $$(".js-theme").forEach((b) => b.setAttribute("aria-pressed", String(mode === "light")));
}

export function initTheme() {
  let saved = null;
  try {
    saved = localStorage.getItem(THEME_KEY);
  } catch {}
  setTheme(saved === "light" ? "light" : "dark");
  $$(".js-theme").forEach((btn) =>
    btn.addEventListener("click", () => setTheme(currentTheme() === "dark" ? "light" : "dark"))
  );
}

/* ---------- topbar ---------- */
export function initTopbar() {
  const bar = $(".topbar");
  if (!bar) return;
  const onScroll = () => bar.classList.toggle("is-scrolled", scrollY > 12);
  onScroll();
  addEventListener("scroll", onScroll, { passive: true });
}

/* ---------- 移动端导航 ---------- */
export function initMobileNav() {
  const toggle = $("#nav-toggle");
  const menu = $("#mobile-menu");
  if (!toggle || !menu) return;
  const close = () => { menu.classList.remove("is-open"); toggle.setAttribute("aria-expanded", "false"); };
  toggle.addEventListener("click", () => {
    const open = menu.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  menu.addEventListener("click", (e) => { if (e.target.closest("a")) close(); });
  addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  document.addEventListener("click", (e) => {
    if (!menu.contains(e.target) && !toggle.contains(e.target)) close();
  });
}

/* ---------- scroll reveal ---------- */
export function initReveal(root = document) {
  const items = $$(".reveal", root);
  if (!items.length) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    items.forEach((n) => n.classList.add("is-in"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      }
    },
    { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
  );
  items.forEach((n) => io.observe(n));

  // 兜底：快速跳转/锚点定位时 IntersectionObserver 可能错过，
  // 滚动时把所有已经进入或越过视口的元素直接点亮，绝不让正文停在 opacity:0。
  const fallback = () => {
    for (const n of items) {
      if (n.classList.contains("is-in")) continue;
      if (n.getBoundingClientRect().top < innerHeight * 0.95) n.classList.add("is-in");
    }
  };
  addEventListener("scroll", fallback, { passive: true });
  setTimeout(fallback, 900);
}

/* ---------- 数字滚动 ---------- */
export function countUp(node, to, { dur = 1200, decimals = 0, suffix = "" } = {}) {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) {
    node.textContent = to.toFixed(decimals) + suffix;
    return;
  }
  const from = 0;
  const t0 = performance.now();
  const ease = (x) => 1 - Math.pow(1 - x, 4);
  (function step(now) {
    const p = Math.min(1, (now - t0) / dur);
    const v = from + (to - from) * ease(p);
    node.textContent = v.toFixed(decimals) + suffix;
    if (p < 1) requestAnimationFrame(step);
  })(t0);
}

export function observeOnce(node, cb, opts) {
  const io = new IntersectionObserver(
    (es) => {
      if (es.some((e) => e.isIntersecting)) {
        cb();
        io.disconnect();
      }
    },
    opts || { threshold: 0.4 }
  );
  io.observe(node);
  return io;
}
