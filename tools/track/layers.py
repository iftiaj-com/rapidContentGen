"""rcg layers, step 2 (OpenCV): MediaPipe masks -> clean depth layers + a filled background.

Run by tools/track/layers.mjs with the image Python (config bin.imagePython: OpenCV + Pillow):
  python -I layers.py <spec.json>
spec.json: { work, outDir, manifest, sheet, pad, fillScale, feather, layers: [ {name, requests: [n...]} ],
             requests: [ {layer, x, y, box?, label?, person?} ] }   (layers listed back to front)
Inputs in <work>/in/source.png and <work>/out/req-<n>.png, selfie.png (MediaPipe confidences as grey).

Per request: threshold the magic_touch confidence, keep the connected piece under the click point
(plus pieces inside the detector box), and for people add the selfie mask near that piece (hair,
fingers). Layers are claimed front to back, so a pixel belongs to the front-most layer. Edges are
feathered. The background is the source with every cut-out (dilated by `pad`) filled by OpenCV's
Telea inpainting at `fillScale`, then softened, since a camera move only uncovers a band near the
edges and the far layer is usually blurred.
"""
import json, sys
from pathlib import Path
import cv2
import numpy as np

spec = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
work = Path(spec['work'])
out_dir = Path(spec['outDir'])
out_dir.mkdir(parents=True, exist_ok=True)
src = cv2.imread(str(work / 'in' / 'source.png'), cv2.IMREAD_COLOR)
H, W = src.shape[:2]
area = H * W
selfie_path = work / 'out' / 'selfie.png'
selfie = cv2.imread(str(selfie_path), cv2.IMREAD_GRAYSCALE) if selfie_path.exists() else None


def piece(n, req):
    """The cleaned mask (bool) for one click request."""
    conf = cv2.imread(str(work / 'out' / f'req-{n}.png'), cv2.IMREAD_GRAYSCALE)
    if conf is None:
        return np.zeros((H, W), bool), 'no mask'
    binm = (conf >= 128).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(binm, 8)
    px = int(np.clip(req['x'] * W, 0, W - 1))
    py = int(np.clip(req['y'] * H, 0, H - 1))
    keep = set()
    hit = labels[py, px]
    if hit > 0:
        keep.add(int(hit))
    box = req.get('box')
    if box:
        bx, by, bw, bh = box
        gx, gy = int(bw * 0.04), int(bh * 0.04)
        x0, y0, x1, y1 = max(0, bx - gx), max(0, by - gy), min(W, bx + bw + gx), min(H, by + bh + gy)
        inside = np.zeros((H, W), bool)
        inside[y0:y1, x0:x1] = True
        main_area = max([stats[k, cv2.CC_STAT_AREA] for k in keep] + [1])
        for k in range(1, count):
            a = stats[k, cv2.CC_STAT_AREA]
            if k in keep or a < 0.03 * main_area:
                continue
            if (inside & (labels == k)).sum() >= 0.7 * a:
                keep.add(k)
    if not keep and count > 1:
        # No piece under the point: take the piece nearest to it.
        ys, xs = np.nonzero(binm)
        d = (xs - px) ** 2 + (ys - py) ** 2
        keep.add(int(labels[ys[d.argmin()], xs[d.argmin()]]))
    m = np.isin(labels, list(keep)) if keep else np.zeros((H, W), bool)
    note = f'{len(keep)} piece(s)'
    if req.get('person') and selfie is not None and m.any():
        near = cv2.dilate(m.astype(np.uint8), np.ones((31, 31), np.uint8)) > 0
        add = (selfie >= 128) & near
        if box:
            add &= inside
        m |= add
        note += ' + selfie'
    # Close pinholes and fill small enclosed holes (not real openings like a window or a frame).
    m = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)) > 0
    inv = (~m).astype(np.uint8)
    hc, hl, hs, _ = cv2.connectedComponentsWithStats(inv, 4)
    for k in range(1, hc):
        x, y, w, h, a = hs[k]
        if a < 0.0015 * area and x > 0 and y > 0 and x + w < W and y + h < H:
            m[hl == k] = True
    return m, note


raw = {}
notes = {}
for layer in spec['layers']:
    m = np.zeros((H, W), bool)
    for n in layer['requests']:
        req = spec['requests'][n]
        if req.get('missing'):
            continue
        p, note = piece(n, req)
        m |= p
        notes.setdefault(layer['name'], []).append(f"req {n}: {note}")
    raw[layer['name']] = m

# Front to back ownership.
claimed = np.zeros((H, W), bool)
final = {}
for layer in reversed(spec['layers']):
    m = raw[layer['name']] & ~claimed
    claimed |= raw[layer['name']]
    final[layer['name']] = m

# Occluded parts: where a front layer hides part of this one (legs behind a chair), the photo has
# no pixels. A camera move slides the front layer and uncovers that edge, so extend the layer
# `extend` px into the area its front layers cover and fill the band from its own pixels.
extend = int(spec.get('extend', 60))
rgb = {name: src for name in final}
ext_notes = {}
if extend > 0:
    front = np.zeros((H, W), bool)
    for layer in reversed(spec['layers']):
        name = layer['name']
        m = final[name]
        if m.any() and front.any():
            # Straight growth only (up/down/left/right): a round dilation also grew diagonal
            # "wings" past the silhouette in R10, where no person existed.
            mu = m.astype(np.uint8)
            straight = (cv2.dilate(mu, np.ones((2 * extend + 1, 1), np.uint8)) | cv2.dilate(mu, np.ones((1, 2 * extend + 1), np.uint8))) > 0
            band = straight & front & ~m
            if band.any():
                # Clone-stretch along the same axis: each band pixel copies the nearest layer pixel
                # straight above/below/beside it, from inside the edge (the edge fringe is mixed with
                # what is behind). Telea averaged a plaid shirt into a pale smear; a round nearest
                # fill made a radial fan.
                inner = cv2.erode(mu, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13))) > 0
                img = src.copy()
                done = np.zeros((H, W), bool)

                def shift(a, dy, dx):
                    out = np.zeros_like(a)
                    ys0, ys1 = max(0, dy), H + min(0, dy)
                    xs0, xs1 = max(0, dx), W + min(0, dx)
                    out[ys0:ys1, xs0:xs1] = a[ys0 - dy:ys1 - dy, xs0 - dx:xs1 - dx]
                    return out

                for s in range(1, extend + 7):
                    for dy, dx in ((s, 0), (-s, 0), (0, s), (0, -s)):
                        cand = band & ~done & shift(inner, dy, dx)
                        if cand.any():
                            img[cand] = shift(src, dy, dx)[cand]
                            done |= cand
                band = done
                soft_ = cv2.GaussianBlur(img, (0, 0), 1.5)
                img[band] = soft_[band]
                rgb[name] = img
                final[name] = m | band
                ext_notes[name] = round(float(band.mean()), 4)
        front |= m

feather = float(spec.get('feather', 1.2))
manifest = {
    'version': 1, 'source': spec.get('source'), 'width': W, 'height': H,
    'order': ['bg'] + [l['name'] for l in spec['layers']],
    'layers': {}, 'detections': spec.get('detections', []),
}
edge = 3
for layer in spec['layers']:
    name = layer['name']
    m = final[name]
    alpha = m.astype(np.float32)
    if feather > 0:
        alpha = cv2.GaussianBlur(alpha, (0, 0), feather)
    rgba = np.dstack([rgb[name], np.clip(alpha * 255, 0, 255).astype(np.uint8)])
    f = out_dir / f'{name}.png'
    cv2.imwrite(str(f), rgba)
    ys, xs = np.nonzero(m)
    entry = {'file': f.name, 'area': round(float(m.mean()), 4), 'notes': notes.get(name, []) + ([f'extended behind front layers: {ext_notes[name] * 100:.1f}% of frame'] if name in ext_notes else [])}
    if len(xs):
        entry['bbox'] = [int(xs.min()), int(ys.min()), int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)]
        entry['centroid'] = [round(float(xs.mean()) / W, 4), round(float(ys.mean()) / H, 4)]
        entry['touches'] = {
            'left': bool(m[:, :edge].any()), 'right': bool(m[:, -edge:].any()),
            'top': bool(m[:edge, :].any()), 'bottom': bool(m[-edge:, :].any()),
        }
    else:
        entry['empty'] = True
    manifest['layers'][name] = entry

# Background: fill behind every cut-out.
pad = int(spec.get('pad', 14))
hole = cv2.dilate(claimed.astype(np.uint8) * 255, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * pad + 1, 2 * pad + 1)))
fs = float(spec.get('fillScale', 0.5))
small = cv2.resize(src, None, fx=fs, fy=fs, interpolation=cv2.INTER_AREA) if fs != 1 else src
hs_ = cv2.resize(hole, (small.shape[1], small.shape[0]), interpolation=cv2.INTER_NEAREST) if fs != 1 else hole
filled = cv2.inpaint(small, hs_, max(3, int(7 * fs)), cv2.INPAINT_TELEA)
if fs != 1:
    filled = cv2.resize(filled, (W, H), interpolation=cv2.INTER_CUBIC)
soft = cv2.GaussianBlur(filled, (0, 0), 6)
wgt = cv2.GaussianBlur((hole > 0).astype(np.float32), (0, 0), 4)[..., None]
bg = (src * (1 - wgt) + soft * wgt).astype(np.uint8)
cv2.imwrite(str(out_dir / 'bg.png'), bg)
manifest['layers']['bg'] = {'file': 'bg.png', 'fill': round(float((hole > 0).mean()), 4), 'pad': pad}
Path(spec['manifest']).write_text(json.dumps(manifest, indent=2), encoding='utf-8')

# Check sheet: source with layer outlines | filled background | each layer on a checkerboard.
def tile(img, label):
    t = cv2.resize(img, (360, int(360 * H / W)), interpolation=cv2.INTER_AREA)
    cv2.rectangle(t, (0, 0), (t.shape[1], 30), (0, 0, 0), -1)
    cv2.putText(t, label, (6, 21), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2, cv2.LINE_AA)
    return t

colors = [(60, 220, 255), (80, 80, 255), (255, 160, 60), (120, 255, 120), (255, 80, 220)]
outl = src.copy()
for i, layer in enumerate(spec['layers']):
    cnts, _ = cv2.findContours(final[layer['name']].astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cv2.drawContours(outl, cnts, -1, colors[i % len(colors)], max(3, W // 300))
for r in spec['requests']:
    if not r.get('missing'):
        cv2.circle(outl, (int(r['x'] * W), int(r['y'] * H)), max(8, W // 120), (255, 255, 255), -1)
holeo = bg.copy()
cnts, _ = cv2.findContours(hole, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
cv2.drawContours(holeo, cnts, -1, (0, 255, 255), max(2, W // 400))
tiles = [tile(outl, 'source + layers'), tile(holeo, 'bg (filled)')]
cell = max(16, W // 40)
yy, xx = np.mgrid[0:H, 0:W]
checker = np.where(((yy // cell) + (xx // cell)) % 2 == 0, 200, 150).astype(np.uint8)
checker = np.dstack([checker] * 3)
for layer in spec['layers']:
    a = cv2.imread(str(out_dir / f"{layer['name']}.png"), cv2.IMREAD_UNCHANGED)
    al = a[..., 3:4].astype(np.float32) / 255
    tiles.append(tile((a[..., :3] * al + checker * (1 - al)).astype(np.uint8), layer['name']))
cv2.imwrite(str(spec['sheet']), np.hstack(tiles))
print(json.dumps({'manifest': spec['manifest'], 'sheet': spec['sheet'], 'layers': {k: {kk: v[kk] for kk in ('area', 'notes') if kk in v} for k, v in manifest['layers'].items() if k != 'bg'}, 'fill': manifest['layers']['bg']['fill']}))
