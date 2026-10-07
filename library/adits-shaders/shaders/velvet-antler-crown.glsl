/*{
  "ADITS": 1,
  "DESCRIPTION": "A pair of antlers still in velvet, shaded with an inverted microfacet lobe: the sheen distribution peaks at grazing incidence instead of head-on, so the light gathers into a fuzzy halo along the silhouette rather than a highlight on the front, and a backscatter term brightens the nap wherever the key swings round toward the eye. It rests as a young spike pair, grows into a full pearled four-point rack, then strips to hard polished bone whose sheen gives way to a mirror gloss.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-09-04",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "skeletal"],
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
      "LABEL": "Antler Reach", "BIND": "bass", "BIND_DEPTH": 0.55 },
    { "NAME": "spread",     "TYPE": "float", "DEFAULT": 0.36, "MIN": 0.08, "MAX": 0.88,
      "LABEL": "Tine Spread", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "nap",        "TYPE": "float", "DEFAULT": 0.40, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Velvet Nap", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "strip",      "TYPE": "float", "DEFAULT": 0.28, "MIN": 0.05, "MAX": 0.90,
      "LABEL": "Velvet Strip", "BIND": "kick", "BIND_DEPTH": 0.60 },
    { "NAME": "velvet_tint","TYPE": "color", "DEFAULT": [0.36, 0.19, 0.11, 1.00],
      "LABEL": "Velvet Colour" },
    { "NAME": "bone_tint",  "TYPE": "color", "DEFAULT": [0.94, 0.88, 0.74, 1.00],
      "LABEL": "Bone Colour" }
  ]
}*/

#define TAU    6.28318530718
#define PI     3.14159265359
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

float sdCone3(vec3 p, vec3 a, vec3 b, float ra, float rb) {
    vec3 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h) - mix(ra, rb, h);
}

// ------------------------------------------------------------------
// The rack. One beam curve, sampled as four tapered segments, with the
// tines branching off it at fixed fractions along its length. Both
// sides come from one evaluation because the domain is mirrored in x,
// which is what keeps a seven-segment antler affordable.
// ------------------------------------------------------------------

float g_h, g_base, g_spread, g_sweep, g_bR, g_tR, g_tine, g_tines, g_pearl, g_pf;

vec3 beamPt(float u) {
    // Rises, leans outward as it goes, and rakes back: the three motions
    // a real beam makes, each quadratic in its own way.
    return vec3(g_spread * (0.12 + 0.88 * u * u),
                -g_base + g_h * u,
                -g_sweep * u * u);
}

float map(vec3 p) {
    p.x = abs(p.x);
    float d = 1e9;

    for (int i = 0; i < 4; i++) {
        float u0 = float(i) * 0.25;
        float u1 = u0 + 0.25;
        d = min(d, sdCone3(p, beamPt(u0), beamPt(u1),
                           g_bR * (1.0 - 0.16 * u0 * 3.0),
                           g_bR * (1.0 - 0.16 * u1 * 3.0)));
    }

    for (int i = 0; i < 3; i++) {
        float fi = float(i);
        float u = 0.26 + fi * 0.24;
        vec3 a = beamPt(u);
        // Each tine leans further forward and further out than the last,
        // which is how a rack reads as ordered rather than as a bush.
        vec3 dir = normalize(vec3(0.30 + 0.42 * g_tines,
                                  0.86 - 0.16 * fi,
                                  0.52 + 0.30 * fi));
        vec3 b = a + dir * g_tine * (1.0 - 0.17 * fi);
        d = min(d, sdCone3(p, a, b, g_tR, g_tR * 0.22));
    }

    // Pearling: the ring of knobs a real antler grows near its base,
    // strongest low down and gone by the tips.
    float lowd = smoothstep(0.35, -0.55, p.y);
    vec3 q = p * g_pf;
    float knob = sin(q.x) * sin(q.y * 1.09) * sin(q.z * 0.93);
    return d - knob * g_pearl * lowd;
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
// Sheen. The whole point of this shader.
//
// An ordinary microfacet lobe peaks where the half vector meets the
// normal, which puts the highlight in the middle of the form. Velvet
// does the opposite: its fibres stand off the surface, so the facets
// that face the eye are the ones at the silhouette. Inverting the
// distribution to peak at grazing incidence is what produces the fuzzy
// halo, and no amount of rim-light hacking gets the same falloff.
//
// Estevez and Kulla's normalised form, with the cheap Ashikhmin
// visibility term that pairs with it.
// ------------------------------------------------------------------

float sheenD(float nh, float a) {
    float inv = 1.0 / max(a, 0.02);
    float sinTh = sqrt(max(1.0 - nh * nh, 0.0));
    return (2.0 + inv) * pow(sinTh, inv) / TAU;
}

float sheenV(float nl, float nv) {
    return 1.0 / (4.0 * (nl + nv - nl * nv) + 1e-3);
}

float ggx(float nh, float a) {
    float d = nh * nh * (a * a - 1.0) + 1.0;
    return (a * a) / (PI * d * d);
}

// Woodland at dusk. Dark canopy above, one low warm sun raking through
// it, and leaf litter below. Velvet reflects almost nothing specular,
// so what matters here is that the two hemispheres differ in colour:
// that split is all the form a matte nap gets.
vec3 envWood(vec3 r) {
    vec3 c = mix(vec3(0.170, 0.205, 0.265), vec3(0.062, 0.098, 0.086),
                 smoothstep(-0.45, 0.85, r.y));
    c += vec3(0.430, 0.245, 0.130) * smoothstep(0.10, -0.80, r.y);
    vec3 sun = normalize(vec3(-0.62, 0.30, 0.72));
    float sd = max(dot(r, sun), 0.0);
    c += vec3(1.00, 0.72, 0.40) * pow(sd, 120.0) * 9.00;
    c += vec3(1.00, 0.78, 0.50) * pow(sd, 6.0) * 0.42;
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

    // Heavy velvet rack, wide stripped bone crown, thin needle rack.
    // The rack rests, deliberately: it is the archetype with enough mass
    // to hold a frame on its own, and a young spike pair at rest would
    // read as two twigs. The tines never disappear, they shorten, so a
    // blend grows them out of the beam instead of fading them in.
    float grow = (0.93 + 0.18 * swell) * (0.980 + 0.026 * sin(phase));
    g_h      = (w1 * 1.660 + w2 * 1.480 + w3 * 1.200) * grow;
    g_base   = (w1 * 0.680 + w2 * 0.620 + w3 * 0.520) * grow;
    g_spread = (w1 * 0.420 + w2 * 0.560 + w3 * 0.680) * grow
             * (0.80 + 0.40 * spread);
    g_sweep  = (w1 * 0.320 + w2 * 0.220 + w3 * 0.100) * grow;
    // Velvet antler in growth is visibly swollen and blood-rich, not
    // stick-thin, and the thickness is load-bearing here: a grazing
    // angle halo needs a broad form to fall across, and on a thin
    // beam the whole rim is three pixels wide and reads as nothing.
    g_bR     = (w1 * 0.235 + w2 * 0.150 + w3 * 0.140) * grow;
    g_tR     = (w1 * 0.112 + w2 * 0.072 + w3 * 0.085) * grow;
    g_tine   = (w1 * 0.460 + w2 * 0.560 + w3 * 0.620) * grow
             * (0.75 + 0.50 * spread);
    g_tines  = w1 * 0.40 + w2 * 0.92 + w3 * 1.00;
    g_pf     = w1 * 26.0 + w2 * 22.0 + w3 * 40.0;
    g_pearl  = (w1 * 0.0105 + w2 * 0.0058 + w3 * 0.0032);

    // How much velvet is left, and the shed pattern. Real velvet does
    // not thin evenly, it hangs off in strips, so the middle archetype
    // gets a patch mask rather than a lower number. Stripping swaps the
    // sheen lobe for a gloss one: the same geometry under two completely
    // different surfaces.
    float velBase  = w1 * 0.98 + w2 * 0.72 + w3 * 0.06;
    float shredAmt = w1 * 0.14 + w2 * 0.95 + w3 * 0.30;

    // ---- camera (guide 5) -------------------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.55 * ww);

    float lean = 0.13 * sin(phase * 2.0);
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
        for (int i = 0; i < 60; i++) {
            p = ro + rd * t;
            float d = map(p);
            near = min(near, d / max(t, 0.6));
            if (d < 0.0009) { hit = true; break; }
            t += d * 0.70;
            if (t > tb1) break;
        }

        if (hit) {
            vec3 n = calcNormal(p);

            // Shed velvet hangs off in strips, so the field is stretched
            // hard along the beam and its domain warped first. Left as a
            // plain sine lattice it comes out a regular checkerboard,
            // which reads as a texture fault and not as shedding.
            vec3 sq = p * vec3(g_pf, g_pf * 0.32, g_pf);
            sq += 1.10 * vec3(sin(sq.y * 1.6), sin(sq.z * 1.3), sin(sq.x * 1.9));
            float shred = sin(sq.x) * sin(sq.y * 1.09) * sin(sq.z * 0.93);
            float patch = smoothstep(-0.34, 0.30, shred);
            float velvet = clamp(velBase * mix(1.0, patch, shredAmt)
                               * (1.0 - 0.85 * strip), 0.0, 1.0);

            // The nap. Fibre texture on the normal, deliberately kept
            // coarse and shallow: pushed to the frequency real velvet
            // hair would have, it randomises the normal from pixel to
            // pixel and destroys the coherent silhouette the sheen lobe
            // is built out of, so the halo disappears with it.
            vec3 fq = p * (52.0 + 46.0 * nap);
            vec3 jit = vec3(sin(fq.x) * cos(fq.y), sin(fq.y) * cos(fq.z),
                            sin(fq.z) * cos(fq.x));
            n = normalize(n + jit * 0.035 * velvet);

            float nv = clamp(dot(n, -rd), 0.0, 1.0);
            vec3 L = normalize(vec3(-0.62, 0.30, 0.72));
            float nl = clamp(dot(n, L), 0.0, 1.0);
            vec3 hv = normalize(L - rd);
            float nh = clamp(dot(n, hv), 0.0, 1.0);

            float ash = 0.14 + 0.46 * nap;

            // Two paths through the same lobe, and both are needed.
            // The key light gives the sharp fuzz where the half vector
            // grazes the normal. The halo along the whole silhouette is
            // the lobe's response to the sky: its directional albedo
            // climbs as the view goes grazing, and a nap outdoors is lit
            // from every direction at once. With only the analytic light
            // there is no halo at all, which is the trap here.
            float sheenKey = sheenD(nh, ash) * sheenV(nl, nv) * nl;
            float sheenSky = pow(1.0 - nv, 2.6) * (0.30 + 0.70 * ash);

            // Backscatter. A nap lit from the eye's own direction throws
            // light straight back, so the whole surface flares when the
            // key swings round toward the viewer, once per turn.
            float retro = pow(clamp(dot(L, -rd), 0.0, 1.0), 3.0);

            vec3 refv = reflect(rd, n);
            vec3 env = envWood(refv);
            vec3 amb = mix(vec3(0.14, 0.10, 0.075), vec3(0.11, 0.15, 0.19),
                           0.5 + 0.5 * n.y);

            // The bone underneath, when the velvet is off: a hard
            // polished surface with an ordinary lobe, which is exactly
            // what makes the sheen legible by contrast.
            const vec3 F0 = vec3(0.055);
            vec3 fres = F0 + (1.0 - F0) * pow(1.0 - nv, 5.0);
            // Antler tips get polished by rubbing, so gloss climbs with
            // height. Flat diffuse bone reads as clay.
            float polish = 0.35 + 0.65 * smoothstep(-0.30, 0.70, p.y);
            vec3 boneCol = bone_tint.rgb * (nl * 0.85 + 0.50)
                         + env * fres * 4.20 * polish
                         + vec3(1.0) * ggx(nh, mix(0.26, 0.075, polish))
                           * nl * (0.045 + 0.130 * polish);

            // Key and ambient are added, not multiplied. Folding the
            // ambient into the diffuse as a factor drops the whole nap
            // two stops and the sheen halo has nothing to stand out of.
            const vec3 KEYC = vec3(1.00, 0.76, 0.46);
            vec3 velCol = velvet_tint.rgb * (nl * KEYC * 2.60 + amb * 8.60)
                        + velvet_tint.rgb * 3.20 * retro * (0.55 + 0.95 * nap)
                        + mix(vec3(1.0, 0.90, 0.76), velvet_tint.rgb * 3.0, 0.30)
                          * sheenKey * (2.40 + 3.30 * nap)
                          * (0.70 + 0.80 * AUDIO_SNARE)
                        // The nap tips scatter almost white, which is why
                        // the halo is far paler than the body under it.
                        + mix(vec3(0.84, 0.91, 1.00), velvet_tint.rgb * 2.4, 0.18)
                          * sheenSky * (1.35 + 1.85 * nap)
                          * (0.55 + 0.75 * AUDIO_BEAT) * 2.30;

            col = mix(boneCol, velCol, velvet)
                + bone_tint.rgb * pow(1.0 - nv, 5.0) * (1.0 - velvet) * 0.55
                  * (0.6 + 0.7 * AUDIO_BEAT);

            alpha = 1.0;
        }
    }

    // ---- bounded sheath from the closest approach (guide 8) ----------
    float ca = clamp(1.0 - near * 5.8, 0.0, 1.0);
    float sheath = (pow(ca, 8.0) * 0.18 + pow(ca, 30.0) * 0.50) * (1.0 - alpha);
    sheath *= smoothstep(0.446, 0.10, rr) * (0.35 + 0.70 * nap)
            * (0.50 + 0.90 * AUDIO_BEAT);
    col += mix(velvet_tint.rgb * 2.4, bone_tint.rgb, 1.0 - velBase) * sheath;
    alpha = clamp(alpha + sheath * 0.50, 0.0, 1.0);

    col = col / (1.0 + col * 0.40);
    col = pow(max(col, 0.0), vec3(0.90));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
