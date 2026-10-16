"""Contact sheets of the pipeline previews, to review many rooms at a glance (development tool).

python sheets.py <preview-dir> <out-dir> [per-sheet=6] [half=left|right|both] [id-prefix ...]
Each preview made by auto.py is the masks (left) beside the 500 mm grids (right); a sheet shows one half of each.
"""
import sys
from pathlib import Path

import cv2
import numpy as np

import tools

prev, out = Path(sys.argv[1]), Path(sys.argv[2])
per = int(sys.argv[3]) if len(sys.argv) > 3 else 6
half = sys.argv[4] if len(sys.argv) > 4 else 'left'
prefixes = [a.lower() for a in sys.argv[5:]]
files = sorted(p for p in prev.glob('*.png') if '-' in p.stem and len(p.stem) == 5 and p.stem[:2].isalpha())
if prefixes:
    files = [p for p in files if any(p.stem.startswith(x) for x in prefixes)]
CELL_W = 620
cells = []
for p in files:
    img = tools.read(str(p))
    h, w = img.shape[:2]
    if half == 'left':
        img = img[:, : w // 2]
    elif half == 'right':
        img = img[:, w // 2:]
    k = CELL_W / img.shape[1]
    img = cv2.resize(img, (CELL_W, max(1, int(img.shape[0] * k))), interpolation=cv2.INTER_AREA)
    label = np.full((20, CELL_W, 3), 25, np.uint8)
    cv2.putText(label, p.stem, (6, 15), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
    cells.append(np.vstack([label, img]))
out.mkdir(parents=True, exist_ok=True)
cols = 2
for i in range(0, len(cells), per):
    chunk = cells[i:i + per]
    rows = []
    for j in range(0, len(chunk), cols):
        pair = chunk[j:j + cols]
        hmax = max(c.shape[0] for c in pair)
        pair = [np.vstack([c, np.full((hmax - c.shape[0], CELL_W, 3), 15, np.uint8)]) if c.shape[0] < hmax else c for c in pair]
        while len(pair) < cols:
            pair.append(np.full((hmax, CELL_W, 3), 15, np.uint8))
        rows.append(np.hstack([np.hstack([c, np.full((hmax, 4, 3), 10, np.uint8)]) for c in pair]))
    tools.write(out / f'sheet-{half}-{i // per + 1:02d}.png', np.vstack(rows))
print(len(cells), 'rooms in', (len(cells) + per - 1) // per, 'sheets')
