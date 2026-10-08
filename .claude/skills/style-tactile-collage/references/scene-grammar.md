# Scene grammar

Ported from the Tactile Paper Collage skill (github.com/audrey-560/hyperframes-tactile-collage,
MIT), mapped to the `rcg style` components. Choose the physical metaphor from the narrative
function of the beat, not from a fixed storyboard.

| Narrative function | Construction | Components | Motion cause |
|---|---|---|---|
| Hook or surprising claim | A cluster gathers, one verdict lands | `headline` + `stamp` | objects gather, then the verdict lands |
| Many alternatives | Mismatched cards or tags around one anchor | 2-3 `paper-card` / `file-tag`, staggered | fan out from one origin |
| New concept | Taped note or lifted paper panel | `paper-card` (`variant: note`) | the note is attached (tape lands) |
| Person or evidence | Taped photo with a short caption | `taped-photo` (+ `route` to it) | a route draws toward the evidence |
| Comparison | Two unequal cards with a clear divide | two `paper-card`s, left and right | cards separate, then settle into roles |
| Process | Checklist or numbered cards | `checklist` | each row appears because the previous finished |
| Handoff | A file tag crosses between stations | `file-tag` (`from` = direction) | the moved object owns the transition |
| Transformation | Keep one card in place while its state changes | `paper-card` then `stamp` on it | the existing object becomes the result |
| Proof or result | Checked rows, an approved stamp | `checklist` + `stamp` (`colour: resolve`) | evidence stacks, checks or stamps in |
| Return or reuse | A route closing back to earlier material | `route` back to a re-shown tag or card | the route closes the loop |
| Closing prompt | Two or three big paper questions | `headline` or 2-3 `paper-card`s | questions land in spoken order |

## Building one beat

1. Write the beat's single sentence (from the transcript or the voiceover script).
2. Find its concrete noun or action.
3. Pick one physical metaphor that makes that noun or action visible.
4. Design the strongest paused frame first: snapshot the beat's middle before tuning motion.
5. One hero move, at most one support move, a quiet ground.
6. End in a readable state that can hand an object, direction, colour or shape to the next beat.

## Continuity

- Keep paper size, edge weight and shadow direction across the piece (the components do).
- Carry an object across beats when the story refers to the same thing: reuse its text, colour and
  position (same `x`, `y`, `w`).
- Give a repeated concept a stable colour role.
- Let the person on camera stay the human anchor; do not centre every graphic on them.
- Use full-frame paper beats to reset attention, not on every sentence. R9a used one in four.

## Emphasis words

`*word*` in a `headline` or `paper-card` sets it in marker in the accent colour (`highlight: true` on a
headline adds a tape stroke under it and keeps the word ink). Pick one word per beat, the one the
voice leans on. Use the same word for the caption `--emphasis`.
