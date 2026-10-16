"""Is a surface good enough to be tiled? (development tool, used by auto.py)

A tile laid on the wrong pixels is worse than no tile: it covers a sofa, leaks into the ceiling or runs in a direction the room
does not. So every surface the models propose is measured here, and only a surface that can be identified accurately is kept;
the rest of the photo stays exactly as photographed. Each measure answers one plain question, has a limit below which the surface
is left out, and the reason is written down (review.json) in words a person can read.

    area      how much of the picture it is: a sliver cannot be tiled convincingly
    solid     how much of it lies in its three largest pieces: furniture may split a floor into a few big pieces, but a surface
              cut to shreds has ragged, unreliable edges
    sure      how sure the segmentation model is that these pixels are this kind of surface
    unsure    how much of it the model is not sure about (it could as well be something else)
    edge      how much of its open outline follows an edge of the photograph: an outline through a flat area is a guess
    strong    how much of it is tiled at full strength: the far floor and a wall seen nearly edge-on fade into the photograph,
              and a surface that is mostly faded would look half-tiled, washed out, so it is left out instead
    gaps      (walls) how much of the wall inside its outline no surface took: holes where the depth model could not place the wall
    flips     (walls) how often it takes turns with a wall at right angles along the same lines of sight: along any row of the
              picture two such walls meet once, at their corner. Taking turns several times is the depth model unable to tell
              which of the two is which, and a tile laid on either would change direction in bands across one flat wall
"""
import cv2
import numpy as np

# Limits per kind of surface. A surface under a limit is left out; for `unsure`, `gaps` and `flips` it is the other way round (over).
LIMITS = {
    'floor': {'area': 0.04, 'solid': 0.85, 'sure': 0.70, 'unsure': 0.20, 'edge': 0.40, 'strong': 0.50},
    'wall': {'area': 0.04, 'solid': 0.85, 'sure': 0.65, 'unsure': 0.25, 'edge': 0.30, 'strong': 0.50, 'flips': 0.20, 'gaps': 0.10},
}


def _kernel(r):
    r = max(1, int(round(r)))
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))


def photo_edges(gray):
    """The photograph's own edges (Canny, thresholds from the picture's median brightness) as a boolean map."""
    g = cv2.GaussianBlur(gray, (0, 0), 1.2)
    med = float(np.median(g))
    lo, hi = int(max(8, 0.66 * med * 0.4)), int(max(30, 1.33 * med * 0.4))
    return cv2.Canny(g, lo, hi) > 0


def measure(mask, prob, edges, skip=None, alpha=None):
    """The measures area, solid, sure, unsure, edge and strong of one surface: mask and edges are boolean maps of the
    working-size photo, prob the model's probability (0..1) of the surface's class, `alpha` how much of each pixel is tiled
    (1 where nothing fades). `skip` marks where the surface's outline is not judged by the photo's edges: where it meets another
    wall, or the ceiling (structural lines, which may not show in a soft-lit room), or where its far part was cut off."""
    h, w = mask.shape
    total = float(mask.sum())
    if total == 0:
        return {'area': 0.0, 'solid': 0.0, 'sure': 0.0, 'unsure': 1.0, 'edge': 0.0, 'strong': 0.0}
    n, lab, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), connectivity=8)
    biggest = float(np.sort(stats[1:, cv2.CC_STAT_AREA])[-3:].sum()) if n > 1 else 0.0
    p = prob[mask]
    # The open outline: where the surface ends, away from the picture's border and from the other surfaces
    m8 = mask.astype(np.uint8)
    outline = (m8 - cv2.erode(m8, _kernel(1))).astype(bool)
    keep = np.ones_like(mask)
    b = max(2, int(0.012 * max(h, w)))
    keep[:b, :] = keep[-b:, :] = False
    keep[:, :b] = keep[:, -b:] = False
    if skip is not None and skip.any():
        keep &= ~(cv2.dilate(skip.astype(np.uint8), _kernel(0.012 * max(h, w))) > 0)
    outline &= keep
    near = cv2.distanceTransform((~edges).astype(np.uint8), cv2.DIST_L2, 3) <= 0.004 * max(h, w)
    edge = float(near[outline].mean()) if outline.sum() >= 40 else 1.0  # nothing open to judge: the surface is bounded by others and the border
    strong = float((alpha[mask] >= 0.9).mean()) if alpha is not None else 1.0
    return {'area': total / (h * w), 'solid': biggest / total, 'sure': float(p.mean()), 'unsure': float((p < 0.5).mean()), 'edge': edge, 'strong': strong}


def flips(mask_a, mask_b, min_run=0.006):
    """Share of the rows where two walls at right angles both appear in which they take turns more than once (A, B, A or
    A, B, A, B...). Runs shorter than `min_run` of the width are noise and ignored. 0 when they hardly share a row."""
    h, w = mask_a.shape
    min_len = max(3, int(min_run * w))
    rows = flipped = 0
    for y in range(0, h, 3):
        a, b = mask_a[y], mask_b[y]
        if not a.any() or not b.any():
            continue
        xs = np.nonzero(a | b)[0]
        vals = a[xs].astype(np.int8)  # 1: wall A, 0: wall B
        cut = np.nonzero(np.diff(vals))[0]
        starts = np.concatenate([[0], cut + 1])
        ends = np.concatenate([cut + 1, [len(vals)]])
        runs = [(int(vals[s]), int(xs[e - 1] - xs[s] + 1)) for s, e in zip(starts, ends)]
        kept = []
        for v, n in runs:
            if n < min_len:
                continue
            if kept and kept[-1] == v:
                continue
            kept.append(v)
        if len(kept) < 2:
            continue
        rows += 1
        flipped += len(kept) - 1 >= 2
    return flipped / rows if rows >= 12 else 0.0


def main_parts(mask, rel=0.35):
    """The mask without its stray pieces: a piece smaller than `rel` of the largest one is not tiled. A wall seen past a column
    or a door is in two big pieces and keeps both; a patch of wall in another room that the depth model lumped in goes."""
    n, lab, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), connectivity=8)
    if n <= 2:
        return mask
    area = stats[:, cv2.CC_STAT_AREA].astype(float)
    area[0] = 0.0
    keep = area >= rel * area.max()
    keep[0] = False
    return keep[lab]


def gaps(mask, pool):
    """Share of the wall inside a surface's outline (its convex hull) that nothing explains: wall pixels, per the labels, that no
    surface took. A hole in the middle of a wall is where the depth model could not place the wall, and a tile would skip it.
    Objects (furniture, windows) are not wall and do not count; `pool` is the wall that no surface took."""
    cs, _ = cv2.findContours(mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cs:
        return 0.0
    hull = np.zeros(mask.shape, np.uint8)
    cv2.fillConvexPoly(hull, cv2.convexHull(np.concatenate(cs)), 1)
    inside = hull.astype(bool)
    wall_in = float((inside & (pool | mask)).sum())
    return float((inside & pool).sum() / wall_in) if wall_in else 0.0


def share_in_hull(small, big):
    """Share of the pixels of `small` that lie inside the convex hull of `big`: how much of it is woven into the bigger one
    rather than beside it."""
    cs, _ = cv2.findContours(big.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cs or not small.any():
        return 0.0
    hull = np.zeros(big.shape, np.uint8)
    cv2.fillConvexPoly(hull, cv2.convexHull(np.concatenate(cs)), 1)
    return float(hull[small].mean())


def reasons(kind, m):
    """Why a surface with these measures cannot be tiled accurately: a list of plain sentences, empty when it can."""
    lim = LIMITS['floor' if kind == 'floor' else 'wall']
    what = 'floor' if kind == 'floor' else 'wall'
    out = []
    if m['area'] < lim['area']:
        out.append(f"only {m['area'] * 100:.1f}% of the photo is visible {what}: too little to tile convincingly")
    if m['solid'] < lim['solid']:
        out.append(f"the {what} is broken into many small pieces by furniture and objects ({m['solid'] * 100:.0f}% in its three largest pieces)")
    if m['sure'] < lim['sure'] or m['unsure'] > lim['unsure']:
        out.append(f"the {what} cannot be told apart from what surrounds it with confidence ({m['sure'] * 100:.0f}% sure)")
    if m['edge'] < lim['edge']:
        out.append(f"the outline of the {what} runs through flat areas of the photo ({m['edge'] * 100:.0f}% of it follows an edge)")
    if m['strong'] < lim['strong']:
        out.append(f"most of the {what} is far away or seen almost edge-on ({m['strong'] * 100:.0f}% of it can be tiled at full strength), where the perspective of a tile cannot be trusted and a tile would look washed out")
    if 'gaps' in lim and m.get('gaps', 0.0) > lim['gaps']:
        out.append(f"there are holes in the middle of the wall that nothing explains ({m['gaps'] * 100:.0f}% of the wall inside its outline), where a tile would stop for no reason")
    if 'flips' in lim and m.get('flips', 0.0) > lim['flips']:
        out.append(f"it takes turns with a wall at right angles across the same stretch of wall ({m['flips'] * 100:.0f}% of the rows), which a room cannot do: which wall is which cannot be told")
    return out
