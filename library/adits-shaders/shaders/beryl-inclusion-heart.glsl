/*{
  "ADITS": 1,
  "DESCRIPTION": "A beryl crystal shaded by real optics: the ray refracts in, the interior is marched for its true chord, and the colour is whatever survives Beer-Lambert absorption over that path, so thin tips stay pale while the thick waist goes deep and a fern garden of inclusions scatters inside it. Beryl is one mineral in several varieties, so the spectrum picks the variety: it rests as a squat golden heliodor barrel, draws out into a tall emerald prism, then a fluted aquamarine needle.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-09-04",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "crystal", "refraction"],
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
    { "NAME": "swell",      "TYPE": "float", "DEFAULT": 0.30, "MIN": 0.12, "MAX": 0.70,
      "LABEL": "Crystal Swell", "BIND": "bass", "BIND_DEPTH": 0.55 },
    { "NAME": "churn",      "TYPE": "float", "DEFAULT": 0.32, "MIN": 0.06, "MAX": 0.82,
      "LABEL": "Garden Churn", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "fire",       "TYPE": "float", "DEFAULT": 0.38, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Dispersion Fire", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "soak",       "TYPE": "float", "DEFAULT": 0.44, "MIN": 0.16, "MAX": 0.96,
      "LABEL": "Absorption Depth", "BIND": "kick", "BIND_DEPTH": 0.50 },
    { "NAME": "gem_tint",   "TYPE": "color", "DEFAULT": [0.32, 0.96, 0.62, 1.00],
      "LABEL": "Gem Colour" },
    { "NAME": "flare_tint", "TYPE": "color", "DEFAULT": [1.00, 0.86, 0.55, 1.00],
      "LABEL": "Flare Tint" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  4.60
#define BOUND  1.28
#define IOR    1.578

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

float box2(vec2 p, vec2 b) {
    vec2 d = abs(p) - b;
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

// ------------------------------------------------------------------
// The crystal. A fluted hexagonal prism with pyramidal terminations:
// one primitive under six numbers, so the three archetypes deform into
// each other instead of cross-fading (guide 12.5).
//
// The mirror fold is the standard hexagon fold rather than an atan, so
// map() costs no transcendental per march step (guide 9).
// ------------------------------------------------------------------

float g_h, g_R, g_sh, g_taper, g_gd, g_gw;

float sdHexFluted(vec2 p, float r, float gd, float gw) {
    const vec3 k = vec3(-0.8660254, 0.5, 0.5773503);
    p = abs(p);
    p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
    float d = length(p - vec2(clamp(p.x, -k.z * r, k.z * r), r)) * sign(p.y - r);
    // A flute is a cylinder pressed into the middle of each of the six
    // faces. Carved after the fold, so one subtraction cuts all six.
    float g = gw - length(p - vec2(0.0, r + gw - gd));
    return max(d, g);
}

float map(vec3 p) {
    float ay = abs(p.y);
    // Pyramidal termination. The taper is linear in height on purpose:
    // a linear falloff on a hexagonal cross-section is six flat
    // triangular faces, which is what a real beryl tip is. Squaring it
    // would curve those faces and the crystal would read as a barrel.
    float tt = clamp((ay - g_sh) / max(g_h - g_sh, 1e-3), 0.0, 1.0);
    float R  = g_R * (1.0 - g_taper * tt);
    float d  = max(sdHexFluted(p.xz, R, g_gd * g_R, g_gw * g_R), ay - g_h);
    return d * 0.80;
}

vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0016;
    return normalize(k.xyy * map(p + k.xyy * e) +
                     k.yyx * map(p + k.yyx * e) +
                     k.yxy * map(p + k.yxy * e) +
                     k.xxx * map(p + k.xxx * e));
}

// ------------------------------------------------------------------
// The garden. Real emerald inclusions are flat fibrous veils, not
// specks, so this is a ridged field folded three times: the abs turns
// the waves into sheets and the warp makes the sheets wander.
// Sampled along the interior path, where it acts as a second absorber.
// ------------------------------------------------------------------

float g_ph, g_churn, g_veil;

float garden(vec3 p) {
    vec3 q = p * 3.1;
    q += g_churn * vec3(sin(q.y * 1.7 + g_ph),
                        sin(q.z * 2.1 - g_ph * 2.0),
                        sin(q.x * 1.5 + g_ph * 3.0));
    float f = 0.0;
    float a = 0.5;
    for (int i = 0; i < 3; i++) {
        f += a * abs(sin(q.x) + cos(q.y) * 0.9 + sin(q.z) * 0.7);
        q = q * 2.11 + vec3(0.7, 1.3, -0.9);
        a *= 0.55;
    }
    // The sheets are the near-zero set of the ridged field, so the
    // window has to sit under the field's own mean or nothing fires
    // at all and the garden is dead code.
    return smoothstep(0.95, 0.22, f) * g_veil;
}

// ------------------------------------------------------------------
// The room the gem lives in. Two rectangular panels with hard edges,
// a sky gradient and a warm floor bounce. Hard-edged sources are what
// a dielectric needs: a smooth gradient gives it nothing to focus, and
// a gem with nothing to focus reads as coloured plastic.
// ------------------------------------------------------------------

vec3 envStudio(vec3 r) {
    float up = r.y;
    vec3 c = mix(vec3(0.055, 0.075, 0.115), vec3(0.46, 0.56, 0.74),
                 smoothstep(-0.45, 0.95, up));
    c += vec3(0.46, 0.30, 0.17) * smoothstep(0.12, -0.85, up);
    // The seam of a light tent: a bright horizontal band at eye level.
    // A gem picks this up as the long straight glint along each facet.
    c += vec3(0.85, 0.88, 0.95) * exp(-up * up * 150.0) * 0.75;

    // Panel A, high and left. Projected into direction space so its
    // edge stays a straight line however the gem turns.
    vec3 da = normalize(vec3(-0.52, 0.74, 0.42));
    float fa = dot(r, da);
    if (fa > 0.25) {
        vec3 ra = normalize(cross(da, vec3(0.0, 1.0, 0.0)));
        vec3 q = r / fa;
        vec2 pa = vec2(dot(q, ra), dot(q, cross(da, ra)));
        c += vec3(1.00, 0.97, 0.92) * smoothstep(0.14, 0.0, box2(pa, vec2(0.62, 0.26))) * 4.20;
    }
    // Panel B, low and right, cooler and narrower.
    vec3 db = normalize(vec3(0.68, -0.22, 0.60));
    float fb = dot(r, db);
    if (fb > 0.25) {
        vec3 rb = normalize(cross(db, vec3(0.0, 1.0, 0.0)));
        vec3 q = r / fb;
        vec2 pb = vec2(dot(q, rb), dot(q, cross(db, rb)));
        c += vec3(0.55, 0.76, 1.00) * smoothstep(0.16, 0.0, box2(pb, vec2(0.16, 0.55))) * 2.80;
    }
    return c;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    float rr = length(uv);
    float bound = smoothstep(0.478, 0.446, rr);
    if (bound <= 0.0) { gl_FragColor = vec4(0.0); return; }

    float ph = fract(TIME / PERIOD);
    float phase = ph * TAU;
    g_ph = phase;

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

    // Three silhouettes out of one primitive: a squat flat-topped barrel,
    // a tall double-terminated prism, a deeply fluted needle. Every
    // number slides, so a blend deforms rather than cross-fading.
    // The rest flute is zero: any flute at all rounds the six faces off
    // and the crystal stops reading as faceted.
    float grow = (0.94 + 0.16 * swell) * (0.978 + 0.030 * sin(phase));
    g_h     = (w1 * 0.80 + w2 * 1.01 + w3 * 1.06) * grow;
    g_R     = (w1 * 0.54 + w2 * 0.37 + w3 * 0.42) * grow;
    g_sh    = (w1 * 0.62 + w2 * 0.52 + w3 * 0.16) * grow;
    g_taper = w1 * 0.34 + w2 * 0.84 + w3 * 1.00;
    g_gd    = w1 * 0.00 + w2 * 0.13 + w3 * 0.46;
    g_gw    = w1 * 0.30 + w2 * 0.34 + w3 * 0.50;
    g_veil  = w1 * 0.70 + w2 * 1.05 + w3 * 1.55;
    g_churn = 0.18 + 0.70 * churn;

    // Beryl is one mineral in several varieties, so the three archetypes
    // are three real ones: heliodor, emerald, aquamarine. The variety is
    // a property of the absorption, not a coat of paint, so it enters as
    // the colour the crystal fails to absorb.
    vec3 body = w1 * vec3(0.97, 0.78, 0.30)
              + w2 * gem_tint.rgb
              + w3 * vec3(0.26, 0.84, 0.99);

    // A gem absorbs the complement of the colour it shows, which is why
    // the tint enters here and not as a multiply on the output.
    vec3 sigma = (1.0 - body) * (0.60 + 4.20 * soak)
               + vec3(0.05) * (0.6 + 1.4 * soak);

    // ---- camera (guide 5) -------------------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.55 * ww);

    float roll = 0.20 * sin(phase * 2.0);
    pR(ro.xz, phase); pR(ro.yz, roll);
    pR(rd.xz, phase); pR(rd.yz, roll);

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
            float d = map(p);
            near = min(near, d / max(t, 0.6));
            if (d < 0.0010) { hit = true; break; }
            t += d * 0.72;
            if (t > tb1) break;
        }

        if (hit) {
            vec3  n   = calcNormal(p);
            float ndv = clamp(dot(n, -rd), 0.0, 1.0);

            // Schlick, with the real F0 for this index of refraction:
            // ((n-1)/(n+1))^2 is about 0.05 for beryl, which is why a gem
            // is mostly transmission and only flashes at grazing angles.
            const float F0 = 0.0503;
            float fres = F0 + (1.0 - F0) * pow(1.0 - ndv, 5.0);

            // ---- the interior chord ---------------------------------
            // Refract in, then march until map() turns positive again.
            // The path length that comes out of this is the real one, so
            // absorption thickens exactly where the crystal is thick.
            vec3 ri = refract(rd, n, 1.0 / IOR);
            float ti = 0.010;
            float veil = 0.0;
            vec3  q = p + ri * ti;
            for (int j = 0; j < 18; j++) {
                q = p + ri * ti;
                float di = map(q);
                if (di > -0.0006) break;
                float ds = max(-di * 0.90, 0.014);
                veil += garden(q) * ds;
                ti += ds;
            }

            // Beer-Lambert over that chord, then the garden as a second
            // absorber sitting inside the first.
            vec3 trans = exp(-sigma * ti) * exp(-vec3(2.2, 1.6, 2.6) * veil);

            // Exit refraction, taken at three indices. Dispersion in a
            // real gem is three different exit directions, not a fringe
            // painted on the image, so the split has to happen here.
            vec3 ne = calcNormal(q);
            float dv = 0.006 + 0.052 * fire;
            vec3 e1 = envStudio(refract(ri, ne, IOR - dv));
            vec3 e2 = envStudio(refract(ri, ne, IOR));
            vec3 e3 = envStudio(refract(ri, ne, IOR + dv));
            vec3 inner = vec3(e1.r, e2.g, e3.b);

            // Total internal reflection: refract() returns zero past the
            // critical angle, and that is where a real gem turns into a
            // mirror. Fall back to the reflection there.
            vec3 mirror = envStudio(reflect(rd, n));
            float tir = 1.0 - step(1e-4, dot(inner, vec3(1.0)));
            inner = mix(inner, mirror * 0.85, tir);

            // The second lobe at the back wall. Light that does not leave
            // at the exit face bounces back off it, and that bounce is
            // what lets you see a stone's far facets through its near
            // ones. Without it every face is one flat wash of the tint
            // and the crystal reads as moulded plastic.
            float nde = clamp(dot(ne, -ri), 0.0, 1.0);
            float fin = 0.0503 + (1.0 - 0.0503) * pow(1.0 - nde, 5.0);
            vec3  back = envStudio(reflect(ri, ne));
            inner = mix(inner, back, clamp(fin * 1.6, 0.0, 0.85));

            // The garden also scatters forward, which is what makes an
            // included gem look milky rather than merely darker.
            // Real jardin reads as bright white-green feathers, not as dirt:
            // the sheets scatter light forward as well as absorbing it.
            vec3 milk = mix(body, vec3(1.0), 0.22) * veil
                      * (0.95 + 1.15 * fire) * (0.65 + 0.85 * AUDIO_SNARE);

            // Facet edges. A cut stone is brightest where two faces meet,
            // and on an SDF that is exactly where the normal swings
            // hardest, so grazing incidence stands in for it.
            float edge = pow(1.0 - ndv, 3.5);

            // The flash. A GGX lobe this tight puts the key on one flat
            // face at a time, which is how a crystal reads as faceted; a
            // broad Blinn lobe would smear across the whole silhouette
            // and give back the rounded pebble.
            vec3  kl = normalize(vec3(-0.52, 0.74, 0.42));
            float nh = max(dot(n, normalize(kl - rd)), 0.0);
            const float ag = 0.085;
            float den = nh * nh * (ag * ag - 1.0) + 1.0;
            float flash = (ag * ag) / (3.14159265 * den * den);

            col = mirror * (fres * 1.20 + 0.030)
                + inner * trans * (1.0 - fres) * 1.55
                + milk
                + vec3(1.0, 0.98, 0.94) * flash * 0.105 * (0.7 + 1.3 * fire)
                + flare_tint.rgb * edge * (0.35 + 1.25 * fire)
                                 * (0.55 + 0.80 * AUDIO_BEAT);

            // Glass is not opaque. Dense absorbing stretches hide the
            // footage, thin pale tips let it through, which is the whole
            // reason to compute a real chord.
            float dens = 1.0 - clamp(dot(trans, vec3(0.3333)), 0.0, 1.0);
            alpha = clamp(0.40 + 0.46 * dens + 0.52 * fres + 0.30 * edge, 0.0, 1.0);
        }
    }

    // ---- bounded sheath from the closest approach (guide 8) ----------
    float ca = clamp(1.0 - near * 5.2, 0.0, 1.0);
    float sheath = (pow(ca, 7.0) * 0.24 + pow(ca, 28.0) * 0.60) * (1.0 - alpha);
    sheath *= smoothstep(0.446, 0.10, rr) * (0.35 + 0.70 * fire)
            * (0.50 + 0.85 * AUDIO_BEAT);
    col += mix(body, flare_tint.rgb, 0.45) * sheath;
    alpha = clamp(alpha + sheath * 0.52, 0.0, 1.0);

    col = col / (1.0 + col * 0.38);
    col = pow(max(col, 0.0), vec3(0.90));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
