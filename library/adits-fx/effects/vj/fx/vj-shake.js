/**
 * vj-shake.js — shared "Shake" GLSL chunk + clock for the Video Jockey deck. // VJ
 * ─────────────────────────────────────────────────────────────────────────────
 * Shake is a SHARED param, like Glow / Parallax / Depth — every VJ FX gets it,
 * so the maths lives in one place instead of being copy-tuned per FX. Same shape
 * as shared/UniversalColorModeGPU.js: string chunks an FX splices into its own
 * shader, plus the JS that binds them.
 *
 * An FX opts in with four edits:
 *   1. `${SHAKE_UNIFORMS}`  in its uniform block
 *   2. `${SHAKE_FUNCTIONS}` above main()
 *   3. `...SHAKE_UNIFORM_NAMES` in its UNIFORM_NAMES array
 *   4. `shakeUv(uv, depth)` wrapped around the uv it samples the MEDIA with,
 *      and `setShakeUniforms(...)` in render()
 *
 * The chunk also owns `uTime` (seconds, wall clock). Any FX that wants its own
 * animation — ScanFX's mote drift, say — reads that uniform rather than
 * declaring a second clock, so an FX never ends up with two unsynced timelines.
 *
 * NOTE: this file embeds a GLSL template literal — it is excluded from the prod
 * obfuscator in vite.config.mjs (same as ScanFX.js / LumNetworkFX.js).
 */

export const SHAKE_UNIFORM_NAMES = ['uTime', 'uShake', 'uShakeDrive'];

export const SHAKE_UNIFORMS = /* glsl */`
uniform float uTime;           // seconds since this FX was constructed
uniform float uShake;          // 0 off … 1 violent
uniform float uShakeDrive;     // 0..1 — live value of the primary control channel
`;

export const SHAKE_FUNCTIONS = /* glsl */`
/* Three incommensurate sines. Erratic enough to read as a real handheld camera
   rather than as a loop, and far cheaper than a noise-texture lookup. ~-1..1. */
float shakeWave(float t, float seed) {
    return sin(t * 1.000 + seed)             * 0.55
         + sin(t * 2.371 + seed * 3.1)       * 0.30
         + sin(t * 5.137 + seed * 7.7)       * 0.15;
}

/* Camera shake on the MEDIA sample only — the FX overlay stays locked to the
   screen, exactly the way uParallax already behaves. That separation is the
   point: the footage throws around underneath a stable pattern.

   Three things make it read as a camera instead of as UV jitter:
     · rotation as well as translation — translation alone reads as a slipping
       texture, not as a hand holding something;
     · a depth weight on the translation, so near material throws further than
       far. This is the same displacement family as parallax, which is why the
       control sits directly under it. Rotation is deliberately left RIGID —
       weighting an angle per-pixel stops being a rotation and turns into a
       rubbery twist;
     · a pre-zoom proportional to the throw, so a violent shake never drags a
       smeared clamped edge pixel across the frame. 0.26 covers the worst case
       (0.055 translation + a 0.045rad corner swing) with margin.

   Amplitude rides uShakeDrive — the live value of whatever the Control selector
   owns — so an audio-driven deck punches on transients and a gesture-driven one
   shakes when you move. The 0.30 floor is what stops it dying between hits, and
   what makes a ramp/ease wrap read as a dip rather than as a stall. uShake is
   squared so the bottom of the slider stays usable for a subtle tremor instead
   of jumping straight to "broken monitor". */
vec2 shakeUv(vec2 uv, float depth) {
    if (uShake <= 0.0) return uv;

    float amp = uShake * uShake * (0.30 + 0.70 * uShakeDrive);
    float w   = uTime * (6.0 + 22.0 * uShake);
    float dw  = mix(0.55, 1.0, depth);

    vec2  off = vec2(shakeWave(w, 0.0), shakeWave(w, 11.3)) * (0.055 * amp * dw);
    float ang = shakeWave(w, 27.9) * (0.045 * amp);
    float zm  = 1.0 + 0.26 * amp;

    float c = cos(ang), s = sin(ang);
    vec2  p = uv - 0.5;
    p = vec2(p.x * c - p.y * s, p.x * s + p.y * c) / zm;
    return p + 0.5 + off;
}
`;

/**
 * Bind the shared clock + shake uniforms.
 *
 * `time` is supplied by the caller rather than read from performance.now() here.
 * VJDeck derives it from MEDIA time during offline post-processing — that pass
 * re-renders frames as fast as the encoder allows, not in realtime, so a
 * wall-clock basis would export shake (and ScanFX's mote drift, and LightshowFX's
 * strobe) at whatever rate the export happened to run rather than at the rate it
 * was performed at. Live, it is ordinary wall-clock seconds and nothing changes.
 *
 * @param {WebGL2RenderingContext} gl
 * @param {object} u      uniform-location map from VJPass.use()
 * @param {object} params static FX params (reads `shake`)
 * @param {number} drive  primary channel value, 0..1 — the "selected Control"
 * @param {number} time   seconds on the deck's show clock
 */
export function setShakeUniforms(gl, u, params, drive, time) {
    gl.uniform1f(u.uTime, time || 0);
    gl.uniform1f(u.uShake, params.shake ?? 0);
    gl.uniform1f(u.uShakeDrive, drive ?? 0);
}
