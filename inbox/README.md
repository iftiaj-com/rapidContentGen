# Inbox

Drop a job here, one folder per job:

```
inbox/
  my-reel/
    prompt.md        what you want (copy prompt.template.md)
    clip1.mp4        your footage (any number of videos)
    music.mp3        optional music
    photo.jpg        optional images
```

Then tell Claude: "new job from inbox/my-reel". You can also attach files and type the prompt in
chat instead; the inbox is optional.

When `rcg new-job` takes media from a folder it writes `.rcg-claim.json` there (job id, agent, time),
so a second agent session will not start the same folder. `node tools/rcg.mjs inbox list` shows which
folders are free or claimed; `node tools/rcg.mjs inbox release <folder>` frees one.

When the job is finished the agent runs `node tools/rcg.mjs inbox done --job jobs/<id>`, which renames the
folder to `<folder>-Complete`. You can leave finished folders here and keep adding new ones: agents
skip `-Complete` folders (`inbox list --all` shows them). To redo one, remove `-Complete` from its name.

Everything in this folder except this README and the template is ignored by git.
