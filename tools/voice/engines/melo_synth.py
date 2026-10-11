"""
engines/melo_synth.py  -  MeloTTS batch synthesis for `rcg voice say --engine melo`.

Runs under the Python named by config bin.meloPython (an environment with the `melotts`
package, torch and the MeloTTS weights already cached), NOT the voice venv: the voice venv
deliberately has no torch. voice_cli.py writes a spec file, runs this script once for all
Melo lines of a job (the model and its BERT tokenizers load once: about 80 s cold), then does
the rest of the pipeline (effects, skip silences, word timing) in the voice venv as usual.

    <meloPython> -I melo_synth.py <spec.json>
    spec: {"language": "EN", "device": "cpu", "allow_download": false,
           "items": [{"text": "...", "out": "<abs path>.wav", "speaker": "EN-US", "speed": 1.0}]}

Prints one JSON line: {"ok": true, "speakers": {...}, "items": [{"out", "seconds"}], "load_s"}.

Offline by default: HF_HUB_OFFLINE / TRANSFORMERS_OFFLINE are set unless allow_download, so a
missing model fails with a clear message instead of downloading (workspace rule: ask first).
Learned from the TTS app's engines/melo_engine.py (AditsVoiceStudio); written fresh here.
"""

import json
import os
import sys
import time


def main():
    spec = json.loads(open(sys.argv[1], encoding="utf-8-sig").read())
    if not spec.get("allow_download"):
        os.environ["HF_HUB_OFFLINE"] = "1"
        os.environ["TRANSFORMERS_OFFLINE"] = "1"
    t0 = time.time()
    try:
        import nltk
        for res in ("taggers/averaged_perceptron_tagger_eng", "corpora/cmudict"):
            nltk.data.find(res)
    except LookupError as e:
        raise SystemExit(f"MeloTTS needs NLTK data that is not installed ({e}). Ask the user before downloading it.")
    try:
        from melo.api import TTS
    except Exception as e:
        raise SystemExit(f"MeloTTS is not importable in this Python ({sys.executable}): {e}")
    try:
        model = TTS(language=spec.get("language", "EN"), device=spec.get("device", "cpu"))
    except Exception as e:
        raise SystemExit(f"MeloTTS could not load language {spec.get('language', 'EN')} offline: {e}. "
                         "The weights are not cached; ask the user before allowing a download.")
    load_s = round(time.time() - t0, 1)
    speakers = dict(model.hps.data.spk2id)
    out = []
    for it in spec["items"]:
        spk = it.get("speaker") or "EN-US"
        # MeloTTS names the Indian English speaker EN_INDIA; accept either spelling.
        if spk not in speakers and spk.replace("-", "_") in speakers:
            spk = spk.replace("-", "_")
        if spk not in speakers:
            raise SystemExit(f"Melo speaker '{spk}' is not in {list(speakers)}")
        t = time.time()
        model.tts_to_file(it["text"], speakers[spk], it["out"], speed=float(it.get("speed", 1.0)), quiet=True)
        if not os.path.exists(it["out"]):
            raise SystemExit(f"MeloTTS wrote no file for: {it['text'][:60]}")
        out.append({"out": it["out"], "speaker": spk, "seconds": round(time.time() - t, 1)})
    sys.stdout.write(json.dumps({"ok": True, "speakers": speakers, "items": out, "load_s": load_s}) + "\n")


if __name__ == "__main__":
    main()
