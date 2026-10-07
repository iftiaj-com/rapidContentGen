/*{
  "ADITS": 1,
  "DESCRIPTION": "A hollow octahedral glass reliquary whose wall is cut open by rotating slice planes, marched layer by layer so the ray reads the front wall, the folded shell suspended inside it and the lit nucleus at its centre all at once; it rests nearly intact with one deep cleave and is quartered and then split into a cage of shards as the spectrum brightens.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-26",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "crystal"],
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
      "LABEL": "Vessel Swell", "BIND": "bass", "BIND_DEPTH": 0.55 },
    { "NAME": "cleave",     "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.05, "MAX": 0.85,
      "LABEL": "Cleave Roll", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "glaze",      "TYPE": "float", "DEFAULT": 0.42, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Glass Glaze", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "glass_tint", "TYPE": "color", "DEFAULT": [0.40, 0.86, 1.00, 1.00],
      "LABEL": "Glass Tint" },
    { "NAME": "core_tint",  "TYPE": "color", "DEFAULT": [1.00, 0.66, 0.20, 1.00],
      "LABEL": "Nucleus Tint" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  5.20
#define BOUND  1.12

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
// The vessel.
//
// An octahedron is cut open by three rotating slice planes, then
// abs(d) - wall turns the solid into a thin hollow shell. Each carve
// removes a slab of half-width s, so a negative s reaches nothing at
// all and the same three carves cover one cleave, two, or three
// without a variable loop bound (guide 12.5).
// ------------------------------------------------------------------

float g_R, g_wall, g_s1, g_s2, g_s3, g_roll, g_ph, g_nuc;
float g_layer;   // folded-lattice radius at the sample, for colour
float g_mat;     // 0 vessel wall, 1 inner shell, 2 nucleus

vec3 lattice(vec3 p) {
    for (int i = 0; i < 2; i++) {
        pR(p.xy,  0.78539816);
        pR(p.xz,  0.78539816);
        p = abs(p) - 0.62;
        pR(p.xz, -0.78539816);
        pR(p.xy, -0.78539816);
    }
    return p;
}

float carve(vec3 p, float d, float s, float a) {
    pR(p.xy, a);
    pR(p.xz, a * 0.5);
    pR(p.yz, a + a);
    return max(d, -(abs(p.x) - s));
}

float map(vec3 p0) {
    float oct = dot(abs(p0), vec3(0.5773503, 0.5773503, 0.5773503)) - g_R;

    float outer = oct;
    outer = carve(p0, outer, g_s1, g_roll);
    outer = carve(p0, outer, g_s2, g_roll * 2.0 + 1.1);
    outer = carve(p0, outer, g_s3, g_roll * 3.0 + 2.3);
    outer = abs(outer) - g_wall;

    // A second, folded shell hung inside, visible through the cuts and
    // never poking out through the vessel.
    vec3 q = lattice(p0);
    g_layer = length(q);
    float inner = abs(g_layer - 0.34) - g_wall * 0.70;
    inner = max(inner, oct + 0.07);

    float nuc = length(p0) - g_nuc;

    float d = outer;
    g_mat = 0.0;
    if (inner < d) { d = inner; g_mat = 1.0; }
    if (nuc   < d) { d = nuc;   g_mat = 2.0; }
    return d;
}

vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0018;
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

    // A negative half-width parks a slice plane: the slab it removes
    // never reaches the body, so the cleave count rises with the
    // selector without a variable loop bound.
    g_s1 = w1 *  0.090 + w2 *  0.140 + w3 * 0.175;
    g_s2 = w1 * -2.000 + w2 *  0.120 + w3 * 0.155;
    g_s3 = w1 * -2.000 + w2 * -2.000 + w3 * 0.135;

    // Shared parameters, sliding across the whole selector range so the
    // envelope keeps moving even at a fifty-fifty blend (guide 12.6).
    g_R    = (0.50 + 0.10 * swell) * (0.97 + 0.05 * sin(ph * TAU));
    g_wall = 0.024 + 0.026 * glaze;
    g_nuc  = 0.17 + 0.06 * swell + 0.05 * AUDIO_KICK;
    g_roll = g_ph + cleave * 1.7 * sin(ph * TAU * 2.0);

    // ---- camera (guide 5) -------------------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    float spin = ph * TAU;
    float roll = 0.34 * sin(ph * TAU * 2.0);
    pR(ro.xz, spin); pR(ro.yz, roll);
    pR(rd.xz, spin); pR(rd.yz, roll);

    vec3 lightD = normalize(vec3(0.44, 0.80, 0.42));

    vec3  acc   = vec3(0.0);
    float cov   = 0.0;
    float trans = 1.0;

    float tb0, tb1;
    if (sph(ro, rd, BOUND, tb0, tb1)) {
        float t = max(tb0, 0.02);
        for (int i = 0; i < 64; i++) {
            vec3 p = ro + rd * t;
            float d = map(p);

            if (d < 0.0010) {
                float mat = g_mat;
                float lay = g_layer;
                vec3  n   = calcNormal(p);

                float dif  = clamp(dot(n, lightD), 0.0, 1.0);
                float fre  = pow(clamp(1.0 + dot(n, rd), 0.0, 1.0), 2.4);
                float spec = pow(clamp(dot(reflect(rd, n), lightD), 0.0, 1.0), 52.0);

                vec3  c;
                float glowTake;

                if (mat > 1.5) {
                    // The nucleus. Opaque, and the only thing in here
                    // that is a light source rather than a lens.
                    c = core_tint.rgb * (1.40 + 1.65 * dif + 1.35 * fre)
                      * (0.85 + 0.95 * AUDIO_BEAT);
                    glowTake = 1.0;
                } else {
                    // Glass. Thin enough to see through, so the wall
                    // reads as a lens and not as a painted surface.
                    float veil = mix(0.09, 0.19, mat);
                    vec3 tone = mix(glass_tint.rgb, core_tint.rgb, 0.30 * mat);
                    // The folded field tints the wall from inside, which
                    // is what stops a flat facet reading as flat paint.
                    tone *= 0.55 + 0.85 * smoothstep(0.10, 0.60, lay);
                    c = tone * (0.12 + 0.34 * dif)
                      + tone * fre * (0.90 + 1.35 * glaze)
                      + vec3(1.0, 0.98, 0.95) * spec * (0.80 + 0.80 * AUDIO_BEAT);
                    glowTake = clamp(veil + 0.44 * fre + 0.40 * spec, 0.0, 1.0)
                             * (0.55 + 0.40 * glaze);
                }

                acc  += c * glowTake * trans;
                cov  += glowTake * trans;
                trans *= 1.0 - glowTake;
                if (trans < 0.04) break;

                // Step past this wall and keep reading the ones behind it.
                t += g_wall * 2.3 + 0.006;
                continue;
            }

            t += d * 0.85;
            if (t > tb1) break;
        }
    }

    vec3  col   = acc / (1.0 + acc * 0.42);
    float alpha = clamp(cov, 0.0, 1.0);

    // ---- bounded hub glow, well inside the frame edge (guide 8) ------
    float halo = 0.0058 / (dot(uv, uv) + 0.0085) * smoothstep(0.42, 0.05, rr);
    col += mix(core_tint.rgb, glass_tint.rgb, 0.45) * halo
         * (0.40 + 0.85 * AUDIO_BEAT + 0.40 * glaze) * (1.0 - alpha * 0.75);
    alpha = clamp(alpha + halo * 0.32 * (1.0 - alpha), 0.0, 1.0);

    col = pow(max(col, 0.0), vec3(0.90));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
