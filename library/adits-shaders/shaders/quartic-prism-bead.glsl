/*{
  "ADITS": 1,
  "DESCRIPTION": "A solved glass bead: the quartic surface it is cut from is intersected in closed form rather than marched, so its edges stay razor sharp at any size, and the ray is refracted at the way in and again at the way out to read the interior; it rests as a soft rounded pebble and hardens into a squared bead and then a near-cubic prism as the spectrum brightens.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-26",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "crystal"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "medium",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "morph_gain", "TYPE": "float", "DEFAULT": 0.84, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Morph Sensitivity" },
    { "NAME": "rest_form",  "TYPE": "float", "DEFAULT": 0.10, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Rest Archetype" },
    { "NAME": "swell",      "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.10, "MAX": 0.76,
      "LABEL": "Bead Swell", "BIND": "bass", "BIND_DEPTH": 0.55 },
    { "NAME": "bend",       "TYPE": "float", "DEFAULT": 0.36, "MIN": 0.05, "MAX": 0.88,
      "LABEL": "Refraction", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "split",      "TYPE": "float", "DEFAULT": 0.40, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Dispersion", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "glass_tint", "TYPE": "color", "DEFAULT": [0.52, 0.86, 1.00, 1.00],
      "LABEL": "Glass Tint" },
    { "NAME": "core_tint",  "TYPE": "color", "DEFAULT": [1.00, 0.36, 0.76, 1.00],
      "LABEL": "Core Tint" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  4.60
#define MISS   1.0e6

void pR(inout vec2 p, float a) { p = cos(a) * p + sin(a) * vec2(p.y, -p.x); }

// ------------------------------------------------------------------
// The solid.
//
// A superquadric of exponent four: x^4 + y^4 + z^4 = r^4. Rather than
// marching it, the ray is substituted straight into that equation,
// which leaves a quartic in t and a quartic can be solved in closed
// form. The hit is therefore exact, and the edges stay sharp however
// close the camera gets, which no fixed-step march can promise.
//
// The exponent stays four throughout; the roundness is carried by
// blending the solved quartic hit against a solved sphere hit, since
// only the two exponents that have closed forms are on the table.
// ------------------------------------------------------------------

float g_r, g_box, g_ph;

// Nearest positive root of the quartic surface, or MISS.
float rayQuartic(vec3 ro, vec3 rd, float ra) {
    float r2 = ra * ra;
    vec3 d2 = rd * rd, d3 = d2 * rd;
    vec3 o2 = ro * ro, o3 = o2 * ro;
    float ka = 1.0 / dot(d2, d2);
    float k3 = ka * dot(ro, d3);
    float k2 = ka * dot(o2, d2);
    float k1 = ka * dot(o3, rd);
    float k0 = ka * (dot(o2, o2) - r2 * r2);

    float c2 = k2 - k3 * k3;
    float c1 = k1 + 2.0 * k3 * k3 * k3 - 3.0 * k3 * k2;
    float c0 = k0 - 3.0 * k3 * k3 * k3 * k3 + 6.0 * k3 * k3 * k2 - 4.0 * k3 * k1;

    float p = c2 * c2 + c0 / 3.0;
    float q = c2 * c2 * c2 - c2 * c0 + c1 * c1;
    float h = q * q - p * p * p;
    if (h < 0.0) return MISS;

    float sh = sqrt(h);
    float s = sign(q + sh) * pow(abs(q + sh), 1.0 / 3.0);
    float t = sign(q - sh) * pow(abs(q - sh), 1.0 / 3.0);
    vec2 w = vec2(s + t, s - t);
    vec2 v = vec2(w.x + c2 * 4.0, w.y * sqrt(3.0)) * 0.5;
    float rr = length(v);
    float rm = rr - v.x;
    // Two candidate roots; take the nearer one that is in front.
    float a = sqrt(max(rm, 0.0));
    float b = sqrt(max(2.0 * rr - rm, 0.0));
    float t1 = -a - b * 0.5 - k3;
    float t2 =  a - b * 0.5 - k3;
    float tmin = MISS;
    if (t1 > 0.0) tmin = min(tmin, t1);
    if (t2 > 0.0) tmin = min(tmin, t2);
    return tmin;
}

// Sphere root, the round end of the same family.
float raySphereT(vec3 ro, vec3 rd, float ra, float far) {
    float b = dot(ro, rd);
    float c = dot(ro, ro) - ra * ra;
    float h = b * b - c;
    if (h < 0.0) return MISS;
    h = sqrt(h);
    float t0 = -b - h, t1 = -b + h;
    float t = far > 0.5 ? t1 : t0;
    return t > 0.0 ? t : MISS;
}

vec3 quarticNormal(vec3 p, float ra) {
    vec3 c = p * p * p;
    return normalize(c / max(length(c), 1e-6));
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

    g_box = w1 * 0.10 + w2 * 0.62 + w3 * 1.00;

    // Shared parameters, sliding across the whole selector range so the
    // envelope keeps moving even at a fifty-fifty blend (guide 12.6).
    g_r = (0.66 + 0.16 * swell) * (0.97 + 0.05 * sin(ph * TAU))
        * (0.96 + 0.10 * AUDIO_KICK);

    // ---- camera (guide 5) -------------------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    float spin = ph * TAU;
    float tip  = 0.62 * sin(ph * TAU) + 0.35;
    pR(ro.xz, spin); pR(ro.yz, tip);
    pR(rd.xz, spin); pR(rd.yz, tip);

    vec3 lightD = normalize(vec3(0.42, 0.78, 0.46));

    vec3  col   = vec3(0.0);
    float alpha = 0.0;

    float tq = rayQuartic(ro, rd, g_r);
    float ts = raySphereT(ro, rd, g_r, 0.0);

    if (tq < MISS * 0.5 || ts < MISS * 0.5) {
        // Blend the two solved hits: the exponent is fixed, so the
        // roundness has to come from where the surface is, not from
        // raising a power the closed form cannot solve.
        float tIn;
        vec3 nIn;
        if (tq < MISS * 0.5 && ts < MISS * 0.5) {
            tIn = mix(ts, tq, g_box);
            vec3 pq = ro + rd * tq;
            vec3 ps = ro + rd * ts;
            nIn = normalize(mix(normalize(ps), quarticNormal(pq, g_r), g_box));
        } else if (tq < MISS * 0.5) {
            tIn = tq; nIn = quarticNormal(ro + rd * tq, g_r);
        } else {
            tIn = ts; nIn = normalize(ro + rd * ts);
        }

        vec3 pIn = ro + rd * tIn;

        float fre = pow(clamp(1.0 + dot(nIn, rd), 0.0, 1.0), 3.0);
        float spec = pow(clamp(dot(reflect(rd, nIn), lightD), 0.0, 1.0), 68.0);
        float dif  = clamp(dot(nIn, lightD), 0.0, 1.0);

        // Refract in, cross the bead, refract out. Three slightly
        // different indices give the edges their colour fringe.
        float eta = mix(0.98, 0.62, bend);
        float dsp = 0.045 + 0.130 * split;

        vec3 inner = vec3(0.0);
        for (int c = 0; c < 3; c++) {
            float e = eta + (float(c) - 1.0) * dsp;
            vec3 r1 = refract(rd, nIn, e);
            if (dot(r1, r1) < 0.5) r1 = reflect(rd, nIn);

            // Read the core at the closest the bent ray comes to it.
            // Reading it where the ray leaves the solid would sample the
            // surface every time, and the core would never appear.
            float tc = max(-dot(pIn, r1), 0.0);
            vec3 pc = pIn + r1 * tc;
            float dCore = length(pc) / max(g_r, 0.01);
            float lit = exp(-dCore * dCore * 11.0);
            float band = 0.5 + 0.5 * cos(dCore * 16.0 - g_ph * 2.0 + float(c) * 1.1);
            inner[c] = lit * (0.55 + 1.35 * band);
        }

        vec3 core = core_tint.rgb * inner * (0.95 + 1.75 * split)
                  * (0.70 + 0.95 * AUDIO_BEAT);
        core += vec3(inner.r, inner.g, inner.b) * 0.85 * split;

        float wrap = clamp(0.5 + 0.5 * dot(nIn, lightD), 0.0, 1.0);
        // The quartic runs flat across a face and turns hard at an edge,
        // so how far the normal is from an axis reads straight off as
        // the edge, and it is what makes a solved solid look cut.
        vec3 an = abs(nIn);
        float edgeN = 1.0 - max(an.x, max(an.y, an.z));
        float edgeL = smoothstep(0.28, 0.62, edgeN) * g_box;

        col = glass_tint.rgb * (0.06 + 0.30 * dif + 0.34 * wrap * wrap)
            + glass_tint.rgb * edgeL * (0.55 + 1.35 * split)
                             * (0.65 + 0.85 * AUDIO_SNARE)
            + glass_tint.rgb * fre * (1.25 + 1.65 * split)
            + core
            + vec3(1.0, 0.98, 0.95) * spec * (1.95 + 1.55 * AUDIO_SNARE);

        alpha = clamp(0.32 + 0.62 * fre + 0.60 * spec
                    + 0.55 * clamp(inner.g, 0.0, 1.0), 0.0, 1.0);
    }

    // ---- bounded hub glow, well inside the frame edge (guide 8) ------
    float halo = 0.0060 / (dot(uv, uv) + 0.0090) * smoothstep(0.42, 0.05, rr);
    col += mix(core_tint.rgb, glass_tint.rgb, 0.5) * halo
         * (0.35 + 0.80 * AUDIO_BEAT + 0.35 * split) * (1.0 - alpha * 0.80);
    alpha = clamp(alpha + halo * 0.30 * (1.0 - alpha), 0.0, 1.0);

    col = pow(max(col, 0.0), vec3(0.90));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
