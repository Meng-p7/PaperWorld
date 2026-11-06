# PaperWorld

把一篇论文，变成一座可以走进去的科研展览。上传 PDF 后，PaperWorld 在浏览器本地解析文字层、重建章节与图注、挑出原文语句并布成展厅；每条结论都能点开，回到论文原页高亮核对。

**在线地址**：https://meng-p7.github.io/PaperWorld/

## 三个入口

| 页面 | 作用 |
| --- | --- |
| `index.html` | 展览大厅。首展《Learning Fine-Grained Bimanual Manipulation with Low-Cost Hardware》（ALOHA / ACT） |
| `parse.html` | 上传论文、查看布展流水线、本机展览库；可点「用 ALOHA 论文试一次」直接跑通 |
| `about.html` | 生成链路、准确性契约、技术架构与已知边界 |

首展有 8 间展厅、5 台互动装置、11 幅论文原图、81 条逐字核对过的引文。自动生成的展览有 7 间展厅与 4 台通用装置（章节地图、数值扫描、随机展签、原文页图）。

## 准确性契约

自动展的正文**只放从 PDF 文本层拼回来的逐字字符串**，不改写、不翻译、不补因果；编辑写的过渡句单独标成「策展语 · 非原文」，和原文分色显示。每个原文块都带页码，点开给引文，再点一次渲染那一页 PDF 并高亮。图表只画原文里出现过的数，不插值、不推测。

当前版本的「生成」是**提取式策展**，不调用生成式大模型——所以不会替论文编出一个不存在的发现，代价是叙事较朴素。这一点在页面与方法说明里都如实写出。

## 本地运行

```
python -m http.server 8000
```

然后打开 `http://localhost:8000`。不要用 `file://` 直接打开，pdf.js 需要 HTTP 才能加载论文与 worker。

## 目录结构

| 路径 | 内容 |
| --- | --- |
| `index.html` / `parse.html` / `about.html` | 三个页面 |
| `css/` | 设计变量（暗场展厅 / 纸张阅读双主题）、基础样式、展馆样式、工作室样式 |
| `js/core/` | 通用 UI、蓝图背景、pdf.js 原页渲染与高亮、本机展览仓库 |
| `js/engine/` | 展览渲染器、PDF 结构抽取、提取式策展、通用互动装置 |
| `js/interactives.js` | 首展专用的 5 台互动装置 |
| `assets/` | 蓝图数据、参考文献、论文原图、内置 ALOHA PDF |
| `vendor/pdfjs/` | 本地打包的 pdf.js，无 CDN 依赖 |
| `tools/` | 论文文本抽取、插图裁切、参考文献解析与蓝图构建脚本 |

站点根目录即仓库根目录，`.nojekyll` 用于让 GitHub Pages 直接按静态文件发布。

## 构建与校验

```
python tools/build_blueprint.py
```

它会把 81 条引文逐条与 `tools/pages.json` 里的 PDF 文本做去空白归一后比对，任何一条对不上就直接失败、不产出展览；通过后重新生成 `assets/data/aloha.json` 与 `assets/js/data.js`。

`tools/extract.py`、`figs.py`、`table8.py` 依赖 PyMuPDF（`pip install pymupdf`），用于从原 PDF 重新抽取文本与插图。论文原文件只有一份，在 `assets/papers/aloha.pdf`。

## 已知边界

- 扫描版 PDF 没有文字层会直接报错，本版本不含 OCR。
- 双栏、脚注、跨栏表格与数学公式的阅读顺序可能还原错；作者署名靠版面启发式，可能只认出部分作者。
- 自动展的插图由原 PDF 页面本地渲染，不是论文原图裁切，清晰度有限。
- 原页高亮遇到跨栏或断字严重时可能定位不到，界面会明确提示「未定位到引文」。
- 上传的 PDF 与生成的展览只存在当前浏览器的 IndexedDB / localStorage，不上传服务器，跨设备不同步。

## 版权

首展论文：arXiv:2304.13705v1，Tony Z. Zhao, Vikash Kumar, Sergey Levine, Chelsea Finn。插图与引文版权归原作者所有，本项目仅作研究与阅读展示之用。
