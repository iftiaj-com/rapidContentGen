# Music and sound design

Rules 2 and 3 of `principles.md`. The video-job audio steps (limit, level, mix-check, the
absolute-level volume lanes of pitfall 1) apply as usual. This file says what a cinematic edit adds.

## Music

**Source.** Use the user's music, or music they have cleared. Ask when the prompt has none: "Which track,
and is it cleared for where you will post it?" The `bg-music-*` files in `library/sfx/` are Pixabay
sounds (`library/sfx/CREDITS.md`); offer them only as a draft bed and say so. Pixabay Music downloads
are not approved (`style-info-graphics/references/assets.md`). Never use a popular song the user has not
cleared.

**Fit.** The music sets the mood. Each section of the story gets music of one energy:

| Section mood | Music |
|---|---|
| calm, opening, wonder | sparse, slow, pads or piano, little percussion |
| build, journey | a steady pulse that grows; risers at the end |
| peak, action | full drums, the strongest part of the track |
| release, ending | the track thins out, or a soft second track |

- Change tracks (or sections of one track) where the footage's energy changes. Cross-fade about 1-2 s on
  a downbeat, or cut hard on a downbeat into a new section. A dip to black can hide a hard change.
- `rcg limit` every track first (-2.5 dBTP), then `rcg beatgrid` for beats, downbeats and phases. Cut
  peak sections on beats or downbeats. Change sections on a phrase (usually every 4 or 8 bars).
- End on the music's ending. Trim or loop the track so the last note and the last shot land together,
  and fade out only if the track has no ending.
- `build.music` in the beat sheet holds one track (`rcg assemble`). For a second track, add it after
  assembly as its own `<audio>` with a volume lane (absolute levels, pitfall 1), then run `rcg mix-check`.

## Sound design

Sound design makes the picture feel alive. It should sound like part of the scene, never added on.

| Layer | When | Source |
|---|---|---|
| Natural sound | under almost every shot: wind, waves, a street, footsteps | the footage's own audio. Keep it (prep `"audio": true`, or a separate `<audio>` of the source with `data-media-start`), low, about -24 to -18 dB under the music |
| Ambience bed | a place with no usable natural sound | none approved in the workspace: ask the user for a file or a source before downloading |
| Whoosh | a fast camera move, a whip, an object passing the lens | `whoosh-short`, `whoosh`, `whoosh-cinematic` |
| Impact | a big visual change: a cut to a wide reveal, the title hit, a physical hit on screen | `impact-bass-1`, `impact-bass-2` |
| Riser | the last 2-4 s before a peak or a drop | `riser` |

- Place every SFX by its measured crest (`library/sfx/manifest.json`, pitfall 4). In the beat sheet:
  `"sfx": [{ "name": "whoosh-short", "landing": 12.40, "volume": 0.25 }]` (`rcg assemble` places the
  peak on `landing`).
- Start low. In a cinematic mix most sound design is felt, not heard: begin at about 0.15-0.3 and raise
  it only where a hit has to land. Keep SFX within about 1-4 dB of the music (video-job step 5), lower
  in calm sections.
- One sound per visual event. A whoosh on every cut is a promo, not a film. Use sound where the picture
  moves fast or changes a lot.
- Several layers can stack under one strong shot (the article's example has five under one drone shot):
  natural sound, an ambience, a riser and an impact at the reveal. Build them one at a time, and keep
  one only if the shot feels more alive with it.
- With a voiceover, duck the music under the voice (`"duck"` in `build.music`) and keep SFX out of the
  words.

## Checks

- `rcg mix-check` must pass (no predicted gain reduction).
- `rcg render` verifies loudness and true peak.
- You cannot hear the result. Say in the report that the mix was judged by measurement, and list every
  sound layer and its level so the user can ask for changes.
