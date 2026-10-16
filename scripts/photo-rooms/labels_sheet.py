"""What the segmentation model calls each part of a photo (development tool).

python labels_sheet.py <out.png> <code-prefix> [per-row=3]     e.g.  python labels_sheet.py se.png SE
"""
import sys
from pathlib import Path

import cv2
import numpy as np

import auto
import segment
import tools

out, prefix = sys.argv[1], sys.argv[2].upper()
per = int(sys.argv[3]) if len(sys.argv) > 3 else 3
names = auto.ade_names()
rng = np.random.default_rng(7)
pal = rng.integers(60, 255, (256, 3)).astype(np.uint8)
for nm, col in (('floor', (255, 90, 0)), ('wall', (70, 200, 70)), ('ceiling', (210, 210, 210)), ('stairs', (0, 200, 255)), ('step', (0, 140, 255))):
    for i, n in names.items():
        if n == nm:
            pal[i] = col
CELL_W = 520
cells = []
for code, path in auto.photos():
    if not code.startswith(prefix):
        continue
    img = auto.read_bgr(path)
    H0, W0 = img.shape[:2]
    k = min(1.0, 1600 / max(H0, W0))
    if k < 1:
        img = cv2.resize(img, (round(W0 * k), round(H0 * k)), interpolation=cv2.INTER_AREA)
    lab = segment.segment_file(path)['labels']
    col = pal[lab]
    both = cv2.addWeighted(img, 0.5, col, 0.5, 0)
    ids, cnt = np.unique(lab, return_counts=True)
    top = [(names[int(i)], c / lab.size) for i, c in sorted(zip(ids, cnt), key=lambda x: -x[1])[:7]]
    for i in ids:
        ys, xs = np.nonzero(lab == i)
        if len(xs) > 0.012 * lab.size:
            cv2.putText(both, names[int(i)][:12], (int(xs.mean()) - 24, int(ys.mean())), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (0, 0, 0), 2, cv2.LINE_AA)
            cv2.putText(both, names[int(i)][:12], (int(xs.mean()) - 24, int(ys.mean())), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (255, 255, 255), 1, cv2.LINE_AA)
    s = CELL_W / both.shape[1]
    both = cv2.resize(both, (CELL_W, int(both.shape[0] * s)), interpolation=cv2.INTER_AREA)
    bar = np.full((18, CELL_W, 3), 25, np.uint8)
    cv2.putText(bar, f"{code}  " + ' '.join(f'{n[:7]} {f * 100:.0f}' for n, f in top[:5]), (4, 13), cv2.FONT_HERSHEY_SIMPLEX, 0.36, (255, 255, 255), 1, cv2.LINE_AA)
    cells.append(np.vstack([bar, both]))
rows = []
for j in range(0, len(cells), per):
    row = cells[j:j + per]
    hmax = max(c.shape[0] for c in row)
    row = [np.vstack([c, np.full((hmax - c.shape[0], CELL_W, 3), 15, np.uint8)]) for c in row]
    while len(row) < per:
        row.append(np.full((hmax, CELL_W, 3), 15, np.uint8))
    rows.append(np.hstack([np.hstack([c, np.full((hmax, 4, 3), 10, np.uint8)]) for c in row]))
tools.write(out, np.vstack(rows))
print(len(cells), 'photos ->', out)
