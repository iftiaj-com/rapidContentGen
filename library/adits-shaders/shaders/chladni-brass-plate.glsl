/*{
  "ADITS": 1,
  "DESCRIPTION": "A thick square Chladni slab of dark brass on a slow turntable, a solid the camera can orbit, carrying piles of sand along the nodal lines of its vibration. Drive frequency follows the spectrum, bowing the plate through four figures: a bass ring-in-diamond, a mid rosette, a treble star lattice, a fine mesh, each a superposition of the plate's cosine modes. Bass flexes the brass and squeezes the sand thinner, treble lifts dust above the antinodes, a kick throws the grains. Rests as the rosette.",
  "CREDIT": "claude-fable-5-1",
  "DATE": "2026-09-18",
  "CATEGORIES": ["generative", "morph", "3d", "physics", "chladni", "brass", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "low",
  "ASPECT": "square",
  "LOOP": 24.0,
  "INPUTS": [
    { "NAME": "sens",    "TYPE": "float", "DEFAULT": 0.80, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",    "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Strike" },
    { "NAME": "rest",    "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Figure" },
    { "NAME": "drive",   "TYPE": "float", "DEFAULT": 0.30, "MIN": 0.05, "MAX": 1.00,
      "LABEL": "Bow Pressure", "BIND": "bass", "BIND_DEPTH": 0.60 },
    { "NAME": "dust",    "TYPE": "float", "DEFAULT": 0.25, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Fine Dust", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "damp",    "TYPE": "float", "DEFAULT": 0.30, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Damping" },
    { "NAME": "sandCol", "TYPE": "color", "DEFAULT": [1.00, 0.92, 0.74, 1.00],
      "LABEL": "Sand" },
    { "NAME": "dustCol", "TYPE": "color", "DEFAULT": [0.40, 0.78, 1.00, 1.00],
      "LABEL": "Dust" }
  ]
}*/

#define TAU 6.28318530718
#define PI  3.14159265359

// Camera: the corpus convention, so orbiting the anamorphic camera orbits the
// plate the same way it orbits every other 3D object in the gallery.
#define ORBIT 4.0
#define FOCAL 3.2

// World half-width of the plate. Projected it is about 0.26 at the centre and
// the nearest corner of a steeply tilted plate reaches about 0.42, inside the
// 0.46 silhouette bound at every orbit angle.
#define HALF 0.33

// Half thickness of the slab, in plate units (the plate half-width is 1).
// Thick enough that the side face reads as a solid from a low orbit.
#define TH 0.13

// Height of the sand piles and of the floating dust layer, plate units.
#define SANDH 0.030
#define DUSTH 0.090

// Per-position spread of the selector, in archetype spacings (guide §12.6).
// Under one spacing, so the corners are never a whole figure behind the centre.
#define STAGGER 0.80

float hash21(vec2 p) {
    p = fract(p * vec2(127.1, 311.7));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
}

vec2 rot2(vec2 v, float a) {
    float s = sin(a), c = cos(a);
    return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
}

// One vibration mode of a free square plate on [-1, 1]^2, with its gradient.
// cos(n pi x) cos(m pi y) + cos(m pi x) cos(n pi y) is the standard cosine
// approximation of Chladni's square-plate figures: a real plate's modes are
// close to this, not equal to it. Sand settles where the plate does not move,
// so the figure is the zero set of this function. The "+" combination has the
// full symmetry of the square, which is what lets the turntable loop on a
// quarter turn.
float modeF(vec2 p, float n, float m, out vec2 g) {
    float cnx = cos(n * PI * p.x), cmy = cos(m * PI * p.y);
    float cmx = cos(m * PI * p.x), cny = cos(n * PI * p.y);
    float snx = sin(n * PI * p.x), smy = sin(m * PI * p.y);
    float smx = sin(m * PI * p.x), sny = sin(n * PI * p.y);
    g = vec2(-n * PI * snx * cmy - m * PI * smx * cny,
             -m * PI * cnx * smy - n * PI * cmx * sny);
    return cnx * cmy + cmx * cny;
}

// Value only, for the two extra samples the 3D construction needs.
float modeV(vec2 p, float n, float m) {
    return cos(n * PI * p.x) * cos(m * PI * p.y) + cos(m * PI * p.x) * cos(n * PI * p.y);
}

// Resonance weights at a point on the plate. Grains at the free corners are
// thrown farthest and resettle last, so the selector runs centre first,
// corners after: the figure changes as a ring spreading over the plate rather
// than flipping all at once. Static, so at a fixed spectrum the plate holds
// still. The kernel stands in for the plate's resonance curves: less damping,
// a sharper peak, a cleaner single figure. Smooth at its edges, so nothing
// interpolated from it changes rate with a kink (guide §12.6).
vec4 weights(vec2 p, float sel, float slope) {
    float rp = length(p) * 0.7071;                  // 0 centre, 1 corner
    float xs = clamp(sel * 3.0 + STAGGER * (0.5 - rp), 0.0, 3.0);
    vec4 w = smoothstep(vec4(0.0), vec4(1.0), 1.0 - abs(xs - vec4(0.0, 1.0, 2.0, 3.0)) * slope);
    return w / (w.x + w.y + w.z + w.w);
}

// The plate's driven response: four modes in rising frequency order. A
// weighted sum of modes is what a driven plate really does between
// resonances, so mid-blend is a genuine figure and never two at half alpha.
float field(vec2 p, float sel, float slope, out vec2 g) {
    vec4 w = weights(p, sel, slope);
    vec2 g0, g1, g2, g3;
    float f0 = modeF(p, 1.0, 2.0, g0);              // ring in a diamond
    float f1 = modeF(p, 2.0, 3.0, g1);              // rosette
    float f2 = modeF(p, 3.0, 5.0, g2);              // star lattice
    float f3 = modeF(p, 5.0, 7.0, g3);              // fine mesh
    g = w.x * g0 + w.y * g1 + w.z * g2 + w.w * g3;
    return w.x * f0 + w.y * f1 + w.z * f2 + w.w * f3;   // about -2 .. 2
}

float fieldV(vec2 p, float sel, float slope) {
    vec4 w = weights(p, sel, slope);
    return w.x * modeV(p, 1.0, 2.0) + w.y * modeV(p, 2.0, 3.0)
         + w.z * modeV(p, 3.0, 5.0) + w.w * modeV(p, 5.0, 7.0);
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // One loop phase. Every rate below is an integer multiple of it. Nothing on
    // the morph path reads it: which figure is on the plate belongs to the music.
    float ph = fract(TIME / 24.0);

    // Turntable: a quarter turn per loop. The slab, its figures and its grain
    // field all carry the square's symmetry, so frame 0 and frame 24 s match.
    float turn = ph * (TAU * 0.25);

    // --- Camera and slab --------------------------------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 cu = cross(CAM_UP, ww);
    vec3 uu = normalize(length(cu) > 1e-4 ? cu : vec3(1.0, 0.0, 0.0));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + FOCAL * ww);

    // Into plate space: plate half-width 1, turned with the turntable.
    ro /= HALF;
    ro.xy = rot2(ro.xy, -turn);
    rd.xy = rot2(rd.xy, -turn);
    // The slab test divides by the ray; keep every component off exact zero.
    rd.x = abs(rd.x) < 1e-5 ? 1e-5 : rd.x;
    rd.y = abs(rd.y) < 1e-5 ? 1e-5 : rd.y;
    rd.z = abs(rd.z) < 1e-5 ? -1e-5 : rd.z;

    // Analytic slab intersection: one object, no march.
    vec3 ext = vec3(1.0, 1.0, TH);
    vec3 mI = 1.0 / rd;
    vec3 nI = mI * ro;
    vec3 kI = abs(mI) * ext;
    vec3 t1 = -nI - kI;
    vec3 t2 = -nI + kI;
    float tN = max(max(t1.x, t1.y), t1.z);
    float tF = min(min(t2.x, t2.y), t2.z);
    if (tN > tF || tF < 0.0) {
        // The ray misses the plate. Nothing is drawn off it.
        gl_FragColor = vec4(0.0);
        return;
    }
    vec3 hit = ro + tN * rd;
    vec3 fn  = -sign(rd) * step(t1.yzx, t1.xyz) * step(t1.zxy, t1.xyz);
    bool top = fn.z > 0.5;
    vec3 Vp  = -rd;                                  // toward the eye, plate space

    // --- Selector: the drive frequency ----------------------------------------
    // Which mode a plate answers with depends on the frequency it is bowed at,
    // not on how hard. So balance picks the figure and loudness only lights it.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum  = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;             // 0 all bass, 1 all treble
    float xsel = (tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5;
    // Onsets shove the drive before it saturates: a hat bows higher, a kick
    // drops it. At most 0.4 of the axis, about one figure's spacing, so a hit
    // never skips a figure the viewer should have seen.
    xsel += 0.40 * snap * (AUDIO_HAT - AUDIO_KICK);
    float sel = smoothstep(0.0, 1.0, xsel);         // soft saturation at both ends
    // Silence is 0 / 0 in tilt, so fade to a chosen resting figure. AUDIO_LEVEL
    // in the gate keeps quiet masters on the live selector.
    float live = smoothstep(0.02, 0.12, max(lo + md + hi, AUDIO_LEVEL));
    sel = mix(rest, sel, live);
    float slope = mix(1.92, 1.40, damp);

    // --- Top face: the flexed surface ----------------------------------------
    // The vibration is rendered as if stroboscoped down to a slow breath that
    // never quite reaches flat, so the bands ripple instead of blinking, and
    // stay legible when the host clock runs at 10x. Harder bowing, larger flex.
    float flexA = 0.022 * (0.25 + drive);
    float vib   = 0.6 + 0.4 * cos(ph * TAU * 2.0);
    float fA    = flexA * vib;

    // One refinement step along the ray: sample the height where the ray meets
    // the flat top, then slide to where it meets the displaced top. The field
    // is smooth and the displacement small, so one step lands on it.
    vec2 xy = hit.xy;
    if (top) {
        float h0 = fA * fieldV(xy, sel, slope);
        xy = clamp((hit + (h0 / rd.z) * rd).xy, -1.0, 1.0);
    }
    vec2  grd;
    float psi = field(xy, sel, slope, grd);
    // First-order distance to the nodal line, so the sand line keeps one width
    // whether the mode is coarse or fine. Where the gradient vanishes as well
    // the plate is still over a patch, and the sand pools there, as it does.
    float gl = length(grd);
    float d  = abs(psi) / max(gl, 1.2);
    vec2  gdir = grd / max(gl, 1e-3);

    // --- Sand piles -------------------------------------------------------------
    // Harder bowing throws grains off the moving parts sooner, so they crowd
    // the nodes tighter. A kick throws them into the air: wider, softer, dimmer.
    float squeeze = 1.0 / (1.0 + 1.8 * drive);
    float jump    = 1.0 + 1.2 * snap * AUDIO_KICK;
    float wS   = 0.055 * squeeze * jump;
    float e0 = wS * 0.25, e1 = wS;
    float tt   = clamp((d - e0) / (e1 - e0), 0.0, 1.0);
    float pile = 1.0 - tt * tt * (3.0 - 2.0 * tt);              // rounded pile section
    float dpile = 6.0 * tt * (1.0 - tt) / (e1 - e0);            // |d pile / d d|
    // The pile has height, so it has its own normal: the surface climbs toward
    // the nodal line along the gradient direction.
    vec3 Ns = normalize(vec3(-fA * grd + SANDH * dpile * sign(psi) * gdir, 1.0));

    // Grain field in D4-folded plate coordinates, so it shares the square's
    // symmetry and the quarter-turn loop closes on it too.
    vec2  q  = abs(xy);
    q = (q.x < q.y) ? q.yx : q;
    vec2  gc = q * 64.0;
    vec2  gi = floor(gc);
    float gr  = hash21(gi);
    float gr2 = hash21(gi + 7.7);
    vec2  gf  = fract(gc) - 0.5 - (vec2(gr, gr2) - 0.5) * 0.45;
    float mote = 1.0 - smoothstep(0.16, 0.42, length(gf));
    float sand = pile * (0.40 + 0.85 * mote * (0.45 + 0.75 * gr));

    // Airborne grains on a kick: a soft warm haze around every line.
    float haze = (1.0 - smoothstep(0.0, wS * 3.5, d)) * snap * AUDIO_KICK;

    // --- Lights -----------------------------------------------------------------
    // Both lights are defined in frame space and turned into plate space, so
    // they belong to the scene, not to the plate. The key circles once per loop.
    vec3 Lk = normalize(vec3(0.6 * cos(ph * TAU), 0.6 * sin(ph * TAU), 1.0));
    Lk.xy = rot2(Lk.xy, -turn);
    // The sheen light sits near the camera's mirror image in the plate, pushed
    // off it by an in-plane offset that circles once per loop. Flat brass just
    // misses reflecting it into the eye from every orbit angle, and a band
    // flexed by about half that offset catches it, so the sheen travels with
    // the camera instead of belonging to one head-on view.
    vec3 Lm = vec3(-Vp.x, -Vp.y, Vp.z);
    vec2 off = rot2(vec2(cos(ph * TAU), sin(ph * TAU)), -turn);
    vec3 Ls = normalize(Lm + 0.55 * vec3(off, 0.0));

    // --- Brass -------------------------------------------------------------------
    // Near-black oxidised metal carrying bright light, not a brown diffuse
    // surface: over dark footage the highlights are what read, and a plate lit
    // evenly enough to show its own base colour is the mud failure.
    vec3 brass = vec3(1.00, 0.68, 0.26);
    vec3 base  = vec3(0.075, 0.046, 0.018);
    // Top face uses the flexed normal; a side or the underside uses its face.
    vec3 Np = top ? normalize(vec3(-fA * grd, 1.0)) : fn;
    float dif = max(dot(Np, Lk), 0.0);
    // Wrapped term as well as the sharp one: a metal block in a room is never
    // black on the face turned away from the key, and a dead black side reads
    // as a hole in the footage rather than as the cut edge of a solid.
    float wrap = dot(Np, Lk) * 0.5 + 0.5;
    vec3  Hk  = normalize(Lk + Vp);
    float spK = pow(max(dot(Np, Hk), 0.0), 48.0);
    float fr  = pow(1.0 - max(dot(Np, Vp), 0.0), 3.0);      // rim, travels with view
    vec3 brassCol = base * (0.30 + 0.70 * wrap) + brass * dif * dif * 0.16
                  + brass * spK * 2.2 + brass * fr * 1.10;
    if (top) {
        // Flex sheen: the specular bands are the visible shape of the mode.
        float spec  = pow(max(dot(reflect(-Ls, Np), Vp), 0.0), 24.0);
        float spec0 = pow(max(dot(reflect(-Ls, vec3(0.0, 0.0, 1.0)), Vp), 0.0), 24.0);
        brassCol += brass * max(spec - spec0, 0.0) * 2.6;
        // Contact shadow at the foot of every pile.
        float ao = 1.0 - 0.45 * (1.0 - smoothstep(wS, wS * 2.2, d)) * (1.0 - pile);
        brassCol *= ao;
    } else if (fn.z < -0.5) {
        brassCol *= 0.40;                            // underside, in shadow
    } else {
        // A cut edge, machined: mill grooves running along the cut, kept coarse
        // enough to stay resolved at the smallest render target rather than
        // aliasing into a barcode. They catch the key at grazing angles, which
        // is what separates the side from the top instead of leaving it a flat
        // band. The face is also lifted off black, since a cut edge of brass is
        // the brightest part of a real block, not the darkest.
        float ip   = abs(fn.x) > 0.5 ? hit.y : hit.x;
        float mill = 0.5 + 0.5 * sin(ip * 34.0);
        brassCol += brass * (0.105 + 0.050 * mill) * (0.55 + 1.30 * wrap)
                  + brass * mill * spK * 1.4;
    }
    // Bevelled rims. On the top face that is the four outer edges; on a cut
    // edge it is the top and bottom lips and the vertical corner, so the whole
    // solid is drawn in bright brass wire whatever angle it is seen from.
    float edge = top ? 1.0 - max(abs(xy.x), abs(xy.y))
                     : min(TH - abs(hit.z), 1.0 - min(abs(hit.x), abs(hit.y)));
    float bevel = 1.0 - smoothstep(0.0, 0.030, edge);
    brassCol += brass * bevel * (0.70 + 1.20 * fr + 0.6 * spK);

    // --- Sand, lit as matter ----------------------------------------------------
    float sandLit = 0.30 + 0.70 * max(dot(Ns, Lk), 0.0);
    float glint   = pow(max(dot(reflect(-Lk, Ns), Vp), 0.0), 12.0) * mote;
    // Light catching individual grains. The twinkle is an integer harmonic of
    // the loop, and the hat brightens it: the hat is what rattles the grains.
    float tw = 0.5 + 0.5 * sin(ph * TAU * 8.0 + gr2 * TAU);
    float sparkle = smoothstep(0.82, 0.97, gr2) * pile * mote
                  * (0.35 + 0.65 * tw) * (0.6 + 1.8 * snap * AUDIO_HAT);
    // Overall level lights the sand; the knee keeps quiet passages steady and
    // stops the slam at full level.
    float lvl = 0.75 + 0.55 * smoothstep(0.04, 0.95, AUDIO_LEVEL);
    vec3 sandC = sandCol.rgb;
    vec3 hot   = mix(sandC, vec3(1.0, 0.98, 0.92), 0.65);
    vec3 sandRGB = sandC * (0.55 + 1.15 * sandLit) * lvl + hot * glint * 1.3;

    // --- Fine dust, floating above the antinodes ------------------------------
    // Faraday's observation: powder light enough to ride the air currents
    // gathers where the plate moves most, the opposite of the sand. It hangs a
    // little above the surface, so it is sampled where the ray crosses that
    // height and shifts against the plate as the camera moves. Its colour is a
    // design choice, not physics. A snare puffs it.
    float dustF = 0.0;
    if (top) {
        vec2  xyD  = xy + rd.xy * (DUSTH / rd.z);
        float onP  = 1.0 - smoothstep(0.98, 1.02, max(abs(xyD.x), abs(xyD.y)));
        float amp  = abs(fieldV(xyD, sel, slope)) * 0.5;   // 0 .. 1, antinodes at 1
        float anti = smoothstep(0.50, 0.95, amp);
        vec2  qD   = abs(xyD);
        qD = (qD.x < qD.y) ? qD.yx : qD;
        float fine = hash21(floor(qD * 140.0) + 3.1);
        float puff = 1.0 + 0.9 * snap * AUDIO_SNARE;
        dustF = anti * dust * puff * (0.50 + 0.65 * fine) * onP;
    }

    // --- Compose ------------------------------------------------------------------
    float sandM = top ? clamp(sand, 0.0, 1.0) : 0.0;
    vec3 col = mix(brassCol, sandRGB, sandM)
             + hot * sparkle * 1.7 * float(top)
             + sandC * haze * 0.55 * float(top)
             + dustCol.rgb * dustF * 0.95;

    // Soft knee where sand, sparkle and sheen stack.
    col = col / (1.0 + col * 0.25);

    // The slab is solid, so coverage is one wherever the ray is properly inside
    // it. At the silhouette the ray only clips the metal and its path through
    // it collapses, which is exactly where a hard edge would alias, so the
    // chord length doubles as the coverage falloff. Zero off the plate by the
    // early return above, never a constant write.
    float alpha = smoothstep(0.0, 0.035, tF - tN);
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
