/* PaperWorld · 加载态收尾
 * 加载动画（论文折成一道光）由 CSS 独立跑完，这里只决定「什么时候揭开」：
 * 字落定 + 页面资源就绪，再留一拍，然后淡出交给场景。
 * 任何情况下都有保底，绝不让加载层挡住页面。
 */
export function finishLoader(loader, { hold = 320, ceiling = 6000 } = {}) {
  if (!loader) return;
  const word = loader.querySelector("#loader-word");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let landed = reduced || !word;
  let ready = document.readyState === "complete";
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    loader.classList.add("is-done");
  };
  const maybe = () => {
    if (landed && ready) setTimeout(close, hold);
  };

  if (!landed) {
    const anims = word.getAnimations ? word.getAnimations() : [];
    if (anims.length && anims.some((a) => a.playState !== "finished")) {
      word.addEventListener("animationend", () => { landed = true; maybe(); }, { once: true });
    } else {
      landed = true;
    }
  }

  if (!ready) addEventListener("load", () => { ready = true; maybe(); }, { once: true });

  maybe();
  setTimeout(close, ceiling);
}
