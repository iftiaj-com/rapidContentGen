/*{
  "ADITS": 1,
  "DESCRIPTION": "A beating three-chambered body of translucent flesh lit from inside by the vessels growing through it, read where the refracted ray reaches them so the network sits under the skin with real parallax; it rests as one round blob and separates into three turgid chambers and then into a deeply scooped lobed mass as the spectrum brightens, a systolic front leaving each nucleus on every kick.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-26",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "organic"],
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
      "LABEL": "Turgor", "BIND": "bass", "BIND_DEPTH": 0.55 },
    { "NAME": "meander",    "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.05, "MAX": 0.84,
      "LABEL": "Vessel Meander", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "vitality",   "TYPE": "float", "DEFAULT": 0.42, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Vitality", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "flesh_tint", "TYPE": "color", "DEFAULT": [0.86, 0.36, 0.34, 1.00],
      "LABEL": "Flesh Tint" },
    { "NAME": "vein_tint",  "TYPE": "color", "DEFAULT": [1.00, 0.90, 0.52, 1.00],
      "LABEL": "Vessel Tint" }
  ]
}*/

#define TAU    6.28318530718
#define PI     3.14159265359
#define PERIOD 16.0
#define ORBIT  5.10
#define BOUND  1.22
#define SKIN_H 0.075

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

float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}
float smax(float a, float b, float k) { return -smin(-a, -b, k); }

// ------------------------------------------------------------------
// The body, as a radial height field.
//
// Instead of a distance function, the surface is given as its own radius
// in each direction. A lobe is then the far root of that direction
// against an offset sphere, which is exact and costs one square root, and
// the whole body is a few of those fused. It also means the normal can be
// taken from three samples on the tangent plane rather than a full
// three-dimensional gradient.
// ------------------------------------------------------------------

float g_ph, g_fuse, g_sep, g_scale, g_ripple, g_bite;
vec3  g_c0, g_c1, g_c2;
float g_k0, g_k1, g_k2;
vec3  g_b0, g_b1;
float g_s0, g_s1;

// Far root of the direction d against a sphere centred at c.
float lobeR(vec3 d, vec3 c, float k2) {
    float b = dot(c, d);
    return b + sqrt(max(k2 + b * b, 0.0));
}

// Near root against a bite sphere, pushed far away when the direction
// misses it, so a miss cannot scoop anything.
float biteR(vec3 d, vec3 q, float sq) {
    float b = dot(q, d);
    float disc = b * b - sq;
    float away = step(disc, 0.0) + step(b, 0.0);
    return b - sqrt(max(disc, 0.0)) + away * 8.0;
}

float bodyRadius(vec3 d) {
    float r = lobeR(d, g_c0, g_k0);
    r = smax(r, lobeR(d, g_c1, g_k1), g_fuse);
    r = smax(r, lobeR(d, g_c2, g_k2), g_fuse);

    // A travelling crease, so the wall is never a clean sphere.
    float w = fract(d.y * 1.05 + g_ph * 0.15915494) * 2.0 - 1.0;
    r *= 1.0 + g_ripple * w * (1.0 - abs(w)) * 4.0;

    r = smin(r, min(biteR(d, g_b0, g_s0), biteR(d, g_b1, g_s1)), 0.16);
    return max(r * g_scale, 0.12);
}

float bodyField(vec3 p) {
    float r = length(p);
    if (r < 1e-5) return -0.6;
    return r - bodyRadius(p / r);
}

// Three tangent samples, not a three-dimensional gradient: the surface is
// a height over the sphere, so its slope only ever has two components.
vec3 bodyNormal(vec3 p) {
    vec3 d = normalize(p);
    vec3 ax = abs(d.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 tu = normalize(cross(ax, d));
    vec3 tv = cross(d, tu);
    float e = 0.005;
    float r0 = bodyRadius(d);
    float ru = bodyRadius(normalize(d + tu * e));
    float rv = bodyRadius(normalize(d + tv * e));
    return normalize(d - (tu * (ru - r0) + tv * (rv - r0)) / (e * max(r0, 1e-4)));
}

// ------------------------------------------------------------------
// The vasculature. Evaluated only where a ray has already landed, so its
// cost is paid once per pixel rather than once per march step.
// ------------------------------------------------------------------

float g_vfreq, g_mean, g_vw;
vec3  g_n0, g_n1, g_n2;

float veinRaw(vec3 d) {
    vec3 q = d * g_vfreq;
    q += g_mean * vec3(sin(q.y * 2.10 + g_ph),
                       sin(q.z * 1.70 - g_ph * 2.0),
                       sin(q.x * 2.30 + g_ph * 3.0));
    float f = 0.0;
    float a = 0.50;
    for (int i = 0; i < 4; i++) {
        f += a * abs(sin(q.x) + cos(q.y * 1.1) + sin(q.z * 0.9));
        q = q * 1.92 + vec3(0.70, 1.30, -0.90);
        a *= 0.50;
    }
    return f;
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

    // Turgor is the whole silhouette: it pushes the lobe centres apart
    // and tightens the fuse, so one blob becomes three chambers.
    // The lobe centres have to move out to the same order as the lobe
    // radii before three chambers read as three; short of that they just
    // overlap into one mass.
    g_sep   = w1 * 0.060 + w2 * 0.240 + w3 * 0.360;
    g_fuse  = w1 * 0.520 + w2 * 0.185 + w3 * 0.090;
    g_bite  = w1 * 0.030 + w2 * 0.135 + w3 * 0.260;
    g_vfreq = w1 * 4.20  + w2 * 6.00  + w3 * 8.40;

    // The systole. AUDIO_KICK contracts the body directly, which is the
    // one thing a clock cannot express: a beat the music decides.
    float sys = clamp(AUDIO_KICK * 1.15 + 0.22 * AUDIO_BEAT, 0.0, 1.0);

    g_sep    *= 0.85 + 0.55 * swell;
    g_scale   = (0.94 + 0.16 * swell) * (0.99 + 0.03 * sin(ph * TAU)) * (1.0 - 0.070 * sys);
    g_ripple  = 0.016 + 0.030 * meander;
    g_mean    = 0.18 + 0.60 * meander;
    g_vw      = (0.135 - 0.055 * vitality);

    // Three lobes on slowly drifting axes, and two bites scooped out of
    // the result, which is what keeps the mass from reading as a ball.
    float wA = g_ph * 0.25, wB = g_ph * 0.35 + 2.1, wC = g_ph * 0.20 + 4.3;
    vec3 aA = normalize(vec3(cos(wA), 0.46, sin(wA)));
    vec3 aB = normalize(vec3(cos(wB), -0.30, sin(wB)));
    vec3 aC = normalize(vec3(cos(wC), -0.62, sin(wC)));

    g_c0 = aA * g_sep;
    g_c1 = aB * g_sep;
    g_c2 = aC * g_sep * 0.85;
    float R0 = 0.500, R1 = 0.460, R2 = 0.430;
    g_k0 = R0 * R0 - dot(g_c0, g_c0);
    g_k1 = R1 * R1 - dot(g_c1, g_c1);
    g_k2 = R2 * R2 - dot(g_c2, g_c2);

    // A bite is a sphere whose near surface the body is clipped against.
    vec3 bA = normalize(vec3(cos(wB * 1.4 + 1.0), 0.55, sin(wB * 1.4 + 1.0)));
    vec3 bB = normalize(vec3(cos(wC * 1.7 + 3.4), -0.48, sin(wC * 1.7 + 3.4)));
    // A bite has to sit close enough that its near surface actually
    // crosses the wall, or it scoops nothing at all.
    float bd = 0.62 + 0.22 * (1.0 - g_bite);
    float br0 = 0.26 + 0.40 * g_bite;
    float br1 = 0.22 + 0.36 * g_bite;
    g_b0 = bA * bd;  g_s0 = bd * bd - br0 * br0;
    g_b1 = bB * bd;  g_s1 = bd * bd - br1 * br1;

    // Three nuclei the vessels drain toward, drifting on their own.
    g_n0 = normalize(vec3(cos(g_ph * 1.0 + 0.4), 0.42, sin(g_ph * 1.0 + 0.4)));
    g_n1 = normalize(vec3(cos(g_ph * 1.0 + 2.5), -0.16, sin(g_ph * 1.0 + 2.5)));
    g_n2 = normalize(vec3(cos(g_ph * 1.0 + 4.6), -0.55, sin(g_ph * 1.0 + 4.6)));

    // ---- camera (guide 5) -------------------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    vec3 lightD = normalize(vec3(0.44, 0.72, 0.52));

    vec3  col   = vec3(0.0);
    float alpha = 0.0;
    float near  = 1e9;

    float tb0, tb1;
    if (sph(ro, rd, BOUND, tb0, tb1)) {
        float t = max(tb0, 0.02);
        bool hit = false;
        vec3 p = ro + rd * t;
        for (int i = 0; i < 48; i++) {
            p = ro + rd * t;
            float d = bodyField(p);
            near = min(near, d / max(t, 0.6));
            if (d < 0.0010) { hit = true; break; }
            t += d * 0.78;
            if (t > tb1) break;
        }

        if (hit) {
            vec3 n = bodyNormal(p);
            float facing = max(dot(n, -rd), 0.0);
            float dif = clamp(dot(n, lightD), 0.0, 1.0);
            float wrapL = clamp(0.5 + 0.5 * dot(n, lightD), 0.0, 1.0);
            float fre = pow(1.0 - facing, 3.0);

            // Refract into the skin and read the network where the bent
            // ray actually reaches it. Reading it at the surface instead
            // pins the veins to the skin and kills the parallax.
            vec3 rin = refract(rd, n, 1.0 / 1.42);
            if (dot(rin, rin) < 0.5) rin = rd;
            vec3 dv = normalize(p + rin * SKIN_H * (1.4 + 1.2 * facing));

            // Path through the skin goes as one over the cosine, so the
            // limb is a long warm scatter and a face-on trunk is short.
            float path = min(1.0 / max(facing, 0.09), 7.0);

            // Distance to the nearest nucleus doubles as arc length along
            // the tree, which is what lets a front travel out along it.
            float a0 = acos(clamp(dot(dv, g_n0), -1.0, 1.0));
            float a1 = acos(clamp(dot(dv, g_n1), -1.0, 1.0));
            float a2 = acos(clamp(dot(dv, g_n2), -1.0, 1.0));
            float arc = min(a0, min(a1, a2)) / PI;
            float which = (a1 < a0 && a1 < a2) ? 1.0 : ((a2 < a0) ? 2.0 : 0.0);

            // Vessels are contour lines of the field, wide near a nucleus
            // and narrow far from it, which is what makes trunks and
            // capillaries out of one function.
            float f = veinRaw(dv);
            float taper = g_vw * (1.35 - 0.85 * arc);
            float vline = abs(fract(f * 1.35) - 0.5);

            // The systolic front: one wave per beat leaving each nucleus
            // and running out along the tree, dilating what it passes.
            float front = fract(ph * 2.0);
            float dil = smoothstep(0.14, 0.0, abs(arc - front)) * (0.30 + 1.70 * sys);
            float vein = smoothstep(taper * (1.0 + 0.9 * dil), 0.0, vline);

            // Light from the vessels has to climb back out through skin,
            // and the blue goes first, so a deep trunk arrives dull red.
            vec3 absorb = exp(-path * vec3(0.55, 1.60, 2.30)
                              * (1.35 - 0.55 * vitality));
            vec3 vc = mix(vein_tint.rgb, flesh_tint.rgb, 0.25 + 0.22 * which);

            vec3 skin = flesh_tint.rgb * (0.05 + 0.30 * dif + 0.44 * wrapL * wrapL);
            skin *= 0.52 + 0.62 * exp(-path * 0.42);

            col = skin
                + vc * vein * absorb * (2.10 + 3.60 * vitality)
                     * (0.70 + 0.95 * AUDIO_BEAT)
                + vein_tint.rgb * vein * dil * (0.85 + 1.45 * vitality)
                + flesh_tint.rgb * fre * (0.55 + 0.75 * vitality)
                + vec3(1.0, 0.97, 0.95)
                  * pow(clamp(dot(reflect(rd, n), lightD), 0.0, 1.0), 42.0) * 0.85;
            alpha = 1.0;
        }
    }

    // ---- bounded sheath from the closest approach (guide 8) ----------
    float ca = clamp(1.0 - near * 5.6, 0.0, 1.0);
    float sheath = (pow(ca, 6.0) * 0.30 + pow(ca, 30.0) * 0.62) * (1.0 - alpha);
    sheath *= smoothstep(0.442, 0.10, rr) * (0.40 + 0.60 * vitality)
            * (0.55 + 0.90 * AUDIO_BEAT);
    col += mix(flesh_tint.rgb, vein_tint.rgb, 0.35) * sheath;
    alpha = clamp(alpha + sheath * 0.55, 0.0, 1.0);

    col = col / (1.0 + col * 0.34);
    col = pow(max(col, 0.0), vec3(0.90));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
