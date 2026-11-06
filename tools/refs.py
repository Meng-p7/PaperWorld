"""Parse the reference list into numbered entries.

Splits on [N] markers, keeps raw text verbatim, and extracts a best-guess
year. Raw text is preserved so nothing is invented.
"""
import json
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HERE = Path(__file__).resolve().parent
pages = json.loads((HERE / "pages.json").read_text(encoding="utf-8"))["pages"]

# concatenate text from the page containing REFERENCES onward
full = []
started = False
for p in pages:
    if "REFERENCES" in p["text"]:
        started = True
    if started:
        full.append(p["text"])
text = "\n".join(full)

# cut everything after the references (nothing follows here, but be safe)
idx = text.index("REFERENCES")
text = text[idx + len("REFERENCES"):]

# join wrapped lines: a new reference starts with [N] at line start
lines = text.split("\n")
entries = []
cur = None
for ln in lines:
    ln = ln.strip()
    if not ln:
        continue
    m = re.match(r"^\[(\d+)\]\s*(.*)$", ln)
    if m:
        if cur:
            entries.append(cur)
        cur = {"num": int(m.group(1)), "raw": m.group(2)}
    elif cur is not None:
        cur["raw"] += " " + ln
if cur:
    entries.append(cur)

for e in entries:
    raw = e["raw"]
    raw = re.sub(r"\s+", " ", raw).strip()
    e["raw"] = raw
    years = re.findall(r"\b(19[5-9]\d|20[0-2]\d)\b", raw)
    e["year"] = int(years[-1]) if years else None
    # title heuristic: for URL-only entries keep raw; else first sentence-ish
    e["url"] = (re.search(r"(https?://\S+)", raw) or [None, None])[1]

(HERE / "refs.json").write_text(
    json.dumps(entries, ensure_ascii=False, indent=1), encoding="utf-8"
)
print("refs:", len(entries))
print("with year:", sum(1 for e in entries if e["year"]))
for e in entries[:5] + entries[-3:]:
    print(e["num"], e["year"], e["raw"][:110])
