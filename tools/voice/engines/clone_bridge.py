"""
engines/clone_bridge.py  -  AditsVoiceStudio cloned voices for `rcg voice say --clone <slug>`.

Runs under AditsVoiceStudio's own Python (config voiceStudio.python, else bin.meloPython) with
the app folder (voiceStudio.root) put on sys.path, and calls the app's voice-cloning client in
place: core.voice_cloning.library loads the voice profile, get_client().convert() starts the
app's worker in the engine's own venv (Seed-VC "Quick" or RVC, under the app's vc_runtime_data)
and converts each file. Nothing is copied from the app (GPL-3.0-or-later); this only calls it.
The worker writes its logs and temp files in the app's runtime folder, as it does in the app.

    <python> -I clone_bridge.py <spec.json>
    spec: {"root": "<AditsVoiceStudio folder>",
           "items": [{"in": "<abs>.wav", "out": "<abs>.wav", "slug": "blj-voiceover-melo",
                      "pitch": null, "diffusion_steps": null}]}

All items run in one process, so the worker (and its model) loads once per engine.
Prints one JSON line: {"ok": true, "items": [{"out", "slug", "mode", "seconds"}], "start_s"}.
"""

import json
import os
import sys
import time


def main():
    spec = json.loads(open(sys.argv[1], encoding="utf-8-sig").read())
    root = spec.get("root")
    if not root or not os.path.isdir(os.path.join(root, "core", "voice_cloning")):
        raise SystemExit(f"Not an AditsVoiceStudio folder with voice cloning: {root}")
    sys.path.insert(0, root)
    t0 = time.time()
    try:
        from core.voice_cloning import get_client, library, shutdown_client
        from core.voice_cloning.errors import VCError
    except Exception as e:
        raise SystemExit(f"AditsVoiceStudio's voice-cloning package does not import in {sys.executable}: {e}")

    out = []
    first = None
    try:
        for it in spec["items"]:
            slug = it["slug"]
            try:
                profile = library.load_voice(slug)
            except (OSError, ValueError) as e:
                ready = [p.slug for p in library.list_voices(ready_only=True)]
                raise SystemExit(f"Cloned voice '{slug}' not found ({e}). Ready voices: {', '.join(ready) or 'none'}")
            if not profile.is_ready:
                raise SystemExit(f"Cloned voice '{slug}' is not ready (status {profile.status}).")
            t = time.time()
            try:
                get_client().convert(profile, it["in"], it["out"], pitch=it.get("pitch"),
                                     diffusion_steps=it.get("diffusion_steps"))
            except VCError as e:   # its text already carries the app's hint
                raise SystemExit(f"Voice conversion failed for '{slug}': {e}")
            if not os.path.isfile(it["out"]):
                raise SystemExit(f"The {profile.mode} worker wrote no file for {it['in']}")
            if first is None:
                first = round(time.time() - t0, 1)
            out.append({"out": it["out"], "slug": slug, "mode": profile.mode, "base_engine": profile.base_engine,
                        "base_voice": profile.base_voice, "seconds": round(time.time() - t, 1)})
    finally:
        shutdown_client()
    sys.stdout.write(json.dumps({"ok": True, "items": out, "first_done_s": first}) + "\n")


if __name__ == "__main__":
    main()
