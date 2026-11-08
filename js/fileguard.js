/* PaperWorld · file:// 兜底提示
 *
 * 直接双击 HTML 打开时（file://），浏览器会拦掉 ES 模块与 pdf.js worker，
 * 页面看起来像坏了。这不是用户的问题，是缺少 HTTP 环境。
 * 本脚本是普通脚本（非 module），file:// 下仍会执行，用来把原因讲清楚。
 */
(function () {
  if (location.protocol !== "file:") return;

  function show() {
    if (document.getElementById("pw-fileguard")) return;
    var bar = document.createElement("div");
    bar.id = "pw-fileguard";
    bar.setAttribute("role", "alert");
    bar.style.cssText = [
      "position:fixed", "left:0", "right:0", "top:0", "z-index:2147483647",
      "padding:14px 20px", "background:#1a1206", "border-bottom:2px solid #f2b45c",
      "color:#f4ead6", "font:15px/1.7 'Segoe UI',-apple-system,'PingFang SC',sans-serif",
      "box-shadow:0 6px 24px rgba(0,0,0,.45)",
    ].join(";");
    bar.innerHTML =
      '<strong style="color:#f2b45c">请通过本地服务打开，不要直接双击 HTML。</strong>' +
      '<span style="display:block;margin-top:4px;opacity:.85">' +
      "浏览器禁止 <code>file://</code> 页面加载脚本模块与 PDF 解析器，所以当前页面无法正常运行。" +
      "在项目目录双击 <code>start-backend.bat</code>（macOS / Linux 运行 <code>node server/index.js</code>），" +
      "然后访问 <code>http://localhost:8080</code> 即可。" +
      "</span>";
    document.body.insertBefore(bar, document.body.firstChild);
    document.documentElement.style.paddingTop = bar.offsetHeight + "px";
  }

  if (document.body) show();
  else document.addEventListener("DOMContentLoaded", show);
})();
