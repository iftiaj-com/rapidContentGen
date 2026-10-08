// Adits Global Color Mask (core/ColorMask.js, unmodified) as main.js calls it (9411-9417):
// colorMask.apply(dom, videoEngine, ctx, drawMedia, crop, pnpMedia, pnpCrop, hasPnpMedia),
// after the frame (the "current composite") is on the canvas.
//
// Here the footage (--src) is Main, the keyed layer. Side B (--src2), when given, is both the
// "other media" (mode media: revealed where the colour matches) and the composite drawn first
// (modes effect / color: pass an rcg fx clip of the same footage to isolate that effect in the
// matched colour). Without --src2 the composite is the footage itself.
//
// The WebGPU pipeline compiles asynchronously; _ready turns true once it exists, and the
// harness waits for it before frame 0 (Adits leaves the first frames unkeyed instead).

import { domProxy } from './three-host.js';

export async function create(ColorMask, env) {
  const cm = new ColorMask();
  const dom = domProxy();
  const { width: W, height: H } = env.job;
  const crop = { sx: 0, sy: 0, sw: W, sh: H };
  const obj = {
    _ready: false,
    render(ctx, ve, media) {
      ctx.drawImage(env.media2 || media, 0, 0, W, H);
      cm.apply(dom, ve, ctx, media, crop, env.media2, env.media2 ? crop : null, Boolean(env.media2));
      obj._ready = !ve.gpuDevice || Boolean(cm._pipeline);
    },
  };
  return obj;
}
