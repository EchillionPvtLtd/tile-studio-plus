"""python crop.py <photo> <out.png> x0 y0 x1 y1 [scale] [step] — a zoomed part of a photo with a labelled coordinate grid.
A preview made by auto.py can be given instead of the photo, to check a mask at the same zoom."""
import sys
import cv2
import tools

src, dst = sys.argv[1], sys.argv[2]
x0, y0, x1, y1 = [float(v) for v in sys.argv[3:7]]
scale = float(sys.argv[7]) if len(sys.argv) > 7 else 4.0
step = float(sys.argv[8]) if len(sys.argv) > 8 else 0.01
img = tools.read(src)
h, w = img.shape[:2]
part = img[int(y0 * h):int(round(y1 * h)), int(x0 * w):int(round(x1 * w))]
part = cv2.resize(part, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
tools.write(dst, tools.draw_grid(part, box=(x0, y0, x1, y1), step=step, label_every=5 if step <= 0.01 else 2))
