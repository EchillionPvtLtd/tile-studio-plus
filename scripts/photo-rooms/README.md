# Photo rooms: how the 2D visualizer's rooms are made

The 2D visualizer's rooms are real photographs: `public/rooms2d/Rooms/<Category>/<CODE>-<NN>.<ext>` (a dash or an underscore
both work: `BD-03.png`, `LV_01.png`). LV living room, DR dining room, KN kitchen, BD bedroom, BR bathroom, BY balcony,
OE office (SE staircase is still understood). The app shows the photograph exactly as it is. What this folder produces is
what the app cannot know by itself. The originals (about 240 MB) are git-ignored and never deployed: `auto.py --write` also saves
each as `public/rooms2d/photos/<room id>/photo.webp` (same pixels, about a tenth of the size), which is what the app loads:

- for every surface that can be tiled **accurately** (the floor, each wall) a **mask**: which pixels belong to it, with
  furniture, plants, windows, doors, rugs and decorations left out (`public/rooms2d/photos/<id>/mask-<surface>.webp`);
- the surface's **perspective**: four points on the photo and where those points are on the real surface in millimetres, so
  that tiles shrink with distance and meet at the right angles (`src/data/rooms2d/photos.json`);
- a thumbnail (`public/rooms2d/photos/<id>/thumb.webp`);
- `review.json`: for every room, the surfaces that were kept with the measures they were judged by, and the surfaces that were
  **left out, with the reason in words**.

Nothing here runs in the app or at build time. The results are checked in; this is only needed when a photo is added or a
room needs correcting.

## The rule: a surface that cannot be identified accurately is left out

A tile laid on the wrong pixels is worse than no tile: it covers a sofa, leaks into the ceiling, or runs in a direction the
room does not. So the models only *propose* surfaces. Every proposal is checked (`quality.py`, `auto.py`) and a surface that
fails is **not forced**: it stays exactly as photographed, the person can only click the surfaces that passed, and
`review.json` says why the others did not (for example *"the wall is broken into many pieces by furniture"*, *"it takes turns
with a wall at right angles across the same stretch of wall"*, *"the floor the depth model sees is tilted 40 degrees from
the floor the camera implies"*). A photo with no surface that passes is still listed, as a photograph with nothing to tile.

| check | question it answers |
| --- | --- |
| area | is enough of it visible to tile convincingly? |
| solid | is it one connected piece, or cut to shreds by furniture? |
| sure / unsure | how sure is the segmentation model that these pixels are this kind of surface? |
| edge | does its outline follow edges of the photograph, or run through flat areas (a guess)? |
| strong | can most of it (half or more) be tiled at full strength? The far floor and a wall seen almost edge-on fade into the photograph; a surface that is mostly faded would look half-tiled and washed out, so it is left out instead |
| flips | (walls) does it take turns with a wall at right angles along the same lines of sight? A room's two walls meet once, so taking turns means the depth model cannot tell which wall is which |
| plane | (walls) are its pixels where one flat wall would put them? |
| size | does it measure a believable number of square feet (4 to 1500 floor, 3 to 1200 wall)? If not, the photo's scale cannot be trusted |
| camera | does the floor the depth model sees agree with the floor the camera implies (level, flat)? If not, no surface of the photo can be given a perspective |

The limits are at the top of `quality.py` and `auto.py` and are written into `review.json`, which
`tests/viz2d-rooms-data.test.ts` checks every shipped surface against.

## Running it

Python 3.10+ with `numpy opencv-python pillow scipy torch transformers` (and GeoCalib for `geocalib_cam.py`).

```
python geocalib_cam.py           # horizon and focal length of every photo; _cache/geocalib.json   (~4 s per photo)
python depth.py all              # Depth Anything V2 metric depth; cached in _cache/depth        (~10 s per photo)
python segment.py all            # OneFormer (ADE20K) labels every pixel; cached in _cache/seg   (~1 min per photo on a CPU)
python auto.py lv-01 br-03       # build these rooms, write previews to PREVIEW_DIR (default ./_preview)
python auto.py all --write       # build every room, write the masks, thumbnails, photos.json and review.json
python sheets.py _preview _sheets 6 left     # contact sheets of the previews, to review many rooms at a glance
```

Every cache remembers which picture (and which settings) it was made from, so a photo that is replaced under the same name is
processed again; nothing stale is ever reused. The camera of a photo (the slowest part of `auto.py`) is cached in
`_cache/camera`. Delete a cache file to force it.

Adding a photo: put it in `public/rooms2d/Rooms/<Category>/` named `<CODE>-<NN>.<ext>` (two-letter category code), run the
steps above for it, look at its preview (kept surfaces are tinted; what the checks left out is outlined in red, with the
measures printed at the bottom), and correct it with an override if needed.

## How a room is made (auto.py)

1. **Labels.** `segment.py` runs OneFormer (Swin-L, ADE20K, MIT licence) on the photo and its mirror image. The `floor` and
   `wall` labels are the surfaces; everything else stays untouched. The label edges are snapped onto the photo's own edges
   with a guided filter. Besides the labels, the model's probability of the surface classes is kept.
2. **Camera.** GeoCalib gives the horizon and a focal length. The focal length is the weak part, and for photographs whose
   verticals were straightened (a shift lens, or a render) the horizon is weak too. Two kinds of camera are fitted to the
   photo's long straight lines and the better one is kept: an ordinary tilted camera, and a camera with corrected verticals
   (the usual kind in property photographs and renders), whose horizon may be far from where GeoCalib put it. The depth model
   is a second witness for the horizon: on a level floor a pixel's row is linear in its inverse depth, and the intercept is the
   horizon row. The room's yaw (how its walls sit against the picture) comes from the same lines. A room seen at an angle
   needs evidence for it: the non-vertical lines must agree with that angle clearly better (by 0.2) than with a frontal view,
   otherwise the view is taken as frontal (`check_yaw`; a plain room with a round table and chairs has no lines to say more).
3. **Scale.** The depth model says how far below the lens the floor is. When the ceiling is visible, the room height
   has to be a believable one, otherwise the scale is pulled toward it. Tile sizes are therefore right to roughly 20 %.
4. **Floor.** The floor is a plane at that depth, so its perspective follows from the camera. Near the horizon one pixel is
   metres of floor and the camera's small errors become huge, so the floor is tiled in full up to 9 m and fades into the
   photograph by 15 m.
5. **Walls.** The wall pixels are placed in the room using the depth; walls show up as peaks in how far left/right (side
   walls) and how far ahead (walls across) the pixels are. Each wall pixel goes to the plane its line of sight reaches
   first among the planes that agree with its depth. Planes that carry little (reliefs, niches, sills) are dropped. Wall
   pixels that no plane took but that only one plane borders (a smooth, glary or dark patch the depth model could not place)
   are given to that plane, unless the seam between them is a straight line, which is a real corner. A wall fades into the
   photograph where it is seen nearly edge-on (nothing under 6 degrees, all of it from 12 degrees): there one pixel is metres
   of wall and the camera's small errors become huge ones, so a tile would be a guess (a bathroom wall that ran off to 50 m
   had come out at 574 sq.ft). A wall seen face-on is as well measured at 12 m as at 3 m, so its distance only matters where
   the depth model runs out (it was trained for rooms up to 20 m): full strength to 16 m, nothing from 20 m.
6. **Calibration.** Each surface gets four image points and their positions on the surface in mm: floors are measured in
   the floor plane (x to the right, y toward the viewer), walls along the wall and up from the floor.
7. **Checks.** See above. What fails is left out and recorded.

## Correcting a room

`overrides/<id>.json` (all keys optional; see the top of `auto.py`):

```json
{
  "hfov": 70,
  "horizon": 0.42,
  "height": 900,
  "yaw": 0,
  "floor_sub": [[[0.1, 0.8], [0.3, 0.8], [0.3, 0.95]]],
  "planes_add": [{ "axis": "z", "base": [0.5, 0.6] }],
  "planes_drop": [2],
  "skip": { "wall-left": "covered by shelving whose outline cannot be followed" }
}
```

Polygons and points are fractions of the photo (x to the right, y downwards). `skip` leaves a surface out that passed the
checks but is wrong when looked at; the reason is recorded in `review.json`. `python crop.py <photo> out.png x0 y0 x1 y1`
draws a zoomed part with a coordinate grid, to read points off.

## Files

| file | what it is |
| --- | --- |
| `auto.py` | the pipeline: photo → camera → surfaces → checks → masks, perspective, previews, assets, review |
| `quality.py` | the checks that decide which surfaces are tiled |
| `segment.py` / `depth.py` / `geocalib_cam.py` | the three models, each caching its result (`cachekey.py` ties a cache to its picture) |
| `geom.py` | the camera, rays and planes, line-based refinement |
| `sheets.py`, `labels_sheet.py` | contact sheets for reviewing (the previews; what the segmentation model called each part) |
| `crop.py`, `enhance.py`, `tools.py` | reading coordinates off a photo |
| `overrides/` | per-photo corrections |
| `review.json` | the record of what was kept and what was left out, and why (generated) |
