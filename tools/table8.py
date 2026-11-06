"""Reconstruct the results tables on page 8 by word coordinates.

Linear text extraction can scramble column order, so we cluster words by
(x, y) to verify which number belongs to which subtask column.
"""
import fitz
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HERE = Path(__file__).resolve().parent
doc = fitz.open(HERE.parent / "assets" / "papers" / "aloha.pdf")
page = doc[7]  # 0-indexed -> page 8

words = page.get_text("words")  # x0,y0,x1,y1,word,block,line,word_no
words.sort(key=lambda w: (round(w[1] / 3), w[0]))

# Group into visual rows by y center
rows = []
for w in words:
    yc = (w[1] + w[3]) / 2
    if rows and abs(rows[-1][0]["yc"] - yc) < 4:
        rows[-1].append({"yc": yc, "x": w[0], "t": w[4]})
    else:
        rows.append([{"yc": yc, "x": w[0], "t": w[4]}])

for r in rows:
    r.sort(key=lambda c: c["x"])
    line = "  ".join(f"{c['t']}@{int(c['x'])}" for c in r)
    print(f"y={int(r[0]['yc']):4d} | {line}")
