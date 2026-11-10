"""
engines/seedvc_local.py  -  cloned voices from library/voices for `rcg voice say --clone <slug>`.

Runs under the cloned-voice venv (config paths.voiceCloneVenv, Python 3.11 + torch) with a
Seed-VC checkout (config paths.seedvcRepo, GPL-3.0, downloaded per machine, see SETUP.md) put on
sys.path. Seed-VC's own inference.load_models() and crossfade() do the work; nothing from Seed-VC
is copied here. No AditsVoiceStudio code is needed.

    <python> -I seedvc_local.py <spec.json>
    spec: {"repo": "<seed-vc folder>",
           "items": [{"in": "<abs>.wav", "out": "<abs>.wav", "slug": "ifty",
                      "ref": "<abs>/reference.wav", "diffusion_steps": 50}]}
    <python> -I seedvc_local.py --fetch <seed-vc folder>     one-time weight download (needs a yes)

Normal runs are offline (HF_HUB_OFFLINE): missing weights are an error, never a silent download.
All items run in one process, so the model loads once.
Prints one JSON line: {"ok": true, "items": [{"out", "slug", "mode", "seconds"}], "first_done_s", "device"}.
"""

import json
import os
import sys
import time

MAX_REF_SECONDS = 25
CFG_RATE = 0.7
HOP = 256
OVERLAP_FRAMES = 16
WHISPER_WINDOW_S = 30
WHISPER_OVERLAP_S = 5


def open_seedvc(repo, offline=True):
    """Import Seed-VC's inference module from the checkout. Its paths are relative to the cwd."""
    repo = os.path.abspath(repo)
    if not os.path.isfile(os.path.join(repo, "inference.py")):
        raise SystemExit(f"Not a Seed-VC checkout: {repo} (SETUP.md, section 'Cloned voices')")
    os.chdir(repo)
    os.environ["HF_HUB_CACHE"] = os.path.join(repo, "checkpoints", "hf_cache")
    if offline:
        os.environ["HF_HUB_OFFLINE"] = "1"
    sys.path.insert(0, repo)
    import inference as svc
    return svc


def load(svc):
    from types import SimpleNamespace
    args = SimpleNamespace(fp16=False, f0_condition=False, checkpoint=None, config=None)
    try:
        model, semantic_fn, _f0, vocoder_fn, campplus, to_mel, mel_args = svc.load_models(args)
    except Exception as e:
        raise SystemExit(f"Seed-VC weights did not load ({type(e).__name__}: {e}). If they are not downloaded "
                         "yet, run the --fetch step in SETUP.md, section 'Cloned voices'.")
    return dict(model=model, semantic_fn=semantic_fn, vocoder_fn=vocoder_fn, campplus=campplus,
                to_mel=to_mel, sr=mel_args["sampling_rate"])


def reference(svc, m, path):
    """Mel, style vector and prompt condition of the reference clip (first 25 s)."""
    import librosa
    import torch
    import torchaudio
    sr = m["sr"]
    ref = librosa.load(path, sr=sr)[0][: sr * MAX_REF_SECONDS]
    ref = torch.tensor(ref).unsqueeze(0).float().to(svc.device)
    ref16 = torchaudio.functional.resample(ref, sr, 16000)
    mel2 = m["to_mel"](ref.float())
    feat = torchaudio.compliance.kaldi.fbank(ref16, num_mel_bins=80, dither=0, sample_frequency=16000)
    style2 = m["campplus"]((feat - feat.mean(dim=0, keepdim=True)).unsqueeze(0))
    prompt, *_ = m["model"].length_regulator(m["semantic_fn"](ref16), n_quantizers=3, f0=None,
                                             ylens=torch.LongTensor([mel2.size(2)]).to(mel2.device))
    return mel2, style2, prompt


def content(m, wav16):
    """Whisper content features, in 30 s windows with 5 s of overlap for longer lines."""
    import torch
    if wav16.size(-1) <= 16000 * WHISPER_WINDOW_S:
        return m["semantic_fn"](wav16)
    parts, tail, pos = [], None, 0
    while pos < wav16.size(-1):
        if tail is None:
            chunk = wav16[:, pos:pos + 16000 * WHISPER_WINDOW_S]
        else:
            chunk = torch.cat([tail, wav16[:, pos:pos + 16000 * (WHISPER_WINDOW_S - WHISPER_OVERLAP_S)]], dim=-1)
        s = m["semantic_fn"](chunk)
        parts.append(s if pos == 0 else s[:, 50 * WHISPER_OVERLAP_S:])
        tail = chunk[:, -16000 * WHISPER_OVERLAP_S:]
        pos += 16000 * WHISPER_WINDOW_S if pos == 0 else chunk.size(-1) - 16000 * WHISPER_OVERLAP_S
    return torch.cat(parts, dim=1)


def convert(svc, m, ref, src, out, steps):
    import librosa
    import numpy as np
    import soundfile as sf
    import torch
    import torchaudio
    sr = m["sr"]
    mel2, style2, prompt = ref
    overlap_wave = OVERLAP_FRAMES * HOP
    window = sr // HOP * WHISPER_WINDOW_S - mel2.size(2)   # frames of new speech per diffusion pass
    with torch.no_grad():
        audio = torch.tensor(librosa.load(src, sr=sr)[0]).unsqueeze(0).float().to(svc.device)
        s_alt = content(m, torchaudio.functional.resample(audio, sr, 16000))
        mel = m["to_mel"](audio.float())
        cond, *_ = m["model"].length_regulator(s_alt, n_quantizers=3, f0=None,
                                               ylens=torch.LongTensor([mel.size(2)]).to(mel.device))
        pieces, prev, done = [], None, 0
        while done < cond.size(1):
            last = done + window >= cond.size(1)
            cat = torch.cat([prompt, cond[:, done:done + window]], dim=1)
            mel_out = m["model"].cfm.inference(cat, torch.LongTensor([cat.size(1)]).to(mel2.device),
                                               mel2, style2, None, steps, inference_cfg_rate=CFG_RATE)
            mel_out = mel_out[:, :, mel2.size(-1):]
            wave = m["vocoder_fn"](mel_out.float()).squeeze().cpu().numpy()
            body = wave if last else wave[:-overlap_wave]
            pieces.append(body if prev is None else svc.crossfade(prev, body.copy(), overlap_wave))
            if last:
                break
            prev = wave[-overlap_wave:]
            done += mel_out.size(2) - OVERLAP_FRAMES
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    sf.write(out, np.concatenate(pieces).astype(np.float32), sr, subtype="PCM_16")


def main():
    if sys.argv[1] == "--fetch":
        svc = open_seedvc(sys.argv[2], offline=False)
        load(svc)
        sys.stdout.write(json.dumps({"ok": True, "fetched": os.path.join(os.getcwd(), "checkpoints")}) + "\n")
        return
    spec = json.loads(open(sys.argv[1], encoding="utf-8-sig").read())
    for it in spec["items"]:
        for p in (it["in"], it["ref"]):
            if not os.path.isfile(p):
                raise SystemExit(f"File not found: {p}")
    t0 = time.time()
    svc = open_seedvc(spec["repo"])
    m = load(svc)
    refs, out, first = {}, [], None
    for it in spec["items"]:
        t = time.time()
        if it["ref"] not in refs:
            refs[it["ref"]] = reference(svc, m, it["ref"])
        convert(svc, m, refs[it["ref"]], it["in"], it["out"], int(it["diffusion_steps"]))
        if not os.path.isfile(it["out"]):
            raise SystemExit(f"Seed-VC wrote no file for {it['in']}")
        if first is None:
            first = round(time.time() - t0, 1)
        out.append({"out": it["out"], "slug": it["slug"], "mode": "seedvc", "seconds": round(time.time() - t, 1)})
    sys.stdout.write(json.dumps({"ok": True, "items": out, "first_done_s": first, "device": str(svc.device)}) + "\n")


if __name__ == "__main__":
    main()
