"""Scene segmentation of a room photograph (ADE20K classes), used to find the floor, the walls and everything in front of them.

Development tool: the app never runs a model; it only loads the masks that auto.py makes from this.

Model: OneFormer (Swin-L, ADE20K), MIT licence, from the Hugging Face hub (shi-labs/oneformer_ade20k_swin_large). The hub
ships it as a pickle checkpoint only; transformers loads that with torch's weights_only reader, so no code is run.

The result is cached in scripts/photo-rooms/_cache/seg/<name>.npz so a photo is segmented once; the cache remembers which
picture it was made from (cachekey.py), so replacing a photo under the same name segments it again.
"""
import os
import sys
import time
from pathlib import Path

import numpy as np

from cachekey import fingerprint

HERE = Path(__file__).resolve().parent
CACHE = HERE / '_cache' / 'seg'
MODEL = os.environ.get('SEG_MODEL', 'shi-labs/oneformer_ade20k_swin_large')
SHORT_SIDE = int(os.environ.get('SEG_SHORT', '640'))   # the scale the model was trained at
WORK_LONG = 1600                                        # masks are built at most this many pixels on the long side

_state = {}

# ADE20K class names the pipeline cares about (indices as in the model's config)
FLOOR_LIKE = ('floor',)
OUTDOOR_FLOOR = ('floor', 'path', 'sidewalk', 'road', 'earth', 'runway', 'dirt track', 'land', 'field', 'sand')
# Classes whose probability map is kept next to the label map: how sure the model is of a surface, and of what competes with it
KEPT_CLASSES = ('floor', 'wall', 'ceiling', 'rug', 'stairs', 'stairway', 'step', 'door', 'windowpane', 'curtain', 'painting', 'mirror',
                'path', 'sidewalk', 'road', 'earth', 'runway', 'dirt track', 'land', 'field', 'sand')
VERSION = 2  # changes when what a cache holds changes, so older caches are made again


def load():
    if 'model' not in _state:
        import torch
        from transformers import OneFormerForUniversalSegmentation, OneFormerProcessor

        torch.set_num_threads(max(1, (os.cpu_count() or 4) - 2))
        _state['proc'] = OneFormerProcessor.from_pretrained(MODEL)
        _state['model'] = OneFormerForUniversalSegmentation.from_pretrained(MODEL, use_safetensors=False).eval()
        names = {int(k): v.split(',')[0].strip() for k, v in _state['model'].config.id2label.items()}
        _state['names'] = names
        _state['ids'] = {v: k for k, v in names.items()}
    return _state


def class_names():
    return load()['names']


def class_ids():
    return load()['ids']


def _scores(rgb):
    """Per-class score map (C, h, w) at a quarter of the input size, for an RGB uint8 image already at model size."""
    import torch
    from PIL import Image

    st = load()
    proc, model = st['proc'], st['model']
    inputs = proc(images=Image.fromarray(rgb), task_inputs=['semantic'], return_tensors='pt')
    with torch.no_grad():
        out = model(**inputs)
    classes = out.class_queries_logits.softmax(dim=-1)[..., :-1]  # 1 x Q x C
    masks = out.masks_queries_logits.sigmoid()                   # 1 x Q x h x w
    seg = torch.einsum('bqc,bqhw->bchw', classes, masks)[0]       # C x h x w
    return seg


def segment_rgb(rgb, flip=True):
    """Class index (uint8, H x W at the size of `rgb`) and per-class maps of the main classes. `rgb` is the working-size
    image. The photo and its mirror image are both run and averaged, which steadies the edges."""
    import cv2
    import torch

    h, w = rgb.shape[:2]
    # the model is shown the photo with its short side at SHORT_SIDE
    k = SHORT_SIDE / min(h, w)
    mh, mw = int(round(h * k)), int(round(w * k))
    shown = cv2.resize(rgb, (mw, mh), interpolation=cv2.INTER_CUBIC if k > 1 else cv2.INTER_AREA)
    seg = _scores(shown)
    if flip:
        seg = (seg + _scores(np.ascontiguousarray(shown[:, ::-1])).flip(-1)) / 2
    # back to the working size, in strips so the 150-channel map never exists in full
    labels = np.zeros((h, w), np.uint8)
    keep = {}
    wanted = [i for n, i in class_ids().items() if n in KEPT_CLASSES]
    probs = {i: np.zeros((h, w), np.float16) for i in wanted}
    step = 128
    for y0 in range(0, h, step):
        y1 = min(h, y0 + step)
        # rows y0..y1 of the working image correspond to rows of the score map scaled by seg_h / h
        sh, sw = seg.shape[1:]
        ys = (np.arange(y0, y1) + 0.5) * sh / h - 0.5
        xs = (np.arange(w) + 0.5) * sw / w - 0.5
        grid_y = torch.tensor(ys / max(sh - 1, 1) * 2 - 1, dtype=torch.float32)
        grid_x = torch.tensor(xs / max(sw - 1, 1) * 2 - 1, dtype=torch.float32)
        gy, gx = torch.meshgrid(grid_y, grid_x, indexing='ij')
        grid = torch.stack([gx, gy], dim=-1)[None]
        up = torch.nn.functional.grid_sample(seg[None], grid, mode='bilinear', padding_mode='border', align_corners=True)[0]
        labels[y0:y1] = up.argmax(dim=0).numpy().astype(np.uint8)
        for i in wanted:
            probs[i][y0:y1] = up[i].numpy().astype(np.float16)
    return labels, probs


def segment_file(path, flip=True, force=False):
    """Segmentation of a photo file at its working size: {'labels', 'probs', 'size'}; cached."""
    import cv2

    path = Path(path)
    key = path.stem.lower()
    cache = CACHE / f'{key}.npz'
    # The result belongs to this picture and these settings, not to the file name: a replaced photo is segmented again
    fp = fingerprint(path, MODEL, SHORT_SIDE, WORK_LONG, flip, VERSION)
    if cache.exists() and not force:
        z = np.load(cache, allow_pickle=False)
        if 'fp' in z.files and str(z['fp']) == fp:
            ids = [int(i) for i in z['ids']]
            return {'labels': z['labels'], 'probs': {i: z[f'p{i}'].astype(np.float32) / 255.0 for i in ids}, 'size': z['labels'].shape[::-1]}
    img = cv2.imdecode(np.fromfile(str(path), dtype=np.uint8), cv2.IMREAD_COLOR)
    h, w = img.shape[:2]
    k = min(1.0, WORK_LONG / max(h, w))
    if k < 1:
        img = cv2.resize(img, (round(w * k), round(h * k)), interpolation=cv2.INTER_AREA)
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    t = time.time()
    labels, probs = segment_rgb(rgb, flip=flip)
    print(f'  segmented {path.name} in {time.time() - t:.0f}s')
    CACHE.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(cache, fp=np.array(fp), labels=labels, ids=np.array(list(probs.keys()), np.int32), **{f'p{i}': (np.clip(p.astype(np.float32), 0, 1) * 255).astype(np.uint8) for i, p in probs.items()})
    return {'labels': labels, 'probs': {i: p.astype(np.float32) for i, p in probs.items()}, 'size': (labels.shape[1], labels.shape[0])}


if __name__ == '__main__':
    import glob

    names = class_names()
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    flip = '--noflip' not in sys.argv
    force = '--force' in sys.argv
    if args == ['all']:
        args = sorted(glob.glob(str(HERE.parent.parent / 'public' / 'rooms2d' / 'Rooms' / '*' / '*')))
    for p in args:
        r = segment_file(p, flip=flip, force=force)
        lab = r['labels']
        ids, counts = np.unique(lab, return_counts=True)
        top = ', '.join(f'{names[int(i)]} {c / lab.size * 100:.0f}%' for i, c in sorted(zip(ids, counts), key=lambda x: -x[1])[:6])
        print(f'{Path(p).name} {lab.shape[::-1]}: {top}', flush=True)
