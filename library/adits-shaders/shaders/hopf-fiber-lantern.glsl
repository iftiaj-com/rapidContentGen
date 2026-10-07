/*{
  "ADITS": 1,
  "DESCRIPTION": "A Hopf fibration in neon: three nested tori woven from linked circles of light, counter-rolling around a white axis beam that threads the hole. One fibred torus under five interpolated numbers, so it morphs by deforming through four forms: woven ball, Hopf nest, braided bangle, tall light lantern. Bass swells and thickens the weave, mid ripples the tori, treble runs glints along every fibre, and beats flash the light. Rests as the Hopf nest.",
  "CREDIT": "claude-opus-5-5",
  "DATE": "2026-10-02",
  "CATEGORIES": ["generative", "morph", "neon", "raymarch", "audio", "loop"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 32.0,
  "INPUTS": [
    { "NAME": "sens",    "TYPE": "float", "DEFAULT": 0.85, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",    "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",    "TYPE": "float", "DEFAULT": 0.3333, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "swell",   "TYPE": "float", "DEFAULT": 0.35, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Weave Swell", "BIND": "bass", "BIND_DEPTH": 0.6 },
    { "NAME": "warp",    "TYPE": "float", "DEFAULT": 0.25, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Torus Ripple", "BIND": "mid", "BIND_DEPTH": 0.7 },
    { "NAME": "sparkle", "TYPE": "float", "DEFAULT": 0.35, "MIN": 0.05, "MAX": 1.00,
      "LABEL": "Fibre Glints", "BIND": "treble", "BIND_DEPTH": 0.7 }
  ]
}*/

#define TAU 6.28318530718
#define PERIOD 32.0

// Camera distance and focal length. Together with the 1.0 world-unit design
// radius they put the silhouette near 0.38 uv, inside the 0.46 the frame allows.
#define ORBIT 5.5
#define FOCAL 2.0

// How far the selector is spread across the three shells, so a change of form
// sweeps from the outer torus inward instead of flipping all three at once.
#define STAGGER 0.70

// Filled once per pixel in main(), read by map() on every step.
float gPhase;        // loop phase, 0 .. TAU
float gScale;        // bass swell on the whole object
float gThick;        // bass swell on the thread radius
float gWarp;         // mid ripple amplitude
vec4  gS0;           // per shell: major R, tube r, vertical stretch, thread radius
vec4  gS1;
vec4  gS2;

// Material of the nearest element, written by map().
float gHue;          // place on the neon palette
float gBead;         // glint travelling along the fibre, 0 .. 1
float gWhite;        // 1 on the axis beam, 0 on the fibres

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    return fract(p * (p + p));
}

// Cyclic four-stop neon palette: cyan, violet, magenta, gold. The stops are
// eased into each other, and the last blends back into the first, so the hue
// can wrap around any closed fibre without a seam.
vec3 neon(float h) {
    vec3 c0 = vec3(0.10, 0.92, 1.00);
    vec3 c1 = vec3(0.52, 0.30, 1.00);
    vec3 c2 = vec3(1.00, 0.18, 0.72);
    vec3 c3 = vec3(1.00, 0.68, 0.22);
    float x = fract(h) * 4.0;
    float f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    vec3 a = x < 1.0 ? c0 : (x < 2.0 ? c1 : (x < 3.0 ? c2 : c3));
    vec3 b = x < 1.0 ? c1 : (x < 2.0 ? c2 : (x < 3.0 ? c3 : c0));
    return mix(a, b, f);
}

// The morph. One fibred torus, five interpolated numbers. x is this shell's place
// on the selector axis (0 .. 3) and frac0 its nesting depth at full spread.
// Weights come from a rounded kernel of slope 1.5: neighbours overlap over a
// third of their spacing, which a parameter-space morph can afford, and every
// weight rises with zero slope at its edges, so no parameter changes rate with
// a kink as a transition starts.
vec4 shellForm(float x, float frac0) {
    float w0 = smoothstep(0.0, 1.0, 1.0 - abs(x      ) * 1.5);
    float w1 = smoothstep(0.0, 1.0, 1.0 - abs(x - 1.0) * 1.5);
    float w2 = smoothstep(0.0, 1.0, 1.0 - abs(x - 2.0) * 1.5);
    float w3 = smoothstep(0.0, 1.0, 1.0 - abs(x - 3.0) * 1.5);
    float ws = w0 + w1 + w2 + w3;
    w0 /= ws; w1 /= ws; w2 /= ws; w3 /= ws;

    //          woven ball  Hopf nest  bangle     lantern
    float R  = 0.30 * w0 + 0.58 * w1 + 0.80 * w2 + 0.52 * w3;    // major radius
    float r  = 0.60 * w0 + 0.34 * w1 + 0.11 * w2 + 0.12 * w3;    // tube radius
    float ay = 1.00 * w0 + 1.00 * w1 + 1.00 * w2 + 5.60 * w3;    // tube stretch
    float th = 0.020 * w0 + 0.0095 * w1 + 0.0065 * w2 + 0.0048 * w3; // thread
    float sp = 1.00 * w0 + 1.00 * w1 + 0.55 * w2 + 0.80 * w3;    // nest spread

    float f = 1.0 - (1.0 - frac0) * sp;
    return vec4(R, r * f, ay, th);
}

// N closed fibres wound once round the hole and once round the tube, the (1,1)
// curves that the Hopf map draws on every one of its tori. Returns the distance
// to the nearest fibre and writes its palette place and glint.
// rho and u are the shared cylindrical coordinates about the torus axis.
float fiberShell(vec3 p, vec4 S, float N, float roll, float sgn,
                 float rho, float u, float hueBase,
                 out float hue, out float bead) {
    float R  = S.x;
    float ay = S.z;
    float th = S.w * gThick;

    // Mid: the tube breathes in five lobes round the axis. Integer lobe count and
    // integer phase rate, so it closes round the ring and round the loop.
    float rr = S.y * (1.0 + gWarp * 0.18 * sin(5.0 * u + 2.0 * sgn * gPhase));

    // Tube cross-section is an ellipse of semi-axes rr and ay * rr. Its distance
    // uses the usual first-order ellipse estimate in real space, so threads stay
    // round on a stretched tube instead of flattening into ribbons.
    vec2  Q  = vec2(rho - R, p.y);
    vec2  ab = vec2(rr, rr * ay);
    float k1 = length(Q / ab);
    float k2 = length(Q / (ab * ab)) + 1e-6;
    float dt = k1 * (k1 - 1.0) / k2;          // signed distance to the torus skin
    vec2  q  = vec2(Q.x, Q.y / ay);
    float lq = length(q) + 1e-5;
    float v  = atan(q.y, q.x);

    // Fibre coordinate. roll slides every fibre round the tube, which reads as
    // the torus turning inside out like a smoke ring; mid adds a travelling
    // three-lobe wiggle along each fibre.
    float w    = v - u - roll + gWarp * 0.35 * sin(3.0 * u - gPhase);
    float cell = TAU / N;
    float fid  = floor(w / cell + 0.5);
    float wl   = w - fid * cell;

    // Distance across the skin to the fibre line, in the torus's own metric.
    // rv is the tube's radius along v (elliptical when the tube is stretched),
    // rho the radius along u; the line runs at 45 degrees in (u, v).
    float rv    = rr * length(vec2(q.y, ay * q.x)) / lq;
    float dline = abs(wl) * rv * rho / sqrt(rho * rho + rv * rv + 1e-6);

    // mod() keeps the fibre's identity where u wraps: crossing the seam adds
    // exactly N to fid, so the palette and the glints both close.
    float idm = mod(fid, N);
    hue  = idm / N + hueBase;
    bead = pow(0.5 + 0.5 * cos(3.0 * u + idm * 2.39996 - 4.0 * gPhase), 14.0);

    return length(vec2(dt, dline)) - th;
}

float map(vec3 pw) {
    vec3  p   = pw / gScale;
    float rho = length(p.xz);
    float u   = atan(p.z, p.x);

    float h0, b0, h1, b1, h2, b2;
    // Fibre rolls +1, -1, +2 turns per loop: the shells counter-rotate.
    float d0 = fiberShell(p, gS0, 22.0,  gPhase,        1.0, rho, u, 0.00, h0, b0);
    float d1 = fiberShell(p, gS1, 16.0, -gPhase,       -1.0, rho, u, 0.33, h1, b1);
    float d2 = fiberShell(p, gS2, 10.0,  2.0 * gPhase,  1.0, rho, u, 0.66, h2, b2);

    // The shared nucleus: the fibre through the point at infinity, which the
    // projection turns into a straight line down the axis. Every form keeps it.
    float hb = 0.78;
    float db = length(vec3(p.x, p.y - clamp(p.y, -hb, hb), p.z)) - 0.0055 * gThick;

    float d = d0;
    gHue = h0; gBead = b0; gWhite = 0.0;
    if (d1 < d) { d = d1; gHue = h1; gBead = b1; }
    if (d2 < d) { d = d2; gHue = h2; gBead = b2; }
    if (db < d) { d = db; gHue = 0.25; gBead = 0.0; gWhite = 1.0; }

    return d * gScale;
}

// Four-tap tetrahedral normal.
vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    float e = 0.0015;
    return normalize(k.xyy * map(p + k.xyy * e) +
                     k.yyx * map(p + k.yyx * e) +
                     k.yxy * map(p + k.yxy * e) +
                     k.xxx * map(p + k.xxx * e));
}

mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // The only place TIME is read. Every rate below is an integer multiple of
    // gPhase, so the object wraps exactly at LOOP = 32 s.
    float ph = fract(TIME / PERIOD);
    gPhase = ph * TAU;

    // --- Selector: balance decides the form, loudness only how hard it burns.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum  = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;
    float xs = (tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5;
    // Onsets shove before the soft saturation: a hat pulls toward the lantern, a
    // kick toward the woven ball. At most 0.34, one archetype's spacing.
    xs += 0.34 * snap * (AUDIO_HAT - AUDIO_KICK);
    float sel  = smoothstep(0.0, 1.0, xs);
    float live = smoothstep(0.02, 0.12, max(lo + md + hi, AUDIO_LEVEL));
    sel = mix(rest, sel, live);
    float X = sel * 3.0;

    // Static per-shell stagger, outer shell leading. Never moves with TIME.
    float x0 = clamp(X + STAGGER * (-0.40 + 0.20 * (hash11(1.7) - 0.5)), 0.0, 3.0);
    float x1 = clamp(X + STAGGER * ( 0.00 + 0.20 * (hash11(5.3) - 0.5)), 0.0, 3.0);
    float x2 = clamp(X + STAGGER * ( 0.40 + 0.20 * (hash11(9.1) - 0.5)), 0.0, 3.0);
    gS0 = shellForm(x0, 1.00);
    gS1 = shellForm(x1, 0.66);
    gS2 = shellForm(x2, 0.36);

    // --- Bound inputs, each with one structural job.
    gScale = 0.86 + 0.14 * swell;                  // bass: the weave swells
    gThick = 0.75 + 0.65 * swell;                  // and its threads fatten
    gWarp  = warp;                                 // mid: the tori ripple
    float glint = pow(sparkle, 0.8);               // treble: glints along fibres
    float sharp = 46.0 + 44.0 * sparkle;           // and a tighter glow

    // Onset light. AUDIO_BEAT already decays, so it is used straight.
    float flash = 1.0 + 0.85 * AUDIO_BEAT;

    // --- Camera from CAM_DIR, so a real orbit orbits the object.
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + FOCAL * ww);

    // Object pose: the axis leans toward the viewer so the hole reads, nods
    // gently, and the whole fibration spins once per loop about its own axis.
    mat3 M = rotY(gPhase) * rotX(0.82 + 0.10 * sin(gPhase)) * rotY(0.30 * sin(gPhase));
    ro = M * ro;
    rd = M * rd;

    // Analytic bounding sphere. Rays that miss it cost one quadratic.
    float Rb = 1.12 * gScale;
    float bq = dot(ro, rd);
    float cq = dot(ro, ro) - Rb * Rb;
    float disc = bq * bq - cq;

    vec3  glow = vec3(0.0);
    vec3  hitCol = vec3(0.0);
    float hit = 0.0;

    if (disc > 0.0) {
        float sq = sqrt(disc);
        float t0 = max(-bq - sq, 0.0);
        float t1 = -bq + sq;
        float t  = t0;
        float tc = length(ro);        // depth of the object's centre

        for (int i = 0; i < 64; i++) {
            vec3  p = ro + rd * t;
            float d = map(p);
            float dp = max(d, 0.0);

            // Near half of the object burns brighter than the far half.
            float depth = mix(1.0, 0.42, smoothstep(tc - 0.7, tc + 0.7, t));
            vec3  mc = mix(neon(gHue + ph), vec3(0.92, 0.90, 1.0), gWhite);
            mc += vec3(1.0, 0.95, 0.9) * gBead * glint * 1.6 * (1.0 - gWhite);
            mc *= depth * flash * (1.0 + 1.6 * gWhite * AUDIO_BEAT);

            // A floor on the step keeps 64 steps enough to cross the object;
            // threads thinner than a step still land in the glow, which is
            // integrated over the step length so it does not depend on stepping.
            float stepLen = max(dp * 0.7, 0.010 + 0.0004 * float(i));
            glow += mc * exp(-dp * sharp) * stepLen * 2.4;

            if (d < 0.0006 * t) {
                vec3 n = calcNormal(p);
                // map() moved the material globals; take them at the hit.
                map(p);
                vec3 base = mix(neon(gHue + ph), vec3(0.92, 0.90, 1.0), gWhite);
                float face = abs(dot(n, rd));
                // A neon tube: saturated at the limbs, white-hot along its spine.
                hitCol = base * (0.45 + 0.75 * face) + vec3(1.0) * pow(face, 6.0) * 0.55;
                hitCol += vec3(1.0, 0.95, 0.9) * gBead * glint * 1.4 * (1.0 - gWhite);
                hitCol *= depth * flash;
                hit = 1.0;
                break;
            }
            t += stepLen;
            if (t > t1) break;
        }
    }

    // Belt and braces: everything is gone by 0.48 uv, inside the frame edge.
    float keep = 1.0 - smoothstep(0.43, 0.48, length(uv));

    // Premultiplied light. The glow is additive, so its colour may exceed its
    // coverage; that is what makes it read as emitted light over footage.
    vec3  lightP = (hitCol * hit + glow) * keep;
    float glowA  = clamp(dot(glow, vec3(0.30, 0.50, 0.20)) * 1.3, 0.0, 1.0);
    float alpha  = clamp((hit + glowA) * keep, 0.0, 1.0);

    // Straight colour, then the premultiply the profile expects.
    vec3 col = lightP / max(alpha, 1e-4);
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
