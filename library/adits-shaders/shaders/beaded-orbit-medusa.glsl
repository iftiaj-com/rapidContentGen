/*{
  "ADITS": 1,
  "DESCRIPTION": "A ribbed gill disc, scalloped and speckled, unchanging, hung inside four orbit rings that each change species on their own schedule. Each ring is one wire under six interpolated numbers, so it morphs by deforming, not cross-fading, through four forms: heavy lozenge chain, beaded ring, studded thorn ring, bare hair wire. Bass fattens the beads and swells the disc, treble strips the rings to wire, and the change sweeps ring by ring. Rests as the beaded ring.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-21",
  "CATEGORIES": ["generative", "morph", "armillary", "medusa", "neon", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "medium",
  "ASPECT": "square",
  "LOOP": 24.0,
  "INPUTS": [
    { "NAME": "sens",   "TYPE": "float", "DEFAULT": 0.80, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",   "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",   "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "disc",   "TYPE": "float", "DEFAULT": 0.205, "MIN": 0.150, "MAX": 0.255,
      "LABEL": "Disc Radius", "BIND": "bass", "BIND_DEPTH": 0.40 },
    { "NAME": "ribs",   "TYPE": "float", "DEFAULT": 0.60, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Rib Glow", "BIND": "level", "BIND_DEPTH": 0.45 },
    { "NAME": "beadSz", "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Bead Size", "BIND": "treble", "BIND_DEPTH": 0.45 }
  ]
}*/

#define TAU 6.28318530718

// Where the palette starts. It used to be a slider; the six-slot budget went to
// the morph controls instead, and this is the value it defaulted to.
#define HUE_OFF 0.28

// How far the per-ring selector is spread across the armature. The change then
// crosses it ring by ring instead of flipping all four at once.
#define STAGGER 1.05

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    return fract(p * (p + p));
}

float hash21(vec2 p) {
    p = fract(p * vec2(127.1, 311.7));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
}

vec3 pal(float t) {
    return 0.5 + 0.5 * cos(TAU * (t + vec3(0.00, 0.33, 0.67)));
}

vec2 rot2(vec2 v, float a) {
    float s = sin(a), c = cos(a);
    return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // One loop phase. Every rate below is an integer multiple of it, so the disc
    // and the rings wrap seamlessly on a 24 s cycle. Nothing on the morph path
    // reads it: which ring is which belongs to the music, not to the clock.
    float ph = fract(TIME / 24.0);

    float r = length(uv);
    float a = atan(uv.y, uv.x);

    float turn   = ph * TAU;
    float breath = 1.0 + 0.050 * sin(ph * TAU * 2.0);
    float creep  = ph * 3.0;
    float hue0   = ph + HUE_OFF + 0.24 * (1.0 - CAM_DIR.z);

    // --- Selector -------------------------------------------------------------
    // Balance decides which ring; loudness only decides how hard it is lit.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum  = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;            // 0 all bass, 1 all treble
    // tilt is a ratio of three smoothed averages, so it swings far less than any
    // one band. Expanded around the rest point, or the outer forms never arrive.
    float sel  = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // AUDIO_HAT and AUDIO_KICK already decay, so they are used straight: a hat
    // strips a ring to wire, a kick loads it with lozenges.
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);
    // At silence tilt is 0/0, so fade to a chosen resting form instead.
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest, sel, live);
    float x0 = sel * 3.0;

    // One transient control drives the light as well as the geometry: the beat
    // that loads a ring also flashes the armature.
    float beat = 1.0 + 1.3 * snap * AUDIO_BEAT;

    // Shared continuous parameters. All three slide across the whole selector
    // range rather than snapping, so the disc's envelope is visibly moving even
    // at a 50/50 blend: bass swells it and deepens the scallops, treble tightens
    // it and combs the ribs finer.
    float dM   = mix(1.08, 0.88, sel);
    float scal = mix(0.100, 0.045, sel);
    float rwM  = mix(1.45, 0.70, sel);

    // --- Ribbed gill disc: the shared core -------------------------------------
    // The rim is scalloped in fourteen lobes, so the disc reads as a shell rather
    // than as a circle. It never changes species; it is what holds the middle of
    // the frame together while the rings turn over.
    float D  = disc * breath * dM;
    float Re = D * (1.0 + scal * cos(14.0 * (a - turn)));
    float body = (1.0 - smoothstep(Re - 0.0024, Re + 0.0024, r));
    float rimD = (1.0 - smoothstep(0.0014, 0.0048, abs(r - Re)));

    // 84 fine radial ribs, each with its own brightness, running from the hub to
    // the rim. One angular cell evaluation covers the lot.
    const float RIBS = 84.0;
    float rk  = (a + turn * 0.5) * (RIBS / TAU);
    float rid = mod(floor(rk), RIBS);
    float rd  = abs(fract(rk) - 0.5) * (TAU / RIBS) * r;
    float rh  = hash11(rid * 1.77 + 3.1);
    float rw  = 0.0017 * (0.55 + 0.90 * rh) * rwM;
    float rib = (1.0 - smoothstep(rw, rw + 0.0013, rd)) * body
              * smoothstep(0.055 * D, 0.30 * D, r);

    // Dark speckled centre: a hash dot field that eats brightness in the middle,
    // exactly the grainy hub the reference disc has.
    vec2  sg  = uv * 190.0;
    float spk = step(0.42, hash21(floor(sg) + 3.7));
    float hub = (1.0 - smoothstep(D * 0.30, D * 0.46, r));

    // A second, coarser set of scalloped ridges near the rim.
    float ridge = (1.0 - smoothstep(0.16, 0.36, abs(fract((r / D) * 9.0 - creep) - 0.5)))
                * body * smoothstep(0.40 * D, 0.62 * D, r);

    vec3 hueD = pal(hue0 + rh * 0.10 + (r / max(D, 0.02)) * 0.16);
    vec3 white = vec3(1.00, 0.99, 0.97);

    vec3 col = hueD * body * (0.16 + 0.30 * ribs) * beat
             + hueD * rib * (0.95 + 1.45 * ribs) * beat
             + mix(hueD, white, 0.45) * ridge * (0.30 + 0.50 * ribs)
             + white * rimD * 0.55 * beat;
    // The speckle removes light rather than adding it, so the hub goes grainy dark.
    col *= 1.0 - hub * spk * 0.82;

    float cov = body * 0.90 + rib * 0.60 + rimD * 0.70;

    // --- Morphing armature: four orbit rings -----------------------------------
    float wireC = 0.0;
    float beadC = 0.0;
    vec3  ringCol = vec3(0.0);
    for (int j = 0; j < 4; j++) {
        float fj = float(j);
        float hv = hash11(fj * 2.63 + 5.9);

        // Per-ring selector. The index term sweeps the change across the
        // armature; the hash keeps that sweep from looking mechanical. Both are
        // static, so at a fixed spectrum the rings hold still: the wave is
        // positioned by the music, never by the clock.
        float u  = fj / 3.0;
        float xj = clamp(x0 + STAGGER * (0.66 * (u - 0.5) + 0.34 * (hv - 0.5)),
                         0.0, 3.0);

        // Triangular weights of slope 1.85. Support is 1/1.85 either side of a
        // centre and the centres are spaced 1.0, so neighbours overlap over
        // 2/1.85 - 1 = 0.081 of the axis and the sum is never zero. The slope
        // must stay below 2.0 or the normalisation divides by nothing.
        float w0 = max(1.0 - abs(xj      ) * 1.85, 0.0);
        float w1 = max(1.0 - abs(xj - 1.0) * 1.85, 0.0);
        float w2 = max(1.0 - abs(xj - 2.0) * 1.85, 0.0);
        float w3 = max(1.0 - abs(xj - 3.0) * 1.85, 0.0);
        float ws = w0 + w1 + w2 + w3;
        w0 /= ws; w1 /= ws; w2 /= ws; w3 /= ws;

        // Parameter-space morph. One ring primitive, six interpolated numbers, so
        // the section deforms and no fragment shows two forms at half alpha.
        //             lozenge    beaded     thorn      wire
        float wwm = 2.60 * w0 + 1.00 * w1 + 1.30 * w2 + 0.55 * w3;  // wire gauge
        float bcw = 6.00 * w0 + 13.0 * w1 + 22.0 * w2 + 34.0 * w3;  // bead count
        float blm = 0.0300 * w0 + 0.0190 * w1 + 0.0110 * w2 + 0.0038 * w3;
        float bsh = 1.55 * w0 + 1.00 * w1 + 0.55 * w2 + 0.35 * w3;  // bead share
        float bof = 0.00 * w0 + 0.00 * w1 + 1.15 * w2 + 0.00 * w3;  // stud offset
        float am  = 0.90 * w0 + 1.00 * w1 + 1.05 * w2 + 1.10 * w3;  // amplitude

        float A  = (0.268 + 0.028 * fj) * am;
        float spin = ph * TAU * (fj < 1.5 ? 1.0 : -1.0) + fj * 0.83;
        float sq   = 0.20 + 0.80 * abs(sin(ph * TAU * (1.0 + fj) + fj * 1.9));
        sq = max(sq, 0.17);

        vec2  e = rot2(uv, -spin);
        vec2  g = vec2(e.x, e.y / sq);
        float sd = length(g) - A;        // signed, so a stud can sit outside it
        float d  = abs(sd);

        float wire = 1.0 - smoothstep(0.0011 * wwm, 0.0011 * wwm + 0.0015, d);

        // Beads placed along the ring's own angular parameter, so they ride the
        // wire instead of sitting in screen space beside it. The count is rounded
        // to an integer: a fractional count leaves one wrong bead at the atan
        // wrap, and snapping it is invisible next to the five numbers that do
        // interpolate.
        float th = atan(g.y, g.x);
        float bk = th * (floor(bcw + 0.5) / TAU) + creep * (1.0 + 0.3 * fj);
        float bt = abs(fract(bk) - 0.5) * 2.0;          // 0 at a bead centre
        float bl = blm * (0.45 + 1.00 * beadSz);        // bead half-height in uv
        float br = abs(sd - bof * bl);                  // studs ride outside
        float bead = (1.0 - smoothstep(0.30 * bsh, 0.62 * bsh, bt))
                   * (1.0 - smoothstep(bl, bl + 0.0020, br));
        float beadR = (1.0 - smoothstep(0.34 * bsh, 0.66 * bsh, bt))
                    * (1.0 - smoothstep(0.0008, 0.0028, abs(br - bl)));

        vec3 hc = pal(hue0 + 0.14 * fj + 0.20 * (e.x / A));
        ringCol += hc * (wire * 0.42 + bead * 1.25) * beat
                 + white * beadR * 0.45 * beat;
        wireC += wire;
        beadC += bead + beadR * 0.6;
    }
    col += ringCol * (0.60 + 0.85 * ribs);

    // Soft knee: 84 ribs plus four rings pile up over the disc.
    col = col / (1.0 + col * 0.28);

    // Radial safety bound. The worst case is the thorn form on the outermost
    // ring: 0.352 amplitude * 1.05 plus a stud sitting 2.15 bead-heights out at
    // the largest bead size, which reaches 0.394. This fade only feathers empty
    // space and never slices a stud.
    float rim = 1.0 - smoothstep(0.425, 0.482, r);
    col *= rim;

    // Coverage, then premultiply. Zero everywhere the object is not.
    float alpha = (min(cov, 1.2) * 1.00 + min(wireC, 1.0) * 0.90
                 + min(beadC, 1.0) * 1.00) * rim;
    alpha = smoothstep(0.020, 0.90, alpha);
    alpha = clamp(alpha, 0.0, 1.0);
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
