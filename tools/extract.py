"""Extract per-page text + block coordinates from the demo paper.

Produces:
  pages.json  -> [{page, text, blocks:[{text,bbox}]}]  (1-indexed page numbers)
  paper.txt   -> flat text with page markers, for human reading
"""
import fitz
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PDF = HERE.parent / "assets" / "papers" / "aloha.pdf"


def norm(s: str) -> str:
    s = s.replace("\u00ad", "")
    s = re.sub(r"[ \t]+", " ", s)
    return s.strip()


def main() -> None:
    doc = fitz.open(PDF)
    pages = []
    flat = []
    for i, page in enumerate(doc):
        raw = page.get_text("text")
        text = norm(raw)
        blocks = []
        for b in page.get_text("blocks"):
            x0, y0, x1, y1, btxt, bno, btype = b
            if btype != 0:
                continue
            t = norm(btxt)
            if t:
                blocks.append({
                    "text": t,
                    "bbox": [round(x0, 1), round(y0, 1), round(x1, 1), round(y1, 1)],
                })
        pages.append({
            "page": i + 1,
            "width": round(page.rect.width, 1),
            "height": round(page.rect.height, 1),
            "text": text,
            "blocks": blocks,
        })
        flat.append(f"\n\n===== PAGE {i + 1} =====\n\n{text}")

    (HERE / "pages.json").write_text(
        json.dumps({"pages": pages}, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    (HERE / "paper.txt").write_text("".join(flat), encoding="utf-8")

    print("pages:", doc.page_count)
    print("meta:", {k: v for k, v in doc.metadata.items() if v})
    print("chars:", sum(len(p["text"]) for p in pages))


if __name__ == "__main__":
    sys.exit(main())
