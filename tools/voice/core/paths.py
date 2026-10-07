"""
core/paths.py (rapidContentGen shim)
────────────────────────────────────
Replaces the TTS app's core/paths.py (ported, see docs/PROVENANCE.md).

The copied Kokoro adapter asks bundle_dir() for its weights. Here that is the
workspace models folder (config paths.models, passed in by voice_cli.py through
RCG_MODELS_DIR). rapidContentGen never runs as a frozen app, so the installer
logic of the original is gone.
"""

import os
from pathlib import Path

FROZEN = False

# tools/voice/core/paths.py -> repo root is three levels up from tools/voice/core
_REPO_ROOT = Path(__file__).resolve().parents[3]


def bundle_dir() -> Path:
    models = os.environ.get("RCG_MODELS_DIR")
    return Path(models) if models else _REPO_ROOT / "models"


def user_dir(name: str) -> Path:
    d = bundle_dir() / name
    d.mkdir(parents=True, exist_ok=True)
    return d


def ascii_path(path) -> str:
    """espeak-ng cannot open data through a non-ASCII path. The original makes an
    ASCII copy under ProgramData; this workspace's paths are ASCII, so warn instead."""
    path = str(path)
    if not path.isascii():
        print(f"warning: non-ASCII path may break espeak-ng: {path}")
    return path
