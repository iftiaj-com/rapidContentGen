---
name: script-film-storytelling
description: Write or audit the story and script of a short film in rapidContentGen the way a filmmaker would, not as a string of cool shots - a protagonist who wants something, an obstacle, stakes, cause and effect from scene to scene, every scene turning a value, a dramatic question the ending answers, subtext instead of explained feelings, setups that pay off, and a shot list where every shot size, angle, move, cut and sound has a story reason. Covers four ways in - a scripted short the user will shoot, a narrative edit built from footage the user already has (travel, event, B-roll, AI-generated clips), a narrated short (story voiceover), and an audit of the user's own screenplay or treatment (suggestions only, their words stay). Outputs data/film/story.md (premise, structure map, scene cards), data/film/script.fountain (screenplay), data/film/shot-list.md and the beats the edit follows. Use for short film, screenplay, scene, story for my footage, narrative edit, "make it a story", "make it feel like a film", drama, character piece, mini-movie, AI film, or when the user names this skill. Runs inside the video-job workflow, before the beat sheet; the cinematic style skills cut what it plans.
---

# Short film storytelling

A film is not a set of good shots in a row. It is a person who wants something, a reason they cannot
have it, and a chain of events where each one causes the next, told in pictures and sound, ending in an
answer to the question the opening raised. This skill writes that chain, then picks the shots that
tell it.

This skill owns the story, the screenplay and the shot list. The `video-job` skill still owns intake,
the working mode, audio, build, render, report and the final send. The cinematic skills
(`style-cinematic-long`, `style-cinematic-short`) still own shot prep, flow, grade, music and sound
design. `style-character-lighting` owns the light. `script-modern-storytelling` owns retention scripts
for social talk and explainer videos.

- **Which script skill.** A story with a character who wants something (fiction, a dramatized true
  story, a personal story told as a film, a narrative edit of footage) uses this skill. An explainer,
  tip, opinion or promo talk uses `script-modern-storytelling`. A narrative short for a feed (9:16,
  under about 90 s) uses this skill for the story and borrows two things from the modern skill: open
  inside the action, and land a first turn within the first seconds.
- **When this skill and a style skill disagree.** On story (who wants what, the order of events, what
  the ending answers), this skill wins. On look and cut technique (grade, flow rules, pacing numbers,
  safe zones), the style wins.
- No tool code: this is a writing and planning method. Timing, shots and prep come from the existing
  tools (`cine.mjs measure`, `rcg voice say`, `rcg assemble`, `rcg camera`, `rcg cinema`).

Read before writing: `references/craft.md` (character, scene, dialogue, suspense, setups, the
principles and where each one comes from). Before choosing a shape: `references/structure.md`
(structures for short films and budgets per length). Before the shot list:
`references/cinema-language.md` (what each shot, move, cut and sound means, and the rcg tool for it).
Worked examples: `references/examples.md`. Sources and what was and was not verified:
`references/sources.md`.

## The failure this skill exists to prevent

Most generated films fail the same way: style without story. Check every plan against this list. Each
item has its fix in `references/craft.md`.

| Symptom | What is missing |
|---|---|
| Beautiful shots, nothing happens | A protagonist with a want, and an obstacle |
| Things happen, nobody cares | Stakes: what is lost if they fail, made personal |
| Scenes could be shuffled with no loss | Cause and effect: "but" and "therefore" links between scenes |
| A scene ends where it began | A turn: a value at stake changes charge (McKee) |
| Characters say how they feel | Subtext: behavior and choices show it; dialogue is a tactic |
| Every shot is a hero shot | Purpose: shot size and move chosen by what the moment needs |
| The ending is a mood, not an answer | A dramatic question set up early and answered at the end |
| A twist comes from nowhere | A setup planted earlier that the twist pays off |
| The face, the room or the direction changes between shots | Continuity: the same person, the same space, the same screen direction |
| Narration says what the picture already shows | Words and picture that each carry something the other does not |

## Ways in

| The user gives | The agent makes | The agent keeps |
|---|---|---|
| **An idea or a brief** (a short the user will shoot, or a narrated short) | the premise, the structure map, scene cards, the screenplay, the shot list | the user's idea; anything factual about real people or events is checked or cut |
| **Footage with no story yet** (travel, event, family, B-roll, AI-generated clips) | a story found in the footage: the premise, the scene cards built from shots, a paper edit and, if needed, narration | what the footage shows; no invented events about real people |
| **Their own screenplay or treatment** | a structure map of their pages and a numbered list of suggested changes | every word, until the user approves a change |
| **A finished cut that "doesn't work"** | a scene-by-scene diagnosis against the checks below | the cut; changes are suggestions |

If the request does not say which, a prompt with footage and no script is "footage with no story", and
a prompt with no footage is "an idea". In modes (a) and (c) of the video-job skill, show the premise
and the structure map before writing the full script, and the shot list with the beat sheet gate. In
mode (b), state the choices in `JOB.md` and go on.

## Fast path

1. **Premise.** Write under `## Story` in `JOB.md`, and in full in `data/film/story.md`:
   - **Protagonist:** one person (or animal, or object treated as one), named, with one specific trait
     we can see.
   - **Want:** a concrete goal we could photograph (get the letter back, finish the climb, say sorry).
   - **Need (optional):** what they lack inside, which the want forces them to face. A 1-minute short
     can skip it.
   - **Obstacle:** who or what stands in the way. The stronger it is, the stronger the story.
   - **Stakes:** what they lose if they fail, in their terms.
   - **Dramatic question:** one yes-or-no question the ending answers ("Will she get the letter back
     before he reads it?").
   - **Logline:** one sentence: protagonist + want + obstacle + stakes. If it cannot be written, there
     is no story yet; fix that before any shot is planned.
   - **Ending:** the final image and what it answers. **Write it first.**
   - **Controlling idea:** what the ending says about life, in one sentence (value + cause). It is for
     the writer; it is never said on screen.
   If one cannot be filled from the prompt, ask (modes a and c) or choose and say so (mode b).
2. **Length and shape.** Pick the length budget and a structure from `references/structure.md` (one
   turn, three movements, story circle, four-part kishōtenketsu, or the loop). Most shorts under
   5 minutes are one situation, one turn, few locations and few characters. Write the **structure map**:
   each movement with its target second, its turn and its scene count.
3. **Scene cards.** One card per scene in `data/film/story.md` (format below). For each scene answer
   Mamet's three questions: who wants what here, what happens if they don't get it, why now. Name the
   value at stake and its charge at the start and at the end; if the charge is the same at both ends,
   cut or rewrite the scene. Link each card to the next with "but" or "therefore", never "and then".
4. **Setups and payoffs.** List every object, line, place or skill that the ending or a turn depends on,
   and the earlier scene that plants it. List every planted thing and where it pays off. A setup with
   no payoff is cut; a payoff with no setup gets one.
5. **Decide what the audience knows.** For each turn, choose suspense (the audience knows more than the
   character, and waits) or surprise (nobody knows, and it lands at once). Suspense is the default
   for tension; surprise is for the twist (Hitchcock to Truffaut, `references/craft.md`).
6. **Write the screenplay** in `data/film/script.fountain` (format below). Action lines describe only
   what can be seen and heard, in present tense. Dialogue is short, and no character names a feeling
   they could show. Enter each scene late and leave early. Read it once as the audience: every scene
   must make us want the next one.
7. **Shot list.** For each scene, in `data/film/shot-list.md`: the shots, each with its size, angle,
   move, the story reason for that choice, the cut into the next shot and the sound. Use
   `references/cinema-language.md`. Default to the simplest shot that tells the beat; spend the big
   shots (a wide reveal, a push-in, a held close-up, silence) on the turns.
8. **Footage mode.** When the footage exists, the shot list is built from it, not imagined: run
   `cine.mjs measure jobs/<id>` (skill `style-cinematic-long`), read `data/cine/shots.md` and the frame
   sheets, and give each shot a story job (establish, want, obstacle, turn, reaction, payoff,
   transition). Shots with no story job are left out, however good, and listed in the report. If the
   footage cannot support a want and an obstacle, use the light shapes in `references/structure.md`
   (journey, portrait or loop) and say so to the user; do not invent events the footage does not show.
9. **Run the checks** below and fix every miss.
10. **Hand over to the edit.** In `beat-sheet.json`, one beat per shot (or per scene for dialogue
    scenes), with `onScreen` naming the scene, the story job and the shot (for example
    `S3 TURN: CU Mara sees the stamp; hold 2 s, no music`). The cinematic skill does the rest from its
    step 5 on. Narration lines go to `data/vo-lines.json` (voice rules from video-job and the style).

## Checks (all must pass before the shot list goes to the beat sheet)

- [ ] The logline names a protagonist, a want, an obstacle and stakes, in one sentence.
- [ ] The dramatic question is raised in the first 10-15% of the film and answered in the last scene.
- [ ] Every scene card answers who wants what, what if not, why now, and turns a value (charge changes).
- [ ] Every link between scenes is "but" or "therefore". Two "and then" links in a row fail.
- [ ] The protagonist causes the climax by a choice. Luck, coincidence or another character does not
      solve their problem (coincidence may start a story, not end it).
- [ ] Every setup pays off and every payoff was set up. Every question opened is closed or left open
      on purpose (the report says which).
- [ ] No character says a feeling they could show. No two characters explain to each other what both
      already know.
- [ ] Each scene has fewer locations and characters than it seems to need. Every one left serves the
      want, the obstacle or the turn.
- [ ] Every shot in the shot list has a story reason. Every move has a motivation (a character, the
      action, or a turn). The biggest shot choices sit on the turns.
- [ ] Screen direction and eyelines are planned (the 180-degree line per scene), and the same
      character looks the same in every shot. For AI-generated clips, check face, wardrobe, props and
      light across shots on the frame sheet.
- [ ] Narration, if any, adds what the picture cannot show (a thought, the past, a contradiction). It
      never describes the shot.
- [ ] The first image and the last image answer each other (same place changed, same action reversed,
      or the want fulfilled or lost).
- [ ] The length fits the budget in `references/structure.md` for this many scenes and pages.
- [ ] Facts about real people, places and events are checked this session and sourced in `report.md`,
      or the film is clearly fiction. No real person is made to say or do what they did not.

## Formats

### Scene card (`data/film/story.md`)

| # | scene | target s | who wants what | if not | why now | value: start -> end | link to next | audience knows | setup / payoff |
|---|---|---|---|---|---|---|---|---|---|
| 1 | INT. POST OFFICE - DAY | 0 | Mara wants her letter back | Tom reads that she is leaving | the bag goes out at noon | hope (+) -> hope (-) | but the clerk refuses | the clock reads 11:52 | plant: Mara's red stamp |

### Screenplay (`data/film/script.fountain`)

Plain-text Fountain (fountain.io): a scene heading starts with `INT.` or `EXT.`, a character name in
caps on its own line, dialogue under it, parentheticals in `( )`, transitions only when they carry
meaning (`SMASH CUT TO:`, `MATCH CUT TO:`). Mark each turn with a note `[[TURN: hope + -> -]]` and each
setup with `[[SETUP: red stamp]]`, so the shot list can find them. Rule of thumb: one page of standard
screenplay format is about one minute of screen time; action-heavy pages run faster or slower, so treat
it as a planning number and re-time after the paper edit.

### Shot list (`data/film/shot-list.md`)

| shot | scene | story job | size | angle | move | why | cut to next | sound | source |
|---|---|---|---|---|---|---|---|---|---|
| 3A | 3 | turn | CU | eye level | slow push in | she sees the stamp: we go inside her decision | hard cut on her breath | room tone drops out | `s07` 2.1-4.3 s, or "to shoot" |

`source` is a measured shot id and range in footage mode, or `to shoot` for a script the user will film.

## Boundaries

- Organization rules apply: no invented facts, quotes or "based on a true story" claims; no words or
  acts put on real, named people; recent events checked and dated. A true story is told only from what
  the user said or what a checked source shows.
- The user's screenplay, treatment and recorded performance are kept word for word. Changes are a
  numbered list of suggestions and a question, never a silent edit.
- Do not copy scenes, dialogue or plots from existing films. Name a reference film only to describe a
  technique, and only when the claim about it is one you can stand behind; never quote its dialogue.
  Never quote song lyrics.
- No credit, title-card credits or attribution text on screen (workspace rule). A film title card is
  fine when the user wants one.
- Rules here are craft defaults, not laws. The user's intent wins: when they break one on purpose
  (no protagonist, an open ending, an essay film), record it in the structure map and keep the rest.
- Never publish or post. Writing and rendering are local.
