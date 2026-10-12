# Arc templates and word budgets

## Words per second

Map seconds to words before writing. These rates come from earlier rcg jobs, each measured on one
script, so treat them as estimates and re-measure after voicing.

| Voice | Settings | Speech rate | Finished video (with lead, gaps, tail) | Source |
|---|---|---|---|---|
| Kokoro `af_heart` | `--speed 1.3 --skip-silences` (user default) | about 3.6 words/s | about 3 words/s | `style-info-graphics/references/script-writing.md` (25-word script) |
| MeloTTS EN-US | `--speed 1.0 --skip-silences` | about 3.5 words/s | about 2.6 words/s with mix-media's longer gaps (86 words, 32.7 s) | `style-mix-media/references/script-voice.md` |
| A person on camera | as recorded | measure: transcript words / speech seconds | measure | the job's `data/words.json` or transcript |

When a person will record a shoot script and no sample exists, plan at 2.5 words a second and
re-measure from the take.

`target second ≈ lead + words before the line / rate`. At 3 words a second: 5 s is about 15 words,
10 s about 30, 15 s about 45.

## Templates

Seconds are targets for the start of each slot. Levels are the 0-100 planning score.
"Words" is the total budget at 3 words a second; scale it for another rate.

### 15 s (about 40-45 words): hook, one peak, payoff

| Slot | Target s | Level | Words |
|---|---|---|---|
| Hook | 0-3 | 70 | 6-9 |
| Peak 1 | 3-6 | 90 | 8-12 |
| Release | 6-10 | 40 | 10-14 |
| Payoff (a peak) | 10-15 | 85-95 | 6-12 |

No room for a second mini-peak. The payoff does that job.

### 30 s (about 85-90 words): hook, two peaks, payoff

| Slot | Target s | Level | Words |
|---|---|---|---|
| Hook | 0-3 | 70 | 6-9 |
| Peak 1 | 3-8 | 90 | 8-15 |
| Release | 8-14 | 35 | 15-20 |
| Peak 2 | 14-18 | 85 | 8-12 |
| Release | 18-22 | 40 | 8-12 |
| Peak 3 or twist | 22-26 | 90 | 10-15 |
| Payoff | 26-30 | 80-95 | 4-12 |

### 45 s (about 130 words)

Hook 0-3, peak 1 by 8, release to about 16, peak 2 at 16-20, release, peak 3 at 28-32 (the twist
fits here, about two-thirds in), release, payoff at 40-45.

### 60 s (about 175-185 words)

Hook 0-3, peak 1 by 8, release to about 20, peak 2 at 20-24, peak 3 at 33-37 (twist), peak 4 at
45-49, payoff at 54-60. Releases 8-12 s each.

### 90 s (about 260-270 words)

Hook 0-3, peak 1 by 10, then a peak every 12-15 s (about six peaks), one twist about 55-65 s in,
payoff in the last 6 s. This is the shortest length where the framework's longer release (up to
20 s) after the first peak fits without breaking the 15 s rule elsewhere.

### Over 2 minutes

Rare in rcg. Peaks every 10-15 s still, a misdirection every 2-3 minutes, and a stated goal or
question in the first 15 s that the payoff answers.

## The curve (30 s example)

```
level
 95 |        P1                         P3
 90 |        /\              P2         /\      payoff
 85 |       /  \             /\        /  \      /\
 70 | hook /    \           /  \      /    \    /  \
 50 |-----'      \         /    \    /      \  /
 35 |             \_______/      \__/        \/
    +----+----+----+----+----+----+----+----+----+---- s
    0    3    6    9   12   15   18   21   24   27   30
```

The hook does not start at zero. The releases do not drop to zero. Each release ends with a lift
into the next peak.

## Measuring gaps after voicing

1. Voice the lines and run `rcg infographics place-voice` (it prints each line's start). For
   recorded speech, use the transcript word times.
2. Put each peak line's start into the peak map's `actual s` column.
3. Gap check: no two peaks (counting the hook as the first) more than 15 s apart; for videos of
   30 s or less, aim for 10 s.
4. Too long: cut words from the release before it. Do not cut or weaken the peak. Re-voice and
   re-place.
