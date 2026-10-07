/*{
  "ADITS": 1,
  "DESCRIPTION": "A sheaf of silk fibres shaded with the three paths light really takes through a strand: R off the surface, TT straight through, and TRT in and off the far wall and out. Each path's highlight is a cone about the fibre axis, and the cuticle tilt shifts each cone differently, which is what separates the white primary band from the coloured secondary. It rests as a tight vertical hank, splays into a horsetail whisk, then blows open into a radial corona where the secondary blazes.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-09-04",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "filament"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "morph_gain", "TYPE": "float", "DEFAULT": 0.86, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Morph Sensitivity" },
    { "NAME": "rest_form",  "TYPE": "float", "DEFAULT": 0.08, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Rest Archetype" },
    { "NAME": "swell",      "TYPE": "float", "DEFAULT": 0.32, "MIN": 0.10, "MAX": 0.70,
      "LABEL": "Sheaf Reach", "BIND": "bass", "BIND_DEPTH": 0.55 },
    { "NAME": "splay",      "TYPE": "float", "DEFAULT": 0.36, "MIN": 0.08, "MAX": 0.88,
      "LABEL": "Fibre Splay", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "gloss",      "TYPE": "float", "DEFAULT": 0.42, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Cuticle Gloss", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "glint",      "TYPE": "float", "DEFAULT": 0.32, "MIN": 0.06, "MAX": 0.90,
      "LABEL": "Secondary Glint", "BIND": "kick", "BIND_DEPTH": 0.65 },
    { "NAME": "silk_tint",  "TYPE": "color", "DEFAULT": [0.96, 0.74, 0.44, 1.00],
      "LABEL": "Fibre Colour" },
    { "NAME": "sheen_tint", "TYPE": "color", "DEFAULT": [1.00, 0.96, 0.90, 1.00],
      "LABEL": "Primary Sheen" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  4.60
#define BOUND  1.34

void pR(inout vec2 p, float a) { p = cos(a) * p + sin(a) * vec2(p.y, -p.x); }

bool sph(vec3 ro, vec3 rd, float ra, out float t0, out float t1) {
    t0 = 0.0;
    t1 = 0.0;
    float b = dot(ro, rd);
    float c = dot(ro, ro) - ra * ra;
    float h = b * b - c;
    if (h < 0.0) return false;
    h = sqrt(h);
    t0 = -b - h;
    t1 = -b + h;
    return t1 > 0.0;
}

// ------------------------------------------------------------------
// The sheaf, drawn in closed form. There is no raymarch in this file
// at all.
//
// A silk fibre is a hairline, and a marched hairline is caught by some
// pixels and missed by their neighbours and renders as a row of dashes.
// The closest approach between the view ray and a fibre segment has an
// exact solution, and a Gaussian core about that distance integrates to
// a smooth antialiased strand. The same solution hands back the segment
// direction, which is the fibre tangent every lobe below needs.
// ------------------------------------------------------------------

float g_top, g_len, g_r0, g_r1, g_twist, g_kink, g_core, g_curve;

float raySeg(vec3 ro, vec3 rd, vec3 a, vec3 b, out vec3 cp) {
    vec3 u = b - a;
    vec3 w = ro - a;
    float uu = dot(u, u);
    float ru = dot(rd, u);
    float rw = dot(rd, w);
    float uw = dot(u, w);
    float den = ru * ru - uu;
    float t = abs(den) < 1e-6 ? 0.0 : clamp((rw * ru - uw) / den, 0.0, 1.0);
    float s = max(t * ru - rw, 0.0);
    cp = a + u * t;
    return length(ro + rd * s - cp);
}

vec3 fiberPt(float fi, float u) {
    // Fibres leave the binding together and splay as they fall. The
    // radial curve is quadratic in u, so they hold the bundle near the
    // top and open out toward the tips the way a real hank does.
    // The golden angle per fibre. A plain multiple of TAU puts several
    // fibres at the same azimuth and leaves the bundle with four visible
    // faces instead of a full round of strands.
    float shell = 0.35 + 0.65 * fract(fi * 11.7);
    float a = fi * 32.0 * 2.3999632 + g_twist * u;
    float rad = (g_r0 + (g_r1 - g_r0) * mix(u * u, u, g_curve)) * shell;
    float y = g_top - g_len * u;
    // One shared kink, so the sheaf reads as combed rather than turned.
    float k = g_kink * sin(u * 3.0 + fi * TAU * 2.0);
    return vec3(cos(a) * rad + k * 0.35, y + k * 0.20, sin(a) * rad - k * 0.28);
}

// ------------------------------------------------------------------
// The three Marschner paths.
//
// A fibre is a cylinder, so a highlight on it is a cone about the axis
// rather than a point, and the longitudinal term is a Gaussian in the
// angle the light and the eye make with that axis. The cuticle scales
// on a real strand are tilted a few degrees, and each path crosses them
// a different number of times, so each cone is shifted by a different
// amount. That shift is the whole trick: without it the white primary
// and the coloured secondary land on top of each other and the fibre
// reads as plastic thread.
//
// The azimuthal terms are the published fits rather than the full
// integrals: TT peaks against the light, TRT peaks with it plus a
// glint, and R is broad.
// ------------------------------------------------------------------

#define ALPHA 0.085

float M(float st, float sv, float shift, float w) {
    float t = st + sv - shift;
    return exp(-t * t / (2.0 * w * w)) / (2.5066283 * w);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    float rr = length(uv);
    float bound = smoothstep(0.478, 0.446, rr);
    if (bound <= 0.0) { gl_FragColor = vec4(0.0); return; }

    float ph = fract(TIME / PERIOD);
    float phase = ph * TAU;

    // ---- spectral morph selector (guide 12.2 - 12.4, 12.7) ----------
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;
    float sel = clamp((tilt - 0.5) * (1.6 + 3.4 * morph_gain) + 0.5, 0.0, 1.0);
    sel = clamp(sel + 0.36 * (AUDIO_HAT - AUDIO_KICK) + 0.16 * AUDIO_SNARE, 0.0, 1.0);
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest_form, sel, live);

    float w1 = clamp(1.0 - abs(sel)       / 0.33, 0.0, 1.0);
    float w2 = clamp(1.0 - abs(sel - 0.5) / 0.33, 0.0, 1.0);
    float w3 = clamp(1.0 - abs(sel - 1.0) / 0.33, 0.0, 1.0);
    float ws = w1 + w2 + w3 + 1e-4;
    w1 /= ws; w2 /= ws; w3 /= ws;

    // Tight hank, horsetail whisk, radial corona. One fibre curve
    // throughout, so the sheaf opens rather than dissolving.
    float grow = (0.93 + 0.18 * swell) * (0.980 + 0.026 * sin(phase));
    g_top   = (w1 * 0.860 + w2 * 0.900 + w3 * 0.360) * grow;
    g_len   = (w1 * 1.620 + w2 * 1.740 + w3 * 0.900) * grow;
    g_r0    = (w1 * 0.185 + w2 * 0.155 + w3 * 0.095) * grow;
    g_r1    = (w1 * 0.440 + w2 * 0.680 + w3 * 1.020) * grow;
    g_twist = (w1 * 0.55 + w2 * 1.60 + w3 * 2.00) * (0.6 + 0.9 * splay);
    g_kink  = (w1 * 0.030 + w2 * 0.072 + w3 * 0.090) * grow;
    g_curve = w1 * 0.15 + w2 * 0.45 + w3 * 0.85;
    g_core  = (0.0068 + 0.0060 * (1.0 - gloss)) * grow;

    // Absorption. R never enters the fibre, so it is the colour of the
    // light and nothing else. TT crosses the fibre once and TRT crosses
    // it twice, so each is tinted by a different power of the same
    // absorption, and that is why the secondary highlight of a real
    // strand is deeper in colour than its body.
    vec3 tintTT  = pow(max(silk_tint.rgb, vec3(0.02)), vec3(0.70));
    vec3 tintTRT = pow(max(silk_tint.rgb, vec3(0.02)), vec3(1.70));

    float wR   = 0.055 + 0.155 * (1.0 - gloss);
    float wTT  = wR * 0.55;
    float wTRT = wR * 1.90;

    // ---- camera (guide 5) -------------------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.55 * ww);

    float lean = 0.13 * sin(phase * 2.0);
    pR(ro.xz, phase); pR(ro.yz, lean);
    pR(rd.xz, phase); pR(rd.yz, lean);

    vec3 V = -rd;
    // Behind and above. A fibre sheaf is lit from behind in every real
    // photograph of one, because that is the only way the through-path
    // shows at all.
    // Nearly horizontal, and that is a physical requirement rather than
    // a taste call. Each lobe's highlight is a cone about the fibre axis
    // and fires where the light and eye angles to that axis sum to the
    // cuticle shift. On a bundle of near-vertical strands a high key
    // never satisfies it and every lobe reads as zero.
    vec3 L = normalize(vec3(-0.66, 0.13, -0.74));
    vec3 F = normalize(vec3(0.40, 0.30, 0.86));

    vec3  col = vec3(0.0);
    float occ = 0.0;

    float tb0, tb1;
    if (sph(ro, rd, BOUND, tb0, tb1)) {
        for (int i = 0; i < 32; i++) {
            float fi = float(i) / 32.0;

            float dB = 1e9;
            vec3  TB = vec3(0.0, 1.0, 0.0);
            float depth = 0.0;
            float along = 0.0;

            // Six chords, not three. A twisted fibre approximated by
            // three of them has its chords cutting across the helix, and
            // the strand renders as a run of straight sticks. Thirty-two
            // fibres times six chords is 192, just inside the 200 the
            // loop budget allows.
            for (int j = 0; j < 6; j++) {
                float u0 = float(j) * 0.1666667;
                float u1 = u0 + 0.1666667;
                vec3 a = fiberPt(fi, u0);
                vec3 b = fiberPt(fi, u1);
                vec3 cp;
                float d = raySeg(ro, rd, a, b, cp);
                if (d < dB) {
                    dB = d;
                    TB = normalize(b - a);
                    depth = length(cp - ro);
                    along = u0;
                }
            }

            // A fibre thins toward its tip, as silk does.
            float w = g_core * (1.0 - 0.32 * along);
            float cov = exp(-dB * dB / (w * w));
            if (cov < 0.004) continue;

            float stl = dot(TB, L);
            float stv = dot(TB, V);

            // Azimuth: the parts of L and V across the fibre.
            vec3 Lp = L - TB * stl;
            vec3 Vp = V - TB * stv;
            float lpl = length(Lp), vpl = length(Vp);
            float cphi = (lpl > 1e-4 && vpl > 1e-4) ? dot(Lp, Vp) / (lpl * vpl) : 0.0;

            float mR   = M(stl, stv, -2.0 * ALPHA, wR);
            float mTT  = M(stl, stv,        ALPHA, wTT);
            float mTRT = M(stl, stv, -3.0 * ALPHA, wTRT);

            float nR   = 0.26 * sqrt(max(0.5 + 0.5 * cphi, 0.0));
            float nTT  = exp(-3.65 * cphi - 3.98);
            float nTRT = exp(17.0 * cphi - 16.78) * (0.35 + 1.65 * glint)
                       + 4.5e-4;

            vec3 lobe = sheen_tint.rgb * mR   * nR   * 3.60
                      + tintTT         * mTT  * nTT  * 6.20
                      + tintTRT        * mTRT * nTRT * 4.80
                                       * (0.55 + 0.95 * AUDIO_BEAT);

            // A little diffuse across the strand, plus the front fill,
            // so the sheaf still has a body between its highlights.
            float wrap = clamp(dot(TB, F) * 0.35 + 0.65, 0.0, 1.0);
            lobe += silk_tint.rgb * wrap * 0.48;

            // Fibres in front dim the ones behind them. Ordering the
            // whole sheaf is not affordable, so depth stands in for it:
            // a strand deeper in the bundle contributes less.
            float shade = exp(-max(depth - (ORBIT - BOUND), 0.0) * 0.36);

            col += lobe * cov * shade;
            occ += cov * (1.0 - occ) * 0.92;
        }
    }

    float alpha = clamp(occ, 0.0, 1.0);

    col = col / (1.0 + col * 0.52);
    col = pow(max(col, 0.0), vec3(0.90));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
