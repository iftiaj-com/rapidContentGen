/*{
  "ADITS": 1,
  "DESCRIPTION": "An obsidian carapace of banded armour, unchanging, wearing a fringe of eighteen appendages that each change species on their own schedule. Each is one blade under seven interpolated numbers, so it morphs by deforming, not cross-fading, through four keratin forms: overlapping scale, serrated mandible, sickle talon, needle quill. Bass armours the fringe into a pangolin, treble strips it to a porcupine, and the change sweeps head to tail one edge at a time. Rests as the mandible form.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-21",
  "CATEGORIES": ["generative", "morph", "obsidian", "metal", "creature", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "medium",
  "ASPECT": "square",
  "LOOP": 18.0,
  "INPUTS": [
    { "NAME": "sens",    "TYPE": "float", "DEFAULT": 0.82, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",    "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",    "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "stagger", "TYPE": "float", "DEFAULT": 1.05, "MIN": 0.00, "MAX": 1.60,
      "LABEL": "Edge Stagger" },
    { "NAME": "bodySz",  "TYPE": "float", "DEFAULT": 1.00, "MIN": 0.88, "MAX": 1.12,
      "LABEL": "Shell Mass", "BIND": "bass", "BIND_DEPTH": 0.32 },
    { "NAME": "sheen",   "TYPE": "float", "DEFAULT": 0.62, "MIN": 0.22, "MAX": 1.00,
      "LABEL": "Metal Sheen", "BIND": "level", "BIND_DEPTH": 0.45 }
  ]
}*/

#define PI  3.14159265359
#define TAU 6.28318530718

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    return fract(p * (p + p));
}

// Half-width of the shared shell at axial position t: 0 at the tail, 1 at the head.
// The sawtooth term cuts hard notches into the flank, so the shell reads as banded
// armour with corners rather than as a smooth egg.
float shellW(float t) {
    float w = pow(max(sin(PI * clamp(t, 0.0, 1.0)), 0.0), 0.40);
    w *= 0.66 + 0.58 * smoothstep(0.05, 0.62, t);
    w *= 1.0 + 0.12 * (abs(fract(t * 5.0) - 0.5) * 2.0 - 0.5);
    return 0.105 * w;
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // One loop phase. Every rate below is an integer multiple of it, so the shell
    // and the limb flex wrap seamlessly on an 18 s cycle.
    float ph = fract(TIME / 18.0);

    // Bilateral fold. A terrestrial creature is symmetric about its spine, and the
    // fringe inherits that symmetry because it is built in the folded space.
    vec2  p = vec2(abs(uv.x), uv.y);
    float r = length(uv);
    float sc = bodySz * (1.0 + 0.030 * sin(ph * TAU));
    float mir = sign(uv.x);

    // --- Selector -------------------------------------------------------------
    // Balance decides which creature; loudness only decides how hard it is lit.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum  = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;
    float sel  = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // AUDIO_HAT and AUDIO_KICK already decay, so they are used straight: a hat
    // sharpens the fringe on the transient, a kick armours it.
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);
    // At silence tilt is 0/0, so fade to a chosen resting form instead.
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest, sel, live);

    // One transient control drives the light as well as the geometry: the hat that
    // sharpens an edge also lights its rim.
    float hatF  = 1.0 + 1.6 * snap * AUDIO_HAT;
    float kickF = 1.0 + 1.4 * snap * AUDIO_KICK;

    // --- Studio lighting ------------------------------------------------------
    // Polished stone and metal only read as themselves under a narrow key: the lit
    // strip has to be a strip, with black either side of it. Every exponent below
    // is high for that reason. The key swings over the loop and with the camera,
    // because a highlight that never moves looks painted on.
    float lang = 2.35 + 0.55 * sin(ph * TAU) + 0.90 * CAM_DIR.x;
    vec2  lxy  = vec2(cos(lang), sin(lang)) * 0.74;
    vec3  LK   = normalize(vec3(lxy, 0.58));
    vec3  LF   = normalize(vec3(-lxy, 0.26));

    vec3 OBS  = vec3(0.017, 0.019, 0.028);   // obsidian: carries alpha, not light
    vec3 STL  = vec3(0.66, 0.72, 0.82);      // cool steel
    vec3 BRZ  = vec3(0.60, 0.42, 0.22);      // dark bronze
    vec3 COLD = vec3(0.20, 0.32, 0.52);      // counter-light
    vec3 HOT  = vec3(0.94, 0.98, 1.00);      // specular

    // --- Shared core: the carapace --------------------------------------------
    // This never morphs. Only the fringe does.
    float ty = (uv.y + 0.225 * sc) / (0.420 * sc);
    float W  = shellW(ty) * sc;
    float inShell = step(0.0, ty) * (1.0 - step(1.0, ty));
    float shellMask = (1.0 - smoothstep(W - 0.0022, W + 0.0022, p.x)) * inShell;
    float shellRim  = (1.0 - smoothstep(0.0010, 0.0034, abs(p.x - W))) * inShell;

    // Seven armour bands. Hairline seams, and each plate brightens into its own
    // rear lip: the lip is what makes them read as overlapping rather than drawn.
    float bandK = ty * 7.0 + 0.16 * sin(p.x * 20.0);
    float bandF = fract(bandK);
    float bandH = hash11(floor(bandK) * 2.31 + 0.7);
    float seamMask = 1.0 - smoothstep(0.005, 0.017, min(bandF, 1.0 - bandF));
    float lipMask  = pow(bandF, 7.0);

    // Faceted shell normal, not a dome. The axial tilt sawtooths, resetting at
    // every band seam, and the cross-body tilt steps through three discrete
    // planes. A smooth normal gives one soft chrome smear over the whole shell,
    // which is the look this object is not. Faceting breaks the same light into
    // separate hard chips, one per plate, and the seam lines then sit exactly on
    // the brightness discontinuities they are meant to explain.
    float bn  = clamp(p.x / max(W, 1e-4), 0.0, 1.0);
    float bnF = mix(bn, (floor(bn * 3.0) + 0.5) / 3.0, 0.78);
    // Each plate is tilted its own way about the long axis as well. Without this
    // every plate puts its bright chip in the same column and the seven of them
    // merge back into the single chrome stripe the faceting was meant to break.
    bnF = clamp(bnF + (bandH - 0.5) * 0.24, 0.0, 1.0);
    float bnz = sqrt(max(1.0 - bnF * bnF, 0.0));
    float nyc = (ty - 0.55) * 0.30 + (bandF - 0.5) * (0.95 + 0.30 * bandH);
    vec3  nS  = normalize(vec3(bnF * mir * 1.45, nyc, bnz * 0.72));
    float lamS = clamp(dot(nS, LK), 0.0, 1.0);
    float filS = clamp(dot(nS, LF), 0.0, 1.0);

    // Spine suture, and a paraspinal ridge either side of it.
    float keelMask  = 1.0 - smoothstep(0.0030, 0.0075, p.x);
    float ridgeMask = 1.0 - smoothstep(0.0022, 0.0060, abs(p.x - W * 0.46));

    // A single sheen band travelling head to tail once per loop.
    float sweep = 1.0 - smoothstep(0.0, 0.15, abs(fract(ty - ph + 0.5) - 0.5));

    // Paired eyes, cut as hard lozenges: sharp corners, no soft blob.
    vec2  ep = (p - vec2(0.047 * sc, 0.150 * sc)) / sc;
    float ed = abs(ep.x * 0.80) + abs(ep.y * 1.65);
    float eyeMask = 1.0 - smoothstep(0.0115, 0.0148, ed);
    float eyeHot  = 1.0 - smoothstep(0.0040, 0.0100, ed);

    // The surface is built as one lit material and only then multiplied by the
    // mask, so nothing accumulates past the silhouette and the plates cannot pile
    // into white the way stacked additive glows do.
    vec3 shellSurf = OBS
                   + mix(BRZ, STL, 0.62) * pow(lamS, 4.0) * (0.24 + 0.54 * sheen)
                   + COLD * pow(filS, 5.0) * 0.34
                   + HOT * pow(lamS, 40.0) * (0.26 + 0.54 * sheen);
    shellSurf *= 1.0 + 0.85 * lipMask;                 // plate-to-plate gradient
    shellSurf += STL  * seamMask  * (0.24 + 0.42 * sheen) * kickF;
    shellSurf += mix(BRZ, HOT, 0.55) * keelMask * (0.20 + 0.34 * sheen);
    shellSurf += STL  * ridgeMask * 0.14;
    shellSurf += STL  * sweep * lipMask * (0.10 + 0.26 * sheen);
    shellSurf += HOT  * shellRim  * (0.24 + 0.40 * sheen) * hatF;
    shellSurf += vec3(0.30, 0.80, 1.00) * eyeMask * 0.30 + HOT * eyeHot * 0.85;

    // --- Morphing fringe: nine appendage pairs --------------------------------
    float x0 = sel * 3.0;
    vec3  frCol = vec3(0.0);
    float frCov = 0.0;

    for (int i = 0; i < 9; i++) {
        float fi = float(i);
        float u  = fi / 8.0;                    // 0 at the tail, 1 at the head
        float hj = hash11(fi * 3.77 + 1.3);

        // Per-edge selector. The gradient term makes the change sweep head to
        // tail; the hash keeps that sweep from looking mechanical. Both are
        // static, so at a fixed spectrum the creature holds still: the wave is
        // positioned by the music, never by the clock.
        float xj = clamp(x0 + stagger * (0.66 * (u - 0.5) + 0.34 * (hj - 0.5)),
                         0.0, 3.0);

        // Triangular weights of slope 1.85. Support is 1/1.85 either side of a
        // centre and the centres are spaced 1.0, so neighbours overlap over
        // 2/1.85 - 1 = 0.081 of the axis and the sum is never zero. The slope
        // must stay below 2.0 or the normalisation below divides by nothing.
        // Against a stagger span of 1.05 that leaves under a tenth of the edges
        // mid-morph at any moment: each edge snaps, the fringe turns over
        // gradually.
        float w0 = max(1.0 - abs(xj      ) * 1.85, 0.0);
        float w1 = max(1.0 - abs(xj - 1.0) * 1.85, 0.0);
        float w2 = max(1.0 - abs(xj - 2.0) * 1.85, 0.0);
        float w3 = max(1.0 - abs(xj - 3.0) * 1.85, 0.0);
        float ws = w0 + w1 + w2 + w3;
        w0 /= ws; w1 /= ws; w2 /= ws; w3 /= ws;

        // Parameter-space morph. One blade primitive, seven interpolated numbers,
        // so the silhouette deforms and no fragment ever shows two forms at half
        // alpha. That is why there is no double exposure to hide, and why a
        // fourth archetype costs seven multiply-adds instead of a whole body.
        //           scale      mandible    talon       quill
        float L   = (0.1000 * w0 + 0.1300 * w1 + 0.1560 * w2 + 0.1900 * w3) * sc;
        float bwd = (0.0520 * w0 + 0.0430 * w1 + 0.0270 * w2 + 0.0085 * w3) * sc;
        float tp  =  0.50 * w0 + 0.92 * w1 + 1.18 * w2 + 1.60 * w3;  // taper
        float bd  =  0.04 * w0 + 0.24 * w1 - 0.38 * w2 + 0.06 * w3;  // spine bend
        float sr  =  0.00 * w0 + 0.62 * w1 + 0.26 * w2 + 0.00 * w3;  // serration
        float kl  =  0.90 * w0 + 0.30 * w1 + 0.58 * w2 + 0.85 * w3;  // keel
        float shn =  0.34 * w0 + 0.14 * w1 + 0.66 * w2 + 0.98 * w3;  // stone to chrome

        // Socket on the shell rim, and a rake that turns a fringe into anatomy:
        // the tail pairs sweep back, the head pair reaches forward like mandibles.
        float tyS = mix(0.10, 0.92, u);
        vec2  sk  = vec2(shellW(tyS) * sc * 0.92, (tyS * 0.420 - 0.225) * sc);
        float rk  = mix(-0.58, 0.80, smoothstep(0.40, 0.97, u))
                  + 0.055 * sin(ph * TAU * 2.0 + fi * 1.7);
        vec2  dir = vec2(cos(rk), sin(rk));
        vec2  per = vec2(-dir.y, dir.x);

        vec2  q  = p - sk;
        float al = dot(q, dir);
        float pe = dot(q, per);
        float t  = al / max(L, 1e-4);

        float spine = bd * t * t * L;
        float wpr = bwd * pow(clamp(1.0 - t, 0.0, 1.0), tp);
        wpr *= 1.0 - sr * 0.55 * fract(t * 6.0);      // forward-raked teeth
        float dpe = abs(pe - spine);

        float bladeMask = (1.0 - smoothstep(wpr, wpr + 0.0022, dpe))
                        * step(0.0, al) * (1.0 - smoothstep(0.975, 1.015, t));
        // Metal collar at the joint, sized to whatever the blade currently is.
        float sockMask = 1.0 - smoothstep(bwd * 0.80, bwd * 1.06, length(q));

        // Cross-blade normal, mirrored with the body like the shell's.
        float nx = clamp((pe - spine) / max(wpr, 0.0008), -1.0, 1.0);
        float nz = sqrt(max(1.0 - nx * nx, 0.0));
        vec3  nB = vec3(per * nx, nz);
        nB.x *= mir;

        float lam = clamp(dot(nB, LK), 0.0, 1.0);
        float fil = clamp(dot(nB, LF), 0.0, 1.0);
        float fre = pow(1.0 - nz, 9.0);                   // hairline silhouette
        float keel = (1.0 - smoothstep(0.05, 0.22, abs(nx))) * kl;

        vec3 mtl = mix(BRZ, STL, shn);
        vec3 cB = OBS
                + mtl * pow(lam, 4.0) * (0.34 + 0.72 * sheen) * (0.28 + 0.80 * shn)
                + COLD * pow(fil, 8.0) * 0.16
                + HOT * pow(lam, 52.0) * (0.40 + 0.85 * sheen) * (0.20 + 0.85 * shn) * hatF
                + mix(BRZ, HOT, shn) * keel * (0.14 + 0.26 * sheen)
                + STL * fre * (0.34 + 0.40 * shn) * hatF;
        vec3 cS = mix(BRZ, STL, 0.7) * (0.16 + 0.34 * sheen) + OBS;

        // Composited over, not summed. The loop runs tail to head, so a head-ward
        // scale occludes the one behind it the way real armour does, and nine
        // overlapping plates stay nine plates instead of blowing out to white.
        frCol = mix(frCol, cS, sockMask);
        frCol = mix(frCol, cB, bladeMask);
        frCov = max(frCov, max(sockMask, bladeMask));
    }

    // Shell over fringe, so every socket is hidden under the carapace rim.
    vec3 col = mix(frCol, shellSurf, shellMask);

    // Gentle knee. Only the specular highlights should ever reach it.
    col = col / (1.0 + col * 0.16);

    // Radial safety bound. The worst case is the quill form on the head pair, at
    // full limb flex and the largest shell mass: socket 0.0662, 0.1614 plus a
    // 0.190 blade raked 0.855 rad forward, all scaled by 1.12 * 1.030, which puts
    // the tip at 0.417. That clears the 0.425 knee, so this fade only ever
    // feathers empty space and never slices a point.
    float rim = 1.0 - smoothstep(0.425, 0.482, r);
    col *= rim;

    // Coverage, then premultiply. The obsidian shell is fully opaque where it
    // gives off no light at all: it is a silhouette, not a hole.
    float alpha = max(shellMask, frCov) * rim;
    alpha = smoothstep(0.010, 0.42, alpha);
    alpha = clamp(alpha, 0.0, 1.0);
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
