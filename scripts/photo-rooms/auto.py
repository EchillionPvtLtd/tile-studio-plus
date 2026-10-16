"""Turns a room photograph into a 2D-visualizer room: a mask for the floor and for each wall, and the perspective of each.

Development tool, not part of the app (see README.md in this folder). For every photo in public/rooms2d/Rooms:

  1. segment.py labels every pixel (floor, wall, ceiling, sofa, door, ...). The floor and wall labels are the surfaces; every
     other label (furniture, plants, windows, doors, rugs, paintings) stays exactly as it is in the photo. The label maps are
     snapped to the photo's own edges with a guided filter.
  2. the camera: GeoCalib's horizon (which way is down) and focal length, then the room's yaw and a polish of the camera from
     the photo's long straight lines (floor joints, corners, ceiling and furniture edges all follow the room's two axes).
  3. scale: a depth model (depth.py) tells how far below the lens the floor is; the ceiling, when visible, vetoes absurd values.
  4. the floor is a plane at that depth, so its perspective follows from the camera; the walls are the vertical planes found as
     peaks of the wall pixels' positions in the room (seen from above), and each wall pixel is given to the plane its line of
     sight reaches first among the planes that agree with its depth.
  5. each surface gets four image points and where they are on the surface in millimetres (that is all the app needs).
  6. the check (quality.py): a surface that cannot be identified accurately (too small, cut to pieces by furniture, not clearly
     separated from what is around it, a perspective that cannot be trusted) is LEFT OUT and stays exactly as photographed.
     What was left out, and why, is written to review.json beside what was kept and the measures it was judged by.

Per-photo corrections live in overrides/<id>.json (see OVERRIDES below).

  python auto.py lv-01 br-02        process these rooms, write previews (PREVIEW_DIR)
  python auto.py all --write        process every photo and write assets, src/data/rooms2d/photos.json and review.json

OVERRIDES (overrides/<id>.json), all optional
  floor_classes / wall_classes   ADE20K names to count as floor / wall
  floor_add / floor_sub / wall_add / wall_sub   [[ [x, y], ... ], ...] polygons in photo fractions
  hfov (degrees) or f (pixels at the working size), horizon (row as a fraction of the height), roll (degrees)
  yaw (degrees), height (camera height in mm), ceiling (ceiling height in mm)
  planes_add [{"axis": "x"|"z", "offset": mm} or {"axis": ..., "base": [x, y]}], planes_drop [index, ...]
  skip {"wall-left": "why"}      leave a surface out that passed the checks but is wrong when looked at (the reason is recorded)
  skip_all "why"                 leave every surface of the photo out (a top-down photo, a floor hidden under a rug...)
  trust_camera (true)            keep the surfaces although the depth model disagrees with the camera
  no_floor, no_walls (true), name
"""
import json
import math
import os
import re
import shutil
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

import depth as depth_mod
import quality
import segment
from cachekey import fingerprint
from geom import Cam, detect_lines, estimate_yaw, gravity_from_horizon, line_planes, manhattan_support, refine_camera, swap_focal

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SRC_DIR = ROOT / 'public' / 'rooms2d' / 'Rooms'
OUT_DIR = ROOT / 'public' / 'rooms2d' / 'photos'
DATA_OUT = ROOT / 'src' / 'data' / 'rooms2d' / 'photos.json'
REVIEW_OUT = HERE / 'review.json'
OVERRIDES = HERE / 'overrides'
GEOCALIB = HERE / '_cache' / 'geocalib.json'
NAMES = HERE / '_cache' / 'ade_names.json'
PREVIEW_DIR = Path(os.environ.get('PREVIEW_DIR', HERE / '_preview'))

# code -> (room type, label, camera height to fall back on in mm)
CATEGORIES = {
    'LV': ('living-room', 'Living Room', 900),
    'DR': ('dining-room', 'Dining Room', 950),
    'KN': ('kitchen', 'Kitchen', 1200),
    'BD': ('bedroom', 'Bedroom', 1000),
    'BR': ('bathroom', 'Bathroom', 1200),
    'BY': ('outdoor', 'Balcony', 1200),
    'OE': ('office', 'Office', 1200),
    'SE': ('staircase', 'Staircase', 1400),
}
ORDER = ['LV', 'DR', 'KN', 'BD', 'BR', 'BY', 'OE', 'SE']
OUTDOOR_FLOOR = ['floor', 'path', 'sidewalk', 'earth', 'road', 'land', 'sand', 'field']
DEFAULT_F_PER_LONG_SIDE = 0.8  # focal length / long side when nothing better is known (about 64 degrees across the long side)

# What a floor or a wall of a real room measures, in square feet. Outside this the photo's scale (and so the size of the tiles
# laid on it) cannot be trusted. tests/viz2d-rooms-data.test.ts holds the shipped rooms to the same bounds.
AREA_SQFT = {'floor': (4.0, 1500.0), 'wall': (3.0, 1200.0)}
# The floor the depth model sees must be the floor the camera implies. When it is tilted this much from it, or is not even
# flat, the camera's orientation (and so the perspective of every surface) cannot be trusted.
MAX_FLOOR_TILT = 14.0   # degrees
MAX_FLOOR_FLAT = 0.45   # spread of the floor's height under the lens, as a share of that height
# How far, in the depth model's own uncertainty, a wall's pixels may lie from the flat plane they were given to (median)
MAX_PLANE_RESID = 1.6
# Near the horizon one pixel of the photo is metres of floor and the camera's small errors become huge ones, so a tile laid
# there would be wrong. The floor is tiled in full up to the first distance and fades into the photo by the second (mm).
FLOOR_FADE_MM = (9000.0, 15000.0)
# A wall seen nearly edge-on has the same trouble: where the line of sight meets it at a grazing angle one pixel of the photo is
# metres of wall. Under the first angle (degrees) nothing is tiled; from the second on all of it is. A wall seen face-on is as
# well measured at 12 m as at 3 m, so its distance only matters where the depth model runs out: it was trained for rooms up to
# 20 m, so a wall is tiled in full up to the first distance and not at all from the second (mm).
WALL_FADE_DEG = (6.0, 12.0)
WALL_FADE_MM = (16000.0, 20000.0)

TINT = [(66, 135, 245), (60, 200, 90), (245, 170, 40), (200, 70, 200), (60, 210, 220), (240, 90, 90), (150, 120, 250), (130, 200, 40)]


# ── small helpers ────────────────────────────────────────────────────────────────────────────────────────────────────

def kernel(r):
    r = max(1, int(round(r)))
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))


def read_bgr(path):
    img = cv2.imdecode(np.fromfile(str(path), dtype=np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise SystemExit(f'cannot read {path}')
    return img


def write_png(path, img):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    cv2.imencode('.png', img)[1].tofile(str(path))


def photos():
    """Every photo of the Rooms folder as (code like 'LV-01', path), in display order. A file is named after its category and
    number, with a dash or an underscore: BD-03.png, LV_01.png."""
    out = []
    for p in sorted(SRC_DIR.glob('*/*')):
        if p.suffix.lower() not in ('.jpg', '.jpeg', '.png', '.webp'):
            continue
        m = re.match(r'([A-Za-z]{2})[-_](\d+)$', p.stem)
        if m and m.group(1).upper() in CATEGORIES:
            out.append((f'{m.group(1).upper()}-{m.group(2)}', p))
        else:
            # never silently: a photo that is not picked up has no room, and the data test will say so
            print(f'  skipping {p.relative_to(SRC_DIR).as_posix()}: a photo is named <category code>-<number> (codes: {", ".join(CATEGORIES)})', file=sys.stderr)
    out.sort(key=lambda t: (ORDER.index(t[0][:2]) if t[0][:2] in ORDER else 99, t[0]))
    return out


def load_overrides(rid):
    p = OVERRIDES / f'{rid}.json'
    return json.loads(p.read_text(encoding='utf-8')) if p.exists() else {}


def poly_mask(polys, w, h):
    m = np.zeros((h, w), np.uint8)
    for poly in polys:
        cv2.fillPoly(m, [np.array([[x * w, y * h] for x, y in poly], np.int32)], 1)
    return m.astype(bool)


def ade_names():
    if NAMES.exists():
        return {int(a): b for a, b in json.loads(NAMES.read_text()).items()}
    names = segment.class_names()
    NAMES.write_text(json.dumps(names))
    return names


# ── masks ────────────────────────────────────────────────────────────────────────────────────────────────────────────

def clean_binary(mask, min_frac=0.0015, fill_frac=0.0004):
    """Removes specks and small pinholes of a binary mask (bool array)."""
    h, w = mask.shape
    m = mask.astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, kernel(max(1, 0.002 * max(h, w))))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(m, connectivity=4)
    keep = np.zeros(n, bool)
    for i in range(1, n):
        keep[i] = stats[i, cv2.CC_STAT_AREA] >= min_frac * h * w
    m = keep[lab].astype(np.uint8)
    inv = (m == 0).astype(np.uint8)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(inv, connectivity=4)
    hole = np.zeros(n, bool)
    for i in range(1, n):
        hole[i] = stats[i, cv2.CC_STAT_AREA] < fill_frac * h * w
    m[hole[lab]] = 1
    return m.astype(bool)


def guided_filter(guide, src, r, eps):
    """Guided filter (He et al.) with a grey guide in 0..1: smooths `src` but keeps the guide's edges."""
    box = lambda x: cv2.boxFilter(x, -1, (2 * r + 1, 2 * r + 1), borderType=cv2.BORDER_REFLECT)
    mi, mp = box(guide), box(src)
    cov = box(guide * src) - mi * mp
    var = box(guide * guide) - mi * mi
    a = cov / (var + eps)
    b = mp - a * mi
    return box(a) * guide + box(b)


def snap_to_edges(mask, img):
    """Moves the edges of a label mask onto the photo's own edges (guided filter, the photo being the guide)."""
    h, w = mask.shape
    r = max(3, int(round(0.006 * max(h, w))))
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
    return guided_filter(gray, mask.astype(np.float32), r, 2e-3) > 0.5


def drop_dark_outliers(mask, gray, ratio):
    """The mask without material that is nearly black against its own surface (steel columns and trusses the labeller took for
    wall, black cables, the gap between planks): a pixel darker than `ratio` of the surface's median brightness, with the
    soft edge around it. A surface that is dark itself has a low median, so only what is darker still goes."""
    if mask.sum() < 500:
        return mask
    g = cv2.GaussianBlur(gray, (0, 0), 1.2).astype(np.float32)
    dark = mask & (g < ratio * float(np.median(g[mask])))
    if not dark.any():
        return mask
    dark = cv2.dilate(dark.astype(np.uint8), kernel(0.0025 * max(mask.shape))) > 0
    return mask & ~dark


def drop_color_outliers(mask, img, least, k=3.0):
    """The mask without regions whose colour is clearly not the surface's: a wicker basket the labeller took for wall, the green
    of leaves at the edge of a wall. Colour here is chroma, not brightness (shading and glare are not another material), and
    how different is judged against how much the surface varies itself (a patterned wall tolerates more), but never below
    `least`, so that a plain wall does not cut its own warm lamplight."""
    if mask.sum() < 500:
        return mask
    ab = cv2.cvtColor(cv2.GaussianBlur(img, (0, 0), 1.2), cv2.COLOR_BGR2LAB).astype(np.float32)[..., 1:] - 128.0
    d = np.linalg.norm(ab - np.median(ab[mask], axis=0), axis=2)
    return mask & (d <= max(least, k * float(np.percentile(d[mask], 85))))


def class_mask(labels, names, which):
    ids = [i for i, n in names.items() if n in which]
    return np.isin(labels, ids)


def class_prob(probs, ids, shape):
    """How sure the model is that each pixel is one of the classes `ids` (0..1)."""
    p = np.zeros(shape, np.float32)
    for i in ids:
        if i in probs:
            p += probs[i]
    return np.clip(p, 0.0, 1.0)


def floor_alpha(cam, floor):
    """How much of each floor pixel is tiled (0..1): all of it up to FLOOR_FADE_MM[0] from the camera, nothing from
    FLOOR_FADE_MM[1], and nothing at or above the horizon (where the camera says there is no floor)."""
    near_mm, far_mm = FLOOR_FADE_MM
    ys, xs = np.nonzero(floor)
    X, Z = cam.floor_xz(xs + 0.5, ys + 0.5)
    d = np.hypot(X, Z)
    d[~np.isfinite(d)] = np.inf
    a = np.zeros(floor.shape, np.float32)
    a[ys, xs] = np.clip((far_mm - d) / (far_mm - near_mm), 0.0, 1.0)
    return a


UNRELIABLE_FAR = 'much of it is far away or seen almost edge-on, where the perspective of a tile cannot be trusted'


def wall_alpha(cam, plane, mask):
    """How much of each pixel of a wall is tiled (0..1): it fades where the wall is seen nearly edge-on (WALL_FADE_DEG), because
    there its perspective cannot be trusted, and where it is beyond the reach of the depth model (WALL_FADE_MM). Outside `mask`: 0."""
    near_mm, far_mm = WALL_FADE_MM
    lo, hi = WALL_FADE_DEG
    ys, xs = np.nonzero(mask)
    X, Z, hgt, _t = cam.hit_wall(xs + 0.5, ys + 0.5, plane['axis'], plane['offset'])
    d = np.sqrt(X ** 2 + Z ** 2 + (cam.height - hgt) ** 2)
    angle = np.degrees(np.arcsin(np.clip(abs(plane['offset']) / np.maximum(d, 1e-6), 0.0, 1.0)))
    a = np.minimum(np.clip((far_mm - d) / (far_mm - near_mm), 0.0, 1.0), np.clip((angle - lo) / (hi - lo), 0.0, 1.0))
    a[~np.isfinite(d)] = 0.0
    out = np.zeros(mask.shape, np.float32)
    out[ys, xs] = a
    return out


def describe_plane(p):
    """A wall plane in words, by where it is in the room as the camera sees it (the final names come once it is kept)."""
    if p['axis'] == 'z':
        return 'Wall ahead'
    return 'Wall on the left' if p['offset'] < 0 else 'Wall on the right'


def camera_problems(report):
    """Why a photo's camera cannot be trusted, as sentences (empty when it can). Without a camera the perspective of every
    surface is a guess, and a tile laid with a guessed perspective runs in the wrong direction."""
    out = []
    tilt, flat = report.get('floor_tilt'), report.get('floor_flat')
    if tilt is not None and tilt > MAX_FLOOR_TILT:
        out.append(f'the floor the depth model sees is tilted {tilt:.0f} degrees from the floor the camera implies, so the direction the camera looks cannot be trusted')
    elif flat is not None and flat > MAX_FLOOR_FLAT:
        out.append(f'the floor is not flat in the depth model ({flat * 100:.0f}% spread), so its perspective cannot be trusted')
    return out


def plane_problems(p):
    """Why a wall plane is not a reliable flat wall, as sentences (empty when it is)."""
    if p.get('resid', 0.0) > MAX_PLANE_RESID:
        return [f"the depth model does not see one flat wall here (its pixels lie {p['resid']:.1f} times further from the plane than they should)"]
    return []


# ── the camera ───────────────────────────────────────────────────────────────────────────────────────────────────────

CAMERA_CACHE = HERE / '_cache' / 'camera'
CAMERA_VERSION = 5  # changes when the way a camera is worked out changes, so cached cameras are made again
CAMERA_OVERRIDES = ('hfov', 'f', 'horizon', 'roll', 'yaw', 'camera')


def make_camera(code, key, w, h, gray, ov, report, depth=None, path=None):
    """The camera of a photo, remembered between runs (it is the slow part): it depends on the picture, on GeoCalib's entry for
    it and on the overrides that name the camera, nothing else. `depth` = (depth map, floor mask), when known, gives the
    horizon a second witness."""
    cache = None
    if path is not None:
        gc = json.loads(GEOCALIB.read_text(encoding='utf-8')).get(key) if GEOCALIB.exists() else None
        fp = fingerprint(path, CAMERA_VERSION, segment.WORK_LONG, json.dumps(gc, sort_keys=True), json.dumps({k: ov[k] for k in CAMERA_OVERRIDES if k in ov}, sort_keys=True), segment.VERSION)
        cache = CAMERA_CACHE / f'{path.stem.lower()}.json'
        if cache.exists():
            z = json.loads(cache.read_text(encoding='utf-8'))
            if z.get('fp') == fp:
                c = z['cam']
                report.update(z['report'])
                return Cam(w, h, c['f'], np.array(c['g']), c['yaw'], c['height'], c['cx'], c['cy'])
    before = dict(report)
    cam = _make_camera(code, key, w, h, gray, ov, report, depth)
    if cache is not None:
        CAMERA_CACHE.mkdir(parents=True, exist_ok=True)
        keep = {k: v for k, v in report.items() if k not in before or before[k] != v}
        cache.write_text(json.dumps({'fp': fp, 'report': keep, 'cam': {'f': cam.f, 'g': [float(v) for v in cam.g], 'yaw': cam.yaw, 'height': cam.height, 'cx': cam.cx, 'cy': cam.cy}}), encoding='utf-8')
    return cam


def _make_camera(code, key, w, h, gray, ov, report, depth=None):
    gc = json.loads(GEOCALIB.read_text(encoding='utf-8')).get(key) if GEOCALIB.exists() else None
    default_f = DEFAULT_F_PER_LONG_SIDE * max(w, h)
    f_prior, f_sigma, f_gc, g_gc = default_f, 0.25, default_f, np.array([0.0, 1.0, 0.0])
    reliable = False
    if gc:
        k = w / gc['width']
        f_gc = gc['f_px'] * k
        g_gc = np.array(gc['gravity'], float)
        rel = gc['uncertainty']['f_px'] / gc['f_px']
        hfov = gc['hfov_deg']
        reliable = rel < 0.45 and 40 <= hfov <= 100 and 0.3 * max(w, h) < f_gc < 2.2 * max(w, h)
        if reliable:
            f_prior, f_sigma = f_gc, max(0.12, rel)
    report['focal'] = 'geocalib' if reliable else 'default'
    if 'hfov' in ov:
        f_prior, f_sigma = (w / 2.0) / math.tan(math.radians(ov['hfov']) / 2.0), 0.04
        report['focal'] = 'override'
    if 'f' in ov:
        f_prior, f_sigma = float(ov['f']), 0.04
        report['focal'] = 'override'
    # the horizon is what a photo shows reliably: a different focal length keeps it where GeoCalib saw it
    g = swap_focal(g_gc, f_gc, f_prior, w, h)
    if 'horizon' in ov or 'roll' in ov:
        roll = ov.get('roll', math.degrees(math.atan2(g[0], g[1])))
        y_h = ov['horizon'] * h if 'horizon' in ov else Cam(w, h, f_prior, g).horizon_y()
        g = gravity_from_horizon(y_h, roll, f_prior, w, h)
        g_gc, f_gc = g.copy(), f_prior
    cam = Cam(w, h, f_prior, g, 0.0, ov.get('height', CATEGORIES[code[:2]][2]))
    segs = detect_lines(gray, 0.035 * math.hypot(w, h))
    report['lines'] = len(segs)
    if 'yaw' in ov:
        cam.set_yaw(ov['yaw'])
        report['support'] = None
        return cam
    yaw, support, second = estimate_yaw(cam, segs)
    report['model'] = 'tilt'
    # where the depth model puts the horizon: a second witness, independent of the lines (and of GeoCalib)
    prior = None
    if depth is not None and 'horizon' not in ov:
        dh = depth_horizon(depth[0], depth[1], g[0] / g[1])
        report['depth_horizon'] = round(dh[0], 1) if dh else None
        if dh:
            prior = (dh[0], max(0.05 * h, 3.0 * dh[1]))
    if len(segs) >= 8:
        locked = 'hfov' in ov or 'f' in ov
        sig = 0.04 if locked else f_sigma
        roll_gc = abs(math.degrees(math.atan2(g_gc[0], g_gc[1])))

        def fit(S):
            """The best camera for these lines, as a dict: the camera, its line support, its parameters, its cost, its model."""
            tilt, sup_t, par_t, cost_t = refine_camera(cam, S, g_gc, f_gc, f_prior, sig, tilt_sigma_deg=0.7 if 'horizon' in ov else 1.5, mode='tilt', horizon_prior=prior)
            out = {'cam': tilt, 'support': sup_t, 'params': par_t, 'cost': cost_t, 'model': 'tilt', 'sup_t': sup_t, 'sup_s': None}
            if roll_gc < 3.0 and ov.get('camera') != 'tilt':
                shift, sup_s, par_s, cost_s = refine_camera(cam, S, g_gc, f_gc, f_prior, sig, mode='shift', horizon_prior=prior)
                out['sup_s'] = sup_s
                # corrected verticals are the rule in architectural photographs and renders: take the shifted camera unless the
                # tilted one clearly fits better (lines and depth together)
                if ov.get('camera') == 'shift' or cost_s <= cost_t + 0.01:
                    out.update(cam=shift, support=sup_s, params=par_s, cost=cost_s, model='shift')
            return out

        chosen = fit(segs)
        # The floor's own lines (board and tile seams) are not always the room's: herringbone, diagonal tiles or boards laid at
        # an angle point 45 degrees away from the walls. So when the camera says the room sits diagonally to the picture, the
        # floor supplies most of the lines that say so, and the lines off the floor (walls, windows, furniture) do not back it,
        # the camera is worked out again from the lines off the floor alone.
        if depth is not None and 'yaw' not in ov and abs(chosen['cam'].yaw) > 30.0:
            off = lines_off_floor(segs, depth[1], w, h)
            if off is not None and len(off) >= 10:
                share, backing = yaw_evidence(chosen['cam'], segs, off)
                report['yaw_floor_share'], report['yaw_backing'] = round(share, 2), round(backing, 2)
                if share >= 0.4 and backing < 0.35:
                    chosen = fit(off)
                    report['lines_off_floor'] = True
        cam, support, params = chosen['cam'], chosen['support'], chosen['params']
        report['model'] = chosen['model']
        if chosen['sup_s'] is not None:
            report['support_tilt'], report['support_shift'] = round(float(chosen['sup_t']), 3), round(float(chosen['sup_s']), 3)
        report['refined'] = [round(float(v), 2) for v in params]
    report.update(support=round(float(support), 3), second=round(float(second), 3))
    return cam


def check_yaw(cam, gray, ov, report, min_margin=0.2, min_yaw=8.0):
    """A room seen at an angle (the camera turned more than `min_yaw` degrees from the walls) needs evidence for it: the straight
    lines of the photo that are not vertical must agree with that angle clearly better than with a frontal view. Where they do
    not (a plain room with few lines, where chairs and a round table supply the only ones), the angle is noise, and most photos
    of rooms are taken square on, so the view is taken as frontal. Of the rooms seen at an angle in the current set, all but one win
    by 0.28 or more; the one that does not (DR-07) is a frontal photograph of a plain wall."""
    if 'yaw' in ov or abs(cam.yaw) <= min_yaw:
        return cam
    segs = detect_lines(gray, 0.035 * math.hypot(cam.w, cam.h))
    n, l = line_planes(cam, segs)
    keep = np.abs(n @ cam.g) > math.sin(math.radians(2.0))
    n, l = n[keep], l[keep]
    frontal = cam.copy()
    frontal.set_yaw(0.0)
    margin = (manhattan_support(cam, n, l, axes=('x', 'z')) - manhattan_support(frontal, n, l, axes=('x', 'z'))) if len(l) else 0.0
    report['yaw_margin'] = round(float(margin), 2)
    if margin >= min_margin:
        return cam
    report['yaw_assumed_frontal'] = round(float(cam.yaw), 1)
    return frontal


def lines_off_floor(segs, floor, w, h):
    """The line segments whose middle is off the floor: walls, windows, furniture, the line where wall meets floor."""
    inner = cv2.erode(floor.astype(np.uint8), kernel(0.012 * max(w, h))) > 0
    mx = np.clip(((segs[:, 0] + segs[:, 2]) / 2).astype(int), 0, w - 1)
    my = np.clip(((segs[:, 1] + segs[:, 3]) / 2).astype(int), 0, h - 1)
    return segs[~inner[my, mx]]


def yaw_evidence(cam, segs, off):
    """(share of the non-vertical line length that lies on the floor, support the lines off the floor give the camera's yaw).
    Vertical lines are left out: they agree with every yaw and say nothing about it."""
    def non_vertical(S):
        n, l = line_planes(cam, S)
        keep = np.abs(n @ cam.g) > math.sin(math.radians(2.0))
        return n[keep], l[keep]

    n_all, l_all = non_vertical(segs)
    n_off, l_off = non_vertical(off)
    if l_all.sum() <= 0 or l_off.sum() <= 0:
        return 0.0, 1.0
    return float(1.0 - l_off.sum() / l_all.sum()), float(manhattan_support(cam, n_off, l_off, axes=('x', 'z')))


def depth_horizon(D, floor, slope=0.0, lo=0.7, hi=9.0):
    """The row of the horizon (at the picture's middle column) that the depth model implies, with how far the floor's pixels
    scatter around the fit (pixels): (row, scatter) or None. On a level floor a pixel's row is its horizon plus a constant
    over its depth, so the rows of the floor's pixels fall on a line against inverse depth, and the line's intercept (at
    infinite depth) is the horizon. `slope` is the horizon's tilt in rows per column (a rolled camera)."""
    h, w = D.shape
    ys, xs = np.nonzero(floor)
    if len(xs) < 400:
        return None
    sel = np.random.default_rng(0).choice(len(xs), min(6000, len(xs)), replace=False)
    ys, xs = ys[sel], xs[sel]
    d = D[ys, xs].astype(np.float64)
    ok = (d > lo) & (d < hi)
    if ok.sum() < 300:
        return None
    ys, xs, d = ys[ok].astype(np.float64), xs[ok].astype(np.float64), d[ok]
    y = ys + slope * (xs - w / 2.0)
    A = np.stack([np.ones_like(d), 1.0 / d], 1)
    wgt = np.ones_like(d)
    for _ in range(12):  # robust (Huber-like) least squares: the floor's reflections and far corners do not get a vote
        coef = np.linalg.lstsq(A * wgt[:, None], y * wgt, rcond=None)[0]
        r = y - A @ coef
        s = 1.4826 * np.median(np.abs(r)) + 1e-6
        wgt = 1.0 / np.maximum(1.0, np.abs(r) / (1.5 * s))
    return float(coef[0]), float(s)


# ── scale ────────────────────────────────────────────────────────────────────────────────────────────────────────────

def unproject(cam, D, xs, ys):
    """Room-frame (X, Y down, Z) in the depth map's own units for pixels (xs, ys)."""
    r = cam.rays(xs + 0.5, ys + 0.5)
    P = r * D[ys, xs][:, None]
    return P @ cam.ex, P @ cam.ey, P @ cam.ez


def sample(mask, n, seed=0):
    ys, xs = np.nonzero(mask)
    if len(xs) > n:
        sel = np.random.default_rng(seed).choice(len(xs), n, replace=False)
        xs, ys = xs[sel], ys[sel]
    return xs, ys


def scale_from_depth(cam, D, floor, ceiling, ov, default_height, report):
    """Camera height in mm and the factor that turns depth-map units (metres) into mm.

    The depth model says how far below the lens the floor is. When the ceiling is visible, the room's height has to be a
    believable one; if the depth says otherwise, the scale is pulled toward it."""
    ceiling_mm = ov.get('ceiling', 2750.0)
    xs, ys = sample(floor, 20000)
    if len(xs) < 200:
        report['scale'] = 'default'
        return float(ov.get('height', default_height)), 1000.0
    X, Y, Z = unproject(cam, D, xs, ys)
    d = D[ys, xs]
    near = (d > 0.8) & (d < 6.0) & (Y > 0)
    H_d = float(np.median(Y[near])) if near.sum() > 100 else float(np.median(Y[Y > 0])) if (Y > 0).any() else 0.0
    if H_d <= 0.05:
        report['scale'] = 'default'
        return float(ov.get('height', default_height)), 1000.0
    H = H_d * 1000.0
    info = f'depth {H:.0f}'
    # Does the floor the depth model sees agree with the floor the camera implies? Its height under the lens should be the
    # same everywhere, and the plane through its points should be level.
    pts = near if near.sum() > 100 else (Y > 0)
    if pts.sum() > 100:
        y = Y[pts]
        med = float(np.median(y))
        report['floor_flat'] = round(float(1.4826 * np.median(np.abs(y - med)) / max(med, 1e-6)), 3)
        inl = pts & (np.abs(Y - med) < 0.3 * med)
        if inl.sum() > 100:
            Q = np.stack([X[inl], Y[inl], Z[inl]], 1)
            Q = Q - Q.mean(axis=0)
            normal = np.linalg.eigh(Q.T @ Q)[1][:, 0]
            report['floor_tilt'] = round(float(math.degrees(math.acos(min(1.0, abs(float(normal[1])))))), 1)
    if 'height' in ov:
        H = float(ov['height'])
        info = 'override'
    elif ceiling.sum() > 0.004 * ceiling.size:
        cx_, cy_ = sample(ceiling, 8000, 1)
        _, Yc, _ = unproject(cam, D, cx_, cy_)
        C = float(-np.percentile(Yc, 35)) * 1000.0  # ceiling above the lens (the main level, not the coves)
        room = H + C
        report['room_height_from_depth'] = round(room)
        if C > 0 and not (2300 <= room <= 3500):
            target = min(max(room, 2500.0), 3200.0)
            H = H * target / room
            info = f'depth {H_d * 1000:.0f}, pulled to room height {target:.0f}'
    # A camera held at eye level is below 2.2 m; one looking steeply down from a gallery or a stair can be much higher
    pitch = math.degrees(math.asin(max(-1.0, min(1.0, -float(cam.g[2])))))
    H = float(min(max(H, 350.0), 2200.0 if pitch > -25.0 else 5000.0))
    report['scale'] = info
    return H, H / H_d  # mm per depth-map unit (metre)


# ── walls ────────────────────────────────────────────────────────────────────────────────────────────────────────────

def density_peaks(c, s, lo, hi, step, min_support, merge_rel=0.06, merge_abs=140.0):
    """Peaks of the (kernel) density of positions `c` (each with its own spread `s`): [(position, support)], strongest first."""
    grid = np.arange(lo, hi + step, step)
    sup = np.zeros(len(grid))
    for i in range(0, len(grid), 256):
        g = grid[i:i + 256]
        sup[i:i + 256] = np.exp(-0.5 * ((g[:, None] - c[None, :]) / s[None, :]) ** 2).sum(axis=1)
    sm = np.convolve(sup, np.ones(3) / 3, mode='same')
    cand = [i for i in range(1, len(grid) - 1) if sm[i] >= sm[i - 1] and sm[i] > sm[i + 1] and sm[i] >= min_support]
    cand.sort(key=lambda i: -sm[i])
    out = []
    for i in cand:
        pos = grid[i]
        if any(abs(pos - q) <= merge_rel * max(abs(pos), abs(q)) + merge_abs for q, _ in out):
            continue
        out.append((float(pos), float(sm[i])))
    return out


def fit_walls(cam, D_mm, wall, ov, report, floor=None):
    """Vertical planes that carry the wall pixels: [{'axis', 'offset', 'support'}] and a label image (-1: none)."""
    h, w = wall.shape
    xs, ys = sample(wall, 30000, 2)
    if len(xs) < 300:
        return [], np.full((h, w), -1, np.int32)
    X, Y, Z = unproject(cam, D_mm, xs, ys)
    d = D_mm[ys, xs]
    sg = 0.05 * d + 60.0
    ok = np.isfinite(X) & np.isfinite(Z) & (d > 0)
    X, Z, d, sg = X[ok], Z[ok], d[ok], sg[ok]
    n = len(X)
    min_support = max(120.0, 0.04 * n)
    planes = []
    for axis, c, other in (('x', X, Z), ('z', Z, X)):
        lo, hi = float(np.percentile(c, 0.5)) - 200.0, float(np.percentile(c, 99.5)) + 200.0
        found = []
        for pos, sup in density_peaks(c, sg, lo, hi, 25.0, min_support):
            if axis == 'z' and pos < 0.4 * cam.height:
                continue
            near = np.abs(c - pos) < 1.5 * sg
            if near.sum() < 30:
                continue
            offset = float(np.median(c[near]))
            # a wall runs along the room: its pixels are spread along the other axis (a back wall seen as a peak of X is not a wall)
            lo_o, hi_o = np.percentile(other[near], [10, 90])
            if hi_o - lo_o < max(1100.0, 0.9 * cam.height):
                continue
            found.append({'axis': axis, 'offset': offset, 'support': sup})
        if found:
            top = max(q['support'] for q in found)
            planes += [q for q in found if q['support'] >= 0.2 * top]
    for i in sorted(ov.get('planes_drop', []), reverse=True):
        if 0 <= i < len(planes):
            planes.pop(i)
    for q in ov.get('planes_add', []):
        if 'base' in q:
            bx, bz = cam.floor_xz(np.array([q['base'][0] * w]), np.array([q['base'][1] * h]))
            offset = float(bx[0]) if q['axis'] == 'x' else float(bz[0])
        else:
            offset = float(q['offset'])
        planes.append({'axis': q['axis'], 'offset': offset, 'support': 1.0, 'forced': True})
    report['planes_found'] = [(p['axis'], round(p['offset']), round(p['support'])) for p in planes]
    if not planes:
        return [], np.full((h, w), -1, np.int32)
    lab = clean_labels(assign_walls(cam, D_mm, wall, planes))
    # planes that end up carrying little (a relief on a wall, a niche) are not walls: drop them and let their pixels go to the real ones
    for _ in range(3):
        keep = []
        for k, p in enumerate(planes):
            m = lab == k
            area = m.sum() / float(h * w)
            ext = plane_extent(cam, p, m)
            tall = plane_height_range(cam, p, m)
            p['area'], p['extent'], p['tall'] = area, ext, tall
            if p.get('forced') or (area >= 0.012 and ext >= max(1000.0, 0.9 * cam.height) and tall >= 900.0):
                keep.append(k)
        if len(keep) == len(planes):
            break
        planes = [planes[k] for k in keep]
        if not planes:
            return [], np.full((h, w), -1, np.int32)
        lab = clean_labels(assign_walls(cam, D_mm, wall, planes))
    # where a wall meets the floor says where the wall is far better than the depth model does: assign the pixels again
    if floor is not None and refine_offsets(cam, floor, lab, planes):
        lab = clean_labels(assign_walls(cam, D_mm, wall, planes))
        if refine_offsets(cam, floor, lab, planes):
            lab = clean_labels(assign_walls(cam, D_mm, wall, planes))
    planes, lab = drop_explained(cam, D_mm, wall, planes, lab)
    if enforce_corners(cam, lab, planes):
        lab = clean_labels(lab)
    lab = fill_wall_holes(lab, wall)
    report['planes_found'] = [(p['axis'], round(p['offset']), round(p['support'])) for p in planes]
    plane_residuals(cam, D_mm, lab, planes)
    return planes, lab


def is_straight(ys, xs, long_side):
    """True when the points lie along one straight line (a corner between two walls, a trim line): they are at least 6 % of the
    picture long and scatter less than 0.4 % of it across their own direction. A seam that merely meanders is not straight."""
    if len(xs) < 20:
        return False
    P = np.stack([xs, ys], 1).astype(np.float64)
    P -= P.mean(axis=0)
    ev = np.linalg.eigvalsh(P.T @ P / len(P))  # ascending: across, along
    return bool(np.sqrt(12.0 * ev[1]) >= 0.06 * long_side and np.sqrt(ev[0]) <= 0.004 * long_side)


def fill_wall_holes(lab, wall, purity=0.9):
    """Wall pixels (by the labels) that no plane took, bordered by ONE plane, are a hole where the depth model could not place
    the wall (glare, a smooth or dark patch, a stretch of wall that meets the edge of the picture), not another wall: they are
    given to that plane. Two things say it is another wall instead: it is bordered by more than one plane, or the seam between
    it and the plane is a straight line (a real corner or trim line). The neighbours that are not wall at all (furniture, the
    ceiling) say nothing either way. `lab` is not changed; the new labels are returned."""
    h, w = lab.shape
    long_side = max(h, w)
    free = wall & (lab < 0)
    n, cc, stats, _ = cv2.connectedComponentsWithStats(free.astype(np.uint8), connectivity=4)
    out = lab.copy()
    for i in range(1, n):
        comp = cc == i
        ring = cv2.dilate(comp.astype(np.uint8), kernel(2)) > 0
        nb = lab[ring & ~comp & wall]
        nb = nb[nb >= 0]
        if len(nb) < 30:
            continue
        k = int(np.bincount(nb).argmax())
        if float((nb == k).mean()) < purity:
            continue
        ys, xs = np.nonzero(ring & ~comp & (lab == k))
        if is_straight(ys, xs, long_side):
            continue
        out[comp] = k
    return out


def enforce_corners(cam, lab, planes):
    """Two walls at right angles meet along one line, their corner. Where the assignment takes turns between such a pair (the
    depth model cannot tell them apart there), their pixels are given by which wall the line of sight reaches first, as in a
    real corner; `lab` is changed in place. True when it changed anything."""
    changed = False
    for i in range(len(planes)):
        for j in range(i + 1, len(planes)):
            if planes[i]['axis'] == planes[j]['axis']:
                continue
            a, b = lab == i, lab == j
            if quality.flips(a, b) <= quality.LIMITS['wall']['flips']:
                continue
            ys, xs = np.nonzero(a | b)
            rx, ry, rz = cam.room_rays(xs + 0.5, ys + 0.5)
            t = np.full((2, len(xs)), np.inf)
            for n, k in enumerate((i, j)):
                p = planes[k]
                comp = rx if p['axis'] == 'x' else rz
                with np.errstate(divide='ignore', invalid='ignore'):
                    tt = np.where(np.abs(comp) > 1e-9, p['offset'] / comp, np.nan)
                hgt = cam.height - ry * tt
                ok = np.isfinite(tt) & (tt > 0) & (hgt > -0.2 * cam.height) & (hgt < 5000.0)
                t[n] = np.where(ok, tt, np.inf)
            lab[ys, xs] = np.where(t[0] <= t[1], i, j)
            changed = True
    return changed


def drop_explained(cam, D_mm, wall, planes, lab, share=0.6, small=0.04):
    """Removes a wall plane that is only the depth model's noise near a corner: one that no floor line confirms, or a small
    one, when the other planes explain most of its pixels. Its pixels go to the planes that explain them."""
    h, w = lab.shape
    changed = True
    while changed and len(planes) > 1:
        changed = False
        doubtful = [k for k, p in enumerate(planes) if not p.get('by_floor') or (lab == k).sum() < small * h * w]
        for k in sorted(doubtful, key=lambda k: planes[k]['support']):
            trial = [p for j, p in enumerate(planes) if j != k]
            lab_t = assign_walls(cam, D_mm, wall, trial)
            mine = lab == k
            if mine.sum() and (lab_t[mine] >= 0).mean() >= share:
                planes, lab = trial, clean_labels(lab_t)
                changed = True
                break
    return planes, lab


def refine_offsets(cam, floor, lab, planes, min_contact=80):
    """Moves each wall plane to where its wall meets the floor (mm); True when any moved.

    The depth model puts a wall within about 5 % of its distance, which is a few decimetres: enough to put the corner between
    two walls a hundred pixels from where it is. The line where a wall meets the floor lies on the floor, which the camera
    knows, and on the wall, so wherever furniture does not hide it that line fixes the wall's position to a few centimetres."""
    below = np.zeros_like(floor)
    below[:-1] = floor[1:]
    moved = False
    for k, p in enumerate(planes):
        ys, xs = np.nonzero((lab == k) & below)
        if len(xs) < min_contact:
            continue
        X, Z = cam.floor_xz(xs + 0.5, ys + 1.5)
        c = (X if p['axis'] == 'x' else Z)
        c = c[np.isfinite(c)]
        if len(c) < min_contact:
            continue
        med = float(np.median(c))
        spread = float(np.percentile(np.abs(c - med), 75))
        # a wall's foot is a straight line, so one coordinate is constant along it; and the depth model was not far wrong
        if spread > 0.08 * abs(med) + 90.0 or abs(med - p['offset']) > 0.35 * abs(p['offset']) + 250.0:
            continue
        if abs(med - p['offset']) > 1.0:
            moved = True
        p['offset'] = med
        p['by_floor'] = True
    return moved


def plane_residuals(cam, D_mm, lab, planes):
    """For each plane, how far the depth model puts its pixels from it, in units of the depth's own uncertainty (median).
    A flat wall gives about 0.5 to 1; a curved or irregular one, or planes fitted to noise, much more."""
    for k, p in enumerate(planes):
        ys, xs = np.nonzero(lab == k)
        if len(xs) < 50:
            p['resid'] = 9.9
            continue
        if len(xs) > 4000:
            sel = np.random.default_rng(8).choice(len(xs), 4000, replace=False)
            xs, ys = xs[sel], ys[sel]
        X, Y, Z = unproject(cam, D_mm, xs, ys)
        d = D_mm[ys, xs]
        sg = 0.05 * d + 60.0
        c = X if p['axis'] == 'x' else Z
        ok = np.isfinite(c)
        # flatness: how far the pixels scatter around where they lie together. (Not around the plane's offset: that may have
        # been moved to where the wall meets the floor, which the camera knows better than the depth model does.)
        p['resid'] = float(np.median(np.abs(c[ok] - np.median(c[ok])) / sg[ok])) if ok.sum() > 30 else 9.9


def clean_labels(lab, min_frac=0.0035, thin=0.008):
    """Small islands of a plane inside a region of another plane, and strips of it narrower than `thin` of the picture, are
    given to the plane around them (depth is noisy near edges and around window frames: a wall is not made of slivers)."""
    h, w = lab.shape
    out = lab.copy()
    for k in np.unique(lab):
        if k < 0:
            continue
        n, cc, stats, _ = cv2.connectedComponentsWithStats((lab == k).astype(np.uint8), connectivity=4)
        for i in range(1, n):
            if stats[i, cv2.CC_STAT_AREA] >= min_frac * h * w:
                continue
            comp = cc == i
            ring = cv2.dilate(comp.astype(np.uint8), kernel(3)) > 0
            around = lab[ring & ~comp]
            around = around[(around >= 0) & (around != k)]
            if len(around):
                out[comp] = np.bincount(around).argmax()
    r = max(3, int(round(thin * max(h, w))))
    for k in np.unique(out):
        if k < 0:
            continue
        m = (out == k).astype(np.uint8)
        strips = (m > 0) & (cv2.morphologyEx(m, cv2.MORPH_OPEN, kernel(r)) == 0)
        n, cc, stats, _ = cv2.connectedComponentsWithStats(strips.astype(np.uint8), connectivity=8)
        for i in range(1, n):
            comp = cc == i
            ring = cv2.dilate(comp.astype(np.uint8), kernel(2)) > 0
            around = out[ring & ~comp]
            around = around[(around >= 0) & (around != k)]
            if len(around):
                out[comp] = np.bincount(around).argmax()
    return out


def plane_extent(cam, plane, mask):
    """How far along the room a plane's pixels reach (mm), robustly."""
    ys, xs = np.nonzero(mask)
    if len(xs) < 50:
        return 0.0
    if len(xs) > 3000:
        sel = np.random.default_rng(5).choice(len(xs), 3000, replace=False)
        xs, ys = xs[sel], ys[sel]
    X, Z, hgt, t = cam.hit_wall(xs + 0.5, ys + 0.5, plane['axis'], plane['offset'])
    along = X if plane['axis'] == 'z' else Z
    along = along[np.isfinite(along)]
    if len(along) < 30:
        return 0.0
    lo, hi = np.percentile(along, [3, 97])
    return float(hi - lo)


def plane_height_range(cam, plane, mask):
    """The vertical reach (mm) of a plane's pixels, robustly."""
    ys, xs = np.nonzero(mask)
    if len(xs) < 50:
        return 0.0
    if len(xs) > 3000:
        sel = np.random.default_rng(6).choice(len(xs), 3000, replace=False)
        xs, ys = xs[sel], ys[sel]
    X, Z, hgt, t = cam.hit_wall(xs + 0.5, ys + 0.5, plane['axis'], plane['offset'])
    hgt = hgt[np.isfinite(hgt)]
    if len(hgt) < 30:
        return 0.0
    lo, hi = np.percentile(hgt, [3, 97])
    return float(hi - lo)


def assign_walls(cam, D_mm, wall, planes):
    """Each wall pixel goes to the plane whose position its depth agrees with and its line of sight reaches first."""
    h, w = wall.shape
    ys, xs = np.nonzero(wall)
    X, Y, Z = unproject(cam, D_mm, xs, ys)
    d = D_mm[ys, xs]
    sg = 0.05 * d + 60.0
    rx, ry, rz = cam.room_rays(xs + 0.5, ys + 0.5)
    best = {}
    for axis, c, comp in (('x', X, rx), ('z', Z, rz)):
        idx = [k for k, p in enumerate(planes) if p['axis'] == axis]
        if not idx:
            continue
        offs = np.array([planes[k]['offset'] for k in idx])
        res = np.abs(c[:, None] - offs[None, :]) / sg[:, None]
        j = res.argmin(axis=1)
        r_min = res[np.arange(len(c)), j]
        offset = offs[j]
        with np.errstate(divide='ignore', invalid='ignore'):
            t = np.where(np.abs(comp) > 1e-9, offset / comp, np.nan)
        hgt = cam.height - ry * t
        valid = (r_min < 2.5) & np.isfinite(t) & (t > 0) & (hgt > -0.2 * cam.height) & (hgt < 5000.0)
        best[axis] = (np.array(idx)[j], np.where(valid, t, np.inf))
    lab = np.full(len(xs), -1, np.int32)
    t_best = np.full(len(xs), np.inf)
    for axis, (k, t) in best.items():
        better = t < t_best
        lab[better] = k[better]
        t_best[better] = t[better]
    out = np.full((h, w), -1, np.int32)
    out[ys, xs] = lab
    return out


def plane_calibration(cam, plane, mask):
    """Image points and their millimetre positions on a wall plane (x left to right as seen, y up from the floor)."""
    ys, xs = np.nonzero(mask)
    if len(xs) < 80:
        return None
    sel = np.random.default_rng(3).choice(len(xs), min(4000, len(xs)), replace=False)
    px, py = xs[sel] + 0.5, ys[sel] + 0.5
    X, Z, hgt, t = cam.hit_wall(px, py, plane['axis'], plane['offset'])
    ok = np.isfinite(t)
    if ok.sum() < 50:
        return None
    if plane['axis'] == 'z':
        along = X
    elif plane['offset'] < 0:
        along = Z
    else:
        along = -Z
    along, hgt = along[ok], hgt[ok]
    a0, a1 = np.percentile(along, [1, 99])
    h1 = float(np.percentile(hgt, 99))
    if a1 - a0 < 300 or h1 < 300:
        return None
    corners = [(a0, 0.0), (a1, 0.0), (a1, h1), (a0, h1)]
    pts = []
    for a, hh in corners:
        if plane['axis'] == 'z':
            Xp, Zp = a, plane['offset']
        elif plane['offset'] < 0:
            Xp, Zp = plane['offset'], a
        else:
            Xp, Zp = plane['offset'], -a
        x, y = cam.project(np.array(Xp), np.array(cam.height - hh), np.array(Zp))
        pts.append((float(x), float(y)))
    pts = np.array(pts)
    if not np.all(np.isfinite(pts)) or np.abs(pts).max() > 12 * max(cam.w, cam.h):
        return None
    return {'image': [[round(float(x) / cam.w, 5), round(float(y) / cam.h, 5)] for x, y in pts],
            'planeMm': [[round(float(a - a0), 1), round(float(hh), 1)] for a, hh in corners]}


# ── a room ───────────────────────────────────────────────────────────────────────────────────────────────────────────

def floor_fit_points(cam, floor):
    """Four pixels on the floor, far apart and inside the picture, for the floor's calibration."""
    h, w = cam.h, cam.w
    ys, xs = np.nonzero(floor)
    y_hor = cam.horizon_y()
    y_bot = min(h - 1.0, float(np.percentile(ys, 99.5)))
    y_top0 = float(np.percentile(ys, 0.5))
    if y_hor is None:
        y_hor = y_top0 - 0.1 * h
    y_top = max(y_top0, y_hor + 0.18 * (y_bot - y_hor))
    xl, xr = 0.08 * w, 0.92 * w
    return [(xl, y_top), (xr, y_top), (xr, y_bot), (xl, y_bot)]


def analyse(code, path, force_seg=False):
    rid = code.lower()
    ov = load_overrides(rid)
    cat = CATEGORIES[code[:2]]
    full = read_bgr(path)
    H0, W0 = full.shape[:2]
    k = min(1.0, segment.WORK_LONG / max(H0, W0))
    img = cv2.resize(full, (round(W0 * k), round(H0 * k)), interpolation=cv2.INTER_AREA) if k < 1 else full
    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    names = ade_names()
    seg = segment.segment_file(path, force=force_seg)
    labels = seg['labels']
    D = depth_mod.depth_file(path)
    if D.shape != (h, w):
        D = cv2.resize(D, (w, h), interpolation=cv2.INTER_LINEAR)
    report = {'size': (w, h)}

    floor_classes = set(ov.get('floor_classes', OUTDOOR_FLOOR if code[:2] == 'BY' else ['floor']))
    wall_classes = set(ov.get('wall_classes', ['wall']))
    floor = clean_binary(snap_to_edges(class_mask(labels, names, floor_classes), img))
    wall = clean_binary(snap_to_edges(class_mask(labels, names, wall_classes), img))
    ceiling = clean_binary(class_mask(labels, names, {'ceiling'}))
    for key in ('floor_add', 'floor_sub', 'wall_add', 'wall_sub'):
        if key in ov:
            m = poly_mask(ov[key], w, h)
            if key.startswith('floor'):
                floor = (floor | m) if key.endswith('add') else (floor & ~m)
            else:
                wall = (wall | m) if key.endswith('add') else (wall & ~m)
    wall &= ~floor
    # what is nearly black against the surface it was labelled as is not that surface
    wall = clean_binary(drop_color_outliers(drop_dark_outliers(wall, gray, 0.32), img, 20.0))
    floor = clean_binary(drop_color_outliers(drop_dark_outliers(floor, gray, 0.22), img, 26.0))

    cam = make_camera(code, f'{path.parent.name}/{path.name}', w, h, gray, ov, report, depth=(D, floor), path=path)
    cam = check_yaw(cam, gray, ov, report)
    H, s = scale_from_depth(cam, D, floor, ceiling, ov, ov.get('height', cat[2]), report)
    cam.height = H
    D_mm = D.astype(np.float64) * s
    report['camera'] = cam.describe()

    planes, lab = [], None
    if not ov.get('no_walls') and wall.sum() > 0.005 * h * w:
        planes, lab = fit_walls(cam, D_mm, wall, ov, report, floor)

    # far floor, where the perspective is not reliable, is left to the photo
    floor_a = floor_alpha(cam, floor)
    # and so are stray patches that are not the room's floor: a road seen past a balcony, the floor of another room through a door
    floor_whole = floor
    floor = quality.main_parts(clean_binary(floor & (floor_a > 0.02)), rel=0.12)
    floor_a = np.where(floor, floor_a, 0.0).astype(np.float32)
    floor_cut = floor_whole & ~floor

    # What the models propose is only a proposal. Each surface is checked (quality.py) and one that cannot be identified
    # accurately is left out: it stays exactly as photographed, and the reason is written down for review.json.
    review = {'skipped': [], 'notes': []}

    def leave_out(what, why):
        review['skipped'].append({'surface': what, 'reasons': why})

    p_floor = class_prob(seg['probs'], [i for i, n in names.items() if n in floor_classes], (h, w))
    p_wall = class_prob(seg['probs'], [i for i, n in names.items() if n in wall_classes], (h, w))
    edges = quality.photo_edges(gray)
    ceil_near = cv2.dilate(ceiling.astype(np.uint8), kernel(0.012 * max(h, w))) > 0
    problems = [] if ov.get('trust_camera') else camera_problems(report)
    if ov.get('skip_all'):
        problems = [f"{ov['skip_all']} (decided by looking at the photo)"]

    candidates = []
    if problems:
        leave_out('Floor and walls', problems)
    else:
        if ov.get('no_floor'):
            review['notes'].append('the floor is left out by hand')
        elif floor.sum() < 0.004 * h * w:
            review['notes'].append('no floor is visible in this photo')
        else:
            fit = floor_fit_points(cam, floor)
            fx, fz = cam.floor_xz(np.array([q[0] for q in fit]) + 0.5, np.array([q[1] for q in fit]) + 0.5)
            xw = [p['offset'] for p in planes if p['axis'] == 'x']
            zw = [p['offset'] for p in planes if p['axis'] == 'z' and p['offset'] > 0]
            X0 = min(xw + [float(np.min(fx))]) if xw else float(np.min(fx))
            Z0 = max(zw + [float(np.max(fz))]) if zw else float(np.max(fz))
            candidates.append({
                'id': 'floor', 'name': 'Floor', 'kind': 'floor', 'priority': 0, 'mask': floor, 'alpha': floor_a, 'cut': floor_cut, 'prob': p_floor,
                'calibration': {'image': [[round((a + 0.5) / w, 5), round((b + 0.5) / h, 5)] for a, b in fit],
                                'planeMm': [[round(float(a - X0), 1), round(float(Z0 - b), 1)] for a, b in zip(fx, fz)]},
            })
        if ov.get('no_walls'):
            review['notes'].append('the walls are left out by hand')
        elif wall.sum() <= 0.005 * h * w:
            review['notes'].append('no wall is visible in this photo')
        elif not planes:
            leave_out('Walls', ['the walls could not be separated into flat planes that agree with the photo'])
        for kidx, p in enumerate(planes):
            whole = quality.main_parts(clean_binary(lab == kidx, min_frac=0.004))
            # only the part of the wall whose perspective can be trusted (not very far, not nearly edge-on) is tiled
            a = wall_alpha(cam, p, whole)
            m = quality.main_parts(clean_binary(whole & (a > 0.02)))
            cut = whole & ~m
            cut_share = float(cut.sum()) / max(1.0, float(whole.sum()))
            if m.sum() < 0.006 * h * w:
                unreliable = whole.sum() >= 0.006 * h * w and cut_share > 0.3
                leave_out(describe_plane(p), [UNRELIABLE_FAR if unreliable else 'too little of it is visible to tile convincingly'])
                continue
            cal = plane_calibration(cam, p, m)
            if cal is None:
                leave_out(describe_plane(p), ['its perspective could not be measured reliably'])
                continue
            candidates.append({'kind': 'wall', 'priority': 1, 'mask': m, 'alpha': np.where(m, a, 0.0).astype(np.float32), 'cut': cut, 'cut_share': cut_share,
                               'prob': p_wall, 'calibration': cal, 'plane': p, 'name': describe_plane(p).capitalize()})

    walls_c = [c for c in candidates if c['kind'] == 'wall']
    # the wall (by the labels) that no surface took: where the depth model could not place it
    taken = np.any([c['mask'] | c['cut'] for c in candidates], axis=0) if candidates else np.zeros((h, w), bool)
    unexplained = wall & ~taken
    for c in candidates:
        # Where a wall meets another wall is not an outline to judge by the photo's edges (a corner may not show at all);
        # every other line, the floor's included, is
        sib = [o['mask'] for o in walls_c if o is not c] if c['kind'] == 'wall' else []
        # Nor is the line against the ceiling: it is straight and structural, and in a soft-lit white room there is no edge to see
        # Nor is the line where the far part was cut off: it follows a distance, not an edge of the photo
        skip_lines = np.any(sib + [ceil_near, c['cut']], axis=0)
        c['metrics'] = quality.measure(c['mask'], c['prob'], edges, skip_lines, c.get('alpha'))
        if c['kind'] == 'wall':
            c['metrics']['flips'] = 0.0
            c['metrics']['gaps'] = quality.gaps(c['mask'], unexplained)
    # Two walls at right angles meet once along a line of sight; taking turns is the depth model not knowing which is which.
    # A sliver at the edge of a wall cannot veto the wall: it is the sliver that is doubtful. When the smaller of the two is woven
    # into the bigger one, nothing can be said about either.
    for i, a in enumerate(walls_c):
        for b in walls_c[i + 1:]:
            if a['plane']['axis'] == b['plane']['axis']:
                continue
            f = quality.flips(a['mask'], b['mask'])
            if f <= quality.LIMITS['wall']['flips']:
                continue
            big, small = (a, b) if a['mask'].sum() >= b['mask'].sum() else (b, a)
            woven = quality.share_in_hull(small['mask'], big['mask']) >= 0.3
            for c in ((big, small) if woven else (small,)):
                c['metrics']['flips'] = max(c['metrics']['flips'], f)
    for c in candidates:
        c['why'] = quality.reasons(c['kind'], c['metrics']) + (plane_problems(c['plane']) if c['kind'] == 'wall' else [])
        if c['why'] and c.get('cut_share', 0.0) > 0.3 and any('too little' in r for r in c['why']):
            c['why'].append(UNRELIABLE_FAR)
        c['area_sqft'] = surface_area_sqft(c, w, h)
        lo, hi = AREA_SQFT[c['kind']]
        if not lo <= c['area_sqft'] <= hi:
            c['why'].append(f"its size comes out at {c['area_sqft']:.0f} sq.ft, which no room has: the scale of the photo cannot be trusted")
    rejected = [c for c in candidates if c['why']]
    for c in rejected:
        leave_out(c['name'], c['why'])
    good = [c for c in candidates if not c['why']]

    # names: walls across are 'back' (the farthest first); side walls are left / right of the camera
    kept = [c for c in good if c['kind'] == 'wall']
    z_walls = sorted([c for c in kept if c['plane']['axis'] == 'z'], key=lambda c: -c['plane']['offset'])
    x_left = sorted([c for c in kept if c['plane']['axis'] == 'x' and c['plane']['offset'] < 0], key=lambda c: -c['plane']['offset'])
    x_right = sorted([c for c in kept if c['plane']['axis'] == 'x' and c['plane']['offset'] >= 0], key=lambda c: c['plane']['offset'])
    for group, base, side, label in ((z_walls, 'wall-back', 'north', 'Back wall'), (x_left, 'wall-left', 'west', 'Left wall'), (x_right, 'wall-right', 'east', 'Right wall')):
        for i, c in enumerate(group):
            c['id'] = base if i == 0 else f'{base}-{i + 1}'
            c['wallSide'] = side
            c['name'] = label if i == 0 else f'{label} {i + 1}'

    # a surface that passed every check can still be wrong in a way only a look at the picture shows: overrides say so
    surfaces = []
    for c in sorted(good, key=lambda c: c['priority']):
        by_hand = ov.get('skip', {}).get(c['id'])
        if by_hand:
            leave_out(c['name'], [f'{by_hand} (decided by looking at the photo)'])
            rejected.append(dict(c, why=[by_hand]))
        else:
            surfaces.append(c)
    report['planes'] = [(c['id'], c['plane']['axis'], round(c['plane']['offset']), round(c['plane']['support'])) for c in kept]

    left = wall & ~(np.any([s['mask'] for s in surfaces if s['kind'] == 'wall'], axis=0) if any(s['kind'] == 'wall' for s in surfaces) else np.zeros((h, w), bool))
    if left.sum() > 0.03 * h * w:
        review['notes'].append(f'{left.sum() / (h * w) * 100:.0f}% of the photo is wall that stays as photographed')

    return {'id': rid, 'code': code, 'path': path, 'roomType': cat[0], 'name': ov.get('name', f'{cat[1]} {int(code[3:])}'), 'img': img, 'size': (w, h),
            'orig_size': (W0, H0), 'surfaces': surfaces, 'rejected': rejected, 'review': review, 'cam': cam, 'labels': labels, 'names': names, 'depth': D,
            'depth_mm': D_mm, 'planes': planes, 'report': report, 'ov': ov}


# ── previews ─────────────────────────────────────────────────────────────────────────────────────────────────────────

def label_text(img, text, org, scale=0.45):
    cv2.putText(img, text, org, cv2.FONT_HERSHEY_SIMPLEX, scale, (0, 0, 0), 3, cv2.LINE_AA)
    cv2.putText(img, text, org, cv2.FONT_HERSHEY_SIMPLEX, scale, (255, 255, 255), 1, cv2.LINE_AA)


def preview(room):
    img, cam = room['img'], room['cam']
    h, w = img.shape[:2]
    tint = img.astype(np.float32)
    for i, s in enumerate(room['surfaces']):
        col = np.array(TINT[i % len(TINT)][::-1], np.float32)
        a = (s['mask'].astype(np.float32))[..., None] * 0.45
        tint = tint * (1 - a) + col * a
    tint = tint.astype(np.uint8)
    for i, s in enumerate(room['surfaces']):
        col = TINT[i % len(TINT)][::-1]
        cs, _ = cv2.findContours(s['mask'].astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        cv2.drawContours(tint, cs, -1, col, 1, cv2.LINE_AA)
        if cs:
            big = max(cs, key=cv2.contourArea)
            M = cv2.moments(big)
            if M['m00'] > 0:
                label_text(tint, s['id'], (int(M['m10'] / M['m00']) - 24, int(M['m01'] / M['m00'])))
    # what the checks left out is outlined in red, to judge whether they were right
    for c in room.get('rejected', []):
        cs, _ = cv2.findContours(c['mask'].astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        cv2.drawContours(tint, cs, -1, (0, 0, 255), 2, cv2.LINE_AA)
        if cs:
            M = cv2.moments(max(cs, key=cv2.contourArea))
            if M['m00'] > 0:
                label_text(tint, 'X ' + (c.get('id') or c['name'])[:14], (int(M['m10'] / M['m00']) - 30, int(M['m01'] / M['m00'])))
    # the measures of every surface that was proposed: green = kept, red = left out
    for j, (c, ok) in enumerate([(c, True) for c in room['surfaces']] + [(c, False) for c in room.get('rejected', [])]):
        m = c.get('metrics')
        if m:
            txt = f"{(c.get('id') or c['name'])[:12]:12s} area {m['area'] * 100:4.1f}% solid {m['solid']:.2f} sure {m['sure']:.2f} unsure {m['unsure']:.2f} edge {m['edge']:.2f}" + (f" flips {m['flips']:.2f}" if 'flips' in m else '')
            if c.get('plane'):
                txt += f" resid {c['plane'].get('resid', 0):.2f}"
            cv2.putText(tint, txt, (6, h - 8 - 16 * j), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 0, 0), 3, cv2.LINE_AA)
            cv2.putText(tint, txt, (6, h - 8 - 16 * j), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (90, 230, 90) if ok else (80, 80, 255), 1, cv2.LINE_AA)
    # a 500 mm grid on every surface, from its own calibration
    grid = img.copy()
    for s in room['surfaces']:
        cal = s['calibration']
        src = np.array(cal['planeMm'], np.float32)
        dst = np.array([[x * w, y * h] for x, y in cal['image']], np.float32)
        Hm = cv2.getPerspectiveTransform(src, dst)
        pm = np.array(cal['planeMm'])
        lo, hi = pm.min(axis=0) - 9000, pm.max(axis=0) + 9000
        layer = np.zeros_like(grid)
        step = 500.0
        for axis in (0, 1):
            v = math.floor(lo[axis] / step) * step
            while v <= hi[axis]:
                t = np.linspace(lo[1 - axis], hi[1 - axis], 160)
                pts = np.stack([np.full_like(t, v), t], 1) if axis == 0 else np.stack([t, np.full_like(t, v)], 1)
                q = cv2.perspectiveTransform(pts[None].astype(np.float32), Hm)[0]
                q = q[np.isfinite(q).all(axis=1)]
                q = q[(np.abs(q[:, 0]) < 6 * w) & (np.abs(q[:, 1]) < 6 * h)]
                if len(q) > 1:
                    heavy = int(round(v / step)) % 2 == 0
                    cv2.polylines(layer, [q.astype(np.int32)], False, (0, 70, 255) if heavy else (255, 150, 0), 1, cv2.LINE_AA)
                v += step
        sel = s['mask'] & (layer.sum(axis=2) > 0)
        grid[sel] = layer[sel]
    y = cam.horizon_y()
    if y is not None and -h < y < 2 * h:
        cv2.line(grid, (0, int(y)), (w, int(y)), (255, 255, 0), 1, cv2.LINE_AA)
    r = room['report']
    label_text(grid, f"{room['id']}  {cam.describe()}", (6, 16))
    label_text(grid, f"support {r.get('support')}/{r.get('second')}  focal {r.get('focal')}  scale {r.get('scale')}  planes {r.get('planes')}", (6, 34), 0.38)
    label_text(grid, f"floor flat {r.get('floor_flat')}  tilt {r.get('floor_tilt')}  model {r.get('model')}", (6, 50), 0.38)
    both = np.concatenate([tint, grid], axis=1)
    scale = min(1.0, 1800.0 / both.shape[1])
    if scale < 1:
        both = cv2.resize(both, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    write_png(PREVIEW_DIR / f"{room['id']}.png", both)


# ── writing the assets ───────────────────────────────────────────────────────────────────────────────────────────────

def save_webp(path, array, lossless=False, quality=80):
    path.parent.mkdir(parents=True, exist_ok=True)
    if array.ndim == 3:
        array = cv2.cvtColor(array, cv2.COLOR_BGR2RGB)
    im = Image.fromarray(array)
    if lossless:
        im.save(path, 'WEBP', lossless=True, quality=100, method=6)
    else:
        im.save(path, 'WEBP', quality=quality, method=6)


def surface_area_sqft(s, w, h):
    cal = s['calibration']
    src = np.array(cal['planeMm'], np.float32)
    dst = np.array([[x * w, y * h] for x, y in cal['image']], np.float32)
    try:
        Hinv = np.linalg.inv(cv2.getPerspectiveTransform(src, dst))
    except np.linalg.LinAlgError:
        return 0.0
    step = max(1, int(max(w, h) / 360))
    ys, xs = np.nonzero(s['mask'][::step, ::step])
    if len(xs) == 0:
        return 0.0
    pts = np.stack([xs * step + step / 2.0, ys * step + step / 2.0], 1).astype(np.float32).reshape(-1, 1, 2)
    base = cv2.perspectiveTransform(pts, Hinv).reshape(-1, 2)
    dx = cv2.perspectiveTransform(pts + np.array([[[1, 0]]], np.float32), Hinv).reshape(-1, 2) - base
    dy = cv2.perspectiveTransform(pts + np.array([[[0, 1]]], np.float32), Hinv).reshape(-1, 2) - base
    det = np.abs(dx[:, 0] * dy[:, 1] - dx[:, 1] * dy[:, 0]) * step * step
    # a surface that fades out (the far floor) counts as much as is tiled
    if s.get('alpha') is not None:
        det = det * s['alpha'][::step, ::step][ys, xs]
    det = det[np.isfinite(det)]
    return float(det.sum() / 1e6 * 10.7639)


def write_room(room):
    rid = room['id']
    folder = OUT_DIR / rid
    if folder.exists():
        shutil.rmtree(folder)  # a surface that is no longer proposed must not leave its mask behind
    img = room['img']
    h, w = img.shape[:2]
    tw = 480
    thumb = cv2.resize(img, (tw, round(h * tw / w)), interpolation=cv2.INTER_AREA) if w > tw else img
    save_webp(folder / 'thumb.webp', thumb, quality=78)
    # The picture the app shows: same pixels as the original, a tenth of the size. The originals stay out of the deployed app
    save_webp(folder / 'photo.webp', read_bgr(room['path']), quality=88)
    surfaces = []
    for s in room['surfaces']:
        # A surface may fade out (the far floor): the mask then holds how much of each pixel is tiled
        base = s['mask'].astype(np.float32) * (s['alpha'] if s.get('alpha') is not None else 1.0)
        soft = np.clip(cv2.GaussianBlur(base * 255.0, (0, 0), 0.8), 0, 255).astype(np.uint8)
        save_webp(folder / f"mask-{s['id']}.webp", soft, lossless=True)
        e = {'id': s['id'], 'name': s['name'], 'kind': s['kind'], 'priority': s['priority'],
             'mask': {'kind': 'raster', 'src': f"/rooms2d/photos/{rid}/mask-{s['id']}.webp"},
             'calibration': s['calibration'], 'areaSqFt': round(surface_area_sqft(s, w, h), 1)}
        if s.get('wallSide'):
            e['wallSide'] = s['wallSide']
        surfaces.append(e)
    out = {'id': rid, 'name': room['name'], 'roomType': room['roomType'], 'source': 'builtin',
           'image': {'src': f'/rooms2d/photos/{rid}/photo.webp', 'width': room['orig_size'][0], 'height': room['orig_size'][1], 'thumb': f'/rooms2d/photos/{rid}/thumb.webp'},
           'surfaces': surfaces, 'version': 1}
    # What was looked at and left out, by name, so the panel can say that those parts stay as photographed
    left_out = sorted({x['surface'] for x in room['review']['skipped']})
    if left_out:
        out['leftOut'] = left_out
    return out


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    write = '--write' in sys.argv
    force = '--force-seg' in sys.argv
    everything = photos()
    chosen = everything if args == ['all'] else [(c, p) for c, p in everything if c.lower() in [a.lower() for a in args]]
    if not chosen:
        raise SystemExit(__doc__)
    built, reviews = {}, {}
    for code, path in chosen:
        room = analyse(code, path, force_seg=force)
        r = room['report']
        out = [s['id'] for s in room['surfaces']]
        left = [x['surface'] for x in room['review']['skipped']]
        print(f"{room['id']}: {r['camera']}; support {r.get('support')}/{r.get('second')}, focal {r.get('focal')}, scale {r.get('scale')}, flat {r.get('floor_flat')}, tilt {r.get('floor_tilt')}, surfaces {out}" + (f', LEFT OUT {left}' if left else ''), flush=True)
        for x in room['review']['skipped']:
            print(f"    left out {x['surface']}: " + '; '.join(x['reasons']), flush=True)
        for note in room['review']['notes']:
            print(f'    note: {note}', flush=True)
        preview(room)
        reviews[room['id']] = {
            'surfaces': {s['id']: {k: round(float(v), 3) for k, v in s['metrics'].items()} for s in room['surfaces']},
            'skipped': room['review']['skipped'],
            'notes': room['review']['notes'],
        }
        if write:
            built[room['id']] = write_room(room)
    if write and built:
        existing = json.loads(DATA_OUT.read_text(encoding='utf-8')) if DATA_OUT.exists() else []
        by_id = {r['id']: r for r in existing}
        by_id.update(built)
        order = [c.lower() for c, _ in everything]
        ordered = [by_id[i] for i in order if i in by_id]
        DATA_OUT.write_text(json.dumps(ordered, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')
        print(f'wrote {DATA_OUT} ({len(ordered)} rooms)')
        # What was left out and why, next to what was kept, with the measures it was judged by: the record of the review
        old = json.loads(REVIEW_OUT.read_text(encoding='utf-8')).get('rooms', {}) if REVIEW_OUT.exists() else {}
        old.update(reviews)
        REVIEW_OUT.write_text(json.dumps({'limits': {'surface': quality.LIMITS, 'areaSqFt': AREA_SQFT, 'maxFloorTilt': MAX_FLOOR_TILT, 'maxFloorFlat': MAX_FLOOR_FLAT, 'maxPlaneResid': MAX_PLANE_RESID, 'floorFadeMm': FLOOR_FADE_MM, 'wallFadeMm': WALL_FADE_MM, 'wallFadeDeg': WALL_FADE_DEG},
                                          'rooms': {i: old[i] for i in order if i in old}}, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')
        print(f'wrote {REVIEW_OUT}')
        # Masks and thumbnails of rooms whose photo is gone
        for folder in OUT_DIR.iterdir() if OUT_DIR.exists() else []:
            if folder.is_dir() and folder.name not in order:
                shutil.rmtree(folder)
                print(f'removed the files of {folder.name}, which has no photo any more')


if __name__ == '__main__':
    main()
