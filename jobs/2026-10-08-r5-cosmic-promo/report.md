# Report: R5 cosmic promo (Phase 5, every capability group)

- **Render:** `renders/final.mp4`, 1080x1920, 24 fps, 14.5 s, rendered in 2 min 20 s; all 11 verify checks pass.
- **Audio:** -15.7 LUFS, -1.8 dBTP, no whole-mix gain reduction (mix-check predicted -15.6 / -1.8).
- **How it was built:** `rcg recipe plan --recipe cosmic-promo --duration 14.5 --seed 5 --title "MOP STAR"`
  drafted the beat sheet on the song's own beat grid (librosa, run on this job's song). Voice lines,
  end title and beat-flash words were written into the placeholders, then `rcg recipe build` ran
  voice, level, assemble, 3D, flythrough, shader, beat-flash, titles, captions, mix-check and check.

| Section | Time | Built with |
|---|---|---|
| cinematic-orbit | 0-2.39 | `rcg three` orb (orbit + crash zoom on the 0.51 downbeat, audio-reactive); `rcg title` "MOP STAR" (stagger-up, neon) |
| card-flythrough | 2.39-5.88 | `rcg flythrough`: 3 stills cut from the footage (seeded TimeRemap picks), arrivals on beats (errors 0-2 ms), whooshes |
| beat-drop | 5.88-7.55 | footage card over the `billowing-plasma-nebula` shader; flash + impact on the downbeat; crash zoom in/out; kick shake; `rcg ramp` speed sync 1.3-2.0x on shot 2; `rcg beatflash` CLEAN/SPIN/REPEAT |
| whip-montage | 7.55-12.73 | 6 shots under 1 s, alternating whips across every cut (0.25 s halves), handheld + kick shake, whoosh per cut, same shader block continues |
| cool-down | 12.73-14.49 | full-frame drone pull-back, then a static shot; end title "MOP STAR / NOW PLAYING" |

Voice: five Kokoro lines (af_heart / am_michael), leveled to -14 LUFS with peaks held to -3.6 dBTP,
neon 2-word captions; the music sits at 0.7 and ducks to 0.3 under every line.

**Deviations and fixes found while building (all fixed in the tools, not by hand):**
1. The song is 15.02 s, so the edit is 14.5 s (ends on the last downbeat), not the 24 s first asked.
2. Planner: four flythrough cards in a 2-bar section cannot each land on a downbeat. Cards shorter
   than a bar now snap to beats, with at most one card per two beats.
3. Recipe: the montage whips paired the wrong directions (checked numerically: every cut now continues
   its motion) and took 0.5 s per half on 0.85 s shots (now 0.25 s).
4. Planner: the end title ran 0.68 s (now spans its section); the shader restarted at the section
   boundary (back-to-back sections on the same shader now share one block).
5. Mix: first plan peaked at +1.4 dBTP (HyperFrames would cut the whole mix 2.4 dB). Fixed in the
   recipes: music 0.7, duck to 0.3, voice ceiling -3.6, whooshes 0.2, the drop impact 0.14.
6. Flythrough: cards set `visibility: visible`, which overrode HyperFrames hiding the finished
   sub-composition, so the last card stayed on top until the end. Cards now inherit visibility.
7. Assemble: the card frame's drop shadow stayed on screen after its section. A timed frame is not
   allowed (HyperFrames: video_nested_in_timed_element), so the shadow is now its own timed clip.

**Open:** vo1 alignment matched 2 of 4 words (whisper heard "mop star" as one word); its caption
timing is interpolated over 1.2 s. `hf check` warns that the 3D sub-composition is long (the camera
runtime it inlines grew with the 2D presets); advisory only. I cannot listen to the audio; the mix was
judged by measurement.
