// Side B for SplitScreen and RevealUnder. In Adits each effect polls its file input and builds
// its own <video>, which then plays on the wall clock. Here the harness feeds a canvas that it
// redraws every frame from the second clip (advanced at the effect's B speed), so B is
// deterministic. Without --src2 both effects fall back to Layer A zoomed 1.3x, as in Adits.

export async function setup(effect, env) {
  if (env.media2) effect._mediaB = env.media2;
}

// SplitScreen's image masks (bird.gif, flower, leaf, smoke) load asynchronously; load them before
// frame 0 and anchor the bird's animation clock to the timeline (its t0 is otherwise wall time).
const MASK_INDEXES = [7, 8, 9, 10];

export async function afterWarmUp(effect, env) {
  if (!env.job.options?.masks || !effect._bindMaskTexture || !effect._gl) return;
  for (const idx of MASK_INDEXES) effect._bindMaskTexture(effect._gl, idx);
  for (let k = 0; k < 500; k++) {
    const assets = Object.values(effect._maskAssets || {});
    if (assets.length >= MASK_INDEXES.length && assets.every((a) => a.ready)) break;
    env.flushRaf();
    await new Promise((r) => setTimeout(r, 10));
  }
  const pending = Object.entries(effect._maskAssets || {}).filter(([, a]) => !a.ready).map(([k]) => k);
  if (pending.length) env.log(`mask assets still loading: ${pending.join(', ')}`);
  if (effect._maskAssets?.bird) effect._maskAssets.bird.t0 = 0;
}
