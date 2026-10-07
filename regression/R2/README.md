# R2: audio-reactive shader + beat cuts (Phase 2 regression)

15 s on the song: AditsShaders `billowing-plasma-nebula` full frame behind a 640x1138 footage card
that cuts on the 9 downbeats (librosa beat grid, 136 BPM) with a punch-in, plus beat-flash words
(CLEAN|SPIN|REPEAT on bass|mid|treble, neon, kinetic style) in the top band.

1. `rcg new-job ... --mode b`; `rcg limit` the song.
2. Beat grid: `tools/voice/.venv/Scripts/python.exe <plugin>/skills/music-to-video/scripts/analyze-beatgrid.py <song> -o data/audiomap.json`
3. Card + cuts from `data/audiomap.json` downbeats (see the job's index.html).
4. `rcg shader --shader billowing-plasma-nebula --audio <song> --fit fill --duration 15 --id sh-bg --track 0 --insert`
5. `rcg beatflash --words "CLEAN|SPIN|REPEAT" --audio <song> --source bands --effect neon --style kinetic --duration 15 --id flash --insert`
6. check, render twice (`--name final`, `--name repeat`), compare.

Determinism (see expected.json): two snapshot runs of the shader are pixel-identical; two full
renders agree at 51 dB PSNR (local capture/encode is not byte-identical; HyperFrames documents
`render --docker` for that). Silent vs music-driven shader frames differ strongly (15-18 dB PSNR).
Also run: `cd library/adits-shaders && node scripts/validate.mjs && node scripts/compile-check.mjs`.
