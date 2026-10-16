"""Helpers for authoring the built-in photo rooms (development only, not part of the app).

grid:   python tools.py grid <photo> <out.png> [scale] [step]     a photo with a labelled coordinate grid, to read points off
crop:   python tools.py crop <photo> <out.png> x0 y0 x1 y1 [scale] a zoomed part (normalized box) with a finer grid
"""
import sys
import cv2
import numpy as np


def read(path):
    data = np.fromfile(path, dtype=np.uint8)
    img = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if img is None:
        raise SystemExit(f"cannot read {path}")
    return img


def write(path, img):
    ok, buf = cv2.imencode('.png', img)
    buf.tofile(path)


def draw_grid(img, box=(0.0, 0.0, 1.0, 1.0), step=0.05, label_every=2):
    """img shows `box` (normalized x0,y0,x1,y1) of a photo; draws lines at multiples of `step`."""
    h, w = img.shape[:2]
    x0, y0, x1, y1 = box
    out = img.copy()
    overlay = out.copy()
    font = cv2.FONT_HERSHEY_SIMPLEX
    n0 = int(np.ceil(x0 / step - 1e-9))
    n1 = int(np.floor(x1 / step + 1e-9))
    for i in range(n0, n1 + 1):
        v = i * step
        px = int(round((v - x0) / (x1 - x0) * w))
        major = i % label_every == 0
        cv2.line(overlay, (px, 0), (px, h), (0, 255, 255) if major else (255, 255, 0), 1 if not major else 1, cv2.LINE_AA)
        if major:
            cv2.putText(out, f"{v:.2f}".rstrip('0').rstrip('.') if v != 0 else '0', (px + 2, 12), font, 0.38, (0, 0, 0), 3, cv2.LINE_AA)
            cv2.putText(out, f"{v:.2f}".rstrip('0').rstrip('.') if v != 0 else '0', (px + 2, 12), font, 0.38, (0, 255, 255), 1, cv2.LINE_AA)
    m0 = int(np.ceil(y0 / step - 1e-9))
    m1 = int(np.floor(y1 / step + 1e-9))
    for j in range(m0, m1 + 1):
        v = j * step
        py = int(round((v - y0) / (y1 - y0) * h))
        major = j % label_every == 0
        cv2.line(overlay, (0, py), (w, py), (0, 255, 255) if major else (255, 255, 0), 1, cv2.LINE_AA)
        if major:
            t = f"{v:.2f}".rstrip('0').rstrip('.') if v != 0 else '0'
            cv2.putText(out, t, (2, py - 3), font, 0.38, (0, 0, 0), 3, cv2.LINE_AA)
            cv2.putText(out, t, (2, py - 3), font, 0.38, (0, 255, 255), 1, cv2.LINE_AA)
    return cv2.addWeighted(overlay, 0.45, out, 0.55, 0)


def main():
    cmd = sys.argv[1]
    if cmd == 'grid':
        src, dst = sys.argv[2], sys.argv[3]
        scale = float(sys.argv[4]) if len(sys.argv) > 4 else 2.0
        step = float(sys.argv[5]) if len(sys.argv) > 5 else 0.05
        img = read(src)
        img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        write(dst, draw_grid(img, step=step))
    elif cmd == 'crop':
        src, dst = sys.argv[2], sys.argv[3]
        x0, y0, x1, y1 = [float(v) for v in sys.argv[4:8]]
        scale = float(sys.argv[8]) if len(sys.argv) > 8 else 3.0
        img = read(src)
        h, w = img.shape[:2]
        part = img[int(y0 * h):int(np.ceil(y1 * h)), int(x0 * w):int(np.ceil(x1 * w))]
        part = cv2.resize(part, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        write(dst, draw_grid(part, box=(x0, y0, x1, y1), step=0.01, label_every=5))


if __name__ == '__main__':
    main()
