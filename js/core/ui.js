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
