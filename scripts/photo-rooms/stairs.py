"""Staircases from one photograph (development tool; see auto.py).

A flight of stairs is a very regular object: n steps, each with the same rise (the height of a riser) and the same run
(the depth of a tread), between two side edges. Given the camera (geom.py) such a flight has only a handful of unknowns:

    Hc    height of the camera above the level at the foot of the flight (mm)
    r     rise, d  run (mm)
    z1    distance along the flight (room axis Z) of the first riser
    xl, xr  the two sides of the flight (room axis X)
    n     number of steps
    yaw   a small correction of the room's yaw (the flight is the best guide to it)

These are found by ray-casting the model through the camera and comparing, pixel by pixel, with what the photograph
says: which pixels are stairs (segmentation), and for each of them whether the surface is horizontal (a tread) or
vertical (a riser), which the depth map's surface normals give. The ray-cast also yields clean masks for every tread and
riser, and exact planes for their calibrations, so the tile pattern on every step is aligned to the step's own edges.

Units: millimetres; the room frame of geom.Cam (X across to the right, Y down from the lens, Z away along the flight).
"""
import math

import cv2
import numpy as np

from geom import Cam

RISE_DEFAULT = 170.0


# ── what the photograph says ────────────────────────────────────────────────────────────────────────────────────────────

def surface_up(cam, D, sigma=2.0):
    """|normal . up| per pixel from the depth map (1 = a horizontal surface such as a tread, 0 = a vertical one)."""
    h, w = D.shape
    Ds = cv2.GaussianBlur(D.astype(np.float32), (0, 0), sigma)
    ys, xs = np.mgrid[0:h, 0:w]
    r = cam.rays(xs + 0.5, ys + 0.5)
    P = (r * Ds[..., None]).astype(np.float32)
    P = np.stack([P @ cam.ex, P @ cam.ey, P @ cam.ez], -1).astype(np.float32)
    dx = cv2.Sobel(P, cv2.CV_32F, 1, 0, ksize=5)
    dy = cv2.Sobel(P, cv2.CV_32F, 0, 1, ksize=5)
    n = np.cross(dx, dy)
    n /= np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-9)
    return np.abs(n[..., 1])


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def components(mask, min_area):
    n, lab, stats, cent = cv2.connectedComponentsWithStats(mask.astype(np.uint8), connectivity=4)
    return [(i, stats[i, cv2.CC_STAT_AREA], cent[i]) for i in range(1, n) if stats[i, cv2.CC_STAT_AREA] >= min_area]


# ── the model ───────────────────────────────────────────────────────────────────────────────────────────────────────────

class Flight:
    """Parameters of a flight; labels 2k (tread k) and 2k+1 (riser k), k = 1..n, 0 for none."""

    def __init__(self, Hc, r, d, z1, xl, xr, n):
        self.Hc, self.r, self.d, self.z1, self.xl, self.xr, self.n = Hc, r, d, z1, xl, xr, int(n)

    def level_y(self, k):
        """Y (down from the lens) of the top of step k's tread."""
        return self.Hc - k * self.r

    def nosing_z(self, k):
        return self.z1 + (k - 1) * self.d

    def as_list(self):
        return [self.Hc, self.r, self.d, self.z1, self.xl, self.xr, self.n]


def ray_cast(f, rx, ry, rz):
    """Label of the first step surface each ray (components rx, ry, rz along X, Y, Z, with z = 1) meets, 0 for none."""
    shape = rx.shape
    rx, ry, rz = rx.ravel(), ry.ravel(), rz.ravel()
    best = np.full(rx.shape, np.inf)
    lab = np.zeros(rx.shape, np.int32)
    with np.errstate(divide='ignore', invalid='ignore'):
        for k in range(1, f.n + 1):
            zk = f.nosing_z(k)
            top = f.level_y(k)
            bottom = f.level_y(k - 1)
            lo, hi = (top, bottom) if top < bottom else (bottom, top)
            # riser k: the vertical plane Z = zk between the level below and this step's top
            t = zk / rz
            ok = (t > 0) & (t < best)
            if ok.any():
                X = t * rx
                Y = t * ry
                ok &= (X >= f.xl) & (X <= f.xr) & (Y >= lo) & (Y <= hi)
                best = np.where(ok, t, best)
                lab = np.where(ok, 2 * k + 1, lab)
            # tread k: the horizontal plane at the top of the step, from this riser back to the next
            t = top / ry
            ok = (t > 0) & (t < best)
            if ok.any():
                X = t * rx
                Z = t * rz
                ok &= (X >= f.xl) & (X <= f.xr) & (Z >= zk) & (Z <= zk + f.d)
                best = np.where(ok, t, best)
                lab = np.where(ok, 2 * k, lab)
    return lab.reshape(shape), best.reshape(shape)


def klass(lab):
    """1 for a tread, 2 for a riser, 0 for none."""
    out = np.zeros(lab.shape, np.int8)
    out[(lab > 0) & (lab % 2 == 0)] = 1
    out[(lab > 0) & (lab % 2 == 1)] = 2
    return out


# ── the fit ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

class Observation:
    """The photograph at a working size: which pixels are stairs, how tread-like each is, and where the edges are."""

    def __init__(self, cam, D, stairs, gray, width=320):
        h, w = stairs.shape
        ys, xs = np.nonzero(stairs)
        pad = int(0.04 * max(h, w))
        self.box = (max(0, xs.min() - pad), max(0, ys.min() - pad), min(w, xs.max() + pad + 1), min(h, ys.max() + pad + 1))
        x0, y0, x1, y1 = self.box
        self.k = min(1.0, width / max(x1 - x0, y1 - y0))
        sz = (max(8, int(round((x1 - x0) * self.k))), max(8, int(round((y1 - y0) * self.k))))
        up = surface_up(cam, D)
        self.up = cv2.resize(up[y0:y1, x0:x1], sz, interpolation=cv2.INTER_AREA)
        self.S = cv2.resize(stairs[y0:y1, x0:x1].astype(np.float32), sz, interpolation=cv2.INTER_AREA) > 0.5
        g = cv2.GaussianBlur(gray[y0:y1, x0:x1].astype(np.float32), (0, 0), 1.0)
        gx = cv2.Sobel(g, cv2.CV_32F, 1, 0)
        gy = cv2.Sobel(g, cv2.CV_32F, 0, 1)
        grad = np.hypot(gx, gy)
        self.grad = cv2.resize(grad, sz, interpolation=cv2.INTER_AREA)
        self.grad /= max(float(np.percentile(self.grad, 95)), 1e-6)
        self.pt = smoothstep(0.4, 0.8, self.up)  # how tread-like a stairs pixel is
        xs_, ys_ = np.meshgrid((np.arange(sz[0]) + 0.5) / self.k + x0, (np.arange(sz[1]) + 0.5) / self.k + y0)
        self.xs, self.ys = xs_, ys_
        self.sz = sz
        self.cam = cam

    def rays(self, yaw_delta=0.0):
        cam = self.cam
        if yaw_delta:
            cam = cam.copy()
            cam.set_yaw(cam.yaw + yaw_delta)
        return cam.room_rays(self.xs, self.ys)

    def score(self, lab):
        c = klass(lab)
        S, pt = self.S, self.pt
        tread = (c == 1)
        riser = (c == 2)
        reward = np.zeros(S.shape, np.float32)
        reward[S & tread] = pt[S & tread]
        reward[S & riser] = (1.0 - pt)[S & riser]
        reward[S & (c == 0)] = -0.25                     # a stairs pixel the model does not explain
        wrong = S & ((tread & (pt < 0.3)) | (riser & (pt > 0.7)))
        reward[wrong] = -0.4
        reward[~S & (c > 0)] = -0.35                      # the model claims something that is not stairs
        # boundaries between steps should sit on image edges
        edge_bonus = 0.0
        if lab.shape[0] > 2:
            b = (lab[1:, :] != lab[:-1, :]) & (lab[1:, :] > 0) & (lab[:-1, :] > 0)
            if b.any():
                edge_bonus = 0.6 * float(self.grad[1:, :][b].mean()) * b.sum() / max(1, S.sum()) * 8.0
        return float(reward.sum()) / max(1.0, float(S.sum())) + edge_bonus


def measure_treads(cam, D, stairs, up, ov):
    """First estimates from the depth map: the treads that can be told apart, their positions along the flight and their
    heights, in the depth map's own units."""
    h, w = stairs.shape
    m = stairs & (up > 0.62)
    m = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)) > 0
    m = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (15, 3))) > 0
    area_min = max(60, int(0.0007 * h * w))
    comps = components(m, area_min)
    ys, xs = np.mgrid[0:h, 0:w]
    out = []
    for i, area, cen in comps:
        sel = np.zeros((h, w), bool)
        n, lab, st, ce = cv2.connectedComponentsWithStats(m.astype(np.uint8), connectivity=4)
        sel = lab == i
        yy, xx = ys[sel], xs[sel]
        if len(yy) > 2000:
            idx = np.random.default_rng(i).choice(len(yy), 2000, replace=False)
            yy, xx = yy[idx], xx[idx]
        r = cam.rays(xx + 0.5, yy + 0.5)
        d = D[yy, xx]
        P = r * d[:, None]
        X, Y, Z = P @ cam.ex, P @ cam.ey, P @ cam.ez
        out.append({'area': area, 'X': (np.percentile(X, 5), np.percentile(X, 95)), 'Y': float(np.median(Y)), 'Z': float(np.median(Z)),
                    'Znear': float(np.percentile(Z, 8)), 'ycen': float(cen[1])})
    out.sort(key=lambda c: c['Z'])
    return out


def fit(cam, D, stairs, gray, ov=None, seed=0, verbose=False):
    """Finds the flight. Returns a dict with the flight, its scale (mm per depth-map unit), the label map at the photo's
    working size and the score, or None when there is no flight to find."""
    from scipy.optimize import differential_evolution

    ov = ov or {}
    h, w = stairs.shape
    if stairs.sum() < 0.015 * h * w:
        return None
    up = surface_up(cam, D)
    treads = measure_treads(cam, D, stairs, up, ov)
    if len(treads) < 2:
        return None
    # the nearest few treads are the most reliable
    near = treads[: min(len(treads), 6)]
    dz = np.diff([t['Z'] for t in near])
    dy = np.diff([t['Y'] for t in near])
    rise_units = float(np.median(np.abs(dy))) if len(dy) else 0.17
    run_units = float(np.median(np.abs(dz))) if len(dz) else 0.28
    ascending = float(np.median(dy)) < 0  # Y shrinks as the flight climbs away
    # one unit of the depth map is a metre if the model is metric; otherwise the rise sets the scale
    s0 = 1000.0 if 120.0 <= rise_units * 1000.0 <= 240.0 else RISE_DEFAULT / max(rise_units, 1e-3)
    if 'rise' in ov:
        s0 = ov['rise'] / max(rise_units, 1e-3)
    r0 = rise_units * s0 * (1 if ascending else -1)
    d0 = float(np.clip(run_units * s0, 190.0, 380.0))
    first = treads[0]
    Hc0 = first['Y'] * s0 + r0
    z10 = first['Znear'] * s0
    xl0, xr0 = first['X'][0] * s0, first['X'][1] * s0
    n0 = int(np.clip(len(treads) * 1.15 + 1, 4, 30))
    if verbose:
        print(f'   init: r={r0:.0f} d={d0:.0f} Hc={Hc0:.0f} z1={z10:.0f} x=[{xl0:.0f},{xr0:.0f}] n={n0} (scale {s0:.0f}, {len(treads)} treads)')

    obs = Observation(cam, D, stairs, gray)
    rx, ry, rz = obs.rays()
    sgn = 1.0 if ascending else -1.0
    width0 = max(xr0 - xl0, 300.0)

    def make(p):
        Hc, r, d, z1, xl, xr, n = p
        return Flight(Hc, sgn * r, d, z1, xl, xr, round(n))

    def cost(p):
        f = make(p)
        lab, _ = ray_cast(f, rx, ry, rz)
        return -obs.score(lab)

    b_r = (max(110.0, abs(r0) * 0.8), min(240.0, abs(r0) * 1.25 + 10))
    if 'rise' in ov:
        b_r = (ov['rise'] * 0.97, ov['rise'] * 1.03)
    bounds = [
        (Hc0 - 0.35 * abs(Hc0) - 300, Hc0 + 0.35 * abs(Hc0) + 300),   # Hc
        b_r,                                                          # r
        (max(180.0, d0 * 0.75), min(400.0, d0 * 1.3)),                # d
        (z10 - 0.22 * abs(z10) - 200, z10 + 0.22 * abs(z10) + 200),   # z1
        (xl0 - 0.3 * width0, xl0 + 0.3 * width0),                     # xl
        (xr0 - 0.3 * width0, xr0 + 0.3 * width0),                     # xr
        (max(3.0, n0 * 0.55), min(34.0, n0 * 1.5)),                   # n
    ]
    x0 = np.array([Hc0, abs(r0), d0, z10, xl0, xr0, n0], float)
    pop = np.clip(x0 + np.random.default_rng(seed).normal(0, 1, (60, 7)) * np.array([0.1 * abs(Hc0) + 60, 8, 20, 0.07 * abs(z10) + 60, 0.1 * width0, 0.1 * width0, 2.0]), [b[0] for b in bounds], [b[1] for b in bounds])
    pop[0] = np.clip(x0, [b[0] for b in bounds], [b[1] for b in bounds])
    res = differential_evolution(cost, bounds, init=pop, maxiter=70, tol=1e-5, mutation=(0.4, 0.9), recombination=0.8, seed=seed, polish=False, updating='immediate')
    f = make(res.x)
    # polish the integer-free parameters with a local search at the final n
    from scipy.optimize import minimize

    def cost2(p):
        return cost(list(p[:6]) + [res.x[6]])

    loc = minimize(cost2, res.x[:6], method='Nelder-Mead', options={'xatol': 1.0, 'fatol': 1e-5, 'maxiter': 300})
    best = list(loc.x) + [res.x[6]] if loc.fun < res.fun else list(res.x)
    f = make(best)
    if verbose:
        print(f'   fit: score {-min(loc.fun, res.fun):.3f}  Hc={f.Hc:.0f} r={f.r:.0f} d={f.d:.0f} z1={f.z1:.0f} x=[{f.xl:.0f},{f.xr:.0f}] n={f.n}')
    # the depth map's scale, from the model's own distances
    ys, xs = np.mgrid[0:h, 0:w]
    rr = cam.room_rays(xs + 0.5, ys + 0.5)
    lab_full, t_full = ray_cast(f, *rr)
    sel = (lab_full > 0) & stairs & (D > 0)
    scale = float(np.median(t_full[sel] / D[sel])) if sel.sum() > 100 else s0
    return {'flight': f, 'scale': scale, 'labels': lab_full, 'score': float(-min(loc.fun, res.fun)), 'rays': rr}


# ── facets ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

def facets(cam, found, stairs, min_px=60, budget=14, include_risers=True):
    """Tread and riser surfaces of the flight: [{'id', 'group', 'name', 'kind', 'mask', 'calibration'}].

    Treads use the floor convention of the app (x to the right, y toward the viewer) with the origin at the left end of the
    nosing, so a tile row starts exactly at the nosing; risers use the wall convention (x left to right, y up) with the
    origin at the bottom left. Steps that are too small to see are left out."""
    f = found['flight']
    lab = found['labels']
    h, w = lab.shape
    # the stairs mask decides what is tiled; one pixel of slack lets neighbouring facets meet without a gap
    S = cv2.dilate(stairs.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
    out_t, out_r = [], []
    for k in range(1, f.n + 1):
        mt = (lab == 2 * k) & S
        mr = (lab == 2 * k + 1) & S
        if mt.sum() >= min_px:
            out_t.append((k, mt))
        if mr.sum() >= min_px:
            out_r.append((k, mr))
    # the 'far' steps are tiny: keep the nearest ones if there are more than the room can take
    nt, nr = len(out_t), len(out_r)
    if include_risers and nt + nr > budget:
        include_risers = False
    if nt > budget:
        out_t = out_t[:budget]
    result = []

    def corners(mask):
        ys, xs = np.nonzero(mask)
        pts = np.stack([xs + 0.5, ys + 0.5], 1)
        # the four extreme points of the region in the image: top-left, top-right, bottom-right, bottom-left
        s = pts[:, 0] + pts[:, 1]
        dd = pts[:, 0] - pts[:, 1]
        return [pts[np.argmin(s)], pts[np.argmax(dd)], pts[np.argmax(s)], pts[np.argmin(dd)]]

    for k, m in out_t:
        c = corners(m)
        down = f.level_y(k)
        X, Z = cam.plane_xz(np.array([p[0] for p in c]), np.array([p[1] for p in c]), down)
        zk = f.nosing_z(k)
        plane = [[round(float(x - f.xl), 1), round(float(zk - z), 1)] for x, z in zip(X, Z)]
        result.append({'id': f'tread-{k}', 'group': 'treads', 'name': 'Stair treads', 'kind': 'floor', 'priority': 3, 'mask': m,
                       'calibration': {'image': [[round(float(p[0]) / cam.w, 5), round(float(p[1]) / cam.h, 5)] for p in c], 'planeMm': plane}})
    if include_risers:
        for k, m in out_r:
            c = corners(m)
            zk = f.nosing_z(k)
            X, Y, Z, hgt = None, None, None, None
            rx, ry, rz = cam.room_rays(np.array([p[0] for p in c]), np.array([p[1] for p in c]))
            t = zk / rz
            X = t * rx
            Y = t * ry
            base = f.level_y(k - 1)
            plane = [[round(float(x - f.xl), 1), round(float(base - y) * (1.0 if f.r > 0 else -1.0), 1)] for x, y in zip(X, Y)]
            result.append({'id': f'riser-{k}', 'group': 'risers', 'name': 'Stair risers', 'kind': 'wall', 'priority': 3, 'mask': m,
                           'calibration': {'image': [[round(float(p[0]) / cam.w, 5), round(float(p[1]) / cam.h, 5)] for p in c], 'planeMm': plane}})
    return result
