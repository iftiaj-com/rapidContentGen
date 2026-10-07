"""
pipeline.py
───────────
Voice post-processing chain, ported from the TTS app's
ui/app.py TTSStudioApp._generate_worker (see docs/PROVENANCE.md), without the UI.

Order is the same as the app: silence removal -> speed -> effects -> 3-band EQ
-> ambiance -> normalize (-3 dB). Everything runs on one float32 mono array and
is written once.
"""

import numpy as np
from pydub import AudioSegment
from pydub import silence as pydub_silence

from core.audio_io import load_segment
from effects.audio_effects import AudioEffects
from effects.registry import EFFECTS_REGISTRY

EFFECTS_BY_KEY = {e["key"]: e for e in EFFECTS_REGISTRY}
# Synthesized presets in AudioEffects.add_environment_sound; any other value is
# treated as a path to an audio file to loop underneath.
AMBIANCES = ("Airplane Cabin", "Nature/Forest")


def effect_list():
    """[{key, label, desc}] with the UI emoji stripped from labels."""
    out = []
    for e in EFFECTS_REGISTRY:
        label = e["label"].split("  ")[-1].strip()
        out.append({"key": e["key"], "label": label, "desc": e.get("desc", "")})
    return out


def process(in_path, out_path, *, speed=1.0, effects=(), eq=None,
            ambiance=None, ambiance_volume=0.3, skip_silences=False,
            normalize=True, seed=0):
    """Run the chain on *in_path* and write a 16-bit mono WAV to *out_path*.

    eq: (bass_db, mids_db, treble_db) or None.
    seed: seeds numpy so noise-based effects and ambiance render the same way twice.
    Returns {"sample_rate", "duration_s", "applied": [...]}.
    """
    np.random.seed(seed)
    applied = []
    unknown = [k for k in effects if k not in EFFECTS_BY_KEY or k == "normalize"]
    if unknown:
        raise ValueError(f"Unknown effect(s): {', '.join(unknown)}. Run `voice_cli.py effects` for the list.")

    seg = load_segment(in_path)
    if skip_silences:
        chunks = pydub_silence.split_on_silence(seg, min_silence_len=200, silence_thresh=-40)
        if chunks:
            joined = chunks[0]
            for c in chunks[1:]:
                joined += c
            seg = joined
            applied.append("skip_silences")

    seg = seg.set_channels(1)
    sr = seg.frame_rate
    peak = float(2 ** (8 * seg.sample_width - 1))
    samples = np.array(seg.get_array_of_samples(), dtype=np.float32) / peak

    if abs(speed - 1.0) > 0.01:
        samples = AudioEffects.change_speed(samples, speed)
        applied.append(f"speed {speed:.2f}x")

    for key in effects:
        entry = EFFECTS_BY_KEY[key]
        fn = entry["fn"]
        kwargs = entry.get("kwargs", {})
        try:
            samples = fn(samples, sr, **kwargs)
        except TypeError:
            samples = fn(samples, **kwargs)
        applied.append(key)

    if eq:
        bass, mids, treble = eq
        samples = AudioEffects.three_band_eq(
            samples, sr, 10 ** (bass / 20.0), 10 ** (mids / 20.0), 10 ** (treble / 20.0))
        applied.append(f"eq {bass:+g}/{mids:+g}/{treble:+g} dB")

    if ambiance:
        samples = AudioEffects.add_environment_sound(samples, sr, ambiance, volume=ambiance_volume)
        applied.append(f"ambiance {ambiance} @ {ambiance_volume}")

    if normalize:
        samples = AudioEffects.normalize(samples)
        applied.append("normalize -3 dB")

    int16 = (np.clip(samples, -1.0, 1.0) * 32767.0).astype(np.int16)
    AudioSegment(data=int16.tobytes(), sample_width=2, frame_rate=sr, channels=1).export(out_path, format="wav")
    return {"sample_rate": sr, "duration_s": round(len(int16) / sr, 3), "applied": applied}
