# Worked examples

All stories here were written for this skill. They are illustrations of the method, not tested films.

## Example 1: a scripted short to shoot, about 2 minutes (shape A, one turn)

**Premise (`data/film/story.md`)**
- Protagonist: Mara, 60s, a retired postal clerk who still stamps every letter twice, out of habit.
- Want: get back the letter she posted this morning, before it leaves.
- Need: to say out loud what the letter says.
- Obstacle: the new clerk, Jun, who follows the rule (posted mail cannot be returned), and the noon
  collection.
- Stakes: her son Tom reads that she is selling the family house before she has told him herself.
- Dramatic question: will Mara get the letter back before noon?
- Logline: A retired postal clerk has eight minutes to talk a by-the-book new clerk into returning a
  letter, before her son learns from it what she could not tell him.
- Ending (written first): she lets the letter go, and calls Tom from the payphone outside. Final image:
  the bag leaves; she is talking.
- Controlling idea: we get back what matters only when we stop trying to undo what we did (value:
  closeness; cause: facing it).
- Image system: the red double stamp; the clock; the glass counter between them.

**Structure map**

| Movement | target s | Turn |
|---|---|---|
| Opening: Mara at the counter, the clock at 11:52 | 0-15 | the want: "I need it back" |
| Middle: three tactics against Jun | 15-90 | each fails, each costs more |
| Turn: Jun finds the letter by its double stamp | 90-105 | she could have it, and does not take it |
| End: the payphone | 105-120 | answer: no, and yes-but |

**Scene cards**

| # | scene | target s | who wants what | if not | why now | value: start -> end | link | audience knows | setup / payoff |
|---|---|---|---|---|---|---|---|---|---|
| 1 | INT. POST OFFICE - DAY | 0 | Mara wants the letter back | Tom reads it first | the bag goes at noon | hope + -> - | but Jun says no | clock at 11:52; what the letter says: no | plant: double stamp (insert), clock |
| 2 | INT. POST OFFICE - CONTINUOUS | 15 | Mara tries the rules she knows (form 7B) | same | 11:55 | hope - -> + | but the form needs the sender's ID, which is in her car | she worked here (the photo on the wall) | plant: her photo on the staff wall |
| 3 | INT. POST OFFICE - CONTINUOUS | 50 | Mara pleads, then pulls rank | same | 11:58 | trust + -> - | therefore Jun stops looking at her | Jun has seen the photo | payoff: the photo |
| 4 | INT. POST OFFICE - CONTINUOUS | 90 | Jun wants to help, quietly | he breaks a rule | the van is outside | closeness - -> + | but Mara does not take it | we see the double stamp before Mara does (suspense) | payoff: double stamp |
| 5 | EXT. POST OFFICE - DAY | 105 | Mara wants to tell Tom herself | he reads it cold | the van pulls away | courage - -> + | (end) | | callback: the clock, now past noon |

**Screenplay excerpt (`data/film/script.fountain`)**

```
INT. POST OFFICE - DAY

A wall clock: 11:52. MARA (60s, coat buttoned wrong) waits at a glass counter. Behind it, JUN (20s)
sorts mail into a canvas bag.

On the counter, her own hand taps a rubber stamp twice on nothing. Habit. [[SETUP: double stamp]]

MARA
The blue envelope. Addressed to Tom Reyes.

JUN
Once it's posted, it's the post's.

MARA
I know the rule.

She looks past him, at the staff photos on the wall. One of them is her, thirty years younger.
[[SETUP: photo]]

...

Jun lifts a blue envelope from the bag. Two red stamps, one over the other. He looks at her.
[[TURN: closeness - -> +]]

Mara looks at the envelope a long time. She does not reach for it.

MARA
Let it go.

EXT. POST OFFICE - DAY

The van pulls away. Mara at a payphone, coins in her palm. She dials.

MARA (INTO PHONE)
Tom. It's Mum. There's a letter coming.
```

**Shot list excerpt**

| shot | scene | story job | size | angle | move | why | cut to next | sound | source |
|---|---|---|---|---|---|---|---|---|---|
| 1A | 1 | establish | WS | eye level | static | the glass between them is the whole film | cut on Jun's turn | clock tick, room tone | to shoot |
| 1B | 1 | setup | ECU | top-down | static | the double stamp: a promise to the audience | hard cut | two thuds | to shoot |
| 1C | 1 | want | MCU Mara | eye level, through the glass | static | she is behind glass from the start | L cut: her line over Jun | | to shoot |
| 4A | 4 | turn | CU envelope in Jun's hand | Mara's POV | static | we see the stamp; she sees it a beat later | cut to 4B | music out, room tone out | to shoot |
| 4B | 4 | turn | CU Mara | eye level | slow push in | the decision happens here | hold 3 s, then cut | silence | to shoot |
| 5A | 5 | answer | WS | high | crane up (or static wide) | she is small, and talking: the end of the circle | dip to black on "letter coming" | traffic, her voice | to shoot |

What makes it a film and not shots: every scene changes a value, Mara causes the ending by a choice, the
stamp and the photo are planted and pay off, the audience knows the letter is there before Mara does,
and the first image (glass between them) answers the last (no glass, a phone).

## Example 2: a story found in footage (shape C, story circle)

**Input:** 46 shots of one person's train-and-hiking trip, no speech, no script. `cine.mjs measure`
wrote `shots.md`. Reading it and the frame sheets:

- One person appears in 19 shots (always the same red jacket: continuity is good).
- The weather goes from sun to fog to sun. The summit shots are in fog.
- Shot `s31` is the person sitting down on the trail, head down. `s38` is the same person at a hut,
  laughing with two strangers.

**Premise from the footage**
- Protagonist: the hiker (unnamed; the footage does not say).
- Want: the summit view (the footage shows a trail sign with a summit name and the hiker checking a
  phone map).
- Obstacle: the fog (shown) and fatigue (`s31`, shown).
- Take (the cost): no view at the top (the summit shots are white).
- Change: the hut and the strangers (`s38`): the trip was the company, not the view.
- Dramatic question: will the hiker get the view?
- Ending: answered no-but: no view, a better thing found.

**Story circle map (2:10 at 24 fps)**

| Step | Shots | target s | Story job |
|---|---|---|---|
| You | s01-s05 (city, station) | 0-15 | ordinary world, alone (no other people in frame) |
| Need | s06-s08 (phone map, summit sign) | 15-25 | the want is planted |
| Go | s09-s14 (train window, first trail) | 25-45 | crossing over; screen direction left to right, kept |
| Search | s15-s27 | 45-80 | the climb; steady wides, few close-ups |
| Find | s28-s30 (the top) | 80-92 | the summit, in fog; hold on the white |
| Take | s31 (sitting down) | 92-100 | the cost; longest hold, music out |
| Return | s32-s37 (descent, fog lifts) | 100-118 | going back; light returns |
| Change | s38-s40 (the hut, laughing) | 118-130 | the answer; the first faces other than the hiker's |

Left out: 6 shots of good landscapes in the "search" section (story job "none": they repeat what s15-s27
already say), 2 shots that reverse the screen direction mid-journey. Both listed in the report.

Narration: none needed. The footage carries want, obstacle and change. If the user wants a voice, it
would be one line before "find" and one after "change" that say what the picture cannot: the reason for
the trip.

What the agent did not do: invent a reason for the trip, name the strangers, or cut the strangers'
laughter against a moment they did not see.

## Example 3: diagnosing a "cool shots" film

**The user's cut:** 90 s of generated clips: a woman in a desert, a neon city, a horse in the rain, a
slow push on a door, an explosion, the woman again, the end. Music throughout.

**Diagnosis (against the failure table in `SKILL.md`)**

1. No want: nothing shows what she is trying to do. Suggest one insert early (she holds a photo of a
   door), so the door later means something.
2. No cause and effect: the shots can be shuffled. Reorder so each causes the next: desert (she walks),
   photo (the want), city (the search), door (find), explosion (take), desert again (return, changed).
3. No turn: the door push-in is the only motivated move. Make it the turn: she opens it, and we cut to
   what she sees, not to the explosion.
4. Continuity: her hair colour changes between shots 1 and 6, and the light comes from the left in one
   and the right in the other (frame sheet). Regenerate or cut one, or make the change a story change.
5. The horse has no story job. Cut it or make it the thing she is looking for.
6. Music covers every second. Drop it at the turn for 2-3 s.
7. The last shot repeats the first. Good instinct; change one thing in it (she now holds the photo
   torn, or not at all), so the mirror shows the change.

None of these were applied. The agent asks which to try, and in mode (b) states which it chose.

## Example 4: auditing the user's screenplay (suggestions only)

```
Structure map of your pages: 6 scenes, about 8 min at a page a minute. Dramatic question ("Will Ana
win the race?") is raised on page 3, about 35% in; the climax is on page 8.

Suggested changes (none made yet):
1. Pages 1-2 introduce Ana's family at breakfast. None of it is used later. Suggest opening at the
   start line (your page 3) and planting the family in one shot of them in the crowd. Cut, keep, or
   shorten?
2. Scene 3 begins and ends with Ana confident (value unchanged). Could her coach's line about the knee
   land here instead of scene 5, so the scene turns?
3. Ana wins because her rival trips (page 8). That is luck solving the hero's problem. Could she win by
   the choice you set up on page 4 (she saves her sprint for the hill)?
4. Page 6: "Ana feels the pressure." Suggest showing it: she re-ties a shoe that is already tied.
5. Your last image (Ana alone on the track at night) answers your first (the crowded track at dawn).
   Keep it.
```
