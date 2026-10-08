/*{
  "ADITS": 1,
  "DESCRIPTION": "A rain-beaded enamel gourd under a two-layer coat: clear lacquer reflects its own Fresnel share and passes the rest down to a pigmented base with metallic flake, and every flake carries its own normal, so the sparkle comes and goes with the angle a real show finish does. The droplets are geometry bumped into the field on a jittered lattice, each a lens with a water Fresnel and a bright meniscus. It rests as a fat black-cherry pear, drenches into a calabash, then squats into a ribbed gourd.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-09-04",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "lacquer"],
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
      "LABEL": "Gourd Swell", "BIND": "bass", "BIND_DEPTH": 0.55 },
    { "NAME": "bead",       "TYPE": "float", "DEFAULT": 0.38, "MIN": 0.08, "MAX": 0.92,
      "LABEL": "Rain Beading", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "flake",      "TYPE": "float", "DEFAULT": 0.40, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Flake Fire", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "sheet",      "TYPE": "float", "DEFAULT": 0.30, "MIN": 0.06, "MAX": 0.88,
      "LABEL": "Coat Wetness", "BIND": "kick", "BIND_DEPTH": 0.60 },
    { "NAME": "paint_tint", "TYPE": "color", "DEFAULT": [0.44, 0.045, 0.085, 1.00],
      "LABEL": "Paint Colour" },
    { "NAME": "lamp_tint",  "TYPE": "color", "DEFAULT": [1.00, 0.66, 0.30, 1.00],
      "LABEL": "Street Lamp" }
  ]
}*/

#define TAU    6.28318530718
#define PI     3.14159265359
#define PERIOD 16.0
#define ORBIT  4.60
#define BOUND  1.38

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

// A trig-free hash, because the bead lattice is sampled on every march
// step and a sin-based one would cost three transcendentals a step.
vec3 hash3(vec3 c) {
    vec3 q = fract(c * vec3(0.1031, 0.1030, 0.0973));
    q += dot(q, q.yzx + 33.33);
    return fract((q.xxy + q.yzz) * q.zyx) * 2.0 - 1.0;
}

float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

// ------------------------------------------------------------------
// The gourd: two blended spheres with eight longitudinal lobes.
//
// The lobes need cos(8 theta) and an atan in the march would be the
// most expensive line in the shader, so the angle is never taken. The
// double-angle identity applied three times gets cos(8 theta) out of
// x/r and z/r with nothing but multiplies.
// ------------------------------------------------------------------

float g_r1, g_r2, g_y1, g_y2, g_blend, g_rib, g_nr1, g_nr2;
float g_bf, g_br, g_bamp;

// Droplet distance: a jittered 3D lattice, so the beads land wherever
// the surface happens to cross a cell and come out different sizes,
// which is what real beading on a waxed panel looks like.
float beadDist(vec3 p) {
    vec3 u = p * g_bf;
    vec3 c = floor(u) + 0.5 + 0.32 * hash3(floor(u));
    return length(u - c) / g_bf;
}

float map(vec3 p) {
    float lower = length(p - vec3(0.0, -g_y1, 0.0)) - g_r1;
    float upper = length(p - vec3(0.0,  g_y2, 0.0)) - g_r2;
    float d = smin(lower, upper, g_blend);

    float r = length(p.xz);

    // The neck, as a tapered cylinder between the two bulb centres. Two
    // spheres alone cannot make a long-necked gourd: pull them far
    // enough apart for a neck and they stop overlapping, and the object
    // splits into two balls. The neck is what keeps it one object.
    float ty = clamp((p.y + g_y1) / max(g_y2 + g_y1, 1e-3), 0.0, 1.0);
    float neck = max(r - mix(g_nr1, g_nr2, ty),
                     max(p.y - g_y2, -g_y1 - p.y));
    d = smin(d, neck, g_blend);

    if (r > 1e-4) {
        float c = p.x / r, s = p.z / r;
        float c2 = c * c - s * s, s2 = 2.0 * c * s;
        float c4 = c2 * c2 - s2 * s2;
        float c8 = 2.0 * c4 * c4 - 1.0;
        d -= g_rib * (0.5 + 0.5 * c8) * smoothstep(0.06, 0.30, r);
    }

    d -= smoothstep(g_br, 0.0, beadDist(p)) * g_bamp;
    return d;
}

vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0013;
    return normalize(k.xyy * map(p + k.xyy * e) +
                     k.yyx * map(p + k.yyx * e) +
                     k.yxy * map(p + k.yxy * e) +
                     k.xxx * map(p + k.xxx * e));
}

// A GGX lobe, used twice: once wide for the pigment coat and once tight
// for the lacquer over it.
float ggx(float nh, float a) {
    float d = nh * nh * (a * a - 1.0) + 1.0;
    return (a * a) / (PI * d * d);
}

// ------------------------------------------------------------------
// A wet street at night. Overcast above, bright tarmac below, a row of
// sodium lamps and one cold shop window. A layered coat is almost
// entirely a picture of its surroundings, so the surroundings have to
// have hard edges and separate colours or the gloss has nothing to say.
// ------------------------------------------------------------------

vec3 envStreet(vec3 r) {
    vec3 c = mix(vec3(0.115, 0.125, 0.165), vec3(0.028, 0.032, 0.046),
                 smoothstep(-0.10, 0.80, r.y));
    c += lamp_tint.rgb * 0.85 * smoothstep(0.02, -0.60, r.y);

    float az = atan(r.z, r.x);
    float run = pow(max(cos(az * 6.0), 0.0), 300.0);
    c += lamp_tint.rgb * run * exp(-(r.y - 0.22) * (r.y - 0.22) * 170.0) * 34.0;
    // The lamps again in the road. A reflection in wet tarmac smears
    // along the vertical, so the copy below is far softer than the lamp.
    c += lamp_tint.rgb * pow(max(cos(az * 6.0), 0.0), 40.0)
       * smoothstep(-0.03, -0.65, r.y) * 2.10;
    c += vec3(0.34, 0.62, 0.98)
       * pow(max(dot(r, normalize(vec3(0.72, 0.10, -0.68))), 0.0), 18.0) * 1.55;
    return c;
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

    // Fat pear, long-necked calabash, squat ribbed gourd. Two spheres
    // and a blend radius carry all three, so the neck grows out of the
    // shoulder rather than fading in over it.
    float grow = (0.93 + 0.18 * swell) * (0.980 + 0.026 * sin(phase));
    g_r1    = (w1 * 0.700 + w2 * 0.560 + w3 * 0.880) * grow;
    g_r2    = (w1 * 0.450 + w2 * 0.250 + w3 * 0.480) * grow;
    g_y1    = (w1 * 0.360 + w2 * 0.520 + w3 * 0.120) * grow;
    g_y2    = (w1 * 0.560 + w2 * 0.790 + w3 * 0.470) * grow;
    g_nr1   = (w1 * 0.430 + w2 * 0.330 + w3 * 0.560) * grow;
    g_nr2   = (w1 * 0.360 + w2 * 0.185 + w3 * 0.430) * grow;
    g_blend = (w1 * 0.220 + w2 * 0.150 + w3 * 0.320) * grow;
    g_rib   = (w1 * 0.020 + w2 * 0.014 + w3 * 0.086) * grow;

    // Beading. Density and size both slide, and the drenched archetype
    // is the one where the droplets crowd into each other.
    g_bf    = (w1 * 13.0 + w2 * 15.5 + w3 * 9.0) * (0.80 + 0.60 * bead);
    g_br    = (w1 * 0.026 + w2 * 0.019 + w3 * 0.032) * (0.55 + 1.05 * bead);
    g_bamp  = g_br * (w1 * 0.58 + w2 * 0.64 + w3 * 0.32);

    // Pigment. Deep cherry, a blue-black wet look, and a warm candy
    // gold. The base is what the lacquer passes light down to, so these
    // are base-layer albedos and not surface colours.
    vec3 pig = w1 * paint_tint.rgb
             + w2 * vec3(0.075, 0.215, 0.290)
             + w3 * vec3(0.62, 0.28, 0.035);
    float flakeAmt = w1 * 0.40 + w2 * 0.22 + w3 * 1.00;

    // ---- camera (guide 5) -------------------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.55 * ww);

    float lean = 0.15 * sin(phase * 2.0);
    pR(ro.xz, phase); pR(ro.yz, lean);
    pR(rd.xz, phase); pR(rd.yz, lean);

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
            if (d < 0.0009) { hit = true; break; }
            // The bead bumps steepen the field, so the step is held down.
            t += d * 0.52;
            if (t > tb1) break;
        }

        if (hit) {
            vec3 n = calcNormal(p);
            float ndv = clamp(dot(n, -rd), 0.0, 1.0);

            vec3 L = normalize(vec3(-0.38, 0.74, 0.55));
            vec3 hv = normalize(L - rd);
            float nh = max(dot(n, hv), 0.0);
            float ndl = max(dot(n, L), 0.0);
            vec3 refv = reflect(rd, n);
            vec3 env = envStreet(refv);

            // Where a droplet is, and where its meniscus is. The rim of
            // a bead is the brightest line on a wet panel because the
            // surface there is nearly edge-on to the eye.
            float bd = beadDist(p);
            float onDrop = smoothstep(g_br * 1.02, g_br * 0.42, bd);
            float lip = smoothstep(g_br * 1.10, g_br * 0.86, bd)
                      * smoothstep(g_br * 0.52, g_br * 0.84, bd);

            // Two coats, layered the way they physically are. The top
            // one reflects its Fresnel share and only what it does not
            // reflect reaches the pigment underneath.
            float F0c = mix(0.040, 0.020, onDrop);
            float Fc = F0c + (1.0 - F0c) * pow(1.0 - ndv, 5.0);
            float ac = mix(0.052, 0.022, sheet);
            vec3 coat = env * Fc + vec3(1.0) * ggx(nh, ac) * ndl * Fc * 0.75;

            // The base coat under it. A wide lobe and a pigment colour,
            // both attenuated by whatever the lacquer kept.
            float ab = 0.34 - 0.12 * flakeAmt;
            vec3 basec = pig * (ndl * 0.85 + 0.30)
                       + pig * ggx(nh, ab) * ndl * 0.055;

            // Metallic flake. Each flake gets its own normal from the
            // lattice it sits in, which is why a real show finish
            // glitters in a moving pattern instead of shining evenly.
            vec3 fc = floor(p * (240.0 + 200.0 * flake));
            vec3 fn = normalize(n + hash3(fc) * 0.85);
            float spark = pow(max(dot(fn, hv), 0.0), 260.0);
            vec3 flakeCol = mix(vec3(1.0), pig * 3.2, 0.35) * spark
                          * flakeAmt * (1.0 - onDrop * 0.7)
                          * (0.55 + 0.95 * AUDIO_SNARE) * 34.0;

            col = coat + basec * (1.0 - Fc) + flakeCol
                + env * lip * (0.85 + 1.30 * bead)
                + lamp_tint.rgb * pow(1.0 - ndv, 4.2) * (0.30 + 0.70 * sheet)
                  * (0.6 + 0.7 * AUDIO_BEAT);

            alpha = 1.0;
        }
    }

    // ---- bounded sheath from the closest approach (guide 8) ----------
    float ca = clamp(1.0 - near * 5.4, 0.0, 1.0);
    float sheath = (pow(ca, 8.0) * 0.18 + pow(ca, 30.0) * 0.50) * (1.0 - alpha);
    sheath *= smoothstep(0.446, 0.10, rr) * (0.35 + 0.70 * flake)
            * (0.50 + 0.90 * AUDIO_BEAT);
    col += lamp_tint.rgb * sheath;
    alpha = clamp(alpha + sheath * 0.52, 0.0, 1.0);

    col = col / (1.0 + col * 0.38);
    col = pow(max(col, 0.0), vec3(0.90));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
