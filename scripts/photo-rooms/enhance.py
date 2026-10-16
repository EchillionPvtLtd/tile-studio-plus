"""python enhance.py <photo> <out.png> [clip] — local-contrast enhanced copy of a photo, to see tile joints and edges."""
import sys
import cv2
import tools

src, dst = sys.argv[1], sys.argv[2]
clip = float(sys.argv[3]) if len(sys.argv) > 3 else 4.0
img = tools.read(src)
lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
lab[..., 0] = cv2.createCLAHE(clipLimit=clip, tileGridSize=(6, 6)).apply(lab[..., 0])
tools.write(dst, cv2.cvtColor(lab, cv2.COLOR_LAB2BGR))
