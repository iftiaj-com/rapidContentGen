# Structures for short films, and budgets per length

Pick the shape by what the story is, not by habit. All timings are planning targets for a first draft,
not measured norms. Re-time after the paper edit or the first assembly.

## Length budgets

"Short film" covers a wide range. The Academy (Oscars) rules for recent ceremonies define a short as
40 minutes or less including credits; festivals set their own limits. Most rcg jobs are far shorter.

| Length | Scenes | Locations | Speaking parts | Turns before the climax | Screenplay pages (about 1 per minute) |
|---|---|---|---|---|---|
| 30-60 s (feed, 9:16) | 1-3 | 1-2 | 0-1 | 0-1 | under 1 |
| 1-3 min | 2-5 | 1-2 | 1-2 | 1 | 1-3 |
| 3-7 min | 4-10 | 2-3 | 1-3 | 2 | 3-7 |
| 7-15 min | 8-20 | 2-5 | 2-4 | 2-3 | 7-15 |
| over 15 min | treat as a compact feature: full three-act shape with a midpoint | | | | |

The page-per-minute figure is a long-standing rule of thumb for standard screenplay format. A page of
dense action can run well over a minute and a page of quick dialogue well under. It is for planning,
not for timing a cut.

Where the movements land (as a share of the running time), for a first draft:

| Movement | Share | Contents |
|---|---|---|
| Opening | first 10-15% | first image; who they are; the want; the inciting event raises the dramatic question |
| Middle | about 60-75% | tries and turns, each costing more; the audience knows more or less than the hero |
| Climax and end | last 15-25% | the hero's choice under the most pressure; the answer; the final image |

Shorter films squeeze the opening hardest: in a 60 s short, the want and the inciting event are often
the same first shot.

## The shapes

### A. One situation, one turn (the default under 3 minutes)

The classic short: a single situation that turns once, hard, near the end.

1. **Image:** the protagonist doing something that shows who they are and what they want.
2. **Pressure:** the obstacle appears; the dramatic question is raised.
3. **Try:** they act; it fails or costs (but).
4. **Turn:** a reveal or a choice changes the meaning of everything before it.
5. **Final image:** the answer, mirroring the first image.

Good for: a reveal, a choice, a small reversal. Risk: a turn with no setup reads as a gimmick; plant it
in beat 1 or 2.

### B. Three movements (compressed three-act)

The setup, confrontation and resolution taught by Syd Field (*Screenplay*, 1979) and most screenwriting
books, shrunk to fit:

1. **Setup:** ordinary world, want, inciting event. Ends when the hero commits (a point of no return).
2. **Confrontation:** rising obstacles. In films over about 7 minutes, a midpoint shifts the goal or
   the stakes. Ends at the lowest point: the plan has failed.
3. **Resolution:** the hero's final choice, the climax, the new normal.

Good for: 3-15 minute narrative shorts. Risk: a slow setup. Cut every setup beat that the climax does
not use.

Blake Snyder's *Save the Cat!* (2005) beat sheet is a detailed feature version of this shape (fifteen
named beats). For shorts, use only its idea of an early beat that makes us care about the hero, and an
"all is lost" low point before the end. Its page numbers are for features; do not scale them blindly.

### C. Story circle (journey and change)

Dan Harmon's eight steps, his simplification of Joseph Campbell's hero's journey, as commonly
summarized: **you** (a comfort zone), **need** (they want something), **go** (an unfamiliar
situation), **search** (adapt), **find** (get what they wanted), **take** (pay a heavy price),
**return** (back to the familiar), **change** (having changed). Labels and wording vary between
summaries.

Good for: travel, personal and journey films, especially from footage: leaving, the strange place, the
cost, the return. The circle gives a road trip a reason to exist. Risk: "find" and "take" are the story;
do not let the search fill the whole film.

### D. Four parts, kishōtenketsu (contrast, not conflict)

A structure from Chinese and Japanese poetry and narrative: **ki** (introduce), **shō** (develop),
**ten** (a twist: something new and seemingly unrelated), **ketsu** (reconcile: the ending connects the
twist to what came before). It does not require a protagonist to beat an opponent, though stories built
on it can contain conflict.

Good for: quiet, observational, poetic or slice-of-life shorts, and footage without a clear antagonist
(a day in a market, a grandparent's routine). The ten is the turn; the ketsu is the meaning. Risk: a ten
that stays unrelated. The ketsu must make the viewer see the first half differently.

### E. The loop (feed shorts and portraits)

The last image returns to the first, changed, so the film can loop. Use for 9:16 pieces and character
portraits: same action, same place, but now we know why. Pair with `style-cinematic-short` (looping
ending).

### F. Light shapes for footage that has no conflict

When the footage cannot support a want and an obstacle, say so to the user and offer one of these
instead of inventing events:

- **Journey:** depart, the road, the arrival, what changed. The want is the destination; the obstacle is
  the distance, the weather, the fatigue that the footage actually shows.
- **Portrait:** one person or place, revealed in layers: the surface, a detail, a contradiction, what
  it means. The turn is the contradiction.
- **Before and after:** the same place or person at two times; the cut between is the turn.
- **Ritual:** a process from start to finish (cooking, building, a race). The want is the finished
  thing; the obstacles are the steps that can fail.

## Choosing

| The idea is... | Shape |
|---|---|
| a reveal or a single choice, under 3 min | A |
| a goal against a strong opponent, 3-15 min | B |
| a trip, a move, a change in someone | C |
| a mood, a place, a quiet observation | D or F (portrait) |
| a 9:16 piece meant to replay | E (with A inside) |
| footage with no clear want | F, or C if the trip is the story |

## Mapping to the beat sheet

- Each scene card becomes one or more beats; each shot in the shot list becomes one beat in footage
  mode.
- `target s` in the scene cards comes from the share table above times the target length.
- Turns get the strongest picture and sound changes of their stretch (a cut to silence, a held
  close-up, the music section change). Middle stretches between turns get steadier coverage.
- In a narrated short, a turn always starts a new voice line, so the edit can find it.
