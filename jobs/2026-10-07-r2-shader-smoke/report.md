# Report: R2 shader smoke

Two shader layers (billowing-plasma-nebula fill 0-3 s, petal-bloom square 3-6 s) driven by the song.
Used as the shader determinism fixture: two snapshot runs at 1.5 s and 2.8 s are pixel-identical,
and the same shader with no audio differs strongly (15-18 dB PSNR) from the music-driven one.
