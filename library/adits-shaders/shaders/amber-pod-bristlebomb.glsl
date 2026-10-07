/*{
  "ADITS": 1,
  "DESCRIPTION": "A bilateral cluster of black lens pods holding molten amber irises, strung on gold wires, guarded by three starbursts whose every needle changes species on its own schedule. Each needle is one primitive under six interpolated numbers, so it morphs by deforming, not cross-fading, through four forms: blunt thorn, hair needle, barbed hook, glinting filament. Bass swells the pods round and thorns the guard, treble slits them and draws the guard to filaments. Rests as the hair needle.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-21",
  "CATEGORIES": ["generative", "morph", "obsidian", "amber", "creature", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "low",
  "ASPECT": "square",
  "LOOP": 18.0,
  "INPUTS": [
    { "NAME": "sens",    "TYPE": "float", "DEFAULT": 0.80, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",    "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",    "TYPE": "float", "DEFAULT": 0.36, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "spread",  "TYPE": "float", "DEFAULT": 1.00, "MIN": 0.82, "MAX": 1.14,
      "LABEL": "Cluster Spread", "BIND": "bass", "BIND_DEPTH": 0.40 },
    { "NAME": "podGlow", "TYPE": "float", "DEFAULT": 0.60, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Iris Heat", "BIND": "level", "BIND_DEPTH": 0.45 },
    { "NAME": "wires",   "TYPE": "float", "DEFAULT": 0.50, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Gold Wires", "BIND": "mid", "BIND_DEPTH": 0.45 }
  ]
}*/

#define TAU 6.28318530718

// Base needle reach, in uv units, before the morph scales it. It used to be a
// slider; it is now one of the numbers the form interpolates, because reach is
// exactly what tells a thorn from a filament.
#define NLEN 0.19

// How far the per-needle selector is spread around a starburst. The change then
// crosses the burst as a wave instead of flipping every needle at once.
#define STAGGER 1.05

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    return fract(p * (p + p));
}

// One lens pod. Returns:
//   x shell coverage (the opaque black body)
//   y iris fill      (the molten amber inside it)
//   z rim line       (wet specular on the shell edge)
//   w hot centre     (the white core of the melt)
// sqM and irM are the shared continuous parameters: they slide across the whole
// selector range, so the cluster's envelope keeps moving even mid-blend.
vec4 pod(vec2 p, vec2 c, float rad, float tilt, float squash, float sqM, float irM) {
    vec2  q  = p - c;
    float s  = sin(tilt), co = cos(tilt);
    q = vec2(co * q.x + s * q.y, -s * q.x + co * q.y);
    q.y /= squash * sqM;                 // a lens, not a ball
    float d  = length(q) / rad;
    float du = abs(d - 1.0) * rad;       // edge distance in uv units, not in d
    float shell = 1.0 - smoothstep(0.990, 1.012, d);
    float rim   = 1.0 - smoothstep(0.0018, 0.0062, du);
    // The iris sits slightly low in the shell, which is what makes a pod read as
    // an eye rather than as a target.
    float di   = length(q - vec2(0.0, -0.13 * rad)) / rad;
    // The melt pools toward the low side of the lens, so the amber reads as a
    // level of something molten inside the shell rather than as a painted disc.
    float pool = 0.40 + 0.60 * smoothstep(0.42, -0.62, q.y / rad);
    float iris = (1.0 - smoothstep(0.22 * irM, 0.64 * irM, di)) * pool;
    float hot  = (1.0 - smoothstep(0.02 * irM, 0.26 * irM, di)) * pool;
    return vec4(shell, iris, rim, hot);
}

// A ragged starburst whose needles each morph on their own schedule.
//   x needle coverage, y tip glint
// x0 is the burst's own position on the selector axis, so the three bursts do
// not all turn over at the same instant.
vec2 bristle(vec2 p, vec2 c, float spikes, float rot, float x0) {
    vec2  q  = p - c;
    float rr = length(q);
    float k  = (atan(q.y, q.x) - rot) * (spikes / TAU);
    float id = mod(floor(k), spikes);
    float hv = hash11(id * 2.17 + 1.3);

    // Per-needle selector. The cosine term sweeps the change around the burst and,
    // unlike a linear index ramp, is continuous where the ring wraps. The hash
    // keeps the sweep from looking mechanical. Both are static, so at a fixed
    // spectrum the guard holds still: the wave is positioned by the music.
    float u  = 0.5 - 0.5 * cos(id * (TAU / spikes));
    float xj = clamp(x0 + STAGGER * (0.62 * (u - 0.5) + 0.38 * (hv - 0.5)), 0.0, 3.0);

    // Triangular weights of slope 1.85. Support is 1/1.85 either side of a centre
    // and the centres are spaced 1.0, so neighbours overlap over 2/1.85 - 1 = 0.081
    // of the axis and the sum is never zero. The slope must stay below 2.0 or the
    // normalisation divides by nothing.
    float w0 = max(1.0 - abs(xj      ) * 1.85, 0.0);
    float w1 = max(1.0 - abs(xj - 1.0) * 1.85, 0.0);
    float w2 = max(1.0 - abs(xj - 2.0) * 1.85, 0.0);
    float w3 = max(1.0 - abs(xj - 3.0) * 1.85, 0.0);
    float ws = w0 + w1 + w2 + w3;
    w0 /= ws; w1 /= ws; w2 /= ws; w3 /= ws;

    // Parameter-space morph. One needle primitive, six interpolated numbers, so
    // the silhouette deforms and no fragment shows two forms at half alpha.
    //           thorn      needle     hook       filament
    float lm = 0.55 * w0 + 1.00 * w1 + 1.15 * w2 + 1.35 * w3;   // reach
    float wm = 3.20 * w0 + 1.00 * w1 + 1.75 * w2 + 0.62 * w3;   // gauge
    float tp = 0.60 * w0 + 1.00 * w1 + 1.30 * w2 + 1.85 * w3;   // taper
    float bd = 0.02 * w0 + 0.04 * w1 - 0.40 * w2 + 0.02 * w3;   // sickle bend
    float sr = 0.00 * w0 + 0.08 * w1 + 0.55 * w2 + 0.00 * w3;   // serration
    float gl = 0.15 * w0 + 0.45 * w1 + 0.35 * w2 + 1.00 * w3;   // tip glint

    float L  = NLEN * lm * (0.42 + 0.72 * hv);
    float rn = rr / max(L, 1e-4);
    float sg = (fract(k) - 0.5) * (TAU / spikes) * rr;   // signed, so it can bend
    float w  = 0.0020 * wm * (0.20 + 0.80 * pow(clamp(1.0 - rn, 0.0, 1.0), tp));
    w *= 1.0 - sr * 0.55 * fract(rn * 6.0);              // forward-raked teeth
    float sd = abs(sg - bd * rn * rn * L);               // bend the centreline

    float m  = (1.0 - smoothstep(w, w + 0.0015, sd))
             * (1.0 - smoothstep(0.86, 1.02, rn))
             * smoothstep(0.006, 0.030, rr);
    return vec2(m, m * smoothstep(0.50, 0.96, rn) * (0.25 + 1.00 * gl));
}

// One straight gold wire leaving the origin.
float wire(vec2 p, float ang, float len, float w) {
    vec2  d  = vec2(cos(ang), sin(ang));
    float al = dot(p, d);
    float pe = abs(dot(p, vec2(-d.y, d.x)));
    return (1.0 - smoothstep(w, w + 0.0013, pe))
         * step(0.0, al) * (1.0 - smoothstep(len * 0.70, len, al));
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // One loop phase. Every rate below is an integer multiple of it, so the
    // cluster pulses seamlessly on an 18 s cycle. Nothing on the morph path
    // reads it: which needle is which belongs to the music, not to the clock.
    float ph = fract(TIME / 18.0);

    // Bilateral mirror, exactly as the reference cluster sits.
    vec2  p = vec2(abs(uv.x), uv.y);
    float r = length(uv);

    float pulse = sin(ph * TAU);              // one swell per loop
    float wob   = sin(ph * TAU * 2.0);        // two wobbles per loop
    float sc    = spread * (1.0 + 0.045 * pulse);

    // --- Selector -------------------------------------------------------------
    // Balance decides which needle; loudness only decides how hard it is lit.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum  = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;            // 0 all bass, 1 all treble
    // tilt is a ratio of three smoothed averages, so it swings far less than any
    // one band. Expanded around the rest point, or the outer forms never arrive.
    float sel  = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // AUDIO_HAT and AUDIO_KICK already decay, so they are used straight: a hat
    // draws the guard out to filaments, a kick thorns it.
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);
    // At silence tilt is 0/0, so fade to a chosen resting form instead.
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest, sel, live);

    // One transient control drives the light as well as the geometry: the kick
    // that thorns the guard also blows the irises white-hot.
    float kick = 1.0 + 1.5 * snap * AUDIO_KICK;
    float hatF = 1.0 + 1.4 * snap * AUDIO_HAT;

    // Shared continuous parameters. These slide across the whole selector range
    // rather than snapping, so the cluster's envelope is visibly moving even at a
    // 50/50 blend: bass rounds the pods and floods them, treble slits them.
    float sqM = mix(1.16, 0.70, sel);
    float irM = mix(1.14, 0.66, sel);

    // Six pods, hand-placed and then scaled as one cluster. No loop: six calls of
    // a cheap function is both faster and easier to read than an indexed array.
    vec4 a1 = pod(p, vec2(0.058, 0.150) * sc, 0.083 * sc,  0.34 + 0.10 * wob, 0.80, sqM, irM);
    vec4 a2 = pod(p, vec2(0.213, 0.072) * sc, 0.069 * sc, -0.52 - 0.10 * wob, 0.74, sqM, irM);
    vec4 a3 = pod(p, vec2(0.104, -0.058) * sc, 0.094 * sc, 0.14 + 0.08 * wob, 0.86, sqM, irM);
    vec4 a4 = pod(p, vec2(0.252, -0.170) * sc, 0.060 * sc, 0.76 - 0.12 * wob, 0.72, sqM, irM);
    vec4 a5 = pod(p, vec2(0.074, -0.243) * sc, 0.070 * sc, -0.24 + 0.11 * wob, 0.78, sqM, irM);
    vec4 a6 = pod(p, vec2(0.180, 0.248) * sc, 0.048 * sc,  0.92 + 0.09 * wob, 0.70, sqM, irM);

    // Union of the shells, and the sum of what glows inside them.
    float shell = max(max(max(a1.x, a2.x), max(a3.x, a4.x)), max(a5.x, a6.x));
    float rimL  = a1.z + a2.z + a3.z + a4.z + a5.z + a6.z;
    // Each iris breathes on its own phase, so the cluster never pulses as one lamp.
    // Per-pod dimming reads as depth: the small outer lenses sit further back.
    float iris  = a1.y * (0.62 + 0.38 * sin(ph * TAU + 0.0)) * 0.92
                + a2.y * (0.62 + 0.38 * sin(ph * TAU * 2.0 + 1.1)) * 0.66
                + a3.y * (0.70 + 0.30 * sin(ph * TAU + 2.3)) * 1.00
                + a4.y * (0.62 + 0.38 * sin(ph * TAU * 3.0 + 3.4)) * 0.58
                + a5.y * (0.62 + 0.38 * sin(ph * TAU * 2.0 + 4.6)) * 0.86
                + a6.y * (0.62 + 0.38 * sin(ph * TAU * 3.0 + 5.8)) * 0.52;
    float hot   = a1.w * 0.92 + a2.w * 0.60 + a3.w + a4.w * 0.52
                + a5.w * 0.84 + a6.w * 0.46;

    // Three needle starbursts: two out on the flanks, one buried in the middle.
    // Each sits at its own offset on the selector axis, so the guard turns over
    // burst by burst rather than all at once.
    float x0 = sel * 3.0;
    vec2 b1 = bristle(p, vec2(0.235, -0.055) * sc, 26.0,  ph * TAU,        x0 + 0.22);
    vec2 b2 = bristle(p, vec2(0.120, -0.255) * sc, 22.0, -ph * TAU * 2.0,  x0 - 0.20);
    vec2 b3 = bristle(p, vec2(0.030,  0.055) * sc, 34.0,  ph * TAU * 3.0,  x0);
    float nee = b1.x + b2.x + b3.x;
    float tip = b1.y + b2.y + b3.y;

    // Gold wires strung through the cluster.
    float wr = wire(p, 1.32 + 0.10 * wob, 0.30 * sc, 0.0016)
             + wire(p, 0.68 - 0.10 * wob, 0.26 * sc, 0.0013)
             + wire(p, 0.14 + 0.08 * wob, 0.31 * sc, 0.0015)
             + wire(p, -0.62 - 0.09 * wob, 0.29 * sc, 0.0013)
             + wire(p, -1.28 + 0.11 * wob, 0.25 * sc, 0.0016);

    // Palette: an obsidian shell, a molten amber core, a cold needle.
    vec3 obs   = vec3(0.042, 0.042, 0.048);
    vec3 amber = vec3(1.00, 0.50, 0.055);
    vec3 melt  = vec3(1.00, 0.86, 0.46);
    vec3 steel = vec3(0.52, 0.56, 0.64);

    vec3 col = obs * shell * 1.00
             + amber * iris * (0.95 * podGlow) * kick
             + melt * min(hot, 2.0) * (0.85 * podGlow) * kick
             + vec3(0.92, 0.90, 0.86) * min(rimL, 2.0) * 0.30
             + obs * min(nee, 1.5) * 1.10
             + steel * min(tip, 1.5) * 0.55 * hatF
             + mix(amber, melt, 0.45) * min(wr, 2.0) * (0.85 * wires);

    // Soft knee: six irises overlap near the middle and would clip to flat white.
    col = col / (1.0 + col * 0.26);

    // Radial safety bound. uv reaches only 0.5 on the axes, so everything closes
    // by 0.482 and the needles fade instead of being sliced. The filament form is
    // the longest, at NLEN * 1.35 * 1.14 = 0.292 from its anchor, which is under
    // the reach the old Needle Reach slider allowed at its top.
    float rim = 1.0 - smoothstep(0.425, 0.482, r);
    col *= rim;

    // Coverage, then premultiply. Zero everywhere the object is not.
    float alpha = (shell * 1.00 + min(iris, 1.0) * 0.60 + min(rimL, 1.0) * 0.70
                 + min(nee, 1.0) * 0.95 + min(tip, 1.0) * 0.40
                 + min(wr, 1.0) * 0.85) * rim;
    alpha = smoothstep(0.020, 0.90, alpha);
    alpha = clamp(alpha, 0.0, 1.0);
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
