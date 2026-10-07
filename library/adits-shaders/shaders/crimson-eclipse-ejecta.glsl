/*{
  "ADITS": 1,
  "DESCRIPTION": "A black glass orb eclipsed behind its own thin crimson ring, orbited by a blast of cleaved obsidian chunks that a red shock front lights from inside as it passes through the field twice per loop; it rests as a tight dark shell of debris packed around the ring, is thrown outward into a detonation trailing red ejecta streaks, and is drawn into a long splinter storm as the spectrum brightens.",
  "CREDIT": "claude-fable-5-1",
  "DATE": "2026-09-11",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "obsidian"],
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
    { "NAME": "swell",      "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.10, "MAX": 0.78,
      "LABEL": "Ejecta Reach", "BIND": "bass", "BIND_DEPTH": 0.55 },
    { "NAME": "scatter",    "TYPE": "float", "DEFAULT": 0.40, "MIN": 0.05, "MAX": 1.00,
      "LABEL": "Tumble Scatter", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "heat",       "TYPE": "float", "DEFAULT": 0.45, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Ring Heat", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "flash",      "TYPE": "float", "DEFAULT": 0.12, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Shock Flash", "BIND": "kick", "BIND_DEPTH": 0.80 },
    { "NAME": "ring_tint",  "TYPE": "color", "DEFAULT": [1.00, 0.10, 0.05, 1.00],
      "LABEL": "Ring Colour" },
    { "NAME": "shard_tint", "TYPE": "color", "DEFAULT": [0.07, 0.17, 0.16, 1.00],
      "LABEL": "Obsidian Tint" }
  ]
}*/

#define TAU    6.28318530718
#define PI     3.14159265359
#define PERIOD 16.0
#define ORBIT  8.0
#define FOCAL  1.95
#define CORE_R 0.50
#define SHARDS 52

// ------------------------------------------------------------------
// Everything here is solved in closed form. There is no raymarch.
//
// The orb is one sphere. Each piece of ejecta is a box cut by three
// skew planes, which is a cleaved obsidian chunk, and a ray against a
// convex polytope is a run of plane clips: the latest entry and the
// earliest exit. Fifty-two of those, sorted by entry depth against the
// sphere, give exact occlusion for the price of one loop. The red
// streak each chunk drags behind it is the closest approach between
// the view ray and a segment, with a Gaussian core, so it never breaks
// up into dashes the way a marched hairline does.
//
// The crimson ring is drawn in screen space at the projected limb of
// the sphere. An eclipse corona always faces the eye, so this is the
// correct behaviour under CAM_DIR, not a shortcut: orbit the orb and
// the ring stays wrapped around its edge.
//
// Reach budget: the longest splinter at the largest swell, kicked by
// the front and a full flash, tips out near 1.50 world units. At the
// near side of its orbit that projects to about 0.45 of the frame,
// inside the 0.46 the guide asks for.
// ------------------------------------------------------------------

float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; return fract(p * (p + p)); }

void pR(inout vec2 p, float a) { p = cos(a) * p + sin(a) * vec2(p.y, -p.x); }

// Any unit vector perpendicular to v.
vec3 perp(vec3 v) {
    vec3 a = abs(v);
    vec3 o = (a.x <= a.y && a.x <= a.z) ? vec3(1.0, 0.0, 0.0)
           : (a.y <= a.z)               ? vec3(0.0, 1.0, 0.0)
                                        : vec3(0.0, 0.0, 1.0);
    return normalize(cross(v, o));
}

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

// Closest approach between the view ray and the segment a-b. s is the
// depth along the ray, u the position along the segment.
float raySeg(vec3 ro, vec3 rd, vec3 a, vec3 b, out float s, out float u) {
    vec3 ab = b - a;
    vec3 w = ro - a;
    float uu = dot(ab, ab);
    float ru = dot(rd, ab);
    float rw = dot(rd, w);
    float uw = dot(ab, w);
    float den = ru * ru - uu;
    u = abs(den) < 1e-6 ? 0.0 : clamp((rw * ru - uw) / den, 0.0, 1.0);
    s = max(u * ru - rw, 0.0);
    return length(ro + rd * s - (a + ab * u));
}

// Clip the ray against the half-space dot(p, n) <= d, in the chunk frame.
// An entering plane can push the entry depth later and owns the surface
// normal there; an exiting plane can only pull the exit earlier.
void clipPlane(vec3 lo, vec3 ld, vec3 n, float d, inout float tN, inout float tF, inout vec3 nrm) {
    float den = dot(n, ld);
    den += (den >= 0.0) ? 1e-7 : -1e-7;
    float tp = (d - dot(n, lo)) / den;
    if (den < 0.0) {
        if (tp > tN) { tN = tp; nrm = n; }
    } else {
        tF = min(tF, tp);
    }
}

// Archetype-interpolated field parameters, set once per frame.
float g_rMin, g_rMax, g_len, g_wid, g_thk, g_chaos, g_trail, g_tlen, g_wave, g_wamp;

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    float rr = length(uv);
    float bound = smoothstep(0.478, 0.442, rr);
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

    float w1 = clamp(1.0 - abs(sel)       / 0.33, 0.0, 1.0);   // eclipse shell
    float w2 = clamp(1.0 - abs(sel - 0.5) / 0.33, 0.0, 1.0);   // detonation
    float w3 = clamp(1.0 - abs(sel - 1.0) / 0.33, 0.0, 1.0);   // splinter storm
    float ws = w1 + w2 + w3 + 1e-4;
    w1 /= ws; w2 /= ws; w3 /= ws;

    // Shared parameter: the reach of the field slides continuously across
    // the whole selector, so the envelope keeps moving through a blend.
    float grow = (0.92 + 0.16 * swell) * (0.985 + 0.015 * sin(phase));
    g_rMin  = (w1 * 0.64  + w2 * 0.76  + w3 * 0.64 ) * grow;
    g_rMax  = (w1 * 1.04  + w2 * 1.10  + w3 * 0.96 ) * grow;
    g_len   = (w1 * 0.150 + w2 * 0.160 + w3 * 0.260) * grow;
    g_wid   = (w1 * 0.085 + w2 * 0.080 + w3 * 0.030) * grow;
    g_thk   = (w1 * 0.056 + w2 * 0.048 + w3 * 0.020) * grow;
    g_chaos = (w1 * 0.80  + w2 * 0.45  + w3 * 0.14 ) * (0.45 + 1.10 * scatter);
    g_trail =  w1 * 0.12  + w2 * 1.00  + w3 * 0.75;
    g_tlen  = (w1 * 0.18  + w2 * 0.55  + w3 * 0.80 ) * grow;

    // The shock front leaves the ring twice per loop and has faded out by
    // the time it wraps, so the wrap itself is invisible.
    float wave = fract(ph * 2.0);
    g_wamp = sin(wave * PI);
    g_wave = 0.45 + 1.20 * wave;
    // The ring itself flares as each front leaves it.
    float burst = g_wamp * (1.0 - wave) * (1.0 - wave);

    // ---- camera (guide 5) -------------------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + FOCAL * ww);

    // The debris field turns once per loop and nods twice.
    float nod = 0.22 * sin(phase * 2.0);
    pR(ro.xz, phase); pR(ro.yz, nod);
    pR(rd.xz, phase); pR(rd.yz, nod);

    vec3 keyL = normalize(vec3(0.30, 0.82, 0.48));

    float s0, s1;
    bool sHit = sph(ro, rd, CORE_R, s0, s1) && s0 > 0.0;
    float tS = sHit ? s0 : 1e9;

    float bestT = tS;          // a chunk behind the orb loses to it
    vec3  bestN = vec3(0.0);
    float bestFront = 0.0;
    float bestH = 0.0;
    bool  chunkHit = false;
    float glowStreak = 0.0;

    for (int i = 0; i < SHARDS; i++) {
        float fi = float(i);
        float h0 = hash11(fi + 0.13);
        float h1 = hash11(fi + 7.71);
        float h2 = hash11(fi + 3.37);
        float h3 = hash11(fi + 9.02);

        // Fibonacci sphere: an even spray in every direction.
        float y = 1.0 - 2.0 * (fi + 0.5) / float(SHARDS);
        float rxy = sqrt(max(1.0 - y * y, 0.0));
        float th = fi * 2.3999632;
        vec3 dir = vec3(cos(th) * rxy, y, sin(th) * rxy);

        // Radius, shoved outward by the passing front and by a kick.
        float rad = mix(g_rMin, g_rMax, h1);
        float dw = (rad - g_wave) / 0.20;
        float front = exp(-dw * dw) * g_wamp;
        rad += front * 0.06 + flash * 0.08 * (0.4 + 0.6 * h3);
        vec3 c = dir * rad;

        // Long axis mostly radial, scattered by the chaos of the archetype,
        // and rolled about itself one or two whole turns per loop.
        vec3 e0 = normalize(dir + g_chaos * (vec3(h0, h2, h3) - 0.5));
        vec3 e1 = perp(e0);
        vec3 e2 = cross(e0, e1);
        float roll = h2 * TAU + phase * (1.0 + floor(h3 * 2.0));
        vec3 f1 = e1 * cos(roll) + e2 * sin(roll);
        vec3 f2 = cross(e0, f1);

        vec3 lo3 = ro - c;
        vec3 lol = vec3(dot(lo3, e0), dot(lo3, f1), dot(lo3, f2));
        vec3 ldl = vec3(dot(rd, e0), dot(rd, f1), dot(rd, f2)) + vec3(1e-6);

        // Sizes vary widely: a few boulders among many flakes.
        vec3 he = vec3(g_len * (0.55 + 0.90 * h0),
                       g_wid * (0.50 + 1.00 * h3),
                       g_thk * (0.50 + 1.00 * h1));

        // Box slabs.
        vec3 m = 1.0 / ldl;
        vec3 n = m * lol;
        vec3 k = abs(m) * he;
        vec3 t1 = -n - k;
        vec3 t2 = -n + k;
        float tN = max(max(t1.x, t1.y), t1.z);
        float tF = min(min(t2.x, t2.y), t2.z);
        vec3 nl = -sign(ldl) * step(t1.yzx, t1.xyz) * step(t1.zxy, t1.xyz);

        // Three skew cuts turn the box into a cleaved chunk.
        vec3 p1 = normalize(vec3(0.55 - 1.10 * h0,  0.85, 0.50 - h2));
        vec3 p2 = normalize(vec3(-0.60 + 1.20 * h3, -0.80, 0.60 - 1.20 * h1));
        vec3 p3 = normalize(vec3(0.90, 0.30 - 0.60 * h1, -0.70 + 1.40 * h0));
        clipPlane(lol, ldl, p1, dot(abs(p1), he) * (0.32 + 0.45 * h1), tN, tF, nl);
        clipPlane(lol, ldl, p2, dot(abs(p2), he) * (0.32 + 0.45 * h2), tN, tF, nl);
        clipPlane(lol, ldl, p3, dot(abs(p3), he) * (0.40 + 0.45 * h3), tN, tF, nl);

        if (tN < tF && tF > 0.0 && tN < bestT) {
            bestT = tN;
            bestN = nl.x * e0 + nl.y * f1 + nl.z * f2;
            bestFront = front;
            bestH = h0;
            chunkHit = true;
        }

        // The red streak the chunk drags behind it, back toward the ring.
        vec3 a = c - e0 * he.x;
        vec3 b = a - dir * g_tlen * (0.55 + 0.90 * h1);
        float s, u;
        float dT = raySeg(ro, rd, a, b, s, u);
        float tw = 0.012 + 0.016 * g_trail;
        float streak = exp(-dT * dT / (tw * tw)) * (1.0 - u);
        streak *= 0.60 + 0.40 * sin(u * 16.0 - phase * 2.0 + h0 * TAU);
        streak *= g_trail * (0.40 + 0.80 * front + 1.30 * flash);
        streak *= 1.0 - step(tS, s);      // hidden behind the orb
        glowStreak += streak;
    }

    vec3  col   = vec3(0.0);
    float alpha = 0.0;

    if (chunkHit) {
        vec3 p = ro + rd * bestT;
        vec3 n = bestN;
        float dist = length(p);
        vec3 Lr = -p / dist;

        // The ring is the only red light in the scene: a point source at
        // the origin, faint at rest, blazing where the front is passing
        // and on a kick. Faces turned away stay black glass.
        float wrap = clamp(dot(n, Lr) * 0.80 + 0.20, 0.0, 1.0);
        float redI = (0.30 + 0.90 * heat) * (0.28 + 1.40 * bestFront + 1.60 * flash + 0.60 * burst)
                   / (0.35 + dist * dist * 0.85);

        // Obsidian: dark teal glass with a cool sky fill and a hard glint.
        float sky = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 body = shard_tint.rgb * (0.35 + 0.65 * sky) * (0.55 + 0.45 * bestH);
        float fre = pow(clamp(1.0 + dot(n, rd), 0.0, 1.0), 3.0);
        vec3 R = reflect(rd, n);
        float specR = pow(clamp(dot(R, Lr), 0.0, 1.0), 20.0);
        float specK = pow(clamp(dot(R, keyL), 0.0, 1.0), 40.0);

        col = body
            + ring_tint.rgb * redI * (wrap + 1.2 * specR)
            + mix(shard_tint.rgb * 2.5, ring_tint.rgb, 0.25 + 0.45 * bestFront + 0.3 * flash) * fre * 0.55
            + vec3(0.75, 0.92, 0.92) * specK * 0.55;
        alpha = 1.0;
    } else if (sHit) {
        // The orb: black glass, a red Fresnel limb, one cool glint.
        vec3 p = ro + rd * tS;
        vec3 n = p / CORE_R;
        float fre = pow(clamp(1.0 + dot(n, rd), 0.0, 1.0), 4.0);
        vec3 R = reflect(rd, n);
        float specK = pow(clamp(dot(R, keyL), 0.0, 1.0), 70.0);
        col = vec3(0.010, 0.014, 0.016)
            + shard_tint.rgb * 0.30 * pow(clamp(n.y, 0.0, 1.0), 2.0)
            + ring_tint.rgb * fre * (0.9 + 1.3 * heat) * (1.0 + 0.8 * flash)
            + vec3(0.90, 0.95, 1.00) * specK * 0.35;
        alpha = 1.0;
    }

    // ---- the crimson ring, at the projected limb ----------------------
    float Rp = FOCAL * CORE_R / sqrt(ORBIT * ORBIT - CORE_R * CORE_R);
    float dr = rr - Rp * 1.025;
    float rw = 0.0030 + 0.0025 * (1.0 - heat);
    float g1 = exp(-dr * dr / (rw * rw));
    float g2 = exp(-dr * dr / (0.030 * 0.030)) * 0.30;
    float g3 = exp(-dr * dr / (0.110 * 0.110)) * 0.10 * smoothstep(0.40, 0.05, rr);
    float ang = atan(uv.y, uv.x);
    float spot = 1.0 + 0.55 * cos(ang - phase);           // one hot spot round the ring per loop
    float ringVis = (chunkHit && bestT < ORBIT) ? 0.0 : 1.0;
    float ringI = (0.85 + 0.75 * heat) * (1.0 + 1.4 * flash + 0.5 * burst) * (1.0 + 0.5 * AUDIO_BEAT);
    vec3 ringCol = mix(ring_tint.rgb, vec3(1.0, 0.80, 0.62), 0.45 * heat * g1);
    float ringCov = (g1 + g2 * 0.9) * spot * ringVis + g3 * spot * (0.6 + 0.4 * ringVis);
    col += ringCol * ringCov * ringI;
    alpha += ringCov * ringI * 0.9;

    // ---- red haze: the light the ring throws into the debris ----------
    // Pooled around the orb and gone well inside the frame; it darkens
    // over the black disc so the eclipse stays black.
    float glowHaze = exp(-rr * rr / (0.17 * 0.17)) * smoothstep(0.42, 0.08, rr)
                   * smoothstep(Rp * 0.85, Rp * 1.20, rr)
                   * (0.10 + 0.70 * flash + 0.35 * burst) * (0.6 + 0.6 * heat);
    col += mix(ring_tint.rgb, vec3(1.0, 0.45, 0.25), 0.15) * glowHaze;
    alpha += glowHaze * 0.75;

    // ---- ejecta streaks ----------------------------------------------
    vec3 streakCol = mix(ring_tint.rgb, vec3(1.0, 0.55, 0.30), 0.20);
    col += streakCol * glowStreak * 2.4;
    alpha += glowStreak * 1.2;

    col = col / (1.0 + col * 0.30);
    col = pow(max(col, 0.0), vec3(0.92));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
