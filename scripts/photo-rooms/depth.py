"""Metric depth of a room photograph (development tool; the app never runs a model).

Model: Depth Anything V2, metric indoor, small (Apache-2.0), from the Hugging Face hub. The depth is only used as evidence
for where the walls are (build step in auto.py); the camera comes from GeoCalib and the room's own straight lines.
Results are cached in scripts/photo-rooms/_cache/depth/<name>.npz (metres, float16, at the working size of the photo), together
with a fingerprint of the picture (cachekey.py): replacing a photo under the same name measures it again.
"""
import os
import sys
import time
from pathlib import Path

import numpy as np

from cachekey import fingerprint

HERE = Path(__file__).resolve().parent
CACHE = HERE / '_cache' / 'depth'
MODEL = os.environ.get('DEPTH_MODEL', 'depth-anything/Depth-Anything-V2-Metric-Indoor-Small-hf')
WORK_LONG = 1600

_state = {}


def load():
    if 'model' not in _state:
        import torch
        from transformers import AutoImageProcessor, AutoModelForDepthEstimation

        torch.set_num_threads(max(1, (os.cpu_count() or 4) - 4))
        _state['proc'] = AutoImageProcessor.from_pretrained(MODEL)
        _state['model'] = AutoModelForDepthEstimation.from_pretrained(MODEL).eval()
    return _state


def depth_file(path, force=False, flip=True):
    """Depth in metres (float32, H x W at the photo's working size)."""
    import cv2
    import torch
    from PIL import Image

    path = Path(path)
    cache = CACHE / f'{path.stem.lower()}.npz'
    # The result belongs to this picture and these settings, not to the file name: a replaced photo is measured again
    fp = fingerprint(path, MODEL, WORK_LONG, flip)
    if cache.exists() and not force:
        z = np.load(cache)
        if 'fp' in z.files and str(z['fp']) == fp:
            return z['depth'].astype(np.float32)
    img = cv2.imdecode(np.fromfile(str(path), dtype=np.uint8), cv2.IMREAD_COLOR)
    h0, w0 = img.shape[:2]
    k = min(1.0, WORK_LONG / max(h0, w0))
    if k < 1:
        img = cv2.resize(img, (round(w0 * k), round(h0 * k)), interpolation=cv2.INTER_AREA)
    h, w = img.shape[:2]
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    st = load()
    t = time.time()
    outs = []
    views = [rgb] + ([rgb[:, ::-1]] if flip else [])
    for i, v in enumerate(views):
        inputs = st['proc'](images=Image.fromarray(np.ascontiguousarray(v)), return_tensors='pt')
        with torch.no_grad():
            d = st['model'](**inputs).predicted_depth  # 1 x h x w
        d = torch.nn.functional.interpolate(d[None], size=(h, w), mode='bicubic', align_corners=False)[0, 0].numpy()
        outs.append(d[:, ::-1] if i == 1 else d)
    depth = np.mean(outs, axis=0).astype(np.float32)
    print(f'  depth {path.name} in {time.time() - t:.0f}s  (median {np.median(depth):.2f} m, range {depth.min():.2f}..{depth.max():.2f})', flush=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(cache, fp=np.array(fp), depth=depth.astype(np.float16))
    return depth


if __name__ == '__main__':
    import glob

    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if args == ['all']:
        args = sorted(glob.glob(str(HERE.parent.parent / 'public' / 'rooms2d' / 'Rooms' / '*' / '*')))
    for p in args:
        depth_file(p, force='--force' in sys.argv)
