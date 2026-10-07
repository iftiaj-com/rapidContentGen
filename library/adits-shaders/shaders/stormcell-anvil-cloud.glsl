/*{
  "ADITS": 1,
  "DESCRIPTION": "A dark storm cell lit mostly from inside by its own discharges, with a second short ray marched toward the sun at every sample so the mass casts shadows onto itself; it rests as a dense low cumulus and builds an anvil head and then a torn shear wall as the spectrum brightens, the lightning firing on every beat.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-26",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "volumetric"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "morph_gain", "TYPE": "float", "DEFAULT": 0.85, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Morph Sensitivity" },
    { "NAME": "rest_form",  "TYPE": "float", "DEFAULT": 0.10, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Rest Archetype" },
    { "NAME": "swell",      "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.10, "MAX": 0.76,
      "LABEL": "Cell Swell", "BIND": "bass", "BIND_DEPTH": 0.55 },
    { "NAME": "shear",      "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.05, "MAX": 0.84,
      "LABEL": "Wind Shear", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "charge",     "TYPE": "float", "DEFAULT": 0.42, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Charge", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "cloud_tint", "TYPE": "color", "DEFAULT": [0.72, 0.80, 0.94, 1.00],
      "LABEL": "Lit Tint" },
    { "NAME": "bolt_tint",  "TYPE": "color", "DEFAULT": [0.62, 0.82, 1.00, 1.00],
      "LABEL": "Bolt Tint" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  6.40
#define BOUND  1.42
#define NUDGE  0.739513
#define NORM   0.804480    // 1 / sqrt(1 + NUDGE * NUDGE)

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
// The cell.
//
// A shaped body with an octave-summed sine field folded into it. The
// field is what makes the surface boil; the body is what decides
// whether it is a cumulus, an anvil, or a shear wall (guide 12.5).
// ------------------------------------------------------------------

float g_ph, g_base, g_cap, g_lean, g_flat, g_tear, g_scale;

// Billows built by adding sin and cos at a rising frequency while the
// coordinate is rotated by a fixed perpendicular nudge each pass. A
// product of two plane waves would be far cheaper but it corrugates
// space into flat sheets, which reads as crumpled paper, not vapour.
float turb(vec3 p) {
    float n = 0.0;
    float it = 1.0;
    for (int i = 0; i < 5; i++) {
        float k = float(i) + 1.0;
        n += (sin(p.y * it + g_ph * k) + cos(p.x * it - g_ph * k)) / it;
        p.xy += vec2(p.y, -p.x) * NUDGE;  p.xy *= NORM;
        p.xz += vec2(p.z, -p.x) * NUDGE;  p.xz *= NORM;
        it *= 1.733733;
    }
    return n * 0.26;
}

// Positive inside the cloud, and the value doubles as its density.
float cell(vec3 q) {
    vec3 p = q / g_scale;

    // Wind shear: the whole column leans and twists with height.
    float h = clamp((p.y + 0.90) / 1.80, 0.0, 1.0);
    p.x -= g_lean * h * h;
    pR(p.xz, g_lean * 2.2 * h);

    // Body: a rising column that spreads out into a cap.
    float spread = g_base + g_cap * smoothstep(0.45, 1.0, h);
    float rad = length(p.xz) / max(spread, 0.02);
    float top = (p.y - (0.90 - g_flat * 0.55)) / 0.35;
    float bottom = (-0.90 - p.y) / 0.30;

    float body = 1.0 - max(rad, max(top, bottom));
    float n = turb(p * 5.4);
    body += n * 0.85;
    body -= g_tear * abs(n) * 2.2;
    // A soft edge rather than a cut one: a cloud has no surface, and a
    // hard threshold here is what makes it read as crumpled paper.
    return smoothstep(0.0, 0.52, body);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    float rr = length(uv);
    float bound = smoothstep(0.476, 0.440, rr);
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

    g_base = w1 * 0.58 + w2 * 0.34 + w3 * 0.26;
    g_cap  = w1 * 0.04 + w2 * 0.46 + w3 * 0.62;
    g_flat = w1 * 0.10 + w2 * 0.62 + w3 * 0.30;
    g_tear = w1 * 0.06 + w2 * 0.18 + w3 * 0.46;

    // Shared parameters, sliding across the whole selector range so the
    // envelope keeps moving even at a fifty-fifty blend (guide 12.6).
    g_scale = (0.92 + 0.18 * swell) * (0.97 + 0.05 * sin(ph * TAU));
    g_lean  = (0.10 + 0.34 * shear) * (0.85 + 0.30 * AUDIO_KICK);
    g_tear *= 0.75 + 0.60 * shear + 0.30 * AUDIO_KICK;

    // ---- camera (guide 5) -------------------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    float spin = ph * TAU;
    float tip  = 0.14 * sin(ph * TAU * 2.0);
    pR(ro.xz, spin); pR(ro.yz, tip);
    pR(rd.xz, spin); pR(rd.yz, tip);

    // The sun sits low and to one side, which is what makes a
    // self-shadowed cloud read as a cloud and not as a ball of fog.
    vec3 lightD = normalize(vec3(0.72, 0.46, 0.52));

    vec3  acc   = vec3(0.0);
    float cov   = 0.0;
    float trans = 1.0;

    // Lightning: a discharge inside the cell, fired by the beat and
    // placed on a phase that returns exactly at the loop boundary.
    vec3 boltP = vec3(0.22 * sin(ph * TAU * 3.0),
                      0.10 * cos(ph * TAU * 2.0) - 0.10,
                      0.22 * cos(ph * TAU * 3.0)) * g_scale;
    float boltE = (0.55 + 1.10 * charge) + 4.20 * AUDIO_BEAT + 2.60 * AUDIO_KICK;

    float tb0, tb1;
    if (sph(ro, rd, BOUND, tb0, tb1)) {
        float t = max(tb0, 0.02);
        float dt = (tb1 - t) / 36.0;
        for (int i = 0; i < 36; i++) {
            vec3 p = ro + rd * (t + dt * (float(i) + 0.5));
            float dens = cell(p);
            if (dens <= 0.002) continue;
            dens *= 2.1 + 1.6 * charge;

            // Four short steps toward the light. Sampling the same field
            // along that ray is the whole of the self-shadowing, and it
            // is what puts a dark base under a lit anvil.
            float shade = 1.0;
            for (int j = 1; j <= 4; j++) {
                float sd = cell(p + lightD * (float(j) * 0.34 * g_scale));
                shade *= exp(-sd * 3.20);
            }

            // A cool shadow and a warm lit side is most of what makes
            // a volume read as cloud rather than as grey fog.
            vec3 shadowCol = cloud_tint.rgb * vec3(0.34, 0.42, 0.68);
            vec3 sunCol    = cloud_tint.rgb * vec3(1.30, 1.20, 1.05);
            vec3 lit = mix(shadowCol * 0.10, sunCol * 0.62, shade);

            // The discharge lights the cloud from inside, so it is
            // brightest exactly where the shadowed side is darkest.
            vec3 bd = p - boltP;
            lit += bolt_tint.rgb * boltE * exp(-dot(bd, bd) * 4.2) * 1.8;
            vec3 bd2 = p - boltP * vec3(-0.85, -1.4, -0.85);
            lit += bolt_tint.rgb * boltE * exp(-dot(bd2, bd2) * 7.0) * 1.1;

            float glowTake = 1.0 - exp(-dens * dt * 1.15);
            acc  += lit * glowTake * trans;
            cov  += glowTake * trans;
            trans *= 1.0 - glowTake;
            if (trans < 0.02) break;
        }
    }

    vec3  col   = acc;
    float alpha = clamp(cov * 1.10, 0.0, 1.0);

    col = col / (1.0 + col * 0.32);

    // ---- bounded hub glow, well inside the frame edge (guide 8) ------
    float halo = 0.0042 / (dot(uv, uv) + 0.0130) * smoothstep(0.40, 0.05, rr);
    col += bolt_tint.rgb * halo * (0.20 + 1.30 * AUDIO_BEAT + 0.25 * charge)
         * (1.0 - alpha * 0.85);
    alpha = clamp(alpha + halo * 0.22 * (1.0 - alpha), 0.0, 1.0);

    col = pow(max(col, 0.0), vec3(0.90));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
