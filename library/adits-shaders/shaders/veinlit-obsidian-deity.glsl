/*{
  "ADITS": 1,
  "DESCRIPTION": "A near-black baroque mass, mirrored into a Rorschach and fringed with feathered wisps, its silhouette unchanging and its whole surface tiled with glowing hooks that each change species on their own schedule. Each hook is one arc under five interpolated numbers, so it morphs by deforming, not cross-fading, through four forms: fat scale, crescent hook, barbed claw, hair filigree. Bass plates the surface, treble etches it. Rests as the crescent hook.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-21",
  "CATEGORIES": ["generative", "morph", "obsidian", "baroque", "neon", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "low",
  "ASPECT": "square",
  "LOOP": 22.0,
  "INPUTS": [
    { "NAME": "sens",  "TYPE": "float", "DEFAULT": 0.80, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",  "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",  "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "mass",  "TYPE": "float", "DEFAULT": 1.00, "MIN": 0.82, "MAX": 1.12,
      "LABEL": "Body Mass", "BIND": "bass", "BIND_DEPTH": 0.38 },
    { "NAME": "veins", "TYPE": "float", "DEFAULT": 0.65, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Vein Glow", "BIND": "level", "BIND_DEPTH": 0.45 },
    { "NAME": "wisps", "TYPE": "float", "DEFAULT": 0.50, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Rim Wisps", "BIND": "treble", "BIND_DEPTH": 0.45 }
  ]
}*/

#define PI  3.14159265359
#define TAU 6.28318530718

// Base ornament row count. It used to be a slider; row pitch is now one of the
// numbers the form interpolates, and unlike the rest of them it has to be global,
// because the cell index the per-cell numbers are drawn from is itself a function
// of the pitch.
#define ROWS 32.0

// How far the per-hook selector is spread up the body. The change then climbs
// the mass as a wave instead of flipping the whole surface at once.
#define STAGGER 1.05

float hash21(vec2 p) {
    p = fract(p * vec2(127.1, 311.7));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
}

vec3 pal(float t) {
    return 0.5 + 0.5 * cos(TAU * (t + vec3(0.00, 0.33, 0.67)));
}

// One crescent hook inside a unit cell. A thin arc of a circle, gated to one side
// so it opens rather than closing into a ring. opn widens or narrows that gate,
// which is what turns a closed scale into an open claw.
//   x arc, y hot inner edge
vec2 crescent(vec2 f, float rad, float wid, float opn) {
    float d = length(f * vec2(1.0, 1.20));
    float arc = 1.0 - smoothstep(wid, wid + 0.030, abs(d - rad));
    float open = smoothstep(-0.06 * opn, 0.16 * opn, -f.y);
    return vec2(arc * open, (1.0 - smoothstep(wid * 0.35, wid, abs(d - rad))) * open);
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // One loop phase. Every rate below is an integer multiple of it, so the mass
    // and its hue wrap seamlessly on a 22 s cycle. Nothing on the morph path
    // reads it: which hook is which belongs to the music, not to the clock.
    float ph = fract(TIME / 22.0);

    // Bilateral mirror: the reference is a Rorschach, and the ornament mirrors
    // with the body because it is built in mirrored space.
    vec2  p = vec2(abs(uv.x), uv.y);
    float r = length(uv);

    float breath = sin(ph * TAU);
    float wob    = sin(ph * TAU * 2.0);
    float creep  = ph * 2.0;
    float sc     = mass * (1.0 + 0.035 * breath);
    float hue0   = ph + 0.24 * (1.0 - CAM_DIR.z);

    // --- Selector -------------------------------------------------------------
    // Balance decides which hook; loudness only decides how hard it glows.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum  = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;            // 0 all bass, 1 all treble
    // tilt is a ratio of three smoothed averages, so it swings far less than any
    // one band. Expanded around the rest point, or the outer forms never arrive.
    float sel  = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // AUDIO_HAT and AUDIO_KICK already decay, so they are used straight: a hat
    // etches the surface to filigree, a kick plates it into scales.
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);
    // At silence tilt is 0/0, so fade to a chosen resting form instead.
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest, sel, live);
    float x0 = sel * 3.0;

    // The row pitch is the one morphed number that has to be global. It is read
    // from the unstaggered selector for that reason.
    float g0 = max(1.0 - abs(x0      ) * 1.85, 0.0);
    float g1 = max(1.0 - abs(x0 - 1.0) * 1.85, 0.0);
    float g2 = max(1.0 - abs(x0 - 2.0) * 1.85, 0.0);
    float g3 = max(1.0 - abs(x0 - 3.0) * 1.85, 0.0);
    float gs = g0 + g1 + g2 + g3;
    float rowM = (0.62 * g0 + 1.00 * g1 + 1.26 * g2 + 1.55 * g3) / gs;
    float rows = ROWS * rowM;

    // One transient control drives the light as well as the geometry: the kick
    // that plates a hook also floods it.
    float kick = 1.0 + 1.5 * snap * AUDIO_KICK;

    // --- Body: the shared core, which never changes species --------------------
    // Wide through the shoulders, tapering to a point at the tail.
    float by = (uv.y + 0.235 * sc) / (0.500 * sc);
    float bw = 0.232 * sc * pow(max(sin(PI * clamp(by, 0.0, 1.0)), 0.0), 0.42)
             * (0.60 + 0.62 * smoothstep(0.0, 0.55, by));
    // Scalloped flanks, so the mass has shoulders and hips instead of one bulge.
    bw *= 1.0 + 0.155 * cos(by * PI * 5.0 - 0.6);
    float bLive = step(0.0, by) * (1.0 - step(1.0, by));
    float body  = (1.0 - smoothstep(bw - 0.0026, bw + 0.0026, p.x)) * bLive;
    float db    = p.x - bw;                     // signed distance out of the body

    // Five serrated limb wedges reaching off the flanks, and a three-spike crown
    // over the head. They are unioned into the body, so the ornament grid below
    // covers them too without a second evaluation.
    float limb = 0.0;
    for (int i = 0; i < 5; i++) {
        float fi = float(i);
        float u  = fi * 0.25;
        float ang = mix(0.38, -0.98, u) + 0.07 * wob * sin(fi * 2.3 + 0.4);
        vec2  dir = vec2(cos(ang), sin(ang));
        vec2  q   = p - vec2(0.030 * sc, mix(0.155, -0.135, u) * sc);
        float al  = dot(q, dir);
        float pe  = dot(q, vec2(-dir.y, dir.x)) - mix(-0.95, 1.35, u) * al * al;
        float L   = (0.220 + 0.080 * (1.0 - u)) * sc;
        float an  = al / L;
        float lw  = 0.052 * sc * clamp(1.0 - an, 0.0, 1.0)
                  * (0.32 + 0.88 * smoothstep(0.0, 0.24, an));
        float st  = fract(an * 14.0 - creep);
        lw *= 1.0 + 0.55 * smoothstep(0.60, 0.95, st) * smoothstep(1.06, 0.90, st);
        limb = max(limb, (1.0 - smoothstep(lw, lw + 0.0026, abs(pe)))
                       * step(0.0, an) * (1.0 - smoothstep(0.955, 1.02, an)));
    }
    float crown = 0.0;
    for (int k = 0; k < 3; k++) {
        float fk = float(k);
        float cx = (0.016 + 0.036 * fk) * sc;
        float cy = (0.255 - 0.020 * fk) * sc;
        float ch = (0.070 - 0.014 * fk) * sc;
        float t  = (uv.y - cy) / ch;
        float cw = (0.020 - 0.004 * fk) * sc * clamp(1.0 - t, 0.0, 1.0);
        crown = max(crown, (1.0 - smoothstep(cw, cw + 0.0022, abs(p.x - cx - 0.05 * t * t)))
                         * step(0.0, t) * (1.0 - smoothstep(0.94, 1.02, t)));
    }
    body = max(body, max(limb, crown));

    // --- Ornament -------------------------------------------------------------
    // A warped grid, so the rows of hooks swirl over the mass instead of sitting
    // in a rectangular table.
    vec2 bp = p;
    bp += 0.055 * vec2(sin(bp.y * 11.0 + ph * TAU), cos(bp.x * 9.0 - ph * TAU));
    vec2 g  = bp * vec2(rows * 1.15, rows);
    vec2 gi = floor(g);
    vec2 gf = fract(g) - 0.5;
    float h1 = hash21(gi);
    float h2 = hash21(gi + 19.7);

    // Per-hook selector. The body height climbs the mass, so it doubles as the
    // sweep coordinate; the cell hash keeps that sweep from looking mechanical.
    // Both are static, so at a fixed spectrum the ornament holds still. Cells are
    // separated by empty ground, so neighbours disagreeing costs a hook shape
    // rather than a torn edge.
    float uH = clamp(by, 0.0, 1.0);
    float xj = clamp(x0 + STAGGER * (0.66 * (uH - 0.5) + 0.34 * (h2 - 0.5)), 0.0, 3.0);

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

    // Parameter-space morph. One arc primitive, five interpolated numbers, so the
    // hook deforms and no fragment ever shows two forms at half alpha.
    //             scale      hook       claw       filigree
    float radM = 1.35 * w0 + 1.00 * w1 + 0.82 * w2 + 0.70 * w3;   // arc radius
    float widM = 2.20 * w0 + 1.00 * w1 + 0.78 * w2 + 0.58 * w3;   // arc gauge
    float opnM = 0.55 * w0 + 1.00 * w1 + 1.45 * w2 + 1.90 * w3;   // opening
    float kpM  = 0.08 * w0 + 0.20 * w1 + 0.26 * w2 + 0.32 * w3;   // carved gaps
    float briM = 0.80 * w0 + 1.00 * w1 + 1.45 * w2 + 2.30 * w3;   // emission

    // Two hooks per cell, one nested inside the other, and some cells stay empty
    // so the ornament reads as carved rather than as wallpaper.
    vec2 c1 = crescent(gf, (0.26 + 0.10 * h1) * radM, (0.045 + 0.030 * h2) * widM, opnM);
    vec2 c2 = crescent(gf * 1.9, 0.30 * radM, 0.055 * widM, opnM);
    float keep = step(kpM, h1);
    float hook = (c1.x + c2.x * 0.65) * keep * body * briM;
    float hot  = (c1.y + c2.y * 0.55) * keep * body * briM;

    // --- Feathered rim wisps --------------------------------------------------
    // Hair-thin strands leaving the silhouette sideways, in a vertical cell so
    // they comb out of the edge rather than radiating from the centre.
    float wlen = (0.030 + 0.075 * wisps) * sc;
    float wk   = uv.y * 150.0 + 4.0 * sin(uv.y * 9.0 + ph * TAU);
    float wh   = hash21(vec2(floor(wk), 3.0));
    float wt   = abs(fract(wk) - 0.5);
    float wisp = (1.0 - smoothstep(0.13, 0.30, wt))
               * step(0.0, db) * (1.0 - smoothstep(wlen * (0.35 + 0.65 * wh) * 0.7,
                                                  wlen * (0.35 + 0.65 * wh), db))
               * bLive;
    // A few longer feathers, thinner still.
    float wisp2 = (1.0 - smoothstep(0.03, 0.09, wt))
                * step(0.0, db) * (1.0 - smoothstep(wlen * 1.3, wlen * 2.1, db))
                * bLive;

    // --- Colour ---------------------------------------------------------------
    // The body is obsidian: it carries alpha, almost no light. Everything visible
    // is the ornament.
    vec3 obs  = vec3(0.020, 0.021, 0.030);
    vec3 glowC = pal(hue0 + h1 * 0.14 + by * 0.22) * vec3(0.62, 1.02, 1.30);
    vec3 white = vec3(0.86, 0.97, 1.00);

    vec3 col = obs * body * 1.20
             + glowC * hook * (0.85 + 1.55 * veins) * kick
             + white * hot * (0.45 + 0.85 * veins) * kick
             + obs * (wisp + wisp2) * 1.60
             + glowC * wisp2 * 0.22 * kick;

    // Soft knee: nested hooks overlap and would clip to flat cyan.
    col = col / (1.0 + col * 0.30);

    // Radial safety bound. uv reaches only 0.5 on the axes, so everything closes
    // by 0.482 and the wisps fade instead of being sliced.
    float rim = 1.0 - smoothstep(0.425, 0.482, r);
    col *= rim;

    // Coverage, then premultiply. The obsidian body is fully opaque even where it
    // gives off no light: it is a silhouette, not a hole.
    float alpha = (body * 1.00 + min(wisp, 1.0) * 0.95 + min(wisp2, 1.0) * 0.70
                 + min(hook, 1.0) * 0.40) * rim;
    alpha = smoothstep(0.020, 0.90, alpha);
    alpha = clamp(alpha, 0.0, 1.0);
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
