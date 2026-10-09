# Jobs

Each video you make gets its own folder here, created by `rcg new-job`:

```
jobs/
  2026-10-09-my-reel/
    JOB.md            the prompt, media notes and progress
    beat-sheet.md     the plan
    index.html        the edit (HyperFrames composition)
    assets/           your footage, voice, music
    renders/          the finished video
    report.md         what was made and checked
```

This folder is git-ignored apart from this file. Your jobs stay on your machine, and nobody else's
jobs come with the repo.

Keep a job after you have the video: to change the edit later, or to start a similar video from it:

```
node tools/rcg.mjs new-job --name my-next-reel --like jobs/<old-id> --video new-clip.mp4
```

That copies the edit, plan, fonts and SFX, but not the footage, voice, music or renders.
To save space, delete a job's `renders/` (after copying the final video out) and `frames/`.
