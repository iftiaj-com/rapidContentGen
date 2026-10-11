"""
mixmedia_art.py - the image half of `rcg mix-media` (skill style-mix-media, pack library/styles/mix-media).

Runs with the image Python (config bin.imagePython: OpenCV + NumPy + Pillow). Every output is
deterministic for a given --seed. Binaries (ffmpeg, ffprobe) are passed in by the Node tool from
config; nothing here holds a machine path.

Commands
  boards  --out-dir <dir> [--size 1080x1920] [--seed 1] [--overlays bare,newspaper,kraft,fabric,watercolor,mat]
          Cork board (warm cork, thin wooden frame) with one overlay layer per scene. "mat" is the green
          cutting mat of the user's reference videos (no frame). Writes <overlay>.jpg per overlay.
  torn    --rgb <frame.png> --alpha <alpha.png|rgba.png> --out <png> [--border 18] [--paper cream|white] [--seed 1]
          A still cut-out with a hand-torn paper border (irregular, cream, fibrous rim; no outline, no shadow).
  live    --in <matte.webm> --out <webm> --ffmpeg <bin> --ffprobe <bin> [--fps 12] [--border 16] [--max-h 1280]
          [--paper cream|white] [--seed 1]
          The moving cut-out (rcg matte) re-cut every frame at stop-motion rate with a torn border, cropped
          to the subject's union box. Prints the crop and size.
  grab    --src <frame.png> --box x,y,w,h --out <rgba.png> [--iters 6]
          A small object inside a box (GrabCut seeded by the box), for objects the detector misses.
  sticker --in <rgba.png|jpg> --out <png> [--illustrate] [--cut alpha|light|none] [--border 10] [--edge die|paper|none]
          [--max-side 900] [--min-side 0]
          An object cut-out or a collected print as a vintage collage sticker: optional illustration treatment
          (posterized, muted, inked, grain), light-paper background removal for prints, die-cut border.
  pick    --in <matte.webm> --ffmpeg <bin> --ffprobe <bin> [--src <clip>] [--count 6] [--step 0.5]
          Times of distinct poses (farthest-point on the matte silhouettes, sharpest frame nearby).
  sheet   --out <png> --items <json list of {file,label}> [--cell 360]
"""

import argparse
import json
import math
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

# ── noise ────────────────────────────────────────────────────────────────────


def value_noise(h, w, scale, rng):
    """Smooth noise in [0,1] with features about `scale` px (a random grid, cubic upsample)."""
    gh = max(2, int(h / max(scale, 0.5)) + 2)
    gw = max(2, int(w / max(scale, 0.5)) + 2)
    g = rng.random((gh, gw)).astype(np.float32)
    return np.clip(cv2.resize(g, (w, h), interpolation=cv2.INTER_CUBIC), 0, 1)


def aniso_noise(h, w, sy, sx, rng):
    gh = max(2, int(h / sy) + 2)
    gw = max(2, int(w / sx) + 2)
    g = rng.random((gh, gw)).astype(np.float32)
    return np.clip(cv2.resize(g, (w, h), interpolation=cv2.INTER_CUBIC), 0, 1)


def fbm(h, w, scales, weights, rng):
    out = np.zeros((h, w), np.float32)
    for s, wt in zip(scales, weights):
        out += wt * value_noise(h, w, s, rng)
    out -= out.min()
    return out / max(out.max(), 1e-6)


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def lerp3(c0, c1, t):
    c0 = np.array(c0, np.float32)
    c1 = np.array(c1, np.float32)
    return c0 + (c1 - c0) * t[..., None]


def over(dst, rgb, a):
    """Composite rgb (HxWx3 float) with alpha a (HxW 0..1) over dst in place."""
    dst[:] = dst * (1 - a[..., None]) + rgb * a[..., None]


# ── board pieces ─────────────────────────────────────────────────────────────


def cork(h, w, rng):
    n = fbm(h, w, [160, 40], [0.6, 0.4], rng)
    g = value_noise(h, w, 1.8, rng)
    g2 = value_noise(h, w, 3.6, rng)
    g3 = value_noise(h, w, 7.0, rng)
    t = np.clip(0.3 * n + 0.7 * (0.4 * g + 0.35 * g2 + 0.25 * g3), 0, 1)
    t = np.clip((t - 0.5) * 1.35 + 0.5, 0, 1)
    dark, mid, light = (96, 60, 32), (158, 108, 64), (205, 156, 102)
    base = np.where(t[..., None] < 0.5, lerp3(dark, mid, t / 0.5), lerp3(mid, light, (t - 0.5) / 0.5))
    pits = smoothstep(0.80, 0.93, value_noise(h, w, 3.0, rng)) * smoothstep(0.35, 0.7, value_noise(h, w, 30, rng))
    specks = smoothstep(0.86, 0.97, value_noise(h, w, 1.6, rng))
    base = base * (1 - 0.5 * pits[..., None]) + specks[..., None] * np.array([26, 20, 12], np.float32)
    return base


def wood_frame(img, F, rng):
    h, w = img.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.stack([yy, h - 1 - yy, xx, w - 1 - xx])
    side = d.argmin(axis=0)
    dmin = d.min(axis=0)
    horiz = side < 2
    along = np.where(horiz, xx, yy)
    warp_h = aniso_noise(h, w, 6, 160, rng)
    warp_v = aniso_noise(h, w, 160, 6, rng)
    warp = np.where(horiz, warp_h, warp_v)
    streak = np.where(horiz, aniso_noise(h, w, 1.4, 45, rng), aniso_noise(h, w, 45, 1.4, rng))
    rings = 0.5 + 0.5 * np.sin(dmin * 0.55 + warp * 9.0 + along * 0.004)
    t = np.clip(0.55 * rings ** 1.6 + 0.45 * streak, 0, 1)
    col = lerp3((112, 70, 38), (186, 134, 84), t)
    u = dmin / F
    shade = 0.78 + 0.32 * np.sin(np.clip(u, 0, 1) * math.pi) - 0.28 * smoothstep(0.86, 1.0, u)
    col = col * shade[..., None]
    inside = dmin < F
    # The cork sits a little lower than the frame: a soft shadow along the inner edge.
    shadow = np.exp(-np.clip(dmin - F, 0, None) / 7.0) * (dmin >= F)
    img[:] = img * (1 - 0.38 * shadow[..., None])
    img[inside] = col[inside]
    # Mitre joints: a thin dark line on the diagonals.
    diag = inside & ((np.abs(yy - xx) < 1.0) | (np.abs(yy - (w - 1 - xx)) < 1.0) | (np.abs((h - 1 - yy) - xx) < 1.0) | (np.abs((h - 1 - yy) - (w - 1 - xx)) < 1.0))
    img[diag] *= 0.55


def pin(img, x, y, color, rng, r=12):
    h, w = img.shape[:2]
    R = int(r * 3)
    x0, y0, x1, y1 = max(0, int(x) - R), max(0, int(y) - R), min(w, int(x) + R), min(h, int(y) + R)
    if x1 <= x0 or y1 <= y0:
        return
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    sd = np.hypot(xx - (x + 3), yy - (y + 4.5))
    sh = np.clip((r + 2 - sd) / 5.0, 0, 1) * 0.5
    sub = img[y0:y1, x0:x1]
    sub *= (1 - sh[..., None])
    d = np.hypot(xx - x, yy - y)
    a = np.clip(r - d + 0.5, 0, 1)
    base = np.array(color, np.float32)
    shade = 0.62 + 0.45 * np.clip(1 - d / r, 0, 1)
    spec = np.exp(-(((xx - (x - 0.38 * r)) ** 2 + (yy - (y - 0.38 * r)) ** 2) / (0.09 * r * r)))
    col = base * shade[..., None] + spec[..., None] * np.array([255, 255, 255], np.float32) * 0.85
    over(sub, np.clip(col, 0, 255), a)


PIN_COLORS = [(196, 48, 40), (186, 188, 194), (226, 182, 52), (66, 104, 172), (238, 234, 226), (122, 190, 160), (232, 150, 170)]


def tape(img, cx, cy, length, width, angle, rng, color=(238, 226, 188), alpha=0.86):
    h, w = img.shape[:2]
    L, W = int(length), int(width)
    piece = np.ones((W, L), np.float32)
    jag = (value_noise(W, 1, 2.5, rng)[:, 0] * 7).astype(int)
    jag2 = (value_noise(W, 1, 2.5, rng)[:, 0] * 7).astype(int)
    for i in range(W):
        piece[i, :jag[i]] = 0
        piece[i, L - jag2[i]:] = 0
    tex = 0.93 + 0.07 * value_noise(W, L, 3, rng)
    rgb = np.dstack([np.full((W, L), c, np.float32) for c in color]) * tex[..., None]
    M = cv2.getRotationMatrix2D((L / 2, W / 2), angle, 1.0)
    M[0, 2] += cx - L / 2
    M[1, 2] += cy - W / 2
    a = cv2.warpAffine(piece * alpha, M, (w, h), flags=cv2.INTER_LINEAR, borderValue=0)
    c = cv2.warpAffine(rgb, M, (w, h), flags=cv2.INTER_LINEAR, borderValue=(0, 0, 0))
    over(img, c, a)


def place_sheet(img, rgb, mask, cx, cy, angle, shadow=0.35):
    """Rotate a sheet (rgb float, mask 0..1) about its centre onto img at (cx, cy) with a soft shadow."""
    h, w = img.shape[:2]
    sh, sw = mask.shape
    M = cv2.getRotationMatrix2D((sw / 2, sh / 2), angle, 1.0)
    M[0, 2] += cx - sw / 2
    M[1, 2] += cy - sh / 2
    a = cv2.warpAffine(mask.astype(np.float32), M, (w, h), flags=cv2.INTER_LINEAR, borderValue=0)
    c = cv2.warpAffine(rgb.astype(np.float32), M, (w, h), flags=cv2.INTER_LINEAR, borderValue=(0, 0, 0))
    if shadow:
        s = cv2.GaussianBlur(np.roll(np.roll(a, 5, axis=0), 3, axis=1), (0, 0), 5)
        img[:] = img * (1 - shadow * s[..., None])
    over(img, c, a)
    return M


def to_canvas(M, x, y):
    return float(M[0, 0] * x + M[0, 1] * y + M[0, 2]), float(M[1, 0] * x + M[1, 1] * y + M[1, 2])


def jagged_rect_mask(h, w, rng, amp=3.0, torn_edges=(), torn_amp=10.0):
    """A sheet mask: scissor-cut sides (small jitter) and hand-torn sides ('top','bottom','left','right')."""
    m = np.zeros((h, w), np.float32)
    def edge(n, torn):
        a = torn_amp if torn else amp
        e = value_noise(n, 1, 22 if torn else 60, rng)[:, 0] * a
        if torn:
            e += value_noise(n, 1, 2.2, rng)[:, 0] * a * 0.35
        return e
    top, bot = edge(w, 'top' in torn_edges), edge(w, 'bottom' in torn_edges)
    lef, rig = edge(h, 'left' in torn_edges), edge(h, 'right' in torn_edges)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    inside = (yy >= top[None, :]) & (yy <= h - 1 - bot[None, :]) & (xx >= lef[:, None]) & (xx <= w - 1 - rig[:, None])
    m[inside] = 1
    return cv2.GaussianBlur(m, (3, 3), 0.6)


def newsprint(h, w, rng):
    base = np.array([229, 221, 200], np.float32) * (0.95 + 0.05 * fbm(h, w, [80, 9], [0.6, 0.4], rng))[..., None]
    img = base.copy()
    ink = np.array([62, 58, 54], np.float32)
    m = 22
    # Masthead-like headline: two rows of heavy word blocks.
    y = m
    for row, hh in enumerate((30, 22)):
        x = m
        while x < w - m - 40:
            wl = int(rng.integers(40, 150))
            if x + wl > w - m:
                break
            img[y:y + hh, x:x + wl] = img[y:y + hh, x:x + wl] * 0.15 + ink * 0.85
            x += wl + int(rng.integers(12, 20))
        y += hh + 12
    y += 6
    img[y:y + 2, m:w - m] = ink * 0.8
    y += 14
    ncol = 3 if w > 480 else 2
    gut = 16
    cw = (w - 2 * m - gut * (ncol - 1)) // ncol
    photo_col = int(rng.integers(0, ncol))
    for c in range(ncol):
        x0 = m + c * (cw + gut)
        yy = y
        if c == photo_col:
            ph = int(cw * 0.8)
            if yy + ph < h - m:
                gy, gx = np.mgrid[0:ph, 0:cw].astype(np.float32)
                tone = fbm(ph, cw, [60, 20], [0.7, 0.3], rng)
                dots = (np.hypot((gx % 6) - 3, (gy % 6) - 3) < 3.2 * tone)
                block = img[yy:yy + ph, x0:x0 + cw]
                block[dots] = block[dots] * 0.25 + ink * 0.75
                yy += ph + 12
        while yy < h - m - 8:
            x = x0
            line_end = x0 + cw if rng.random() > 0.12 else x0 + int(cw * rng.uniform(0.3, 0.8))
            while x < line_end - 8:
                wl = int(rng.integers(8, 42))
                x1 = min(x + wl, line_end)
                img[yy:yy + 5, x:x1] = img[yy:yy + 5, x:x1] * 0.35 + ink * 0.65
                x = x1 + 5
            yy += 12
            if rng.random() < 0.08:
                yy += 10
    return img


def kraft(h, w, rng):
    t = fbm(h, w, [90, 25, 6], [0.5, 0.3, 0.2], rng)
    img = lerp3((172, 128, 84), (204, 162, 114), t)
    for _ in range(int(h * w / 900)):
        x, y = int(rng.integers(0, w)), int(rng.integers(0, h))
        ang = rng.uniform(0, math.pi)
        ln = rng.uniform(4, 16)
        x2, y2 = int(x + math.cos(ang) * ln), int(y + math.sin(ang) * ln)
        tone = (226, 196, 150) if rng.random() < 0.5 else (140, 98, 60)
        cv2.line(img, (x, y), (x2, y2), tone, 1, cv2.LINE_AA)
    return img


def gingham(h, w, rng, color=(222, 140, 156)):
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    jit = (value_noise(h, w, 30, rng) - 0.5) * 2.0
    p, s = 46, 23
    cx = ((xx + jit) % p) < s
    cy = ((yy + jit) % p) < s
    a = 0.5 * cx + 0.5 * cy
    white = np.array([246, 240, 234], np.float32)
    col = np.array(color, np.float32)
    img = white + (col - white) * a[..., None] * 0.95
    weave = 0.93 + 0.07 * (0.5 + 0.5 * np.sin((xx + yy) * 1.6)) * value_noise(h, w, 2.0, rng)
    return img * weave[..., None]


def pinked_mask(h, w, amp=7, period=14):
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    tri = lambda v: amp * np.abs(((v / period) % 1.0) * 2 - 1)
    inside = (yy > tri(xx)) & (yy < h - 1 - tri(xx)) & (xx > tri(yy)) & (xx < w - 1 - tri(yy))
    return cv2.GaussianBlur(inside.astype(np.float32), (3, 3), 0.6)


def watercolor(h, w, rng):
    paper = np.array([247, 243, 234], np.float32) * (0.95 + 0.05 * fbm(h, w, [6, 2.5], [0.6, 0.4], rng))[..., None]
    img = paper.copy()
    washes = [(240, 186, 160), (168, 212, 190), (198, 184, 230), (244, 222, 150)]
    rng.shuffle(washes)
    for col in washes[:2]:
        # One loose wash per colour: a big soft shape with an organic, slightly darker pigment rim.
        n = fbm(h, w, [420, 160, 50], [0.55, 0.3, 0.15], rng)
        thr = rng.uniform(0.5, 0.58)
        mask = smoothstep(thr, thr + 0.035, n)
        edge = np.clip(mask - cv2.GaussianBlur(mask, (0, 0), 9), 0, 1)
        inner = 0.75 + 0.25 * fbm(h, w, [90, 25], [0.6, 0.4], rng)
        gran = 0.88 + 0.12 * value_noise(h, w, 2.2, rng)
        amt = np.clip((0.34 * mask * inner + 1.4 * edge) * gran, 0, 0.7)
        img = img * (1 - amt[..., None]) + (img * np.array(col, np.float32) / 255.0) * amt[..., None]
    return img


def cutting_mat(h, w, rng):
    base = np.array([98, 136, 92], np.float32) * (0.96 + 0.04 * fbm(h, w, [70, 4], [0.5, 0.5], rng))[..., None]
    img = base.copy()
    cm = 40.0
    ox, oy = 52, 58
    white = np.array([236, 240, 228], np.float32)
    for i in range(int((w - ox) / cm) + 1):
        x = int(ox + i * cm)
        a = 0.85 if i % 5 == 0 else 0.5
        th = 2 if i % 5 == 0 else 1
        img[oy:h - 30, x:x + th] = img[oy:h - 30, x:x + th] * (1 - a) + white * a
    for j in range(int((h - oy) / cm) + 1):
        y = int(oy + j * cm)
        a = 0.85 if j % 5 == 0 else 0.5
        th = 2 if j % 5 == 0 else 1
        img[y:y + th, ox - 12:w - 30] = img[y:y + th, ox - 12:w - 30] * (1 - a) + white * a
    u8 = np.clip(img, 0, 255).astype(np.uint8)
    for i in range(int((w - ox - 30) / cm) + 1):
        cv2.putText(u8, str(i), (int(ox + i * cm) - 6, 36), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (236, 240, 228), 1, cv2.LINE_AA)
    for j in range(1, int((h - oy - 30) / cm) + 1):
        cv2.putText(u8, str(j % 100), (8, int(oy + j * cm) + 5), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (236, 240, 228), 1, cv2.LINE_AA)
        cv2.putText(u8, str(j % 100), (w - 26, int(oy + j * cm) + 5), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (236, 240, 228), 1, cv2.LINE_AA)
    return u8.astype(np.float32)


def board(overlay, H, W, seed):
    rng = np.random.default_rng(seed)
    if overlay == "mat":
        return cutting_mat(H, W, rng)
    img = cork(H, W, rng)
    F = 34
    pins = lambda: PIN_COLORS[int(rng.integers(0, len(PIN_COLORS)))]
    if overlay == "bare":
        # Old pin holes: the board has been used before.
        for _ in range(34):
            x, y = int(rng.integers(F + 20, W - F - 20)), int(rng.integers(F + 20, H - F - 20))
            cv2.circle(img, (x, y), int(rng.integers(1, 3)), (52, 34, 20), -1, cv2.LINE_AA)
    elif overlay == "newspaper":
        for (sw, sh, cx, cy, ang, torn) in ((640, 820, 380, 620, -4.0, ('right',)), (560, 640, 720, 1320, 3.5, ('top',)), (400, 330, 300, 1560, 6.0, ())):
            sw, sh = int(sw * rng.uniform(0.95, 1.05)), int(sh * rng.uniform(0.95, 1.05))
            M = place_sheet(img, newsprint(sh, sw, rng), jagged_rect_mask(sh, sw, rng, 2.0, torn, 9), cx + rng.uniform(-30, 30), cy + rng.uniform(-30, 30), ang + rng.uniform(-1.5, 1.5))
            px, py = to_canvas(M, sw / 2 + rng.uniform(-40, 40), 24)
            pin(img, px, py, pins(), rng)
    elif overlay == "kraft":
        sw, sh = W - 2 * F - 70, H - 2 * F - 230
        M = place_sheet(img, kraft(sh, sw, rng), jagged_rect_mask(sh, sw, rng, 1.5, ('bottom',), 14), W / 2 + rng.uniform(-12, 12), H / 2 - 40, rng.uniform(-1.8, 1.8))
        for (u, v) in ((26, 26), (sw - 26, 26), (26, sh - 60), (sw - 26, sh - 60)):
            px, py = to_canvas(M, u, v)
            pin(img, px, py, PIN_COLORS[1], rng, r=10)
    elif overlay == "fabric":
        sw, sh = 820, 1180
        col = [(222, 140, 156), (134, 164, 204), (150, 196, 170)][int(rng.integers(0, 3))]
        M = place_sheet(img, gingham(sh, sw, rng, col), pinked_mask(sh, sw), W / 2 - 40 + rng.uniform(-20, 20), H / 2 + rng.uniform(-40, 40), rng.uniform(2.0, 4.0))
        for (u, v) in ((40, 40), (sw - 40, 40)):
            px, py = to_canvas(M, u, v)
            pin(img, px, py, pins(), rng)
    elif overlay == "watercolor":
        sw, sh = 880, 1300
        M = place_sheet(img, watercolor(sh, sw, rng), jagged_rect_mask(sh, sw, rng, 1.2, ('left',), 8), W / 2 + rng.uniform(-20, 20), H / 2 - 20, rng.uniform(-2.5, -1.0))
        for (u, v, ang) in ((10, 10, -38), (sw - 10, 10, 38)):
            px, py = to_canvas(M, u, v)
            tape(img, px, py, 150, 42, ang + rng.uniform(-6, 6), rng)
    else:
        raise SystemExit(f"Unknown overlay '{overlay}' (bare, newspaper, kraft, fabric, watercolor, mat)")
    wood_frame(img, F, rng)
    return img


def cmd_boards(a):
    W, H = (int(v) for v in a.size.lower().split("x"))
    out = Path(a.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    written = []
    for ov in [s.strip() for s in a.overlays.split(",") if s.strip()]:
        # "kraft-2": the same overlay, another seeded layout (a scene that repeats an overlay never repeats it exactly).
        base, _, var = ov.partition("-")
        k = ["bare", "newspaper", "kraft", "fabric", "watercolor", "mat"].index(base) if base in ("bare", "newspaper", "kraft", "fabric", "watercolor", "mat") else 0
        img = board(base, H, W, a.seed * 101 + k * 7 + 3 + (int(var) * 1009 if var.isdigit() else 0))
        f = out / f"{ov}.jpg"
        cv2.imwrite(str(f), cv2.cvtColor(np.clip(img, 0, 255).astype(np.uint8), cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 92])
        written.append(str(f))
    print(json.dumps({"boards": written, "size": [W, H]}))


# ── cut-outs ─────────────────────────────────────────────────────────────────

PAPERS = {"cream": ((243, 233, 204), (252, 248, 236)), "white": ((250, 248, 242), (255, 255, 252))}


def clean_mask(a):
    m = (a > 0.5).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    if n <= 1:
        return m
    areas = st[1:, cv2.CC_STAT_AREA]
    big = areas.max()
    keep = np.zeros(n, bool)
    keep[1:] = areas >= 0.03 * big
    m = keep[lab].astype(np.uint8)
    # Fill holes (gaps between an arm and the body are kept: only enclosed specks under 0.5%).
    inv = 1 - m
    n2, lab2, st2, _ = cv2.connectedComponentsWithStats(inv, 4)
    for k in range(1, n2):
        x, y, w, h, ar = st2[k]
        touches = x == 0 or y == 0 or x + w >= m.shape[1] or y + h >= m.shape[0]
        if not touches and ar < 0.005 * m.size:
            m[lab2 == k] = 1
    return m


class TornField:
    """Fixed noise fields for a canvas, so a live cut-out re-cuts with the same paper each frame."""

    def __init__(self, h, w, border, seed):
        rng = np.random.default_rng(seed)
        self.lo = value_noise(h, w, border * 2.4, rng)
        self.hi = value_noise(h, w, 2.4, rng)
        self.fib = value_noise(h, w, 1.3, rng)
        self.tex = value_noise(h, w, 3.0, rng)
        self.border = border


def torn_composite(rgb, a, field, paper="cream"):
    """rgb float HxWx3, a 0..1 HxW (already padded). Returns (rgb, alpha) of subject + torn paper."""
    B = field.border
    m = clean_mask(a)
    dist = cv2.distanceTransform((1 - m).astype(np.uint8), cv2.DIST_L2, 5)
    r = B * (0.68 + 0.64 * field.lo) + B * 0.3 * (field.hi - 0.5)
    pa = np.clip(r - dist + 0.5, 0, 1)
    pa[m > 0] = 1
    rim = np.clip(1 - (r - dist) / 2.8, 0, 1) * (dist > 0)
    pa = np.where(rim > 0, pa * (0.5 + 0.5 * field.fib), pa)
    base, rimc = PAPERS[paper]
    col = np.array(base, np.float32) * (0.95 + 0.07 * field.tex)[..., None]
    col = col + (np.array(rimc, np.float32) - col) * (rim * 0.85)[..., None]
    # The subject over its paper: soft edge from the matte, paper fills where the matte fades.
    sa = np.clip(a, 0, 1) * (m > 0) + np.clip(a, 0, 1) * (m == 0) * 0.0
    sa = np.maximum(sa, cv2.GaussianBlur(m.astype(np.float32), (3, 3), 0.7) * (a > 0.25))
    out = col * (1 - sa[..., None]) + rgb * sa[..., None]
    return out, np.maximum(pa, sa)


def read_rgba(path):
    im = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
    if im is None:
        raise SystemExit(f"Cannot read {path}")
    if im.ndim == 2:
        im = cv2.cvtColor(im, cv2.COLOR_GRAY2BGRA)
    if im.shape[2] == 3:
        im = np.dstack([im, np.full(im.shape[:2], 255, np.uint8)])
    rgb = cv2.cvtColor(im[..., :3], cv2.COLOR_BGR2RGB).astype(np.float32)
    return rgb, im[..., 3].astype(np.float32) / 255.0


def write_rgba(path, rgb, a):
    out = np.dstack([cv2.cvtColor(np.clip(rgb, 0, 255).astype(np.uint8), cv2.COLOR_RGB2BGR), np.clip(a * 255, 0, 255).astype(np.uint8)])
    cv2.imwrite(str(path), out)


def crop_to(a, pad):
    ys, xs = np.where(a > 0.02)
    if not len(ys):
        raise SystemExit("Empty cut-out: the mask has no subject.")
    return max(0, ys.min() - pad), min(a.shape[0], ys.max() + pad + 1), max(0, xs.min() - pad), min(a.shape[1], xs.max() + pad + 1)


def cmd_torn(a):
    rgb, _ = read_rgba(a.rgb)
    _, alpha = read_rgba(a.alpha)
    if alpha.shape != rgb.shape[:2]:
        alpha = cv2.resize(alpha, (rgb.shape[1], rgb.shape[0]), interpolation=cv2.INTER_LINEAR)
    if alpha.max() >= 0.99 and alpha.min() >= 0.99:
        # A grey matte (no alpha channel): read luminance.
        g = cv2.imread(str(a.alpha), cv2.IMREAD_GRAYSCALE)
        alpha = cv2.resize(g, (rgb.shape[1], rgb.shape[0])).astype(np.float32) / 255.0
    B = int(a.border)
    y0, y1, x0, x1 = crop_to(alpha, B * 3)
    rgb, alpha = rgb[y0:y1, x0:x1], alpha[y0:y1, x0:x1]
    P = B * 3
    rgb = cv2.copyMakeBorder(rgb, P, P, P, P, cv2.BORDER_CONSTANT, value=(0, 0, 0))
    alpha = cv2.copyMakeBorder(alpha, P, P, P, P, cv2.BORDER_CONSTANT, value=0)
    field = TornField(alpha.shape[0], alpha.shape[1], B, a.seed)
    out, oa = torn_composite(rgb, alpha, field, a.paper)
    cy0, cy1, cx0, cx1 = crop_to(oa, 2)
    write_rgba(a.out, out[cy0:cy1, cx0:cx1], oa[cy0:cy1, cx0:cx1])
    print(json.dumps({"out": a.out, "size": [int(cx1 - cx0), int(cy1 - cy0)], "crop": [int(x0), int(y0), int(x1 - x0), int(y1 - y0)]}))


def probe_video(ffprobe, path):
    out = subprocess.run([ffprobe, "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate,nb_frames:format=duration",
                          "-of", "json", str(path)], capture_output=True, text=True, check=True).stdout
    j = json.loads(out)
    s = j["streams"][0]
    n, d = (int(v) for v in s["r_frame_rate"].split("/"))
    return int(s["width"]), int(s["height"]), n / d, float(j["format"]["duration"])


def decode_rgba(ffmpeg, path, w, h, vf=None):
    args = [ffmpeg, "-v", "error", "-c:v", "libvpx-vp9", "-i", str(path)]
    if vf:
        args += ["-vf", vf]
    args += ["-pix_fmt", "rgba", "-f", "rawvideo", "pipe:1"]
    proc = subprocess.Popen(args, stdout=subprocess.PIPE)
    size = w * h * 4
    while True:
        buf = proc.stdout.read(size)
        if len(buf) < size:
            break
        yield np.frombuffer(buf, np.uint8).reshape(h, w, 4)
    proc.wait()


def cmd_live(a):
    W, H, rate, dur = probe_video(a.ffprobe, a.in_)
    fps = float(a.fps)
    vf = f"fps={fps}"
    # Pass 1: the union box of the subject over the whole clip.
    box = None
    count = 0
    for fr in decode_rgba(a.ffmpeg, a.in_, W, H, vf):
        m = fr[..., 3] > 127
        ys, xs = np.where(m)
        count += 1
        if not len(ys):
            continue
        b = (ys.min(), ys.max(), xs.min(), xs.max())
        box = b if box is None else (min(box[0], b[0]), max(box[1], b[1]), min(box[2], b[2]), max(box[3], b[3]))
    if box is None:
        raise SystemExit("The matte is empty in every frame.")
    B0 = int(a.border)
    y0, y1, x0, x1 = box
    ch, cw = y1 - y0 + 1, x1 - x0 + 1
    scale = min(1.0, float(a.max_h) / (ch + 6 * B0))
    B = max(4, int(round(B0)))
    P = B * 3
    ow = int(round(cw * scale)) + 2 * P
    oh = int(round(ch * scale)) + 2 * P
    ow += ow % 2
    oh += oh % 2
    field = TornField(oh, ow, B, a.seed)
    enc = subprocess.Popen([a.ffmpeg, "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{ow}x{oh}", "-r", str(fps), "-i", "pipe:0",
                            "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-crf", "22", "-b:v", "0", "-row-mt", "1", "-deadline", "good",
                            "-cpu-used", "2", "-auto-alt-ref", "0", str(a.out)], stdin=subprocess.PIPE)
    n = 0
    for fr in decode_rgba(a.ffmpeg, a.in_, W, H, vf):
        crop = fr[y0:y1 + 1, x0:x1 + 1]
        if scale < 1:
            crop = cv2.resize(crop, (int(round(cw * scale)), int(round(ch * scale))), interpolation=cv2.INTER_AREA)
        rgb = crop[..., :3].astype(np.float32)
        al = crop[..., 3].astype(np.float32) / 255.0
        rgb = cv2.copyMakeBorder(rgb, P, oh - P - rgb.shape[0], P, ow - P - rgb.shape[1], cv2.BORDER_CONSTANT, value=(0, 0, 0))
        al = cv2.copyMakeBorder(al, P, oh - P - al.shape[0], P, ow - P - al.shape[1], cv2.BORDER_CONSTANT, value=0)
        out, oa = torn_composite(rgb, al, field, a.paper)
        frame = np.dstack([np.clip(out, 0, 255).astype(np.uint8), np.clip(oa * 255, 0, 255).astype(np.uint8)])
        enc.stdin.write(frame.tobytes())
        n += 1
    enc.stdin.close()
    enc.wait()
    if enc.returncode != 0:
        raise SystemExit("ffmpeg could not encode the live cut-out")
    print(json.dumps({"out": a.out, "size": [ow, oh], "fps": fps, "frames": n, "duration": round(n / fps, 3),
                      "crop": [int(x0), int(y0), int(cw), int(ch)], "scale": round(scale, 4), "source": [W, H]}))


# ── stickers ─────────────────────────────────────────────────────────────────


def illustrate(rgb, a, rng, k=5):
    """Flat vintage illustration: smooth, few colours, speckle-free regions, outline plus strong inner lines."""
    u8 = np.clip(rgb, 0, 255).astype(np.uint8)
    sm = cv2.medianBlur(u8, 5)
    for _ in range(3):
        sm = cv2.bilateralFilter(sm, 9, 80, 9)
    lab = cv2.cvtColor(sm, cv2.COLOR_RGB2LAB).reshape(-1, 3).astype(np.float32)
    sel = (a.reshape(-1) > 0.5)
    pts = lab[sel] if sel.sum() > k * 10 else lab
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
    cv2.setRNGSeed(int(rng.integers(0, 1 << 30)))
    _, labels, centers = cv2.kmeans(pts, k, None, crit, 3, cv2.KMEANS_PP_CENTERS)
    d = ((lab[:, None, :] - centers[None, :, :]) ** 2).sum(-1)
    idx = d.argmin(1).reshape(sm.shape[:2]).astype(np.uint8)
    # Mode-like clean-up of the colour regions: small islands read as dirt on a sticker.
    ks = max(5, (min(idx.shape) // 60) | 1)
    idx = cv2.medianBlur(idx, ks)
    q = centers[idx.reshape(-1)].reshape(sm.shape).astype(np.uint8)
    q = cv2.cvtColor(q, cv2.COLOR_LAB2RGB)
    hsv = cv2.cvtColor(q, cv2.COLOR_RGB2HSV).astype(np.float32)
    hsv[..., 1] *= 0.72
    hsv[..., 2] = 22 + hsv[..., 2] * 0.88
    q = cv2.cvtColor(np.clip(hsv, 0, 255).astype(np.uint8), cv2.COLOR_HSV2RGB).astype(np.float32)
    q = q * 0.86 + np.array([228, 204, 166], np.float32) * 0.14
    gray = cv2.cvtColor(np.clip(q, 0, 255).astype(np.uint8), cv2.COLOR_RGB2GRAY)
    edges = cv2.Canny(gray, 60, 150)
    n, lab_e, st, _ = cv2.connectedComponentsWithStats((edges > 0).astype(np.uint8), 8)
    short = np.zeros(n, bool)
    short[1:] = st[1:, cv2.CC_STAT_AREA] < max(24, edges.size // 4000)
    edges[short[lab_e]] = 0
    m = (a > 0.5).astype(np.uint8)
    lw = max(2, int(round(max(m.shape) / 260)))
    edges |= cv2.morphologyEx(m, cv2.MORPH_GRADIENT, np.ones((lw + 1, lw + 1), np.uint8)) * 255
    edges = cv2.dilate(edges, np.ones((2, 2), np.uint8))
    ink = np.array([58, 40, 28], np.float32)
    e = (edges > 0).astype(np.float32)[..., None] * 0.85
    q = q * (1 - e) + ink * e
    grain = 0.9 + 0.1 * value_noise(q.shape[0], q.shape[1], 1.6, rng)
    return q * grain[..., None]


def light_background_alpha(rgb):
    """Alpha for a print on light paper: pixels close to the paper colour (sampled at the border) go clear."""
    h, w = rgb.shape[:2]
    border = np.concatenate([rgb[:8].reshape(-1, 3), rgb[-8:].reshape(-1, 3), rgb[:, :8].reshape(-1, 3), rgb[:, -8:].reshape(-1, 3)])
    paper = np.median(border, axis=0)
    dist = np.sqrt(((rgb - paper) ** 2).sum(-1))
    # Ink and paint are saturated or dark; foxing and stains on old paper are pale and low in saturation.
    hsv = cv2.cvtColor(np.clip(rgb, 0, 255).astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)
    psat = cv2.cvtColor(np.uint8([[np.clip(paper, 0, 255)]]), cv2.COLOR_RGB2HSV)[0, 0, 1]
    inked = (hsv[..., 1] > psat + 28) | (hsv[..., 2] < 110)
    m = ((dist > 44) & inked).astype(np.uint8)
    k = max(7, (min(h, w) // 45) | 1)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    m = clean_mask(m.astype(np.float32))
    # Fill every hole that does not reach the edge (pale petals, highlights).
    inv = (1 - m).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(inv, 4)
    for i in range(1, n):
        x, y, ww, hh, _a = st[i]
        if x > 0 and y > 0 and x + ww < w and y + hh < h:
            m[lab == i] = 1
    return m.astype(np.float32)


def cmd_grab(a):
    """A small object inside a box: GrabCut seeded by the box (the click segmenters take the whole person)."""
    rgb, _ = read_rgba(a.src)
    x, y, w, h = (int(round(float(v))) for v in a.box.split(","))
    H, W = rgb.shape[:2]
    pad = int(max(w, h) * 0.6)
    X0, Y0, X1, Y1 = max(0, x - pad), max(0, y - pad), min(W, x + w + pad), min(H, y + h + pad)
    roi = np.clip(rgb[Y0:Y1, X0:X1], 0, 255).astype(np.uint8)
    bgr = cv2.cvtColor(roi, cv2.COLOR_RGB2BGR)
    mask = np.zeros(roi.shape[:2], np.uint8)
    rect = (x - X0, y - Y0, w, h)
    bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    cv2.grabCut(bgr, mask, rect, bgd, fgd, int(a.iters), cv2.GC_INIT_WITH_RECT)
    m = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 1, 0).astype(np.float32)
    m = clean_mask(m).astype(np.float32)
    m = cv2.GaussianBlur(m, (3, 3), 0.8)
    write_rgba(a.out, roi.astype(np.float32), m)
    print(json.dumps({"out": a.out, "size": [int(roi.shape[1]), int(roi.shape[0])], "area": round(float(m.mean()), 4)}))


def cmd_sticker(a):
    rng = np.random.default_rng(a.seed)
    rgb, al = read_rgba(a.in_)
    if a.cut == "light":
        al = light_background_alpha(rgb)
    elif a.cut == "none":
        al = np.ones(rgb.shape[:2], np.float32)
    B = int(a.border)
    y0, y1, x0, x1 = crop_to(al, 2)
    rgb, al = rgb[y0:y1, x0:x1], al[y0:y1, x0:x1]
    if max(rgb.shape[:2]) > int(a.max_side):
        s = int(a.max_side) / max(rgb.shape[:2])
        rgb = cv2.resize(rgb, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
        al = cv2.resize(al, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    elif max(rgb.shape[:2]) < int(a.min_side):
        # Small objects from a frame: enlarge first, so the ink lines and border stay thin on screen.
        s = int(a.min_side) / max(rgb.shape[:2])
        rgb = cv2.resize(rgb, None, fx=s, fy=s, interpolation=cv2.INTER_CUBIC)
        al = cv2.resize(al, None, fx=s, fy=s, interpolation=cv2.INTER_CUBIC)
    P = B * 3
    rgb = cv2.copyMakeBorder(rgb, P, P, P, P, cv2.BORDER_CONSTANT, value=(0, 0, 0))
    al = cv2.copyMakeBorder(al, P, P, P, P, cv2.BORDER_CONSTANT, value=0)
    if a.illustrate:
        rgb = illustrate(rgb, al, rng)
    if a.edge == "die" and B > 0:
        m = (al > 0.5).astype(np.uint8)
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * B + 1, 2 * B + 1))
        dil = cv2.dilate(m, k).astype(np.float32)
        dil = smoothstep(0.35, 0.65, cv2.GaussianBlur(dil, (0, 0), B * 0.35))
        white = np.array([251, 248, 241], np.float32)
        ring = np.clip(dil - cv2.erode(dil, np.ones((3, 3), np.uint8)), 0, 1)
        base = np.dstack([np.full(al.shape, c, np.float32) for c in white])
        base = base * (1 - 0.18 * ring[..., None])
        out = base * (1 - al[..., None]) + rgb * al[..., None]
        oa = np.maximum(dil, al)
    elif a.edge == "paper" and B > 0:
        field = TornField(al.shape[0], al.shape[1], B, a.seed)
        out, oa = torn_composite(rgb, al, field, "cream")
    else:
        out, oa = rgb, al
    cy0, cy1, cx0, cx1 = crop_to(oa, 2)
    write_rgba(a.out, out[cy0:cy1, cx0:cx1], oa[cy0:cy1, cx0:cx1])
    print(json.dumps({"out": a.out, "size": [int(cx1 - cx0), int(cy1 - cy0)]}))


# ── pose picking and sheets ──────────────────────────────────────────────────


def cmd_pick(a):
    W, H, rate, dur = probe_video(a.ffprobe, a.in_)
    step = float(a.step)
    sw = 96
    sh = int(round(H * sw / W))
    masks = [fr[..., 3] > 127 for fr in decode_rgba(a.ffmpeg, a.in_, sw, sh, f"fps={1 / step},scale={sw}:{sh}")]
    times = [round(i * step + step / 2, 3) for i in range(len(masks))]
    keep = [i for i, m in enumerate(masks) if m.mean() > 0.01 and times[i] < dur - 0.2]
    if not keep:
        raise SystemExit("No frame has a subject in the matte.")
    def iou_dist(i, j):
        inter = (masks[i] & masks[j]).sum()
        uni = (masks[i] | masks[j]).sum()
        return 1 - inter / max(uni, 1)
    chosen = [max(keep, key=lambda i: masks[i].mean())]
    while len(chosen) < min(int(a.count), len(keep)):
        best = max((i for i in keep if i not in chosen), key=lambda i: min(iou_dist(i, c) for c in chosen))
        chosen.append(best)
    chosen.sort()
    out = [{"at": times[i], "distance": round(min([iou_dist(i, c) for c in chosen if c != i] or [0]), 3)} for i in chosen]
    if a.src:
        # The sharpest source frame within a quarter step of each pick (motion blur reads badly on paper).
        for o in out:
            best, best_t = -1, o["at"]
            for dt in (-step / 4, 0, step / 4):
                t = max(0.0, min(dur - 0.05, o["at"] + dt))
                proc = subprocess.run([a.ffmpeg, "-v", "error", "-ss", f"{t:.3f}", "-i", str(a.src), "-frames:v", "1", "-vf", "scale=480:-2,format=gray",
                                       "-f", "rawvideo", "pipe:1"], capture_output=True)
                buf = np.frombuffer(proc.stdout, np.uint8)
                if not len(buf):
                    continue
                g = buf.reshape(-1, 480)
                v = float(cv2.Laplacian(g, cv2.CV_32F).var())
                if v > best:
                    best, best_t = v, t
            o["at"] = round(best_t, 3)
            o["sharpness"] = round(best, 1)
    print(json.dumps({"picks": out, "duration": dur}))


def cmd_sheet(a):
    items = json.loads(Path(a.items).read_text(encoding="utf-8-sig"))
    C = int(a.cell)
    cols = min(4, max(1, len(items)))
    rows = (len(items) + cols - 1) // cols
    sheet = np.zeros((rows * (C + 40), cols * C, 3), np.uint8)
    yy, xx = np.mgrid[0:C, 0:C]
    checker = np.where(((yy // 20 + xx // 20) % 2)[..., None] == 0, 120, 150).astype(np.uint8).repeat(3, 2)
    for k, it in enumerate(items):
        r, c = divmod(k, cols)
        y, x = r * (C + 40), c * C
        tile = checker.copy().astype(np.float32)
        rgb, al = read_rgba(it["file"])
        s = min((C - 16) / rgb.shape[1], (C - 16) / rgb.shape[0])
        rgb = cv2.resize(rgb, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
        al = cv2.resize(al, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
        oy, ox = (C - rgb.shape[0]) // 2, (C - rgb.shape[1]) // 2
        sub = tile[oy:oy + rgb.shape[0], ox:ox + rgb.shape[1]]
        over(sub, rgb, al)
        sheet[y:y + C, x:x + C] = cv2.cvtColor(np.clip(tile, 0, 255).astype(np.uint8), cv2.COLOR_RGB2BGR)
        cv2.putText(sheet, str(it.get("label", ""))[:34], (x + 8, y + C + 28), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (235, 235, 235), 1, cv2.LINE_AA)
    cv2.imwrite(str(a.out), sheet)
    print(json.dumps({"sheet": a.out, "items": len(items)}))


def main():
    p = argparse.ArgumentParser(prog="mixmedia_art.py")
    sub = p.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("boards")
    b.add_argument("--out-dir", required=True)
    b.add_argument("--size", default="1080x1920")
    b.add_argument("--seed", type=int, default=1)
    b.add_argument("--overlays", default="bare,newspaper,kraft,fabric,watercolor,mat")
    b.set_defaults(fn=cmd_boards)
    t = sub.add_parser("torn")
    t.add_argument("--rgb", required=True)
    t.add_argument("--alpha", required=True)
    t.add_argument("--out", required=True)
    t.add_argument("--border", type=float, default=18)
    t.add_argument("--paper", default="cream", choices=list(PAPERS))
    t.add_argument("--seed", type=int, default=1)
    t.set_defaults(fn=cmd_torn)
    l = sub.add_parser("live")
    l.add_argument("--in", dest="in_", required=True)
    l.add_argument("--out", required=True)
    l.add_argument("--ffmpeg", required=True)
    l.add_argument("--ffprobe", required=True)
    l.add_argument("--fps", type=float, default=12)
    l.add_argument("--border", type=float, default=16)
    l.add_argument("--max-h", type=int, default=1280)
    l.add_argument("--paper", default="cream", choices=list(PAPERS))
    l.add_argument("--seed", type=int, default=1)
    l.set_defaults(fn=cmd_live)
    s = sub.add_parser("sticker")
    s.add_argument("--in", dest="in_", required=True)
    s.add_argument("--out", required=True)
    s.add_argument("--illustrate", action="store_true")
    s.add_argument("--cut", default="alpha", choices=["alpha", "light", "none"])
    s.add_argument("--border", type=float, default=10)
    s.add_argument("--edge", default="die", choices=["die", "paper", "none"])
    s.add_argument("--max-side", type=int, default=900)
    s.add_argument("--min-side", type=int, default=0)
    s.add_argument("--seed", type=int, default=1)
    s.set_defaults(fn=cmd_sticker)
    g = sub.add_parser("grab")
    g.add_argument("--src", required=True)
    g.add_argument("--box", required=True)
    g.add_argument("--out", required=True)
    g.add_argument("--iters", type=int, default=6)
    g.set_defaults(fn=cmd_grab)
    k = sub.add_parser("pick")
    k.add_argument("--in", dest="in_", required=True)
    k.add_argument("--src")
    k.add_argument("--ffmpeg", required=True)
    k.add_argument("--ffprobe", required=True)
    k.add_argument("--count", type=int, default=6)
    k.add_argument("--step", type=float, default=0.5)
    k.set_defaults(fn=cmd_pick)
    h = sub.add_parser("sheet")
    h.add_argument("--out", required=True)
    h.add_argument("--items", required=True)
    h.add_argument("--cell", type=int, default=360)
    h.set_defaults(fn=cmd_sheet)
    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
