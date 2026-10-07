/*{
  "ADITS": 1,
  "DESCRIPTION": "A baroque medallion of scrolled rocaille, its ornament built from six layers of a turbulence that folds a coordinate back through itself, cut in relief on a shallow disc and mirrored into an eight-fold wedge; it rests as a heavy cartouche with few deep scrolls and works itself into a fine filigree and then a pierced lace as the spectrum brightens.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-26",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "ornament"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "morph_gain", "TYPE": "float", "DEFAULT": 0.84, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Morph Sensitivity" },
    { "NAME": "rest_form",  "TYPE": "float", "DEFAULT": 0.10, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Rest Archetype" },
    { "NAME": "swell",      "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.10, "MAX": 0.76,
      "LABEL": "Medallion Swell", "BIND": "bass", "BIND_DEPTH": 0.55 },
    { "NAME": "churn",      "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.05, "MAX": 0.84,
      "LABEL": "Scroll Churn", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "gild",       "TYPE": "float", "DEFAULT": 0.42, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Gilding", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "field_tint", "TYPE": "color", "DEFAULT": [0.09, 0.07, 0.12, 1.00],
      "LABEL": "Field Tint" },
    { "NAME": "gild_tint",  "TYPE": "color", "DEFAULT": [1.00, 0.78, 0.30, 1.00],
      "LABEL": "Gilding Tint" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  6.60
#define BOUND  1.42

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
// The ornament.
//
// A coordinate is folded back through its own value at a rising
// frequency, which is the whole of the reference's turbulence. Reading
// the folded coordinate as a height, rather than as a colour, turns
// the same arithmetic into scrollwork cut in relief.
//
// Six passes rather than nine: past that the scrolls fall below the
// step the march can resolve and the relief reads as grain.
// ------------------------------------------------------------------

float g_freq, g_ph, g_lay;
float g_orn;   // ornament height at the sample, read back for colour

float rocaille(vec2 v) {
    float acc = 0.0;
    float amp = 1.0;
    for (int i = 1; i <= 6; i++) {
        float f = float(i);
        v += sin(v.yx * f + f + g_ph * f) / f;
        acc += cos(v.x - v.y) * amp;
        amp *= g_lay;
    }
    return acc;
}

// ------------------------------------------------------------------
// The medallion. A shallow disc with a raised rim, the ornament cut
// into its face and pierced right through it where the relief runs
// deepest, which is what opens the lace archetype (guide 12.5).
// ------------------------------------------------------------------

float g_R, g_th, g_relief, g_pierce, g_rimw;

float map(vec3 p) {
    float rad = length(p.xz);
    float a   = atan(p.z, p.x);

    // Scallop the rim so the outline is a cartouche, not a coin.
    float scallop = 1.0 + 0.055 * cos(a * 9.0 + g_ph);
    float disc = max(rad - g_R * scallop, abs(p.y) - g_th);

    // The ornament is laid in a mirrored eight-fold wedge, which gives
    // the cartouche its symmetry and leaves no seam, since a whole
    // number of wedges closes the circle exactly.
    float sect = TAU / 8.0;
    float aw = abs(mod(a + 0.5 * sect, sect) - 0.5 * sect);
    vec2 uvw = vec2(cos(aw), sin(aw)) * rad * g_freq;
    float orn = rocaille(uvw);
    g_orn = orn;

    float relief = g_relief * (0.5 + 0.5 * cos(orn * 2.3));
    float face = abs(p.y) - (g_th - relief);

    // Pierce the field where the ornament runs thin.
    float thin = smoothstep(g_pierce, g_pierce - 0.55, orn);
    float rimKeep = smoothstep(g_R - g_rimw, g_R - g_rimw * 0.4, rad);
    float hub = smoothstep(0.30, 0.22, rad);
    float pierce = max(thin - rimKeep - hub, 0.0);

    float d = max(disc, face);
    d = max(d, pierce * 0.28 - 0.02);
    return d * 0.75;
}

vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0022;
    return normalize(k.xyy * map(p + k.xyy * e) +
                     k.yyx * map(p + k.yyx * e) +
                     k.yxy * map(p + k.yxy * e) +
                     k.xxx * map(p + k.xxx * e));
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    float rr = length(uv);
    float bound = smoothstep(0.478, 0.442, rr);
    if (bound <= 0.0) { gl_FragColor = vec4(0.0); return; }

    float ph = fract(TIME / PERIOD);
    g_ph = ph * TAU;

    // ---- spectral morph selector (guide 12.2 - 12.4, 12.7) ----------
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tiltS = (md * 0.5 + hi) / sum;
    float sel = clamp((tiltS - 0.5) * (1.6 + 3.4 * morph_gain) + 0.5, 0.0, 1.0);
    sel = clamp(sel + 0.38 * (AUDIO_HAT - AUDIO_KICK) + 0.18 * AUDIO_SNARE, 0.0, 1.0);
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest_form, sel, live);

    float w1 = clamp(1.0 - abs(sel)       / 0.33, 0.0, 1.0);
    float w2 = clamp(1.0 - abs(sel - 0.5) / 0.33, 0.0, 1.0);
    float w3 = clamp(1.0 - abs(sel - 1.0) / 0.33, 0.0, 1.0);
    float ws = w1 + w2 + w3 + 1e-4;
    w1 /= ws; w2 /= ws; w3 /= ws;

    g_freq   = w1 * 4.60 + w2 * 7.20 + w3 * 10.40;
    g_lay    = w1 * 0.40 + w2 * 0.62 + w3 * 0.80;
    g_th     = w1 * 0.155 + w2 * 0.115 + w3 * 0.080;
    g_pierce = w1 * -3.0 + w2 * 0.35 + w3 * 1.05;
    g_rimw   = w1 * 0.34 + w2 * 0.22 + w3 * 0.13;

    // Shared parameters, sliding across the whole selector range so the
    // envelope keeps moving even at a fifty-fifty blend (guide 12.6).
    g_R      = (0.94 + 0.20 * swell) * (0.97 + 0.05 * sin(ph * TAU));
    g_relief = (0.030 + 0.050 * churn) * (0.85 + 0.40 * AUDIO_KICK);
    g_freq  *= 0.82 + 0.38 * churn;

    // ---- camera (guide 5) -------------------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    // The medallion is a plate, so it is kept tilted and turning: seen
    // exactly edge-on there would be nothing to read.
    float spin = ph * TAU;
    float tilt = 0.62 + 0.22 * sin(ph * TAU * 2.0);
    pR(ro.yz, tilt); pR(ro.xz, spin);
    pR(rd.yz, tilt); pR(rd.xz, spin);

    vec3 lightD = normalize(vec3(0.42, 0.80, 0.44));

    vec3  col   = vec3(0.0);
    float alpha = 0.0;
    float near  = 1e9;

    float tb0, tb1;
    if (sph(ro, rd, BOUND, tb0, tb1)) {
        float t = max(tb0, 0.02);
        bool hit = false;
        vec3 p = ro + rd * t;
        for (int i = 0; i < 56; i++) {
            p = ro + rd * t;
            float d = map(p);
            near = min(near, d / max(t, 0.6));
            if (d < 0.0011) { hit = true; break; }
            t += d * 0.80;
            if (t > tb1) break;
        }

        if (hit) {
            float orn = g_orn;
            vec3  n   = calcNormal(p);

            float dif  = clamp(dot(n, lightD), 0.0, 1.0);
            float bac  = clamp(dot(n, -lightD), 0.0, 1.0);
            float fre  = pow(clamp(1.0 + dot(n, rd), 0.0, 1.0), 3.0);
            float spec = pow(clamp(dot(reflect(rd, n), lightD), 0.0, 1.0), 46.0);
            float sp2  = pow(clamp(dot(reflect(rd, n), lightD), 0.0, 1.0), 10.0);

            // Gilding sits on the raised scrollwork; the sunk field
            // stays dark, which is what makes relief read as relief.
            float high = smoothstep(-0.35, 0.75, orn);
            vec3 gold = gild_tint.rgb * (0.10 + 0.85 * dif + 0.22 * bac);
            gold += gild_tint.rgb * sp2 * (0.55 + 1.05 * gild);
            gold += vec3(1.0, 0.97, 0.90) * spec * (1.70 + 1.50 * AUDIO_SNARE);

            vec3 field = field_tint.rgb * (0.20 + 0.60 * dif);

            col = mix(field, gold, high * (0.45 + 0.55 * gild))
                + gild_tint.rgb * fre * (0.55 + 1.05 * gild)
                                * (0.65 + 0.80 * AUDIO_BEAT);
            alpha = 1.0;
        }
    }

    // ---- bounded sheath from the closest approach (guide 8) ----------
    float ca = clamp(1.0 - near * 7.0, 0.0, 1.0);
    float sheath = (pow(ca, 6.0) * 0.30 + pow(ca, 30.0) * 0.62) * (1.0 - alpha);
    sheath *= smoothstep(0.442, 0.10, rr) * (0.40 + 0.60 * gild) * (0.55 + 0.90 * AUDIO_BEAT);
    col += gild_tint.rgb * sheath;
    alpha = clamp(alpha + sheath * 0.55, 0.0, 1.0);

    col = pow(max(col, 0.0), vec3(0.90));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
