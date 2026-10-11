"""
paper_sfx.py - soft, tactile scrapbook sounds for the mix-media pack, made from filtered noise.

The SFX library had no paper sounds (the tactile-collage pack noted the gap). These are
synthesized here, so they carry no third-party rights: band-passed noise bursts, crackle grains
and short resonances shaped by envelopes. Soft and ASMR-adjacent, never cartoonish (Hi.Boly
director's bible: paper placing, pin clicking, tape peeling, sticker pressing).

Run with the voice venv (numpy, scipy, soundfile), then measure:
    tools/voice/.venv/Scripts/python.exe -I tools/audio/paper_sfx.py --out-dir library/sfx --ffmpeg <ffmpeg>
    node tools/rcg.mjs measure-sfx

Writes paper-place, pin-click, tape-peel, sticker-press and pencil-scribble as .mp3 (48 kHz
stereo, peaks near -3 dBFS) and their descriptions in manifest.made.json. Deterministic (seeded).
"""

import argparse
import json
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt

SR = 48000
RNG = np.random.default_rng(20261011)


def t_axis(sec):
    return np.arange(int(SR * sec)) / SR


def band(x, lo, hi, order=4):
    lo = max(lo, 20)
    hi = min(hi, SR / 2 - 100)
    return sosfilt(butter(order, [lo, hi], btype="band", fs=SR, output="sos"), x)


def lowp(x, hi, order=4):
    return sosfilt(butter(order, hi, btype="low", fs=SR, output="sos"), x)


def highp(x, lo, order=4):
    return sosfilt(butter(order, lo, btype="high", fs=SR, output="sos"), x)


def env_ad(n, attack, decay, at=0.0):
    """Attack-decay envelope (seconds), starting at `at`."""
    t = np.arange(n) / SR - at
    e = np.where(t < 0, 0.0, np.where(t < attack, t / max(attack, 1e-4), np.exp(-(t - attack) / max(decay, 1e-4))))
    return e


def grains(n, rate_env, dur_ms=(0.4, 1.4), lo=1500, hi=8000):
    """Crackle: short noise grains, density following rate_env (grains per second)."""
    out = np.zeros(n)
    t = 0
    while t < n:
        rate = max(rate_env[min(t, n - 1)], 1.0)
        t += int(SR * RNG.exponential(1.0 / rate))
        if t >= n:
            break
        g = int(SR * RNG.uniform(*dur_ms) / 1000)
        burst = RNG.standard_normal(g) * np.exp(-np.linspace(0, 5, g)) * RNG.uniform(0.3, 1.0)
        out[t:t + g] += burst[: max(0, min(g, n - t))]
    return band(out, lo, hi, 2)


def finish(x, peak_db=-3.0, fade_ms=8):
    f = int(SR * fade_ms / 1000)
    x = x.copy()
    x[-f:] *= np.linspace(1, 0, f)
    x[:2] *= 0.0
    return x / (np.abs(x).max() + 1e-9) * 10 ** (peak_db / 20)


def paper_place():
    n = int(SR * 0.45)
    tap = band(RNG.standard_normal(n), 300, 3200) * env_ad(n, 0.002, 0.022, 0.012)
    body = np.sin(2 * np.pi * 118 * t_axis(0.45)) * env_ad(n, 0.003, 0.04, 0.012) * 0.35
    # A short rustle, mostly discrete fibre crackle: a long noise tail reads as breath, not paper.
    rustle = band(RNG.standard_normal(n), 2200, 7000) * env_ad(n, 0.008, 0.045, 0.016) * 0.5
    crinkle = grains(n, 320 * env_ad(n, 0.01, 0.07, 0.016) + 4, (0.3, 1.0), 1800, 7500)
    return finish(tap + body + 0.4 * rustle + 0.5 * crinkle)


def pin_click():
    n = int(SR * 0.3)
    t = t_axis(0.3)
    thud = lowp(RNG.standard_normal(n), 600) * env_ad(n, 0.004, 0.028, 0.006) * 0.6
    click = highp(RNG.standard_normal(n), 2000) * env_ad(n, 0.0005, 0.003, 0.03)
    ring = sum(a * np.sin(2 * np.pi * f * t) * env_ad(n, 0.0005, d, 0.03) for f, a, d in ((3150, 0.22, 0.05), (4870, 0.15, 0.035), (6230, 0.1, 0.025)))
    return finish(thud + click + ring)


def tape_peel():
    n = int(SR * 0.58)
    t = t_axis(0.58)
    shape = np.clip(t / 0.06, 0, 1) * np.clip((0.46 - t) / 0.16, 0, 1)
    crackle = grains(n, 40 + 260 * shape, (0.35, 1.2), 1500, 8500) * (0.35 + 0.65 * shape)
    sweep = band(RNG.standard_normal(n), 3000, 9000) * shape * 0.08
    snap = highp(RNG.standard_normal(n), 1500) * env_ad(n, 0.001, 0.012, 0.47) * 0.8
    return finish(crackle + sweep + snap)


def sticker_press():
    n = int(SR * 0.36)
    thump = band(RNG.standard_normal(n), 220, 950) * env_ad(n, 0.006, 0.05, 0.01)
    rub = band(RNG.standard_normal(n), 1000, 4200) * env_ad(n, 0.02, 0.07, 0.03) * 0.3
    crinkle = grains(n, 260 * env_ad(n, 0.01, 0.06, 0.02) + 5, (0.3, 0.9), 2000, 8000) * 0.5
    return finish(thump + rub + crinkle)


def pencil_scribble():
    n = int(SR * 0.7)
    t = t_axis(0.7)
    strokes = np.abs(np.sin(2 * np.pi * (9.0 + 1.5 * np.sin(2 * np.pi * 0.9 * t)) * t)) ** 2
    graphite = band(RNG.standard_normal(n), 2000, 6500) * strokes
    graphite *= 0.5 + 0.5 * lowp(np.abs(RNG.standard_normal(n)), 60, 2) / 0.8
    grit = grains(n, np.full(n, 180.0), (0.2, 0.6), 3000, 9000) * strokes * 0.4
    fade = np.clip(t / 0.05, 0, 1) * np.clip((0.7 - t) / 0.12, 0, 1)
    return finish((graphite + grit) * fade)


SOUNDS = {
    "paper-place": (paper_place, "Soft paper set down on a cork board: a light tap and a short rustle. Pop-in of a note, a cut-out or a sheet (mix-media pack)."),
    "pin-click": (pin_click, "A push pin pressed into cork: soft thud, tiny metal click and ring. A pin, binder clip or paperclip landing (mix-media pack)."),
    "tape-peel": (tape_peel, "A strip of tape peeled and pressed: fine crackle, then a small snap at the end (about 0.47 s). Tape, washi or masking strips (mix-media pack)."),
    "sticker-press": (sticker_press, "A sticker pressed down with a finger: muffled thump and a little crinkle. Illustrated props popping in (mix-media pack)."),
    "pencil-scribble": (pencil_scribble, "Pencil or marker scribble, about 0.6 s of quick strokes. A doodle drawn on the board (mix-media pack)."),
}
LICENCE = "Made in rapidContentGen (tools/audio/paper_sfx.py, procedural noise synthesis); no third-party rights"


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--out-dir", required=True)
    p.add_argument("--ffmpeg", default="ffmpeg")
    a = p.parse_args()
    out = Path(a.out_dir)
    made_path = out / "manifest.made.json"
    made = json.loads(made_path.read_text(encoding="utf-8")) if made_path.exists() else {}
    with tempfile.TemporaryDirectory(prefix="rcg_sfx_") as tmp:
        for name, (fn, desc) in SOUNDS.items():
            x = fn()
            wav = Path(tmp) / f"{name}.wav"
            sf.write(str(wav), np.stack([x, x], axis=1).astype(np.float32), SR, subtype="FLOAT")
            subprocess.run([a.ffmpeg, "-v", "error", "-y", "-i", str(wav), "-c:a", "libmp3lame", "-b:a", "192k", str(out / f"{name}.mp3")], check=True)
            made[name] = {"description": desc, "license": LICENCE}
            print(f"{name}.mp3  {len(x) / SR:.2f} s")
    made_path.write_text(json.dumps(made, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
