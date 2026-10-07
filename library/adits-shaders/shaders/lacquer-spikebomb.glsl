/*{
  "ADITS": 1,
  "DESCRIPTION": "A lacquered spike bomb on a cluster of glossy pods that never changes, wearing eighteen spikes that each change species on their own schedule. Each is one cone under seven interpolated numbers, so it morphs by deforming, not cross-fading, through four forms: broad wedge, tapered cone, hooked spike, bare needle. Bass wedges the burst, treble hones it to needles, and the change sweeps spike by spike. Rests as the tapered cone.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-21",
  "CATEGORIES": ["generative", "morph", "lacquer", "spike", "obsidian", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "low",
  "ASPECT": "square",
  "LOOP": 18.0,
  "INPUTS": [
    { "NAME": "sens",   "TYPE": "float", "DEFAULT": 0.80, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",   "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",   "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "spread", "TYPE": "float", "DEFAULT": 0.300, "MIN": 0.240, "MAX": 0.350,
      "LABEL": "Spike Reach", "BIND": "bass", "BIND_DEPTH": 0.40 },
    { "NAME": "gloss",  "TYPE": "float", "DEFAULT": 0.60, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Lacquer Gloss", "BIND": "level", "BIND_DEPTH": 0.45 },
    { "NAME": "knobs",  "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Tip Knobs", "BIND": "treble", "BIND_DEPTH": 0.45 }
  ]
}*/

#define TAU 6.28318530718

// Cone half-width at the hub, in uv units.
#define CONE 0.050

// Where the lacquer cycle starts. It used to be a slider; the six-slot budget
// went to the morph controls instead, and this is the value it defaulted to.
#define HUE_OFF 0.20

// How far the per-spike selector is spread around the burst. The change then
// crosses it spike by spike instead of flipping all eighteen at once.
#define STAGGER 1.05

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    return fract(p * (p + p));
}

vec3 pal(float t) {
    return 0.5 + 0.5 * cos(TAU * (t + vec3(0.00, 0.33, 0.67)));
}

// One glossy pod: an ellipse with a wet rim and a broad internal sheen.
//   x body, y rim, z sheen
vec3 pod(vec2 p, vec2 c, float rad, float tilt, float squash) {
    vec2  q  = p - c;
    float s  = sin(tilt), co = cos(tilt);
    q = vec2(co * q.x + s * q.y, -s * q.x + co * q.y);
    q.y /= squash;
    float d  = length(q) / rad;
    float du = abs(d - 1.0) * rad;
    return vec3(1.0 - smoothstep(0.990, 1.012, d),
                1.0 - smoothstep(0.0016, 0.0050, du),
                (1.0 - smoothstep(0.30, 0.92, d)) * (0.35 + 0.65 * smoothstep(0.35, -0.55, q.y / rad)));
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // One loop phase. Every rate below is an integer multiple of it, so the burst
    // and its lacquer colour wrap seamlessly on an 18 s cycle. Nothing on the
    // morph path reads it: which spike is which belongs to the music.
    float ph = fract(TIME / 18.0);

    float r = length(uv);
    float a = atan(uv.y, uv.x);          // one atan for the frame, none in a loop

    float turn   = ph * TAU;                            // one slow turn per loop
    float breath = 1.0 + 0.045 * sin(ph * TAU * 2.0);
    float wob    = sin(ph * TAU * 3.0);
    float span   = spread * breath;

    // --- Selector -------------------------------------------------------------
    // Balance decides which spike; loudness only decides how glossy it is.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum  = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;            // 0 all bass, 1 all treble
    // tilt is a ratio of three smoothed averages, so it swings far less than any
    // one band. Expanded around the rest point, or the outer forms never arrive.
    float sel  = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // AUDIO_HAT and AUDIO_KICK already decay, so they are used straight: a hat
    // hones a spike to a needle, a kick wedges it.
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);
    // At silence tilt is 0/0, so fade to a chosen resting form instead.
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest, sel, live);

    // --- Morphing burst: eighteen spikes ---------------------------------------
    const float SPIKES = 18.0;
    float sk  = (a + turn) * (SPIKES / TAU);
    float sid = mod(floor(sk), SPIKES);
    float sp  = (fract(sk) - 0.5) * (TAU / SPIKES) * r;   // signed, so it can bend

    float hv  = hash11(sid * 1.93 + 2.1);
    float hv2 = hash11(sid * 7.41 + 5.3);

    // Per-spike selector. The cosine term sweeps the change around the burst and,
    // unlike a linear index ramp, is continuous where the ring wraps. The hash
    // keeps that sweep from looking mechanical. Both are static, so at a fixed
    // spectrum the burst holds still: the wave is positioned by the music.
    float u  = 0.5 - 0.5 * cos(sid * (TAU / SPIKES));
    float xj = clamp(sel * 3.0 + STAGGER * (0.66 * (u - 0.5) + 0.34 * (hv2 - 0.5)),
                     0.0, 3.0);

    // Triangular weights of slope 1.85. Support is 1/1.85 either side of a centre
    // and the centres are spaced 1.0, so neighbours overlap over 2/1.85 - 1 = 0.081
    // of the axis and the sum is never zero. The slope must stay below 2.0 or the
    // normalisation below divides by nothing.
    float w0 = max(1.0 - abs(xj      ) * 1.85, 0.0);
    float w1 = max(1.0 - abs(xj - 1.0) * 1.85, 0.0);
    float w2 = max(1.0 - abs(xj - 2.0) * 1.85, 0.0);
    float w3 = max(1.0 - abs(xj - 3.0) * 1.85, 0.0);
    float ws = w0 + w1 + w2 + w3;
    w0 /= ws; w1 /= ws; w2 /= ws; w3 /= ws;

    // Parameter-space morph. One cone primitive, seven interpolated numbers, so
    // the silhouette deforms and no fragment ever shows two forms at half alpha.
    //             wedge      cone       hook       needle
    float lenM = 0.68 * w0 + 1.00 * w1 + 1.05 * w2 + 1.10 * w3;  // reach
    float wM   = 1.90 * w0 + 1.00 * w1 + 0.60 * w2 + 0.26 * w3;  // chord
    float tpr  = 0.55 * w0 + 1.00 * w1 + 1.25 * w2 + 1.75 * w3;  // taper
    float bd   = 0.02 * w0 + 0.04 * w1 - 0.32 * w2 + 0.02 * w3;  // hook
    float krM  = 1.80 * w0 + 1.00 * w1 + 0.70 * w2 + 0.15 * w3;  // knob
    float colM = 1.60 * w0 + 1.00 * w1 + 1.35 * w2 + 0.20 * w3;  // lathe groove
    float spcM = 1.40 * w0 + 1.00 * w1 + 0.85 * w2 + 0.55 * w3;  // specular stripe

    // Lengths vary hard, which is what makes the burst read as a thrown caltrop
    // rather than as a sunflower. The hash spread is narrower than the archetype
    // spread, so the longest form on the longest spike is what bounds the object.
    float L   = span * (0.52 + 0.58 * hv) * lenM;
    float t   = r / max(L, 1e-4);
    float tap = clamp(1.0 - t, 0.0, 1.0);
    // A gentle taper, not a square one: the reference cones are broad wedges at
    // the hub, and a high exponent thins them to threads before they leave the pods.
    float w   = CONE * wM * pow(tap, tpr) * (0.30 + 0.70 * tap) * (0.55 + 0.75 * hv2);
    float sd  = abs(sp - bd * t * t * L);          // bend the centreline

    float onS   = smoothstep(0.010, 0.028, r) * (1.0 - smoothstep(0.975, 1.005, t));
    float cone  = (1.0 - smoothstep(w, w + 0.0016, sd)) * onS;
    // Hard specular stripe down the spine: this is the whole lacquer read.
    float spec  = (1.0 - smoothstep(0.14 * w * spcM, 0.34 * w * spcM + 0.0009, sd)) * onS;
    float lip   = (1.0 - smoothstep(0.0006, 0.0026, abs(sd - w))) * onS;

    // A turned knob near the point of every second spike. Placed on the spike's
    // own centre direction, so it sits on the cone rather than beside it.
    float ac  = (sid + 0.5) * (TAU / SPIKES) - turn;
    vec2  kc  = L * (0.84 + 0.06 * wob) * vec2(cos(ac), sin(ac));
    float kr  = (0.007 + 0.011 * knobs) * (0.6 + 0.8 * hv2) * krM;
    float dk  = length(uv - kc);
    float has = step(0.42, hv2) * step(0.25, krM);
    float knob = (1.0 - smoothstep(kr, kr + 0.0018, dk)) * has;
    float knobR = (1.0 - smoothstep(0.0010, 0.0034, abs(dk - kr))) * has;
    // A thin collar just inboard of it, like a lathe groove.
    float coll = (1.0 - smoothstep(0.0018 * colM, 0.0036 * colM, abs(r - L * 0.70)))
               * (1.0 - smoothstep(w * 1.9, w * 1.9 + 0.0020, sd)) * onS
               * step(0.25, colM);

    // --- Core pods -------------------------------------------------------------
    vec3 p1 = pod(uv, vec2(0.070, 0.062) * breath, 0.086 * breath,  0.30 + 0.10 * wob, 0.78);
    vec3 p2 = pod(uv, vec2(-0.078, 0.040) * breath, 0.076 * breath, -0.45 - 0.10 * wob, 0.74);
    vec3 p3 = pod(uv, vec2(0.014, -0.084) * breath, 0.092 * breath,  0.10 + 0.09 * wob, 0.84);
    vec3 p4 = pod(uv, vec2(-0.048, -0.050) * breath, 0.062 * breath, 0.85 - 0.11 * wob, 0.70);
    vec3 p5 = pod(uv, vec2(0.094, -0.026) * breath, 0.056 * breath, -0.70 + 0.12 * wob, 0.72);

    float podB = max(max(p1.x, p2.x), max(max(p3.x, p4.x), p5.x));
    float podR = p1.y + p2.y + p3.y + p4.y + p5.y;
    float podS = p1.z + p2.z + p3.z + p4.z + p5.z;

    // --- Lacquer ---------------------------------------------------------------
    // One hue for the whole object, precessing once per loop, plus a view term so
    // orbiting shifts the finish the way a real lacquer does.
    vec3  lac  = pal(ph + HUE_OFF + 0.22 * (1.0 - CAM_DIR.z));
    vec3  deep = lac * 0.11 + vec3(0.016);
    vec3  hot  = mix(lac, vec3(1.0, 0.98, 0.95), 0.72);

    // One transient control drives the light as well as the geometry. AUDIO_KICK
    // already decays, so it is used straight and the 1.0 floor keeps the pods
    // lit in silence.
    float kick = 1.0 + 1.5 * snap * AUDIO_KICK;

    vec3 col = deep * (cone * 1.25 + podB * 1.35 + knob * 1.30)
             + lac * spec * (0.42 + 0.70 * gloss)
             + hot * spec * spec * (0.22 + 0.42 * gloss)
             + hot * min(lip, 1.0) * (0.22 + 0.34 * gloss)
             + lac * min(podS, 2.0) * (0.78 * gloss) * kick
             + hot * min(podR, 2.0) * (0.20 + 0.26 * gloss) * kick
             + hot * knobR * 0.55
             + lac * knob * 0.45
             + hot * coll * 0.40;

    // Soft knee: eighteen cones and five pods pile up on the hub.
    col = col / (1.0 + col * 0.34);

    // Radial safety bound. The needle form is the longest, at 0.350 * 1.045
    // breath * 1.10 spread * 1.10 length, which puts its point at 0.445: no
    // further than the old length spread already reached, so this fade feathers
    // the points exactly as it did before.
    float rim = 1.0 - smoothstep(0.425, 0.482, r);
    col *= rim;

    // Coverage, then premultiply. Zero everywhere the object is not.
    float alpha = (cone * 1.00 + podB * 1.00 + knob * 1.00 + knobR * 0.80
                 + min(podR, 1.0) * 0.70 + min(lip, 1.0) * 0.60 + coll * 0.75) * rim;
    alpha = smoothstep(0.020, 0.90, alpha);
    alpha = clamp(alpha, 0.0, 1.0);
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
