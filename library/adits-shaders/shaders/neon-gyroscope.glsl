/*{
  "ADITS": 1,
  "DESCRIPTION": "A neon gyroscope: four iridescent cyan-violet-magenta rings tumbling around a plasma core that never changes, each ring changing species on its own schedule. Each is one ellipse under six interpolated numbers, so it morphs by deforming, not cross-fading, through four forms: fat glass band, neon ring, beaded chain, hair filament. Bass bands the gyro, treble draws it to filaments, and the change sweeps ring by ring. Rests as the neon ring.",
  "CREDIT": "claude-sonnet-5",
  "DATE": "2026-08-20",
  "CATEGORIES": ["generative", "morph", "neon", "audio", "loop"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "low",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "sens",  "TYPE": "float", "DEFAULT": 0.80, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",  "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",  "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "scale", "TYPE": "float", "DEFAULT": 0.30, "MIN": 0.18, "MAX": 0.35,
      "LABEL": "Gyro Size", "BIND": "level", "BIND_DEPTH": 0.35 },
    { "NAME": "glow",  "TYPE": "float", "DEFAULT": 0.35, "MIN": 0.10, "MAX": 0.90,
      "LABEL": "Ring Glow", "BIND": "bass", "BIND_DEPTH": 0.6 },
    { "NAME": "crisp", "TYPE": "float", "DEFAULT": 0.50, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Edge Crispness", "BIND": "treble", "BIND_DEPTH": 0.45 }
  ]
}*/

#define TAU 6.28318530718

// Where the palette starts along each ring. It used to be a slider; the six-slot
// budget went to the morph controls instead, and its default was zero.
#define HUE_SHIFT 0.0

// How far the per-ring selector is spread across the gyro. The change then
// crosses it ring by ring instead of flipping all four at once.
#define STAGGER 1.05

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    return fract(p * (p + p));
}

// Cyan <-> violet <-> magenta sweep, period 1 in t. The second harmonic pulls
// green down mid-sweep so the middle reads as true violet, not grey lavender.
// Both harmonics are integer multiples of TAU * t, so the palette wraps.
vec3 neonPal(float t) {
    float c1 = cos(TAU * t);
    float c2 = cos(2.0 * TAU * t);
    return vec3(0.55 + 0.45 * c1,
                (0.55 - 0.45 * c1) * (0.80 + 0.20 * c2),
                1.0);
}

// One tilted ring, drawn in 2D. A circle rotated in 3D projects to an ellipse:
// the precession angle rotates the ellipse and the tumble squashes its minor
// axis, which reads as a ring turning in depth. Returns rgb energy plus a
// coverage term in .a.
// u is the ring's place in the nest and x0 the object's place on the selector
// axis; together they decide which of the four forms this ring is.
vec4 neonRing(vec2 p, float ang, float radius, float squash,
              float th, float haloW, float hueBase, float gain,
              float u, float x0) {
    // Per-ring selector. u sweeps the change across the nest; the hash keeps that
    // sweep from looking mechanical. Both are static, so at a fixed spectrum the
    // gyro holds still: the wave is positioned by the music, not by the clock.
    float jt = hash11(u * 5.17 + 2.3);
    float xj = clamp(x0 + STAGGER * (0.66 * (u - 0.5) + 0.34 * (jt - 0.5)), 0.0, 3.0);

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

    // Parameter-space morph. One ellipse primitive, six interpolated numbers, so
    // the section deforms and no fragment ever shows two forms at half alpha.
    //             band       ring       chain      filament
    float radM = 0.80 * w0 + 1.00 * w1 + 1.05 * w2 + 1.10 * w3;   // radius
    float thM  = 1.90 * w0 + 1.00 * w1 + 1.35 * w2 + 0.55 * w3;   // stroke
    float halM = 1.45 * w0 + 1.00 * w1 + 1.30 * w2 + 0.50 * w3;   // halo
    float gnM  = 0.85 * w0 + 1.00 * w1 + 1.10 * w2 + 1.55 * w3;   // emission
    float dshD = 0.00 * w0 + 0.00 * w1 + 1.00 * w2 + 0.20 * w3;   // beading
    float dshN = 6.00 * w0 + 8.00 * w1 + 20.0 * w2 + 34.0 * w3;   // bead pitch

    radius *= radM;
    haloW  *= halM;
    gain   *= gnM;

    float ca = cos(ang);
    float sa = sin(ang);
    vec2 q = vec2(ca * p.x + sa * p.y, ca * p.y - sa * p.x);

    // Minor axis never fully collapses, so edge-on stays a readable sliver.
    float minorS = mix(0.10, 1.0, squash);
    vec2 ab = vec2(radius, radius * minorS);

    // Cheap ellipse distance approximation (good near the curve).
    float k1 = length(q / ab);
    float k2 = length(q / (ab * ab));
    float d = abs(k1 * (k1 - 1.0) / (k2 + 1.0e-7));

    // Hue flows along the ring. The angle is taken on the un-squashed circle,
    // and it doubles as the coordinate the beading is cut in. abs(sin) is even,
    // so the beads close cleanly where atan wraps whatever the pitch.
    float angRing = atan(q.y / minorS, q.x);
    float bead = mix(1.0, 0.25 + 1.50 * pow(abs(sin(angRing * dshN * 0.5)), 0.70), dshD);

    // Crisp core stroke, roughly 2-4 px at the default resolutions.
    float thm = th * thM * bead;
    float stroke = smoothstep(thm, thm * 0.30, d);

    // Tight halo, bounded by a smoothstep that hits zero 0.13 uv from the
    // stroke, so the glow can never creep across the frame.
    float halo = haloW / (d * d + 0.0011) * smoothstep(0.13, 0.01, d);

    vec3 tint = neonPal(angRing / TAU + hueBase);

    // The innermost sliver of the stroke desaturates toward white. A fully
    // saturated stroke reads as painted line; a white-hot centre wrapped in
    // coloured halo is what reads as laser light over footage.
    float hot = smoothstep(thm * 0.45, 0.0, d);
    tint = mix(tint, vec3(1.0), 0.45 * hot);

    // Edge-on rings brighten a little, like real neon seen along its length.
    float limb = 1.0 + 0.30 * (1.0 - squash);

    float energy = (stroke * gain + halo * 0.34) * limb;
    return vec4(tint * energy, stroke * 0.90 + halo * 0.28);
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // The only place TIME is read. Everything below animates on ph with
    // integer rates, so the design wraps exactly at LOOP = 16 s. Nothing on the
    // morph path reads it: which ring is which belongs to the music.
    float ph = fract(TIME / 16.0);
    float r = length(uv);

    // --- Selector -------------------------------------------------------------
    // Balance decides which ring; loudness only decides how hard it burns.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum  = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;            // 0 all bass, 1 all treble
    // tilt is a ratio of three smoothed averages, so it swings far less than any
    // one band. Expanded around the rest point, or the outer forms never arrive.
    float sel  = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // AUDIO_HAT and AUDIO_KICK already decay, so they are used straight: a hat
    // draws a ring down to a filament, a kick swells it into a band.
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);
    // At silence tilt is 0/0, so fade to a chosen resting form instead.
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest, sel, live);
    float x0 = sel * 3.0;

    // One transient control drives the light as well as the geometry: the beat
    // that bands a ring also pulses the core. AUDIO_BEAT already decays, so it
    // is used straight and the floor keeps the core lit in silence.
    float pulse = 0.55 + 0.90 * snap * AUDIO_BEAT;

    float th    = mix(0.0026, 0.0012, crisp);   // treble sharpens the stroke
    float gain  = 0.75 + 0.45 * crisp;          // and brightens it slightly
    float haloW = 0.00040 + 0.0030 * glow;      // bass widens the halo

    // Four rings. Precession rates +1, -2, +3, -4 turns per loop (inner ones
    // spin faster, like a real gyroscope); tumble rates 1, 2, 3, 2 half-flips
    // use abs(cos), whose period divides the loop. Hue drifts +/-1 cycle per
    // loop along each ring. All offsets are constants.
    vec4 acc = vec4(0.0);
    acc += neonRing(uv,  TAU * ph * 1.0 + 0.00, scale,
                    abs(cos(TAU * ph * 1.0 + 0.80)),
                    th, haloW,  ph + 0.00 + HUE_SHIFT, gain, 0.00, x0);
    acc += neonRing(uv, -TAU * ph * 2.0 + 1.90, scale * 0.79,
                    abs(cos(TAU * ph * 2.0 + 2.60)),
                    th, haloW, -ph + 0.25 + HUE_SHIFT, gain, 0.34, x0);
    acc += neonRing(uv,  TAU * ph * 3.0 + 4.10, scale * 0.60,
                    abs(cos(TAU * ph * 3.0 + 4.90)),
                    th, haloW,  ph + 0.50 + HUE_SHIFT, gain, 0.67, x0);
    acc += neonRing(uv, -TAU * ph * 4.0 + 0.70, scale * 0.43,
                    abs(cos(TAU * ph * 2.0 + 1.70)),
                    th, haloW, -ph + 0.75 + HUE_SHIFT, gain, 1.00, x0);

    // Plasma core: the shared part, which never changes species. Bounded by its
    // own smoothstep, it flares on onsets and rests at a finished 0.55 in
    // silence. A gentle two-cycle-per-loop breath keeps it alive with no audio.
    float breathe = 1.0 + 0.10 * sin(TAU * ph * 2.0);
    float core = 0.0016 / (r * r + 0.0010) * smoothstep(0.12, 0.0, r);
    vec3 coreCol = vec3(0.95, 0.88, 1.00) * core * pulse * breathe * 1.3;
    float coreCov = core * pulse * breathe * 0.85;

    // Global envelope: everything reaches zero by r = 0.48, inside the frame. The
    // filament form is the widest, at 0.35 gyro size * 1.10 radius = 0.385, so
    // this fade only feathers its outer edge.
    float keep = 1.0 - smoothstep(0.40, 0.48, r);

    vec3 col = (acc.rgb + coreCol) * keep;
    float alpha = clamp((acc.a + coreCov) * keep, 0.0, 1.0);
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
