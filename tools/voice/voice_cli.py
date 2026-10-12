"""
voice_cli.py
────────────
Headless voiceover for rapidContentGen. Run it with the voice venv:

    tools/voice/.venv/Scripts/python.exe tools/voice/voice_cli.py <command> ...

Commands
  voices   [--engine melo]      Kokoro languages and voices, or the MeloTTS speakers (JSON)
  effects                       Voice effects (JSON)
  say      --text "..." | --script file.txt | --lines lines.json
           --out-dir <dir> [--id vo] [--voice af_heart] [--lang a] [--speed 1.0]
           [--engine kokoro|melo] [--effect cinematic ...] [--eq bass,mids,treble]
           [--ambiance NAME|file] [--ambiance-volume 0.3] [--skip-silences] [--no-normalize]
           [--no-words] [--meta <dir>/audio_meta.json]
  transcribe <audio> [--out words.json] [--srt out.srt] [--model base]
  transcribe-cut <media> --out words.json [--model base] [--lang en] [--clips a-b,a-b]
                                  Raw-take words for rcg cut: fillers and restarts kept
  selftest

Engines: kokoro (default, local ONNX in the voice venv) or melo (MeloTTS, run in the Python
named by config bin.meloPython; see engines/melo_synth.py). With melo, --voice is the speaker
(EN-US, EN-BR, EN_INDIA, EN-AU, EN-Default) and --lang the Melo language (EN). A line in
--lines may set its own "engine". All Melo lines are made in one process (the model loads once).

Cloned voices: --clone <slug> (or a line's "clone"; --clone-steps / "clone_steps" for Seed-VC,
--clone-pitch / "clone_pitch" for RVC) converts the voice with one of AditsVoiceStudio's cloned
voices, called in place (engines/clone_bridge.py, config voiceStudio.root / .python). Order as in
the app: silence removal -> cloned voice -> other effects -> EQ -> ambiance -> normalize; word times
come from the final file. All cloned lines go through one worker run.

`say` writes <id>.wav per line and merges entries into audio_meta.json in the same
shape HyperFrames' audio engine uses:
    {"voices": [{"id", "path", "duration_s", "words": [{"text","start","end"}]}],
     "total_duration_s": ...}
Word times come from faster-whisper, aligned back onto the SCRIPT's own words, so
captions show the script's spelling and punctuation with measured timing.

Kokoro engine, effects and DSP are copied from AditsVoiceStudio (formerly the TTS app,
`tts_app modular`); the post chain and the word timing are ports (docs/PROVENANCE.md). Nothing here downloads: Kokoro weights
must be in the models folder and the Whisper model must already be cached.
"""

import argparse
import difflib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
sys.path.insert(0, str(HERE))


def load_config():
    """Merge config/workspace.json with the git-ignored local overrides."""
    def read(p):
        if not p.exists():
            return {}
        return json.loads(p.read_text(encoding="utf-8-sig"))

    def merge(a, b):
        out = dict(a)
        for k, v in b.items():
            out[k] = merge(a[k], v) if isinstance(v, dict) and isinstance(a.get(k), dict) else v
        return out

    cfg = merge(read(REPO / "config" / "workspace.json"), read(REPO / "config" / "workspace.local.json"))
    models = Path(cfg.get("paths", {}).get("models") or "models")
    cfg["_models_dir"] = models if models.is_absolute() else REPO / models
    return cfg


CFG = load_config()
os.environ.setdefault("RCG_MODELS_DIR", str(CFG["_models_dir"]))


def emit(obj):
    sys.stdout.write(json.dumps(obj, indent=2, ensure_ascii=False) + "\n")


# ── Kokoro ──────────────────────────────────────────────────────────────────

def check_weights():
    m = CFG["_models_dir"]
    missing = [n for n in ("kokoro-v1.0.onnx", "voices.bin") if not (m / n).exists()]
    if missing:
        raise SystemExit(f"Kokoro weights missing in {m}: {', '.join(missing)}. "
                         "Copy them with `node tools/rcg.mjs provenance copy --source aditsVoiceStudio ...`; "
                         "this tool never downloads.")


_ENGINE = None


def engine():
    global _ENGINE
    if _ENGINE is None:
        check_weights()
        from engines.kokoro_engine import KokoroEngine
        _ENGINE = KokoroEngine()
    return _ENGINE


def synth(text, out_wav, voice, lang, speed):
    from core.constants import KOKORO_VOICES
    if lang not in KOKORO_VOICES:
        raise SystemExit(f"Unknown language code '{lang}'. Run `voices`.")
    if voice not in KOKORO_VOICES[lang]:
        raise SystemExit(f"Voice '{voice}' is not in language '{lang}'. Run `voices`.")
    with tempfile.TemporaryDirectory(prefix="rcg_tts_") as tmp:
        res = engine().synthesize(text, tmp, device="cpu", status_cb=None,
                                  check_cancel=lambda: False, voice_key=voice,
                                  kokoro_lang_code=lang, kokoro_speed=float(speed))
        if not res.get("playback_file"):
            raise RuntimeError("Kokoro returned no audio.")
        # shutil.move, not os.replace: temp (C:) and the job (E:) can be different drives.
        shutil.move(res["playback_file"], out_wav)
    return out_wav


# ── MeloTTS (separate Python, see engines/melo_synth.py) ───────────────────

MELO_SPEAKERS = ["EN-US", "EN-BR", "EN_INDIA", "EN-AU", "EN-Default"]


def melo_python():
    py = (CFG.get("bin") or {}).get("meloPython")
    if not py:
        raise SystemExit("--engine melo needs bin.meloPython in config/workspace.local.json: a Python with the "
                         "melotts package and its weights cached (for example AditsVoiceStudio's venv_311).")
    if not Path(py).exists():
        raise SystemExit(f"bin.meloPython not found: {py}")
    return py


def melo_batch(jobs, lang="EN"):
    """jobs: [{"text", "out", "speaker", "speed"}]. One process, the model loads once."""
    if not jobs:
        return {}
    with tempfile.TemporaryDirectory(prefix="rcg_melo_") as tmp:
        spec = Path(tmp) / "spec.json"
        spec.write_text(json.dumps({"language": lang, "device": "cpu", "items": jobs}), encoding="utf-8")
        script = HERE / "engines" / "melo_synth.py"
        # Run from the temp folder with -I so nothing from the job or repo shadows a module.
        proc = subprocess.run([melo_python(), "-I", str(script), str(spec)], cwd=tmp, capture_output=True,
                              text=True, encoding="utf-8", errors="replace")
    if proc.returncode != 0:
        tail = (proc.stderr or proc.stdout or "").strip().splitlines()[-6:]
        raise SystemExit("MeloTTS failed:\n" + "\n".join(tail))
    return json.loads(proc.stdout.strip().splitlines()[-1])


# ── Whisper word timing ────────────────────────────────────────────────────

_WHISPER = None


def whisper(model_name="base"):
    global _WHISPER
    if _WHISPER is None:
        from faster_whisper import WhisperModel
        try:
            _WHISPER = WhisperModel(model_name, device="cpu", compute_type="int8", local_files_only=True)
        except Exception as e:
            raise SystemExit(f"Whisper model '{model_name}' is not cached locally ({e}). "
                             "Ask the user before downloading it.")
    return _WHISPER


def transcribe_words(audio, model_name="base", language=None):
    segments, info = whisper(model_name).transcribe(audio, word_timestamps=True, language=language)
    words = []
    for seg in segments:
        for w in seg.words or []:
            t = w.word.strip()
            if t:
                words.append({"text": t, "start": round(float(w.start), 3), "end": round(float(w.end), 3),
                              "probability": round(float(getattr(w, "probability", 0.0)), 3)})
    return words, getattr(info, "language", None)


# ── Cut transcription (rcg cut) ────────────────────────────────────────────
# Settings ported from ai-video-editor's cut transcriber (docs/PROVENANCE.md): a raw take is full
# of retakes, fillers and long pauses, and plain Whisper tidies those away.
#   initial_prompt with fillers: Whisper writes the ums and restarts down instead of dropping them.
#   condition_on_previous_text=False: with it on, a repeated line tends to merge into one, and
#     repeated lines are exactly the retakes.
#   vad_filter (500 ms): without it, word times drift after a long silence.
# --clips re-transcribes short stretches on their own (no VAD: the stretch is speech). rcg cut
# uses it for a word label that holds far more speech than its word (tools/cut/transcribe.mjs).

CUT_PROMPT = "Umm, so, uh, like, I mean, you know, um, so, wait, sorry, let me say that again."


def _cut_words(segments):
    return [{"text": w.word.strip(), "start": round(float(w.start), 3), "end": round(float(w.end), 3),
             "probability": round(float(getattr(w, "probability", 0.0)), 3)}
            for s in segments for w in (s.words or []) if w.word.strip()]


def cmd_transcribe_cut(args):
    from faster_whisper import decode_audio
    model = whisper(args.model)
    audio = decode_audio(args.media, sampling_rate=16000)
    lang = args.lang or None
    opts = dict(word_timestamps=True, initial_prompt=CUT_PROMPT, beam_size=5, condition_on_previous_text=False)
    t0 = time.time()
    if args.clips:
        clips = []
        for part in args.clips.split(","):
            a, b = (float(x) for x in part.split("-"))
            segs, _ = model.transcribe(audio, language=lang, clip_timestamps=[a, b], **opts)
            clips.append({"start": a, "end": b,
                          "words": [w for w in _cut_words(segs) if w["start"] >= a - 0.05 and w["end"] <= b + 0.05]})
        out = {"media": args.media, "model": args.model, "clips": clips}
    else:
        segs, info = model.transcribe(audio, language=lang, vad_filter=True,
                                      vad_parameters={"min_silence_duration_ms": 500}, **opts)
        words = _cut_words(segs)
        out = {"media": args.media, "model": args.model, "language": getattr(info, "language", None),
               "duration_s": round(len(audio) / 16000, 3), "words": words}
    out["seconds_to_transcribe"] = round(time.time() - t0, 2)
    Path(args.out).write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    emit({"out": args.out, "words": len(out.get("words", [])), "clips": len(out.get("clips", [])),
          "language": out.get("language"), "seconds_to_transcribe": out["seconds_to_transcribe"]})


_norm = lambda s: re.sub(r"[^\w']+", "", s.lower())


def align_to_script(script, heard, duration):
    """Give every word of *script* a time, using whisper's *heard* words.

    Matching runs on normalized tokens (difflib). Script words whisper did not hear
    exactly get times interpolated between their matched neighbours, weighted by
    character length. Returns (words, matched_fraction).
    """
    tokens = [t for t in re.findall(r"\S+", script) if _norm(t)]
    if not tokens:
        return [], 1.0
    a = [_norm(t) for t in tokens]
    b = [_norm(w["text"]) for w in heard]
    times = [None] * len(tokens)
    sm = difflib.SequenceMatcher(a=a, b=b, autojunk=False)
    for block in sm.get_matching_blocks():
        for k in range(block.size):
            h = heard[block.b + k]
            times[block.a + k] = (h["start"], h["end"])
    matched = sum(1 for t in times if t) / len(tokens)

    # Fill gaps: spread unmatched runs between the surrounding known times.
    i = 0
    while i < len(tokens):
        if times[i]:
            i += 1
            continue
        j = i
        while j < len(tokens) and not times[j]:
            j += 1
        left = times[i - 1][1] if i > 0 else 0.0
        right = times[j][0] if j < len(tokens) else max(left, duration)
        span = max(0.0, right - left)
        weights = [max(1, len(a[k])) for k in range(i, j)]
        total = float(sum(weights))
        t = left
        for k, wgt in zip(range(i, j), weights):
            d = span * wgt / total
            times[k] = (round(t, 3), round(t + d, 3))
            t += d
        i = j

    words = []
    prev_end = 0.0
    for tok, (s, e) in zip(tokens, times):
        s = max(s, prev_end)
        e = max(e, s + 0.01)
        words.append({"text": tok, "start": round(s, 3), "end": round(e, 3)})
        prev_end = e
    return words, round(matched, 3)


def srt_time(sec):
    ms = int(round(sec * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


SMALL_WORDS = {"a", "an", "the", "and", "or", "but", "to", "of", "in", "on", "at", "for", "with", "by", "my", "your", "our", "is"}


def write_srt(words, path, phrase_chars=32):
    """Phrase-level SRT: break on sentence punctuation, pauses > 0.5 s, or length.
    A cue broken for length never ends on a small connecting word ("... and a");
    that word moves to the next cue (same rule as tools/blocks/captions.mjs)."""
    cues, cur = [], []
    for w in words:
        if cur:
            text = " ".join(x["text"] for x in cur)
            natural = cur[-1]["text"][-1:] in ".?!" or w["start"] - cur[-1]["end"] > 0.5
            if natural or len(text) + 1 + len(w["text"]) > phrase_chars:
                carry = []
                if not natural:
                    while len(cur) > 1 and re.sub(r"[^\w']", "", cur[-1]["text"].lower()) in SMALL_WORDS:
                        carry.insert(0, cur.pop())
                cues.append(cur)
                cur = carry
        cur.append(w)
    if cur:
        cues.append(cur)
    with open(path, "w", encoding="utf-8") as f:
        for i, c in enumerate(cues, 1):
            f.write(f"{i}\n{srt_time(c[0]['start'])} --> {srt_time(c[-1]['end'])}\n{' '.join(x['text'] for x in c)}\n\n")
    return len(cues)


# ── Commands ───────────────────────────────────────────────────────────────

def cmd_voices(args):
    if getattr(args, "engine", "kokoro") == "melo":
        emit({"EN": {"language": "English (MeloTTS)", "voices": MELO_SPEAKERS}})
        return
    from core.constants import KOKORO_LANGS, KOKORO_VOICES
    by_code = {code: name for name, code in KOKORO_LANGS.items()}
    emit({code: {"language": by_code.get(code, code), "voices": list(v.keys())} for code, v in KOKORO_VOICES.items()})


def cmd_effects(_args):
    from pipeline import AMBIANCES, effect_list
    emit({"effects": effect_list(), "ambiances": list(AMBIANCES) + ["<path to an audio file>"]})


def parse_eq(s):
    if not s:
        return None
    parts = [float(x) for x in s.split(",")]
    if len(parts) != 3:
        raise SystemExit("--eq takes bass,mids,treble in dB, e.g. 2,0,-1")
    return tuple(parts)


def line_engine(line, args):
    """(engine, voice, lang) for a line; Kokoro's defaults map to Melo's under --engine melo."""
    engine_name = line.get("engine", getattr(args, "engine", "kokoro"))
    if engine_name not in ("kokoro", "melo"):
        raise SystemExit(f"Unknown engine '{engine_name}' (kokoro or melo)")
    voice = line.get("voice", args.voice)
    lang = line.get("lang", args.lang)
    if engine_name == "melo":
        voice = "EN-US" if voice in (None, "af_heart") else voice
        lang = "EN" if lang in (None, "a") else lang
    return engine_name, voice, lang


def clone_of(line, args):
    """(slug, diffusion_steps, pitch) when the line goes through a cloned voice, else None."""
    slug = line.get("clone", getattr(args, "clone", None))
    if not slug:
        return None
    return slug, line.get("clone_steps", getattr(args, "clone_steps", None)), line.get("clone_pitch", getattr(args, "clone_pitch", None))


def voice_studio():
    vs = CFG.get("voiceStudio") or {}
    root = vs.get("root")
    py = vs.get("python") or (CFG.get("bin") or {}).get("meloPython")
    if not root or not py:
        raise SystemExit("--clone needs voiceStudio.root and voiceStudio.python (or bin.meloPython) in "
                         "config/workspace.local.json: the AditsVoiceStudio folder and its venv's python.")
    for p in (root, py):
        if not Path(p).exists():
            raise SystemExit(f"voiceStudio path not found: {p}")
    return root, py


def clone_batch(items):
    """items: [{"in", "out", "slug", "diffusion_steps", "pitch"}]. One process: the worker loads once."""
    root, py = voice_studio()
    with tempfile.TemporaryDirectory(prefix="rcg_clone_") as tmp:
        spec = Path(tmp) / "spec.json"
        spec.write_text(json.dumps({"root": root, "items": items}), encoding="utf-8")
        proc = subprocess.run([py, "-I", str(HERE / "engines" / "clone_bridge.py"), str(spec)], cwd=tmp,
                              capture_output=True, text=True, encoding="utf-8", errors="replace")
    if proc.returncode != 0:
        tail = (proc.stderr or proc.stdout or "").strip().splitlines()[-6:]
        raise SystemExit("Cloned voice failed:\n" + "\n".join(tail))
    return json.loads(proc.stdout.strip().splitlines()[-1])


def say_line(line, args, out_dir, raw_ready=False, raw_path=None, cloned=None):
    """raw_path: an already converted file (cloned voice); silences were removed before conversion."""
    from pipeline import process
    lid = line["id"]
    text = line["text"].strip()
    engine_name, voice, lang = line_engine(line, args)
    speed = float(line.get("speed", args.speed))
    effects = line.get("effects", args.effect or [])
    raw = Path(raw_path) if raw_path else out_dir / f"{lid}.raw.wav"
    final = out_dir / f"{lid}.wav"
    t0 = time.time()
    if not raw_ready and not raw_path:
        synth(text, str(raw), voice, lang, speed)
    proc = process(str(raw), str(final), speed=1.0, effects=effects, eq=parse_eq(args.eq),
                   ambiance=args.ambiance, ambiance_volume=args.ambiance_volume,
                   skip_silences=args.skip_silences and not cloned, normalize=not args.no_normalize)
    raw.unlink(missing_ok=True)
    applied = proc["applied"]
    if cloned:
        # The app's order: silence removal -> speed -> cloned voice -> other effects -> EQ -> ambiance -> normalize.
        applied = (["skip_silences"] if args.skip_silences else []) + [f"clone {cloned['slug']} ({cloned['mode']})"] + applied
    entry = {"id": lid, "path": final.name, "text": text, "engine": engine_name, "voice": voice, "lang": lang,
             "speed": speed, "duration_s": proc["duration_s"], "processing": applied}
    if cloned:
        entry["clone"] = cloned["slug"]
    if not args.no_words:
        heard, _ = transcribe_words(str(final), language=None)
        words, matched = align_to_script(text, heard, proc["duration_s"])
        entry["words"] = words
        entry["alignment"] = {"matched_fraction": matched, "script_words": len(words), "heard_words": len(heard)}
        entry["srt"] = f"{lid}.srt"
        write_srt(words, out_dir / entry["srt"])
    entry["seconds_to_make"] = round(time.time() - t0, 1)
    return entry


def cmd_say(args):
    out_dir = Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    if args.lines:
        lines = json.loads(Path(args.lines).read_text(encoding="utf-8-sig"))
    else:
        text = args.text if args.text else Path(args.script).read_text(encoding="utf-8-sig") if args.script else None
        if not text or not text.strip():
            raise SystemExit("say needs --text, --script or --lines")
        lines = [{"id": args.id, "text": text}]
    # Melo lines first, in one process (its model takes about 80 s to load), grouped by language.
    melo = {}
    for l in lines:
        engine_name, voice, lang = line_engine(l, args)
        if engine_name == "melo":
            melo.setdefault(lang, []).append({"text": l["text"].strip(), "out": str(out_dir / f"{l['id']}.raw.wav"),
                                              "speaker": voice, "speed": float(l.get("speed", args.speed))})
    for lang, jobs in melo.items():
        res = melo_batch(jobs, lang)
        sys.stderr.write(f"MeloTTS {lang}: {len(jobs)} line(s), model load {res.get('load_s')} s\n")
    # Cloned voices (AditsVoiceStudio, called in place): silences out first, then every cloned line
    # in one worker run, then the rest of the chain on the converted audio.
    cloned = {}
    clone_items = []
    for l in lines:
        c = clone_of(l, args)
        if not c:
            continue
        from pipeline import process
        lid = l["id"]
        raw = out_dir / f"{lid}.raw.wav"
        if line_engine(l, args)[0] != "melo":
            e, v, lg = line_engine(l, args)
            synth(l["text"].strip(), str(raw), v, lg, float(l.get("speed", args.speed)))
        stage = out_dir / f"{lid}.stage.wav"
        process(str(raw), str(stage), speed=1.0, effects=[], skip_silences=args.skip_silences, normalize=False)
        raw.unlink(missing_ok=True)
        clone_items.append({"in": str(stage), "out": str(out_dir / f"{lid}.clone.wav"), "slug": c[0],
                            "diffusion_steps": c[1], "pitch": c[2]})
    if clone_items:
        t = time.time()
        res = clone_batch(clone_items)
        for it, r in zip(clone_items, res["items"]):
            Path(it["in"]).unlink(missing_ok=True)
            cloned[Path(it["out"]).name.replace(".clone.wav", "")] = r
        sys.stderr.write(f"Cloned voice: {len(clone_items)} line(s) in {round(time.time() - t, 1)} s "
                         f"(first ready after {res.get('first_done_s')} s)\n")
    entries = []
    for l in lines:
        c = cloned.get(l["id"])
        if c:
            entries.append(say_line(l, args, out_dir, raw_path=str(out_dir / f"{l['id']}.clone.wav"), cloned=c))
        else:
            entries.append(say_line(l, args, out_dir, raw_ready=line_engine(l, args)[0] == "melo"))

    meta_path = Path(args.meta).resolve() if args.meta else out_dir / "audio_meta.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8-sig")) if meta_path.exists() else {"voices": []}
    keep = [v for v in meta.get("voices", []) if v["id"] not in {e["id"] for e in entries}]
    meta["voices"] = keep + entries
    meta["total_duration_s"] = round(sum(v.get("duration_s", 0) for v in meta["voices"]), 3)
    meta_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    emit({"meta": str(meta_path), "voices": entries})


def cmd_transcribe(args):
    words, lang = transcribe_words(args.audio, args.model)
    out = {"audio": args.audio, "language": lang, "words": words}
    if args.out:
        Path(args.out).write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    if args.srt:
        write_srt(words, args.srt)
    emit({"words": len(words), "language": lang, "out": args.out, "srt": args.srt})


def cmd_selftest(_args):
    text = "Every great edit starts with one clear idea, and a voice that carries it."
    with tempfile.TemporaryDirectory(prefix="rcg_selftest_") as tmp:
        ns = argparse.Namespace(voice="af_heart", lang="a", speed=1.0, effect=[], eq=None, ambiance=None,
                                ambiance_volume=0.3, skip_silences=False, no_normalize=False, no_words=False)
        entry = say_line({"id": "selftest", "text": text}, ns, Path(tmp))
    checks = {
        "audio_seconds_positive": entry["duration_s"] > 1.0,
        "word_count_matches_script": len(entry["words"]) == len(text.split()),
        "words_increasing": all(entry["words"][i]["start"] <= entry["words"][i + 1]["start"] for i in range(len(entry["words"]) - 1)),
        "words_inside_clip": entry["words"][-1]["end"] <= entry["duration_s"] + 0.05,
        "alignment_at_least_80pct": entry["alignment"]["matched_fraction"] >= 0.8,
    }
    emit({"ok": all(checks.values()), "checks": checks, "duration_s": entry["duration_s"],
          "alignment": entry["alignment"], "seconds_to_make": entry["seconds_to_make"],
          "first_words": entry["words"][:4]})
    sys.exit(0 if all(checks.values()) else 1)


def main():
    p = argparse.ArgumentParser(prog="voice_cli.py", description="rapidContentGen voiceover tools")
    sub = p.add_subparsers(dest="cmd", required=True)
    v = sub.add_parser("voices")
    v.add_argument("--engine", default="kokoro", choices=["kokoro", "melo"])
    v.set_defaults(fn=cmd_voices)
    sub.add_parser("effects").set_defaults(fn=cmd_effects)
    s = sub.add_parser("say")
    src = s.add_mutually_exclusive_group(required=True)
    src.add_argument("--text")
    src.add_argument("--script")
    src.add_argument("--lines", help='JSON list: [{"id","text", optional "voice","lang","speed","effects"}]')
    s.add_argument("--out-dir", required=True)
    s.add_argument("--id", default="vo")
    s.add_argument("--voice", default="af_heart")
    s.add_argument("--lang", default="a")
    s.add_argument("--speed", type=float, default=1.0)
    s.add_argument("--engine", default="kokoro", choices=["kokoro", "melo"])
    s.add_argument("--clone", help="an AditsVoiceStudio cloned voice (slug), applied before the other effects")
    s.add_argument("--clone-steps", type=int, help="Seed-VC diffusion steps (default: the voice's own, 10)")
    s.add_argument("--clone-pitch", type=int, help="RVC pitch shift in semitones (default: the voice's own)")
    s.add_argument("--effect", action="append")
    s.add_argument("--eq")
    s.add_argument("--ambiance")
    s.add_argument("--ambiance-volume", type=float, default=0.3)
    s.add_argument("--skip-silences", action="store_true")
    s.add_argument("--no-normalize", action="store_true")
    s.add_argument("--no-words", action="store_true")
    s.add_argument("--meta")
    s.set_defaults(fn=cmd_say)
    t = sub.add_parser("transcribe")
    t.add_argument("audio")
    t.add_argument("--out")
    t.add_argument("--srt")
    t.add_argument("--model", default="base")
    t.set_defaults(fn=cmd_transcribe)
    tc = sub.add_parser("transcribe-cut")
    tc.add_argument("media")
    tc.add_argument("--out", required=True)
    tc.add_argument("--model", default="base")
    tc.add_argument("--lang")
    tc.add_argument("--clips", help="a-b,a-b seconds: transcribe only these stretches")
    tc.set_defaults(fn=cmd_transcribe_cut)
    sub.add_parser("selftest").set_defaults(fn=cmd_selftest)
    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
