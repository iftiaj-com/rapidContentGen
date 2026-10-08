# Assets: what the agent can make, collect or must ask for

## Made here, with no download

| Need | How |
|---|---|
| Script | written by the agent (`script-writing.md`) |
| Voice | Kokoro, local: `rcg voice say` (54 voices, 9 languages, 33 effects); word times for anchors and captions |
| Captions | `rcg captions --style info-chip --mode word --y 1440` |
| Diagrams, charts, type, UI | the 12 pack components (`rcg style show info-graphics`) |
| Icons already in the library | `library/icons/phosphor/` (`icon` component) |
| Sound effects | `library/sfx/` (19 measured Pixabay sounds; the pack maps swipe, pop, click, tick, typing, hit, shine) |
| 3D objects | `rcg three` (orb, knot, crystal, rings) with camera cues |
| Abstract motion backgrounds | `rcg shader` (166 AditsShaders objects), `rcg beatflash` |
| Depth from a still | `rcg layers` + the `vox-parallax` pack, on a photo the user supplied or approved |
| Effects on footage | `rcg fx`, `rcg camera`, `rcg transition` on the user's clips |

There is no text-to-image or text-to-video model in this workspace. Do not promise generated
illustrations or "AI art"; offer the stand-ins above or collected photos.

## Approved sources (user decision 2026-10-08)

Only these. Do not add other libraries without asking. Ask before each download (workspace rule),
naming the file, the source and the size; `--dry-run` shows all three without saving.

| Source | For | Tool | Licence (read 2026-10-08) |
|---|---|---|---|
| **Phosphor Icons** 2.1.1 | icons, six weights (use `bold` or `fill` on video) | `rcg assets icon find <words>`, `rcg assets icon add <name> --weight bold` (kept in `library/icons/phosphor/`, one SVG at a time, with LICENSE and a sha256 manifest) | MIT |
| **Unsplash** | photos, illustrations | search with the Unsplash connector (`search_photos`, `search_illustrations`), then `rcg assets fetch unsplash --job <dir> --id <photo id> --author "<name>"` (the public download link; it counts the download for the photographer, a dry run included) | Unsplash License: free, no credit required; no resale without significant modification |
| **Pixabay** | stock video, photos | `rcg assets search pixabay --q "<words>" --type video|photo`, `rcg assets fetch pixabay --job <dir> --id <id> --type video`; needs `keys.pixabay` in `config/workspace.local.json` (free key at pixabay.com/api/docs/ after login); searches cached 24 h in `.cache/assets/` as the API asks | Pixabay Content License: free, no credit required; no standalone resale; no commercial use of recognizable brands |
| **Pexels** (manual) | stock video, photos | API key issuance is paused, so no search tool. The user downloads on pexels.com and drops the file in the job; `rcg assets credit --job <dir> --file assets/... --source pexels --author "<name>" --page <url>` records it | Pexels License: free, no credit required; no unflattering use of identifiable people, no implied endorsement, no unaltered resale |
| **Poly Haven** | textures, HDRIs (3D models by hand) | `rcg assets search polyhaven --q <tag> --type textures|hdris`, `rcg assets fetch polyhaven --job <dir> --id <id> [--type hdris] [--res 2k] [--map Diffuse]` (md5 checked) | CC0; their API asks that users are told the assets came from Poly Haven, so credit it |
| **The Met Open Access** | public-domain art and objects | `rcg assets search met --q "<words>"` (public-domain objects with images only; uses `/v1.1/search`, the v1 search was retired on 2026-10-01), `rcg assets fetch met --job <dir> --id <object id>` (refuses objects not marked public domain) | CC0, "unrestricted commercial and noncommercial use" |

Every fetch writes the file into the job's git-ignored `assets/img|video|tex/` and appends
`data/credits.json` (source, id, author, page, licence, sha256). `rcg assets credits --job <dir>`
prints the Markdown credits table for `report.md`.

**Credits never appear in the video** (user rule, 2026-10-08): no photographer, source, licence or
"courtesy of" text on screen, no end card of credits. The credits file and the report are the
record. None of the approved licences requires on-screen credit: Phosphor (MIT) asks for its
licence with the code, which is `library/icons/phosphor/LICENSE`; Unsplash, Pixabay and Pexels say
credit is optional; Poly Haven and The Met are CC0. Poly Haven's API page asks integrators to make
clear the assets came from Poly Haven; the credits record covers that, and the user may add a
line to a post description when posting.

Pixabay photos through the API are capped at 1280 px on the long side (`largeImageURL`; full
resolution needs Pixabay's approved full API access). That is too small for a full 1080x1920 frame,
so use Unsplash for photos and Pixabay for video (tested 2026-10-08: clips came back up to
3840x2160).

Pixabay Music: not approved. Its licence page does not address YouTube Content ID; ask the user
before any music from it.

## Never

- Photos of private people, or real people placed in invented situations.
- Logos, UI copies or names of real products, outlets or accounts in `post`, `prompt` or `plate`,
  unless the user supplies them for their own brand (then record them in `frame.md`).
- Copyrighted music or footage the user has not cleared.
- Bulk downloads: one file per need, in the job that uses it.

## Script mode: mapping the user's assets

| Asset | Component |
|---|---|
| one photo or artwork | `photo` (card, museum, round, mono; `mark` the detail named) |
| several photos | `collage` (scatter, grid, mosaic) |
| a screenshot of a post or an article | `photo` with `frame: round` (theirs, so keep it as is) |
| a product image | `prompt` `result` or `photo` |
| a logo | `equation` chip text or a `photo` with `frame: none` |
| a named tool, step or idea | `icon` (a Phosphor icon with a badge and a label) |
| a clip | a full-frame shot under the components (the video-job build step), or `photo` with a still |
| a voice recording | the voice line: transcribe it and anchor to its words |
| music | the bed: `rcg limit`, `rcg level`, then `place-voice --music` |
