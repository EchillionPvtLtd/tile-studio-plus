"""Room geometry from one photo: a pinhole camera that knows which way is down, the room's two horizontal axes, and the
planes of the floor and the walls (development tool; see auto.py).

Conventions (millimetres unless noted)
- Camera frame: x right, y down, z forward, origin at the lens. Pixels are at the working size of the photo.
- Room frame: e_y is gravity (down). e_z and e_x are the two horizontal axes of the room, e_z being the one nearer to the
  direction the camera looks; (e_x, e_y, e_z) is right-handed like the camera frame. `yaw` turns e_z toward the camera's right.
- The floor is the plane e_y . P = camera height. A wall is a vertical plane X = d (a side wall) or Z = d (a wall across),
  with X = e_x . P and Z = e_z . P.
"""
import math

import cv2
import numpy as np


class Cam:
    def __init__(self, w, h, f, gravity, yaw_deg=0.0, height_mm=1300.0, cx=None, cy=None):
        self.w, self.h, self.f = w, h, float(f)
        self.cx = w / 2.0 if cx is None else float(cx)
        self.cy = h / 2.0 if cy is None else float(cy)
        g = np.asarray(gravity, float)
        self.g = g / np.linalg.norm(g)
        self.height = float(height_mm)
        self.set_yaw(yaw_deg)

    def copy(self):
        return Cam(self.w, self.h, self.f, self.g.copy(), self.yaw, self.height, self.cx, self.cy)

    # -- orientation ------------------------------------------------------------------------------------------------

    def set_yaw(self, yaw_deg):
        g = self.g
        z = np.array([0.0, 0.0, 1.0])
        zh = z - g * np.dot(z, g)
        zh /= np.linalg.norm(zh)
        xh = np.cross(g, zh)  # (right, down, forward) is right-handed: x = y cross z
        a = math.radians(yaw_deg)
        self.yaw = float(yaw_deg)
        self.ez = math.cos(a) * zh + math.sin(a) * xh
        self.ex = np.cross(g, self.ez)
        self.ey = g

    def set_gravity(self, g):
        g = np.asarray(g, float)
        self.g = g / np.linalg.norm(g)
        self.set_yaw(self.yaw)

    @property
    def K(self):
        return np.array([[self.f, 0, self.cx], [0, self.f, self.cy], [0, 0, 1.0]])

    def horizon_y(self, x=None):
        """Image row of the horizon at column x (default: the middle), or None when looking straight down."""
        if abs(self.g[1]) < 1e-9:
            return None
        x = self.cx if x is None else x
        return self.cy - (self.f * self.g[2] + (x - self.cx) * self.g[0]) / self.g[1]

    # -- rays and planes --------------------------------------------------------------------------------------------

    def rays(self, x, y):
        """Camera-frame rays (z = 1) for pixel coordinates (arrays)."""
        x = np.asarray(x, float)
        y = np.asarray(y, float)
        return np.stack([(x - self.cx) / self.f, (y - self.cy) / self.f, np.ones_like(x)], axis=-1)

    def room_rays(self, x, y):
        """Components of the pixels' rays along (e_x, e_y, e_z)."""
        r = self.rays(x, y)
        return r @ self.ex, r @ self.ey, r @ self.ez

    def floor_xz(self, x, y):
        """(X, Z) in mm of the floor point under each pixel; NaN at and above the horizon."""
        rx, ry, rz = self.room_rays(x, y)
        with np.errstate(divide='ignore', invalid='ignore'):
            t = np.where(ry > 1e-9, self.height / ry, np.nan)
        return rx * t, rz * t

    def plane_xz(self, x, y, down):
        """(X, Z) in mm where each pixel's ray meets the horizontal plane `down` mm below the lens (the floor at +height, a
        ceiling at a negative value); NaN where the ray never reaches it."""
        rx, ry, rz = self.room_rays(x, y)
        with np.errstate(divide='ignore', invalid='ignore'):
            t = np.where(ry * down > 1e-9, down / ry, np.nan)
        return rx * t, rz * t

    def hit_wall(self, x, y, axis, offset):
        """Where each pixel's ray meets the vertical plane (axis 'x': X = offset; 'z': Z = offset): (X, Z, height above
        the floor, ray parameter). NaN where the plane is behind the camera."""
        rx, ry, rz = self.room_rays(x, y)
        comp = rx if axis == 'x' else rz
        with np.errstate(divide='ignore', invalid='ignore'):
            t = np.where(np.abs(comp) > 1e-9, offset / comp, np.nan)
        t = np.where(t > 0, t, np.nan)
        return rx * t, rz * t, self.height - ry * t, t

    def project(self, X, Y_down, Z):
        """Pixel of a room point (mm; Y_down measured from the lens, the floor is at +height)."""
        P = np.asarray(X, float)[..., None] * self.ex + np.asarray(Y_down, float)[..., None] * self.ey + np.asarray(Z, float)[..., None] * self.ez
        with np.errstate(divide='ignore', invalid='ignore'):
            return self.cx + self.f * P[..., 0] / P[..., 2], self.cy + self.f * P[..., 1] / P[..., 2]

    def describe(self):
        pitch = math.degrees(math.asin(max(-1, min(1, -self.g[2]))))
        roll = math.degrees(math.atan2(self.g[0], self.g[1]))
        fov = math.degrees(2 * math.atan(self.w / 2.0 / self.f))
        return f'f={self.f:.0f}px (hfov {fov:.0f}°), pitch {pitch:+.1f}°, roll {roll:+.1f}°, yaw {self.yaw:+.1f}°, horizon y={self.horizon_y():.0f}, height {self.height:.0f} mm'


def gravity_from(pitch_deg, roll_deg):
    """Gravity (unit, down) in camera coordinates for a camera pitched up by `pitch` and rolled by `roll`."""
    p, r = math.radians(pitch_deg), math.radians(roll_deg)
    return np.array([math.cos(p) * math.sin(r), math.cos(p) * math.cos(r), -math.sin(p)])


def swap_focal(g, f_old, f_new, w, h):
    """Gravity after changing the focal length while the horizon line stays where it is in the picture.

    The horizon is what a photo shows reliably; the focal length is the weak part of a learned estimate. The line at
    infinity of the ground is l = K^-T g, and g = K^T l for any other K."""
    K = np.array([[f_old, 0, w / 2.0], [0, f_old, h / 2.0], [0, 0, 1.0]])
    K2 = np.array([[f_new, 0, w / 2.0], [0, f_new, h / 2.0], [0, 0, 1.0]])
    line = np.linalg.inv(K).T @ np.asarray(g, float)
    g2 = K2.T @ line
    g2 /= np.linalg.norm(g2)
    return g2 if g2[1] > 0 else -g2


def gravity_from_horizon(y_h, roll_deg, f, w, h):
    """Gravity for a camera whose horizon crosses the middle column at row y_h and is rolled by roll_deg."""
    r = math.radians(roll_deg)
    p = math.atan2((y_h - h / 2.0) * math.cos(r), f)  # camera pitched up when the horizon is below the centre
    return gravity_from(math.degrees(p), roll_deg)


# ── line segments ─────────────────────────────────────────────────────────────────────────────────────────────────────

def detect_lines(gray, min_len):
    """Straight segments (x1, y1, x2, y2) at least `min_len` pixels long, longest first."""
    g = cv2.GaussianBlur(gray, (0, 0), 0.8)
    lsd = cv2.createLineSegmentDetector(cv2.LSD_REFINE_ADV)
    out = lsd.detect(g)[0]
    if out is None:
        return np.zeros((0, 4), np.float64)
    seg = out.reshape(-1, 4).astype(np.float64)
    length = np.hypot(seg[:, 2] - seg[:, 0], seg[:, 3] - seg[:, 1])
    seg = seg[length >= min_len]
    return seg[np.argsort(-np.hypot(seg[:, 2] - seg[:, 0], seg[:, 3] - seg[:, 1]))]


def line_planes(cam, seg):
    """Unit normals of the planes through the lens that contain each image segment, and the segment lengths."""
    p = np.stack([seg[:, 0], seg[:, 1], np.ones(len(seg))], axis=1)
    q = np.stack([seg[:, 2], seg[:, 3], np.ones(len(seg))], axis=1)
    n = np.cross(p, q) @ cam.K  # K^T l for each line l
    n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
    return n, np.hypot(seg[:, 2] - seg[:, 0], seg[:, 3] - seg[:, 1])


def manhattan_support(cam, n, length, sigma=math.radians(1.6), axes=('x', 'y', 'z')):
    """Share of the total line length that agrees with the room's axes (a line agrees when the plane through the lens that
    contains it also contains the axis direction), each segment counted by how closely."""
    dev = np.full(len(n), np.pi / 2)
    for a in axes:
        d = {'x': cam.ex, 'y': cam.ey, 'z': cam.ez}[a]
        dev = np.minimum(dev, np.arcsin(np.clip(np.abs(n @ d), 0, 1)))
    return float((length * np.exp(-0.5 * (dev / sigma) ** 2)).sum() / max(length.sum(), 1e-9))


def estimate_yaw(cam, seg, step=0.25):
    """Yaw (degrees, -45..45) that best aligns the room's horizontal axes with the long line segments, the support it
    gets (0..1) and the support of the best yaw far from it."""
    n, length = line_planes(cam, seg)
    keep = np.abs(n @ cam.g) > math.sin(math.radians(2.0))  # segments that are not vertical say nothing about yaw
    n, length = n[keep], length[keep]
    yaws = np.arange(-45.0, 45.0, step)
    if len(n) == 0:
        return 0.0, 0.0, 0.0
    score = np.zeros(len(yaws))
    for k, yaw in enumerate(yaws):
        cam.set_yaw(yaw)
        score[k] = manhattan_support(cam, n, length, axes=('x', 'z'))
    best = int(score.argmax())
    far = np.abs(((yaws - yaws[best]) + 45) % 90 - 45) > 8
    second = float(score[far].max()) if far.any() else 0.0
    cam.set_yaw(float(yaws[best]))
    return float(yaws[best]), float(score[best]), second


def refine_camera(cam, seg, g_gc, f_gc, f_prior, f_sigma_rel, tilt_sigma_deg=1.5, mode='tilt', horizon_prior=None):
    """Polishes yaw, the focal length and the tilt together on all the line segments; returns (camera, support, params, cost).

    `horizon_prior` = (row, sigma in pixels) is where the depth model puts the horizon: a second witness, weaker than the lines
    but independent of them, that settles photos whose lines say little about it.

    Two kinds of camera are tried, because architectural photographs come in two kinds:
      'tilt'   an ordinary camera, pitched and rolled a little: the learned gravity (g_gc at focal f_gc) is carried to the trial
               focal length keeping its horizon, then tilted by trial pitch and roll corrections;
      'shift'  a camera whose verticals were corrected (a shift lens, or the photo was straightened): gravity is exactly
               (0, 1, 0), and the horizon (which passes through the principal point) is a free row near the learned one.
    The yaw is first scanned over its whole range (the support has several local peaks); the best few starts are then polished.
    The line support is the evidence; weak priors on the focal length and the tilt only break ties and rule out wild values."""
    from scipy.optimize import minimize

    h0 = Cam(cam.w, cam.h, f_gc, g_gc).horizon_y()  # the learned horizon at the picture's middle column
    n_par = 3 if mode == 'shift' else 4

    def build(params):
        yaw = params[0]
        logf = params[-1]
        f = float(f_prior * math.exp(logf))
        if mode == 'shift':
            return Cam(cam.w, cam.h, f, np.array([0.0, 1.0, 0.0]), yaw, cam.height, cam.w / 2.0, h0 + params[1])
        g = swap_focal(g_gc, f_gc, f, cam.w, cam.h)
        dp, dr = math.radians(params[1]), math.radians(params[2])
        Rx = np.array([[1, 0, 0], [0, math.cos(dp), -math.sin(dp)], [0, math.sin(dp), math.cos(dp)]])
        Rz = np.array([[math.cos(dr), -math.sin(dr), 0], [math.sin(dr), math.cos(dr), 0], [0, 0, 1]])
        return Cam(cam.w, cam.h, f, Rz @ Rx @ g, yaw, cam.height, cam.cx, cam.cy)

    def support_of(params):
        c = build(params)
        nn, ll = line_planes(c, seg)
        return manhattan_support(c, nn, ll)

    def cost(params):
        if mode == 'shift':
            # The learned horizon is the weak part of a photo whose verticals were corrected (the camera looked down, or up,
            # and the picture was straightened afterwards): it can be a fifth of the picture away. The lines decide; this
            # only breaks ties and rules out the extremes.
            tilt_pen = 0.5 * (params[1] / (0.18 * cam.h)) ** 2 * 0.05
        else:
            tilt_pen = 0.5 * ((params[1] ** 2 + params[2] ** 2) / tilt_sigma_deg ** 2) * 0.05
        pen = 0.0
        if horizon_prior is not None:
            y_h = h0 + params[1] if mode == 'shift' else build(params).horizon_y()
            if y_h is not None:
                pen = HORIZON_WEIGHT * 0.5 * ((y_h - horizon_prior[0]) / horizon_prior[1]) ** 2
        return -support_of(params) + tilt_pen + pen + 0.5 * (params[-1] / max(f_sigma_rel, 0.05)) ** 2 * 0.12

    # coarse scan of the yaw (and, for a straightened photo, of the horizon) at the learned camera, then polish from the best
    # distinct peaks
    yaws = np.arange(-45.0, 45.0, 1.0)
    if mode == 'shift':
        shifts = np.linspace(-0.36 * cam.h, 0.30 * cam.h, 23)
        grid = [(y, s) for s in shifts for y in yaws]
        scan = np.array([cost([y, s, 0.0]) for y, s in grid])
        order = np.argsort(scan)
        starts = []
        for i in order:
            y, s = grid[i]
            if all(abs(y - y0) > 6.0 or abs(s - s0) > 0.06 * cam.h for y0, s0 in starts):
                starts.append((float(y), float(s)))
            if len(starts) == 5:
                break
        # and the best yaw at the learned horizon itself, which is right for most photos
        s_learned = float(shifts[np.argmin(np.abs(shifts))])
        at_learned = [i for i, (y, s) in enumerate(grid) if abs(s - s_learned) < 1e-9]
        y, s = grid[min(at_learned, key=lambda i: scan[i])]
        if all(abs(y - y0) > 6.0 or abs(s - s0) > 0.02 * cam.h for y0, s0 in starts):
            starts.append((float(y), float(s)))
        starts = [np.array([y0, s0, 0.0]) for y0, s0 in starts]
    else:
        zeros = [0.0] * (n_par - 2)
        scan = np.array([cost([y] + zeros + [0.0]) for y in yaws])
        order = np.argsort(scan)
        picked = []
        for i in order:
            if all(abs(yaws[i] - y0) > 6.0 for y0 in picked):
                picked.append(float(yaws[i]))
            if len(picked) == 3:
                break
        starts = [np.array([y0] + zeros + [0.0]) for y0 in picked]
    steps = [1.0, 0.03 * cam.h, 0.08] if mode == 'shift' else [1.0, 1.0, 0.7, 0.08]
    best = None
    for start in starts:
        simplex = np.vstack([start] + [start + np.eye(n_par)[i] * steps[i] for i in range(n_par)])
        res = minimize(cost, start, method='Nelder-Mead', options={'xatol': 0.02, 'fatol': 1e-5, 'maxiter': 400, 'initial_simplex': simplex})
        if best is None or res.fun < best.fun:
            best = res
    return build(best.x), support_of(best.x), best.x, float(best.fun)


# How much a horizon that disagrees with the depth model costs, in units of line support: one sigma off costs half of this
HORIZON_WEIGHT = 0.03
