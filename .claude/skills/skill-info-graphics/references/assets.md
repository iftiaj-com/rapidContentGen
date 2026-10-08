# Assets: what the agent can make, collect or must ask for

## Made here, with no download

| Need | How |
|---|---|
| Script | written by the agent (`script-writing.md`) |
| Voice | Kokoro, local: `rcg voice say` (54 voices, 9 languages, 33 effects); word times for anchors and captions |
| Captions | `rcg captions --style info-chip --mode word --y 1440` |
| Diagrams, charts, type, UI | the 11 pack components (`rcg style show info-graphics`) |
| Sound effects | `library/sfx/` (19 measured Pixabay sounds; the pack maps swipe, pop, click, tick, typing, hit, shine) |
| 3D objects | `rcg three` (orb, knot, crystal, rings) with camera cues |
| Abstract motion backgrounds | `rcg shader` (166 AditsShaders objects), `rcg beatflash` |
| Depth from a still | `rcg layers` + the `vox-parallax` pack, on a photo the user supplied or approved |
| Effects on footage | `rcg fx`, `rcg camera`, `rcg transition` on the user's clips |

There is no text-to-image or text-to-video model in this workspace. Do not promise generated
illustrations or "AI art"; offer the stand-ins above or collected photos.

## Collected, only after the user says yes

Ask before each download (workspace rule), naming the source, the files and the licence.

| Source | Good for | Licence to record |
|---|---|---|
| The Unsplash connector (`search_photos`), if connected | photos of places, objects, moods | Unsplash License; credit the photographer |
| Wikimedia Commons | public-domain artworks, historical photos, maps | per file (public domain, CC BY, CC BY-SA); record the file page |
| The user's own folders or footage | anything | the user's |
| `library/sfx/bg-music-daily-mail.mp3` (in the repo, 9.0 s) | a quiet bed | not recorded yet: ask the user before a published edit |

Store collected files in `jobs/<id>/assets/img/` (git-ignored) and list each one with its source URL
and licence in `report.md`.

## Never

- Photos of private people, or real people placed in invented situations.
- Logos, UI copies or names of real products, outlets or accounts in `post`, `prompt` or `plate`,
  unless the user supplies them for their own brand (then record them in `frame.md`).
- Copyrighted music or footage the user has not cleared.

## Script mode: mapping the user's assets

| Asset | Component |
|---|---|
| one photo or artwork | `photo` (card, museum, round, mono; `mark` the detail named) |
| several photos | `collage` (scatter, grid, mosaic) |
| a screenshot of a post or an article | `photo` with `frame: round` (theirs, so keep it as is) |
| a product image | `prompt` `result` or `photo` |
| a logo | `equation` chip text or a `photo` with `frame: none` |
| a clip | a full-frame shot under the components (the video-job build step), or `photo` with a still |
| a voice recording | the voice line: transcribe it and anchor to its words |
| music | the bed: `rcg limit`, `rcg level`, then `place-voice --music` |
