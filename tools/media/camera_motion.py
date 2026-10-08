"""Measure the camera language of a video: zoom events, cuts and drift (ORB feature matching).

Used to learn camera rules from a reference edit (style-marketing-pro) and to check a render
against them. Runs with the image Python (config bin.imagePython: OpenCV + numpy):
  python -I tools/media/camera_motion.py <video> [--hz 15] [--json out.json]

Per step (default 15 Hz, analysis at 360 px wide): the global similarity transform between frames
(scale, shift) from ORB matches with RANSAC, the inlier count, the frame difference and the largest
Haar face height. Events: a hard cut (few inliers or a large difference) or a zoom step (|log scale|
> 0.04). Consecutive zoom steps merge into one eased zoom with its total ratio and duration.
Segments between events report drift: zoom %/s and pan px/s (in the video's own pixels).
"""
import argparse, json, sys
import cv2
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('video')
ap.add_argument('--hz', type=float, default=15)
ap.add_argument('--json')
a = ap.parse_args()

cap = cv2.VideoCapture(a.video)
fps = cap.get(cv2.CAP_PROP_FPS) or 30
W0 = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)); H0 = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
aw = 360; ah = int(round(H0 * aw / W0)); px = W0 / aw
step = max(1, int(round(fps / a.hz)))
face = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
orb = cv2.ORB_create(2000); bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
rows = []; prev = None; i = -1
while True:
    ok, f = cap.read(); i += 1
    if not ok: break
    if i % step: continue
    g = cv2.cvtColor(cv2.resize(f, (aw, ah)), cv2.COLOR_BGR2GRAY)
    kp, des = orb.detectAndCompute(g, None)
    s, tx, ty, inl, diff = 1.0, 0.0, 0.0, 0, 0.0
    if prev is not None:
        pg, pkp, pdes = prev
        diff = float(np.abs(g.astype(np.float32) - pg.astype(np.float32)).mean())
        if des is not None and pdes is not None:
            m = sorted(bf.match(pdes, des), key=lambda x: x.distance)[:500]
            if len(m) > 20:
                A = np.float32([pkp[x.queryIdx].pt for x in m]); B = np.float32([kp[x.trainIdx].pt for x in m])
                M, mask = cv2.estimateAffinePartial2D(A, B, ransacReprojThreshold=2.0)
                if M is not None:
                    s = float(np.hypot(M[0, 0], M[1, 0])); tx, ty = float(M[0, 2]), float(M[1, 2]); inl = int(mask.sum())
    fs = face.detectMultiScale(g, 1.1, 5, minSize=(18, 18))
    fh = max([h for (x, y, w, h) in fs], default=0) / ah
    rows.append({'t': round(i / fps, 3), 's': s, 'tx': tx * px, 'ty': ty * px, 'inl': inl, 'diff': diff, 'face': round(fh, 3)})
    prev = (g, kp, des)

events = []
for k, r in enumerate(rows[1:], 1):
    cut = r['inl'] < 25 or r['diff'] > 28
    zoom = abs(np.log(max(r['s'], 1e-6))) > 0.04
    if cut:
        events.append({'kind': 'cut', 't': r['t'], 'ratio': round(r['s'], 3)})
    elif zoom:
        last = events[-1] if events else None
        if last and last['kind'] == 'zoom' and r['t'] - last['end'] <= 1.5 / a.hz:
            last['ratio'] = round(last['ratio'] * r['s'], 3); last['end'] = r['t']; last['dur'] = round(last['end'] - last['t'] + 1 / a.hz, 3)
        else:
            events.append({'kind': 'zoom', 't': rows[k - 1]['t'], 'end': r['t'], 'ratio': round(r['s'], 3), 'dur': round(1 / a.hz, 3)})
bounds = [rows[0]['t']] + [e.get('end', e['t']) for e in events] + [rows[-1]['t']]
segs = []
for a0, a1 in zip(bounds[:-1], bounds[1:]):
    seg = [r for r in rows if a0 < r['t'] <= a1 and r['inl'] >= 25]
    dur = a1 - a0
    if len(seg) < 4 or dur < 0.3: continue
    ss = np.array([r['s'] for r in seg])
    segs.append({'start': round(a0, 2), 'dur': round(dur, 2),
                 'zoomPctPerS': round((np.exp(np.log(ss).sum() / dur) - 1) * 100, 2),
                 'panX': round(sum(r['tx'] for r in seg) / dur, 1), 'panY': round(sum(r['ty'] for r in seg) / dur, 1),
                 'face': round(float(np.median([r['face'] for r in seg if r['face'] > 0] or [0])), 3)})
zooms = [e for e in events if e['kind'] == 'zoom']
out = {'video': a.video, 'size': [W0, H0], 'fps': round(fps, 3), 'duration': rows[-1]['t'], 'events': events, 'segments': segs,
       'summary': {'cuts': sum(e['kind'] == 'cut' for e in events), 'zooms': len(zooms),
                   'zoomIn': [e['ratio'] for e in zooms if e['ratio'] > 1], 'zoomOut': [e['ratio'] for e in zooms if e['ratio'] < 1],
                   'meanZoomDur': round(float(np.mean([e['dur'] for e in zooms])) if zooms else 0, 3)}}
if a.json:
    with open(a.json, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, indent=2)
print(json.dumps(out['summary']))
for e in events: print(f"  {e['kind']:4s} {e['t']:6.2f} s  x{e['ratio']:.3f}" + (f"  over {e['dur']:.2f} s" if e['kind'] == 'zoom' else ''))
for s in segs: print(f"  segment {s['start']:6.2f} +{s['dur']:4.2f} s  zoom {s['zoomPctPerS']:+5.2f} %/s  pan {s['panX']:+6.1f},{s['panY']:+6.1f} px/s  face {s['face']:.3f}")
