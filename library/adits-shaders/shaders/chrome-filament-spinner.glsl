/*{
  "ADITS": 1,
  "DESCRIPTION": "A chrome dandelion of silver wires arcing out from a dense glowing hub, the hub unchanging, every wire changing species on its own schedule. Each is one primitive under eight interpolated numbers, so it morphs by deforming, not cross-fading, through four forms: tapered chrome ribbon, hair filament, glinting tendril, needle spray. Bass turns the head into ribbons, treble draws it out to needles, and the change sweeps around the head one wire at a time. Rests as the hair filament.",
  "CREDIT": "claude-sonnet-5",
  "DATE": "2026-08-20",
  "CATEGORIES": ["generative", "morph", "chrome", "filament", "audio"],
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
    { "NAME": "rest",    "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "reach",   "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.24, "MAX": 0.40,
      "LABEL": "Cluster Reach", "BIND": "bass", "BIND_DEPTH": 0.35 },
    { "NAME": "sparkle", "TYPE": "float", "DEFAULT": 0.50, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Sparkle", "BIND": "treble", "BIND_DEPTH": 0.60 },
    { "NAME": "hubGlow", "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Hub Glow", "BIND": "level", "BIND_DEPTH": 0.40 }
  ]
}*/

#define TAU 6.28318530718

// How far the per-wire selector is spread around the head. The change then
// crosses the head as a wave instead of flipping every wire at once.
#define STAGGER 1.05

float hash21(vec2 p) {
    p = fract(p * vec2(127.1, 311.7));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
}

// One layer of polar-repeated filament arcs, every wire on its own schedule.
// Returns rgb + coverage. No loops: the whole layer is one closed-form field
// evaluation, and the morph adds eight multiply-adds rather than a second body.
vec4 filamentLayer(float r, float ang, float cnt, float curl, float rot,
                   float seed, float ph, float lenScale, float x0, float hatF) {
    // The cell is read once, from the curled angle, and both the filament id and
    // the perpendicular distance come out of it. They have to share one cell: id
    // carries the wire's length, tint and glints, so deriving it from a different
    // coordinate than perp would hand a wire its neighbour's properties partway
    // along its own arc. That is also why the curl stays out of the morph, and
    // why the count does: id comes from mod(floor(cell), cnt), and a fractional
    // count would put a mismatched wire at the angular seam.
    float sa   = ang + rot + curl * r;              // spiral-bent angle
    float cell = sa * cnt / TAU;
    float id   = mod(floor(cell), cnt);             // seam-safe filament id
    float perp = abs(fract(cell) - 0.5) * (TAU / cnt) * r;

    float h1 = hash21(vec2(id + seed, 7.3));        // tip length
    float h2 = hash21(vec2(id + seed, 19.1));       // tint lean
    float h3 = hash21(vec2(id + seed, 4.7));        // glint travel offset
    float h4 = hash21(vec2(id + seed, 31.7));       // glint selection
    float h5 = hash21(vec2(id + seed, 13.9));       // stagger jitter

    // Per-wire selector. The cosine term sweeps the change around the head and,
    // unlike a linear index ramp, is continuous where the ring wraps. The hash
    // keeps that sweep from looking mechanical. Both are static, so at a fixed
    // spectrum the head holds still: the wave is positioned by the music.
    float u  = 0.5 - 0.5 * cos(id * (TAU / cnt));
    float xj = clamp(x0 + STAGGER * (0.64 * (u - 0.5) + 0.36 * (h5 - 0.5)), 0.0, 3.0);

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

    // Parameter-space morph. One wire primitive, eight interpolated numbers, so
    // the section deforms and no fragment ever shows two forms at half alpha.
    //             ribbon     filament   tendril    needle
    float wg   = 2.30 * w0 + 1.00 * w1 + 1.60 * w2 + 0.55 * w3;   // gauge
    float lm   = 0.78 * w0 + 1.00 * w1 + 0.92 * w2 + 1.14 * w3;   // reach
    float tpr  = 0.85 * w0 + 0.30 * w1 + 0.55 * w2 + 0.15 * w3;   // taper
    float hal  = 1.20 * w0 + 1.00 * w1 + 1.30 * w2 + 0.50 * w3;   // halo
    float shA  = 0.70 * w0 + 0.44 * w1 + 0.55 * w2 + 0.20 * w3;   // sheen depth
    float gd   = 0.35 * w0 + 1.00 * w1 + 1.40 * w2 + 0.70 * w3;   // glint density
    float gsp  = 0.35 * w0 + 1.00 * w1 + 1.55 * w2 + 0.55 * w3;   // glint spread
    float tnt  = 0.85 * w0 + 0.50 * w1 + 0.62 * w2 + 0.20 * w3;   // champagne lean

    float len = lenScale * lm * (0.55 + 0.45 * h1);

    // Radial extent: fades in past the hub, fades to zero before the tip,
    // so every wire and every bit of its halo is bounded inside the frame.
    float radial = smoothstep(len, len * 0.78, r) * smoothstep(0.015, 0.055, r);

    // Hair-thin wire core plus a faint tight halo around it. The gauge and the
    // taper are morphed, which is what turns a wire into a ribbon and back.
    float tw   = 1.0 - tpr * clamp(r / max(len, 1e-4), 0.0, 1.0);
    float wire = smoothstep(0.0040 * wg * tw, 0.0010 * wg * tw, perp);
    float halo = 0.00012 * hal / (perp * perp + 0.00035);

    // Chrome sheen sweeping along the cluster. sa carries rot (one turn per
    // loop), so 3*sa - 2 turns nets exactly one turn per loop: seamless. The
    // frequency stays fixed for that reason and only its depth is morphed.
    float sheen = (1.0 - shA) + shA * (0.5 + 0.5 * sin(sa * 3.0 - ph * TAU * 2.0));

    float body = (wire * sheen + halo * 0.30) * radial;

    // Travelling sparkle glints: three trips outward per loop. Treble (via
    // the sparkle bind) raises both how many wires glint and how brightly.
    float gt    = fract(h3 + ph * 3.0);
    float gpos  = len * mix(0.12, 0.92, gt);
    float gsel  = step(h4, 0.15 + 0.85 * sparkle);
    float glint = smoothstep(0.030 * gsp, 0.0, abs(r - gpos)) * wire * radial
                * gsel * (0.35 + 0.65 * sparkle) * gd;

    // Hat-fired micro glints on a loop-safe 24-slice schedule. AUDIO_HAT
    // already decays, so it is used directly as a multiplier; at silence
    // this whole term is exactly zero.
    float seg    = floor(ph * 24.0);
    float fsel   = step(0.72, hash21(vec2(id * 3.3 + seed, seg + 11.0)));
    float hpos   = len * (0.18 + 0.65 * hash21(vec2(id + seed, seg + 41.0)));
    float hglint = smoothstep(0.022, 0.0, abs(r - hpos)) * wire * radial
                 * fsel * AUDIO_HAT * snap * 1.40;

    // Desaturated silver-white, leaning faint cool blue or warm champagne. The
    // lean is one of the morphed numbers, so each form carries its own metal.
    vec3 COOL   = vec3(0.72, 0.82, 1.00);
    vec3 CHAMP  = vec3(1.00, 0.92, 0.78);
    vec3 SILVER = vec3(0.88, 0.90, 0.94);
    float lean = clamp(h2 * 0.4 + tnt * 0.6, 0.0, 1.0);
    vec3 tint  = mix(SILVER, mix(COOL, CHAMP, lean), 0.40);

    vec3 col = tint * body * 1.10
             + mix(vec3(1.0), tint, 0.25) * (glint * 0.85 + hglint * 1.00) * hatF;

    // Semi-translucent wires (~0.4-0.7); glints thicken coverage locally.
    float cov = body * 0.62 + glint * 0.50 + hglint * 0.50;
    return vec4(col, cov);
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // Single loop phase. Every animated rate below is an integer multiple
    // of this phase, so the whole object wraps seamlessly at 18 s. Nothing on
    // the morph path reads it: which wire is which belongs to the music.
    float ph = fract(TIME / 18.0);

    float r   = length(uv);
    float r2  = dot(uv, uv);
    float ang = atan(uv.y, uv.x);

    float rot    = ph * TAU;                            // one turn per loop
    float breath = 1.0 + 0.03 * sin(ph * TAU * 2.0);    // two cycles per loop
    float lenScale = reach * breath;

    // --- Selector -------------------------------------------------------------
    // Balance decides which wire; loudness only decides how hard it is lit.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum  = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;            // 0 all bass, 1 all treble
    // tilt is a ratio of three smoothed averages, so it swings far less than any
    // one band. Expanded around the rest point, or the outer forms never arrive.
    float sel  = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // AUDIO_HAT and AUDIO_KICK already decay, so they are used straight: a hat
    // draws a wire out to a needle, a kick flattens it into a ribbon.
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);
    // At silence tilt is 0/0, so fade to a chosen resting form instead.
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest, sel, live);

    // One transient control drives the light as well as the geometry: the hat
    // that sharpens a wire also fires its glints.
    float hatF = 1.0 + 1.2 * snap * AUDIO_HAT;

    // Two filament layers share one rotation (the cluster spins as a whole)
    // but curl opposite ways, so the arcs weave like a dandelion head. Each
    // layer staggers off its own seed, so they never turn over together.
    vec4 layerA = filamentLayer(r, ang, 26.0,  2.6, rot,  3.0, ph, lenScale, sel * 3.0, hatF);
    vec4 layerB = filamentLayer(r, ang, 22.0, -3.4, rot, 57.0, ph, lenScale, sel * 3.0, hatF);

    // Dense champagne-white hub, bounded so it pools at the centre only. This is
    // the shared core: it never changes species, and it is what holds the middle
    // of the frame together while the wires turn over.
    float core = hubGlow * 0.016 / (r2 + 0.0075) * smoothstep(0.22, 0.0, r);

    vec3 col  = layerA.rgb + layerB.rgb + vec3(1.00, 0.97, 0.90) * core;
    float cov = layerA.a + layerB.a + core * 0.85;

    // Radial bound. The worst case is the needle form on the longest wire at the
    // largest reach: 0.40 * 1.03 breath * 1.14 length, which is 0.470, and the
    // radial envelope has already faded that wire to nothing by then.
    float rim = smoothstep(0.485, 0.40, r);
    col *= rim;
    cov *= rim;

    // Coverage, then premultiply. Zero everywhere the object is not.
    float alpha = clamp(cov, 0.0, 1.0);
    col *= alpha;
    gl_FragColor = vec4(col, alpha);
}
