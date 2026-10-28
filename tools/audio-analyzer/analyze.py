"""rcg audio-analyzer worker: describe audio files with Essentia (ONNX) and LAION-CLAP.

Called by tools/audio/audio-analyzer.mjs, never by hand:
    python -I analyze.py analyze <request.json> <result.json>
    python -I analyze.py find <request.json> <result.json>

Essentia: music mood, danceability, vocals, arousal/valence, genre, instruments (models/essentia, CC BY-NC-SA 4.0).
The mel input copies Essentia's TensorflowInputMusiCNN; checked against essentia.js to 1e-4 (2026-10 test).
CLAP: open-vocabulary tags in fixed 10 s windows, so the same file always gives the same answer
(the paper's fusion mode takes random slices). Code measures here; the agent decides with the result.
"""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

import numpy as np

SR_E, N_FFT, HOP, BANDS = 16000, 512, 256, 96   # Essentia / MusiCNN input
SR_C, WIN = 48000, 480000                        # CLAP input: mono 48 kHz, 10 s windows

# Energy guess (1-5) fitted to the user's ear-test ratings of 15 tracks (2026-10): mean error about 0.5.
ENERGY_W = (-2.357, 1.167, 1.955)  # intercept, arousal (1-9), aggressive (0-1)


def ffmpeg_mono(ffmpeg, path, sr):
    # Average the channels: ffmpeg -ac 1 reads hot (lesson 8). Mono files pass through.
    cmd = [ffmpeg, '-v', 'error', '-i', str(path), '-af', 'aresample=%d,pan=mono|c0=0.5*c0+0.5*c1' % sr, '-f', 'f32le', '-']
    out = subprocess.run(cmd, capture_output=True)
    if out.returncode != 0:  # mono input: no c1 to pan
        cmd = [ffmpeg, '-v', 'error', '-i', str(path), '-ac', '1', '-ar', str(sr), '-f', 'f32le', '-']
        out = subprocess.run(cmd, capture_output=True, check=True)
    return np.frombuffer(out.stdout, dtype='<f4').astype(np.float64)


# ---------------------------------------------------------------- Essentia (ONNX)

def _slaney(f, inverse=False):
    f_sp, lo_hz = 200.0 / 3, 1000.0
    lo_mel, step = lo_hz / f_sp, np.log(6.4) / 27.0
    f = np.asarray(f, dtype=np.float64)
    if inverse:
        return np.where(f < lo_mel, f * f_sp, lo_hz * np.exp(step * (f - lo_mel)))
    return np.where(f < lo_hz, f / f_sp, lo_mel + np.log(np.maximum(f, 1e-9) / lo_hz) / step)


def _filterbank():
    bins = np.arange(N_FFT // 2 + 1) * SR_E / N_FFT
    edges = _slaney(np.linspace(0, _slaney(SR_E / 2), BANDS + 2), inverse=True)
    fb = np.zeros((BANDS, bins.size))
    for b in range(BANDS):
        lo, mid, hi = edges[b:b + 3]
        fb[b] = np.maximum(0, np.minimum((bins - lo) / (mid - lo), (hi - bins) / (hi - mid))) * 2.0 / (hi - lo)
    return fb


FB = _filterbank()


def melspec(audio):
    padded = np.concatenate([np.zeros(N_FFT // 2), audio, np.zeros(N_FFT // 2)])  # frames centred, like FrameCutter
    count = max(1, 1 + (padded.size - N_FFT) // HOP)
    idx = np.arange(N_FFT)[None, :] + HOP * np.arange(count)[:, None]
    win = 0.5 - 0.5 * np.cos(2 * np.pi * np.arange(N_FFT) / (N_FFT - 1))
    power = np.abs(np.fft.rfft(padded[idx] * win, axis=1)) ** 2
    return np.log10(1 + 10000 * power @ FB.T).astype(np.float32)


def patches(mel, size, hop):
    if mel.shape[0] < size:
        mel = np.concatenate([mel, np.zeros((size - mel.shape[0], BANDS), np.float32)])
    return np.stack([mel[s:s + size] for s in range(0, mel.shape[0] - size + 1, hop)])


class Onnx:
    def __init__(self, folder, name):
        import onnxruntime as ort
        self.classes = json.loads((folder / f'{name}.json').read_text(encoding='utf-8'))['classes']
        self.sess = ort.InferenceSession(str(folder / f'{name}.onnx'), providers=['CPUExecutionProvider'])
        self.inp = self.sess.get_inputs()[0].name

    def run(self, x, out='activations'):  # ONNX exports name outputs 'activations' / 'embeddings'
        return self.sess.run([out], {self.inp: x.astype(np.float32)})[0]


HEADS = {  # model -> the class whose probability we keep (it is also the output key)
    'mood_happy': 'happy', 'mood_sad': 'sad', 'mood_relaxed': 'relaxed', 'mood_aggressive': 'aggressive',
    'mood_party': 'party', 'danceability': 'danceable', 'voice_instrumental': 'voice',
}
TAGGERS = {'mtg_jamendo_moodtheme': 'moodTheme', 'mtg_jamendo_genre': 'genre', 'mtg_jamendo_instrument': 'instruments'}


class Essentia:
    def __init__(self, folder):
        folder = Path(folder)
        self.effnet = Onnx(folder, 'discogs-effnet-bsdynamic-1')
        self.musicnn = Onnx(folder, 'msd-musicnn-1')
        self.heads = {n: Onnx(folder, f'{n}-discogs-effnet-1') for n in list(HEADS) + list(TAGGERS)}
        self.reg = {n: Onnx(folder, f'{n}_regression-discogs-effnet-1') for n in ('approachability', 'engagement')}
        self.emo = Onnx(folder, 'emomusic-msd-musicnn-2')

    def describe(self, audio16k):
        mel = melspec(audio16k)
        emb = self.effnet.run(patches(mel, 128, 62), 'embeddings')
        out = {}
        for name, cls in HEADS.items():
            h = self.heads[name]
            out[cls] = round(float(h.run(emb).mean(0)[h.classes.index(cls)]), 3)
        for name, key in TAGGERS.items():
            h = self.heads[name]
            p = h.run(emb).mean(0)
            order = np.argsort(p)[::-1][:5]
            out[key] = [{'tag': h.classes[i], 'score': round(float(p[i]), 3)} for i in order if p[i] >= 0.05]
        for name, h in self.reg.items():
            out[name] = round(float(h.run(emb).mean(0)[0]), 3)
        memb = self.musicnn.run(patches(mel, 187, 93), 'embeddings').reshape(-1, 200)
        val, aro = self.emo.run(memb).mean(0)
        out['valence'], out['arousal'] = round(float(val), 2), round(float(aro), 2)  # 1-9 scale
        e = ENERGY_W[0] + ENERGY_W[1] * out['arousal'] + ENERGY_W[2] * out['aggressive']
        out['energyEstimate'] = int(np.clip(np.round(e), 1, 5))
        v = out['voice']  # ear test: 0.93 and 0.56 were wrong, 0.97 and 0.83 were right
        out['vocalsEstimate'] = 'likely' if v >= 0.95 else 'possible' if v >= 0.8 else 'none'
        return out


# ---------------------------------------------------------------- CLAP

def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 22), b''):
            h.update(chunk)
    return h.hexdigest()


def clap_weights(ckpt, expected_sha):
    """Weights-only copy of the checkpoint (safetensors). Made once, after checking the official SHA-256,
    because the original .pt needs pickle loading (weights_only=False)."""
    import torch
    from safetensors.torch import save_file
    ckpt = Path(ckpt)
    st = ckpt.with_suffix('.weights.safetensors')
    if st.exists():
        return st
    got = sha256(ckpt)
    if expected_sha and got != expected_sha:
        raise SystemExit(f'CLAP checkpoint SHA-256 mismatch: {got} (expected {expected_sha}). Re-download it.')
    print('Making a weights-only copy of the CLAP checkpoint (one time)...', file=sys.stderr)
    state = torch.load(ckpt, map_location='cpu', weights_only=False)
    state = state.get('state_dict', state)
    state = {(k[7:] if k.startswith('module.') else k): v.contiguous() for k, v in state.items() if hasattr(v, 'contiguous')}
    save_file(state, str(st))
    return st


def load_clap(ckpt, expected_sha, device):
    import torch
    import laion_clap
    from safetensors.torch import load_file
    if device == 'cuda' and not torch.cuda.is_available():
        print('CUDA not available, using the CPU.', file=sys.stderr)
        device = 'cpu'
    state = load_file(str(clap_weights(ckpt, expected_sha)))

    def build(dev):
        m = laion_clap.CLAP_Module(enable_fusion=False, amodel='HTSAT-base', device=dev)
        missing, _ = m.model.load_state_dict(state, strict=False)  # newer transformers drop position_ids
        if missing:
            raise SystemExit(f'CLAP weights missing keys: {missing[:5]}')
        m.model.eval()
        return m

    try:
        return build(device), device
    except torch.cuda.OutOfMemoryError:
        print('GPU out of memory, using the CPU.', file=sys.stderr)
        torch.cuda.empty_cache()
        return build('cpu'), 'cpu'


def windows(audio):
    """Fixed 10 s windows; a short file or tail is repeated then cut to 10 s (the paper's rule); tails under 3 s are skipped."""
    a = (np.clip(audio, -1, 1) * 32767).astype(np.int16).astype(np.float32) / 32767  # LAION's int16 round trip
    out, spans = [], []
    for s in range(0, max(1, len(a)), WIN):
        w = a[s:s + WIN]
        if s > 0 and len(w) < WIN / 3.33:
            break
        spans.append((round(s / SR_C, 2), round(min(len(a), s + WIN) / SR_C, 2)))
        if len(w) < WIN:
            w = np.tile(w, int(np.ceil(WIN / max(1, len(w)))))[:WIN] if len(w) else np.zeros(WIN, np.float32)
        out.append(w)
    return np.stack(out), spans


class Clap:
    def __init__(self, ckpt, expected_sha, device, vocab):
        import torch
        self.torch = torch
        self.model, self.device = load_clap(ckpt, expected_sha, device)
        blocked = set(vocab.get('blocked', []))
        self.words = {k: [w for w in vocab[k] if w not in blocked] for k in ('music', 'sfx')}
        tpl = {'music': vocab['musicTemplate'], 'sfx': vocab['sfxTemplate']}
        with torch.no_grad():
            self.text = {k: self.text_emb([tpl[k].format(w) for w in ws]) for k, ws in self.words.items()}
            kp = vocab['kindPrompts']
            self.kind_text = self.text_emb([kp['music'], kp['sfx']])

    def text_emb(self, texts):
        with self.torch.no_grad():
            return self.model.get_text_embedding(texts, use_tensor=True).float()

    def audio_emb(self, wins):
        t = self.torch
        with t.no_grad():
            embs = [self.model.get_audio_embedding_from_data(x=t.from_numpy(wins[i:i + 4]).float(), use_tensor=True)
                    for i in range(0, len(wins), 4)]  # small batches keep a 4 GB GPU safe
        return t.cat(embs).float()

    def describe(self, audio48k, kind):
        """Raw cosine scores for every word, whole track and per 10 s window. Ranking happens in
        audio-analyzer.mjs against the library's average per word, because CLAP scores some words
        high on almost everything ('horror', 'inspiring' in the 2026-10 ear test)."""
        wins, spans = windows(audio48k)
        emb = self.audio_emb(wins)
        kind_sims = (emb.mean(0, keepdim=True) @ self.kind_text.T).cpu().numpy()[0]
        auto_kind = 'music' if kind_sims[0] >= kind_sims[1] else 'sfx'
        k = auto_kind if kind == 'auto' else kind
        sims = (emb @ self.text[k].T).cpu().numpy()
        r = lambda v: [round(float(x), 4) for x in v]
        return {
            'kind': k, 'autoKind': auto_kind,
            'kindScores': {'music': round(float(kind_sims[0]), 3), 'sfx': round(float(kind_sims[1]), 3)},
            'words': self.words[k],
            'scores': r(sims.mean(0)),
            'windows': [{'fromS': a, 'toS': b, 'scores': r(row)} for (a, b), row in zip(spans, sims)],
        }, [{'fromS': a, 'toS': b, 'emb': r(e)} for (a, b), e in zip(spans, emb.cpu().numpy())]


# ---------------------------------------------------------------- commands

def cmd_analyze(req):
    vocab = json.loads(Path(req['vocab']).read_text(encoding='utf-8'))
    clap = Clap(req['clapCheckpoint'], req.get('clapSha256'), req.get('device', 'cuda'), vocab)
    ess = Essentia(req['essentiaModels'])
    emb_dir = Path(req['embeddingsDir'])
    emb_dir.mkdir(parents=True, exist_ok=True)
    results = {}
    for item in req['files']:
        a48 = ffmpeg_mono(req['ffmpeg'], item['path'], SR_C)
        c, emb = clap.describe(a48, item.get('kind', 'auto'))
        res = {'durationS': round(len(a48) / SR_C, 2), 'clap': c, 'device': clap.device}
        if c['kind'] == 'music':
            res['essentia'] = ess.describe(ffmpeg_mono(req['ffmpeg'], item['path'], SR_E))
        (emb_dir / f"{item['id']}.clap.json").write_text(
            json.dumps({'hash': item.get('hash'), 'version': req.get('version'), 'kind': c['kind'], 'windows': emb}),
            encoding='utf-8')
        results[item['id']] = res
        print(f"  {item['id']}: {c['kind']}", file=sys.stderr)
    return {'results': results}


def cmd_find(req):
    vocab = json.loads(Path(req['vocab']).read_text(encoding='utf-8'))
    clap = Clap(req['clapCheckpoint'], req.get('clapSha256'), req.get('device', 'cuda'), vocab)
    q = clap.text_emb([req['query']]).cpu().numpy()[0]
    rows = []
    for f in sorted(Path(req['embeddingsDir']).glob('*.clap.json')):
        d = json.loads(f.read_text(encoding='utf-8'))
        if req.get('type') and d.get('kind') != req['type']:
            continue
        sims = [float(np.dot(w['emb'], q)) for w in d['windows']]
        best = int(np.argmax(sims))
        rows.append({'id': f.name[:-len('.clap.json')], 'kind': d.get('kind'), 'score': round(float(np.mean(sims)), 3),
                     'bestSection': {'fromS': d['windows'][best]['fromS'], 'toS': d['windows'][best]['toS'],
                                     'score': round(sims[best], 3)}})
    rows.sort(key=lambda r: r['score'], reverse=True)
    return {'query': req['query'], 'results': rows[:int(req.get('top', 5))]}


def main():
    mode, req_path, out_path = sys.argv[1:4]
    req = json.loads(Path(req_path).read_text(encoding='utf-8'))
    res = {'analyze': cmd_analyze, 'find': cmd_find}[mode](req)
    Path(out_path).write_text(json.dumps(res), encoding='utf-8')


if __name__ == '__main__':
    main()
