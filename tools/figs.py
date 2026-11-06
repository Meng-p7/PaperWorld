"""Locate figures by their captions and render those regions at high DPI.

Strategy: find text starting with "Fig. N:" , take the horizontal span of the
caption, then walk upwards to the top of the figure region (bounded by the
previous body-text row or page margin). Renders a clip to PNG.

This doubles as the figure-detection heuristic for the product's parser.
"""
import fitz
import json
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "assets" / "figures"
OUT.mkdir(parents=True, exist_ok=True)

doc = fitz.open(HERE.parent / "assets" / "papers" / "aloha.pdf")

# figures we want: (page_1indexed, fig_no, out_name)
WANTED = {
    (1, 1): "fig1-teaser",
    (3, 3): "fig3-hardware",
    (4, 4): "fig4-act-arch",
    (4, 5): "fig5-chunking",
    (7, 6): "fig6-real-tasks",
    (8, 7): "fig7-sim-tasks",
    (10, 8): "fig8-ablations",
    (15, 9): "fig9-teleop-gallery",
    (16, 10): "fig10-camera-views",
    (17, 11): "fig11-detail-arch",
}

# optional top-edge overrides in PDF points (skip title/author blocks)
TOP_OVERRIDE = {
    (1, 1): 158,
}

# explicit full clips (x0,y0,x1,y1) for figures whose caption span != content span
CLIP_OVERRIDE = {
    (7, 6): (43, 40, 570, 731),
    (8, 7): (43, 40, 570, 140),
}

manifest = []

for pno in range(doc.page_count):
    page = doc[pno]
    pw, ph = page.rect.width, page.rect.height
    # find caption blocks
    for b in page.get_text("blocks"):
        x0, y0, x1, y1, txt, bno, btype = b
        if btype != 0:
            continue
        m = re.match(r"\s*Fig\.\s*(\d+):", txt)
        if not m:
            continue
        figno = int(m.group(1))
        key = (pno + 1, figno)
        if key not in WANTED:
            continue
        name = WANTED[key]
        # figure region: same horizontal span as caption (widened a bit),
        # from top margin (or previous caption/text) down to caption top
        fx0 = max(20, x0 - 6)
        fx1 = min(pw - 20, x1 + 6)
        fy1 = y0 - 2
        # walk up: find lowest body-text block bottom that is above the figure
        fy0 = 40
        if key in TOP_OVERRIDE:
            fy0 = TOP_OVERRIDE[key]
        for b2 in page.get_text("blocks"):
            bx0, by0, bx1, by1, btxt, _, bt2 = b2
            if bt2 != 0:
                continue
            if by1 >= fy1 - 1:
                continue
            # skip blocks that are inside the candidate figure area horizontally
            # and are figure-internal labels (short, centered)
            if btxt.strip().startswith(("Fig.", "TABLE", "Algorithm")):
                if by1 < fy1:
                    fy0 = max(fy0, by1 + 4)
                continue
        clip = fitz.Rect(fx0, fy0, fx1, fy1)
        pix = page.get_pixmap(matrix=fitz.Matrix(3, 3), clip=clip)
        fn = OUT / f"{name}.png"
        pix.save(fn)
        manifest.append({
            "id": name,
            "fig": figno,
            "page": pno + 1,
            "file": f"assets/figures/{name}.png",
            "caption": re.sub(r"\s+", " ", txt).strip(),
            "clip": [round(v, 1) for v in (fx0, fy0, fx1, fy1)],
            "px": [pix.width, pix.height],
        })
        print(f"p{pno+1} Fig.{figno} -> {fn.name}  {pix.width}x{pix.height}  clip={[round(v) for v in (fx0,fy0,fx1,fy1)]}")

(HERE / "figures.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
print("total:", len(manifest))
