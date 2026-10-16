"""Camera of every room photo, estimated from the picture alone with GeoCalib (Apache-2.0, https://github.com/cvg/GeoCalib).

Development tool: the app never runs a model. It writes scripts/photo-rooms/_cache/geocalib.json, which the pipeline uses to
know where the horizon is (so the floor and walls can be given a perspective) instead of guessing it.

    python geocalib_cam.py              every photo in public/rooms2d/Rooms (photos already in the file are skipped)
    python geocalib_cam.py --force      estimate them all again
    python geocalib_cam.py Living_Room/LV-01.jpg ...   only these (keys are paths relative to public/rooms2d/Rooms)

GeoCalib comes from `pip install git+https://github.com/cvg/GeoCalib`, or set GEOCALIB_PATH to a clone of its repository.
Its weights (a 111 MB download) are fetched once into the torch hub cache.

For each photo the file holds, at the photo's own pixel size and for a plain pinhole camera (no lens distortion term):

    gravity      unit vector pointing DOWN in camera coordinates (OpenCV: x right, y down, z forward). A level camera gives
                 (0, 1, 0). GeoCalib itself reports the opposite vector (up); that sign is already undone here.
    f_px         focal length in pixels (fx = fy); cx, cy the principal point (the image centre)
    roll_deg     = atan2(gx, gy): positive when the scene looks rotated counter-clockwise (down leans toward image right)
    pitch_deg    = asin(-gz): positive when the camera looks up
    vfov_deg / hfov_deg   vertical and horizontal field of view
    uncertainty  GeoCalib's own 1-sigma estimates (degrees; pixels for f_px). The focal length is the weakest part: it is
                 typically good to 10-20 %, while roll and pitch are good to about a degree or two.
    exif_orientation   the photo's EXIF orientation tag (1 = as stored). OpenCV applies it when decoding, so width and height
                 are those of the picture as it is shown.
"""
import json
import math
import os
import sys
import time
from pathlib import Path

import cv2
import numpy as np

from cachekey import fingerprint

HERE = Path(__file__).resolve().parent
ROOMS =HERE.parent.parent / 'public' / 'rooms2d' / 'Rooms'
OUT = HERE / '_cache' / 'geocalib.json'
EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp'}


def import_geocalib():
    path = os.environ.get('GEOCALIB_PATH')
    if path:
        sys.path.insert(0, path)
    try:
        from geocalib import GeoCalib
    except ImportError:
        raise SystemExit(
            'GeoCalib is not installed. Run: pip install git+https://github.com/cvg/GeoCalib\n'
            '(or set GEOCALIB_PATH to a clone of https://github.com/cvg/GeoCalib)'
        )
    return GeoCalib


def exif_orientation(path):
    try:
        from PIL import Image

        return int(Image.open(path).getexif().get(274, 1))
    except Exception:
        return 1


def estimate(model, path):
    import torch

    img = cv2.imdecode(np.fromfile(str(path), dtype=np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError(f'cannot read {path}')
    h, w = img.shape[:2]
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    tensor = torch.from_numpy(np.ascontiguousarray(rgb.transpose(2, 0, 1))).float() / 255.0
    res = model.calibrate(tensor)  # pinhole camera, no priors

    cam = res['camera']
    up = res['gravity'].vec3d[0].tolist()  # GeoCalib's "gravity" vector is the direction UP in the camera frame
    gx, gy, gz = (-up[0], -up[1], -up[2])
    norm = math.sqrt(gx * gx + gy * gy + gz * gz)
    gx, gy, gz = gx / norm, gy / norm, gz / norm
    f = float(cam.f[0, 0])
    cx, cy = (float(v) for v in cam.c[0])
    deg = math.degrees

    def unc(key, scale=1.0):
        v = res.get(key)
        return None if v is None else round(float(v[0]) * scale, 4)

    return {
        'width': w,
        'height': h,
        'f_px': round(f, 2),
        'cx': round(cx, 2),
        'cy': round(cy, 2),
        'gravity': [round(gx, 6), round(gy, 6), round(gz, 6)],
        'roll_deg': round(deg(math.atan2(gx, gy)), 3),
        'pitch_deg': round(deg(math.asin(max(-1.0, min(1.0, -gz)))), 3),
        'vfov_deg': round(deg(2 * math.atan(h / (2 * f))), 3),
        'hfov_deg': round(deg(2 * math.atan(w / (2 * f))), 3),
        'uncertainty': {
            'roll_deg': unc('roll_uncertainty', deg(1)),
            'pitch_deg': unc('pitch_uncertainty', deg(1)),
            'gravity_deg': unc('gravity_uncertainty', deg(1)),
            'f_px': unc('focal_uncertainty'),
            'vfov_deg': unc('vfov_uncertainty', deg(1)),
        },
        'exif_orientation': exif_orientation(path),
    }


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    force = '--force' in sys.argv
    keys = args or sorted(p.relative_to(ROOMS).as_posix() for p in ROOMS.rglob('*') if p.suffix.lower() in EXTENSIONS)
    done = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {}
    if not args:
        # Photos that are no longer in the folder have nothing to say any more
        gone = [k for k in done if k not in keys]
        for k in gone:
            del done[k]
        if gone:
            print(f'dropped {len(gone)} photos that are no longer in the folder')
    # A photo that was replaced under the same name is estimated again: the entry remembers which picture it was made from
    prints = {k: fingerprint(ROOMS / k) for k in keys}
    todo = [k for k in keys if force or k not in done or done[k].get('fp') != prints[k]]
    print(f'{len(keys)} photos, {len(todo)} to estimate')
    if not todo:
        if not args:
            OUT.write_text(json.dumps(dict(sorted(done.items())), indent=1) + '\n', encoding='utf-8')
        return
    GeoCalib = import_geocalib()
    model = GeoCalib()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    for i, key in enumerate(todo, 1):
        t = time.time()
        try:
            done[key] = estimate(model, ROOMS / key)
            done[key]['fp'] = prints[key]
        except Exception as e:  # one unreadable photo must not stop the others
            print(f'  {key}: FAILED ({e})')
            continue
        d = done[key]
        print(f"  [{i}/{len(todo)}] {key}: pitch {d['pitch_deg']:+.1f}  roll {d['roll_deg']:+.1f}  f {d['f_px']:.0f}px (vfov {d['vfov_deg']:.0f})  {time.time() - t:.1f}s")
        # Written after every photo, so a partial file is usable and nothing is lost if the run stops
        tmp = OUT.with_suffix('.tmp')
        tmp.write_text(json.dumps(dict(sorted(done.items())), indent=1) + '\n', encoding='utf-8')
        tmp.replace(OUT)


if __name__ == '__main__':
    main()
