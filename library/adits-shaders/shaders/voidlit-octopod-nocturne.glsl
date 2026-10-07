/*{
  "ADITS": 1,
  "DESCRIPTION": "An eight-armed deep-sea cephalopod in obsidian biomech with bright rim light, the spectrum morphing it between a furled bass-heavy knot, a drifting octopus with photophore suckers travelling out along each arm, and a long thin treble lash nova. Bass swells the mantle, mid writhes the arms, treble lights the suckers, and every beat flashes the glossy hood. It rests as the drifting octopus.",
  "CREDIT": "claude-opus-4-8",
  "DATE": "2026-10-02",
  "CATEGORIES": ["generative", "morph", "biomech", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "low",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "sens",   "TYPE": "float", "DEFAULT": 0.80, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Morph Sensitivity" },
    { "NAME": "snap",   "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.05, "MAX": 1.00,
      "LABEL": "Onset Snap" },
    { "NAME": "bias",   "TYPE": "float", "DEFAULT": 0.46, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Silence Form" },
    { "NAME": "size",   "TYPE": "float", "DEFAULT": 1.00, "MIN": 0.88, "MAX": 1.16,
      "LABEL": "Overall Size", "BIND": "bass", "BIND_DEPTH": 0.50 },
    { "NAME": "writhe", "TYPE": "float", "DEFAULT": 0.38, "MIN": 0.10, "MAX": 0.90,
      "LABEL": "Arm Writhe", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "detail", "TYPE": "float", "DEFAULT": 0.45, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Sucker Sparkle", "BIND": "treble", "BIND_DEPTH": 0.50 }
  ]
}*/

#define TAU 6.28318530718

// Smooth a clamped triangular weight without widening it (guide §12.6).
float ease(float w) {
    return w * w * (3.0 - 2.0 * w);
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // The only TIME read in the file. It drives the slow precession, the wave
    // travelling out along the arms, and the mantle breath. It never touches the
    // morph: which creature this is belongs to the music, not to the clock.
    float ph = fract(TIME / 16.0);
    float turn   = ph * TAU;            // one slow precession per loop (k = 1)
    float travel = ph * TAU * 2.0;      // wave travelling out along the arms (k = 2)
    float breath = sin(ph * TAU);       // gentle mantle breath (k = 1)

    float r = length(uv);
    float a = atan(uv.y, uv.x);         // one atan for the frame, none in a loop

    // Angular fold into eight sectors. cell is 0 on an arm centreline, and the
    // count is a fixed integer so the fold never seams at the atan wrap.
    float sector = TAU / 8.0;
    float aArm   = a + turn;
    float cell   = mod(aArm + sector * 0.5, sector) - sector * 0.5;

    // ---- Selector (guide §12.2) ----------------------------------------------
    // Balance decides which creature; loudness only decides how hard it burns.
    // The four recorded band levels are used, not AUDIO_BANDS slots, so an
    // offline export picks the same archetype the live preview did.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum  = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;              // 0 all bass, 1 all treble

    // §12.3: tilt is a ratio of three smoothed averages, so it swings far less
    // than any single band. Expanded hard around the rest point, then the onset
    // shove is added BEFORE the soft saturation so a hit eases on instead of
    // slamming a clamp. The shove at MAX moves x by half the axis, one
    // archetype's spacing for three archetypes (guide §12.4).
    float x = (tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5;
    x += snap * 0.5 * (AUDIO_HAT - AUDIO_KICK);
    float sel = smoothstep(0.0, 1.0, x);

    // §12.7: at silence every audio uniform is 0.0 and tilt is 0/0, so fade to a
    // chosen resting form. AUDIO_LEVEL's auto-gain keeps the live selector in
    // charge on quiet masters while still falling to zero in true silence.
    float live = smoothstep(0.02, 0.12, max(lo + md + hi, AUDIO_LEVEL));
    sel = mix(bias, sel, live);

    // ---- Weights (guide §12.6) -----------------------------------------------
    // Three archetypes at x2 = 0, 1, 2. A smooth kernel of slope 1.72 leaves each
    // a plateau and holds the crossfade to a sixth of the axis, so the object is
    // a clean creature most of the time rather than a double exposure.
    float x2 = sel * 2.0;
    float w0 = ease(clamp(1.0 - abs(x2)       * 1.72, 0.0, 1.0));
    float w1 = ease(clamp(1.0 - abs(x2 - 1.0) * 1.72, 0.0, 1.0));
    float w2 = ease(clamp(1.0 - abs(x2 - 2.0) * 1.72, 0.0, 1.0));
    float ws = w0 + w1 + w2 + 1e-4;
    w0 /= ws; w1 /= ws; w2 /= ws;

    // ---- One arm primitive, morphed by its numbers (guide §12.6) -------------
    // Every number below interpolates with the weights, so a 50/50 blend is a
    // real in-between arm, not two arms shown at half alpha.
    //                  furl        drift       lash
    float lenMul = 0.25 * w0 + 0.33 * w1 + 0.38 * w2;    // short knot -> long lash
    float gauge  = 0.045 * w0 + 0.026 * w1 + 0.015 * w2; // thick -> hair thin
    float wavM   = 0.50 * w0 + 1.00 * w1 + 0.45 * w2;    // writhe peaks mid
    float beads  = 5.0 * w0 + 8.0 * w1 + 14.0 * w2;      // few fat -> many fine

    // Shared envelope: slides continuously across the whole selector range, so
    // even mid-blend the silhouette is visibly moving. size is bound to bass
    // loudness, a separate job from the bass share that picks the archetype.
    float sc      = size * (1.0 + 0.03 * breath);
    float Larm    = sc * lenMul;
    float mantleR = sc * mix(0.135, 0.078, sel) * (1.0 + 0.16 * cos(cell * 8.0));

    // Lateral S-bend of the arm centreline: audio sets how far it swings, TIME
    // sets where in the swing it is (guide §11.10). This is the living writhe.
    float wav = writhe * 0.12 * wavM * sin(r * 7.0 - travel);
    float sd  = abs(cell * r - wav);                 // distance from the centreline

    float t   = r / max(Larm, 1e-3);                 // 0..1 out along the arm
    float wd  = gauge * (1.0 - 0.6 * clamp(t, 0.0, 1.0));
    float armMask = smoothstep(mantleR * 0.60, mantleR * 1.05, r)
                  * (1.0 - smoothstep(Larm * 0.88, Larm, r));
    float armBody = (1.0 - smoothstep(wd, wd + 0.0045, sd)) * armMask;
    float armRim  = (1.0 - smoothstep(0.0015, 0.0045, abs(sd - wd))) * armMask;

    // Photophore suckers riding outward along the arm: a slow conveyor the
    // treble only brightens, never jitters.
    float bval    = fract(t * beads - travel * 0.5);
    float beadDot = smoothstep(0.46, 0.50, bval) * smoothstep(0.54, 0.50, bval);
    float bead    = beadDot * armBody;

    // ---- Mantle fields -------------------------------------------------------
    float mBody = 1.0 - smoothstep(mantleR - 0.006, mantleR + 0.006, r);
    float mRim  = 1.0 - smoothstep(0.0020, 0.0070, abs(r - mantleR));

    // ---- Shared core and eyes (guide §12.6) ----------------------------------
    // Unweighted, so the centre of the frame never thins out during a blend.
    float nucR = sc * mix(0.050, 0.032, sel);
    float nuc  = 1.0 - smoothstep(nucR * 0.6, nucR, r);
    float core = (0.0016 / (dot(uv, uv) + 0.0022))
               * (1.0 - smoothstep(0.02, 0.14, r));

    // Two photophore eyes riding the hood as it precesses.
    float er  = sc * mix(0.092, 0.060, sel);
    float eyH = 0.62;
    vec2 e0 = er * vec2(cos(turn + 1.5708 + eyH), sin(turn + 1.5708 + eyH));
    vec2 e1 = er * vec2(cos(turn + 1.5708 - eyH), sin(turn + 1.5708 - eyH));
    float eyes = 0.00032 / (dot(uv - e0, uv - e0) + 0.00045)
               + 0.00032 / (dot(uv - e1, uv - e1) + 0.00045);

    // One onset read straight in the body: a beat flashes the glossy hood and
    // the core. It already decays, so it is used as a multiplier with a floor
    // that keeps the creature fully lit in silence (guide §11.5, §11.6).
    float flash = AUDIO_BEAT;

    // Overall energy drives the arms' luminance, the one quantity the three
    // bound bands leave alone. AUDIO_LEVEL has auto-gain so a quiet master lifts
    // it too; the soft knee kills the idle shimmer and lands silence on the
    // finished default, and the sub-one power keeps soft passages visible
    // (guide §11.9, §11.13).
    float energy = pow(smoothstep(0.05, 0.95, AUDIO_LEVEL), 0.7);

    // ---- Palette: obsidian biomech sliding to acid neon, bass -> treble ------
    vec3 obsid = vec3(0.035, 0.052, 0.070);
    vec3 cyan  = vec3(0.22, 0.86, 1.00);
    vec3 mag   = vec3(0.98, 0.25, 0.80);
    vec3 acid  = vec3(0.55, 1.00, 0.42);
    vec3 white = vec3(0.92, 1.00, 1.00);

    float warm    = smoothstep(0.40, 1.00, sel);     // dark drift -> acid lash
    vec3  armFill = mix(obsid, acid, warm);
    float armEmit = (mix(0.90, 1.45, sel) + 0.55 * smoothstep(0.62, 1.0, sel))
                  * (1.0 + 1.05 * energy);
    vec3  rimCol  = mix(cyan, white, smoothstep(0.50, 1.00, sel));
    vec3  beadCol = mix(mag, white, warm);

    vec3 col = vec3(0.0);
    col += armFill * armBody * armEmit;
    col += rimCol  * armRim  * (0.80 + 0.70 * detail) * (1.0 + 0.9 * energy);
    col += beadCol * bead    * (0.55 + 1.70 * detail) * (1.0 + 1.1 * energy);
    col += obsid * 1.20 * mBody;
    col += mix(cyan, white, 0.35) * mRim * (0.70 + 0.70 * flash);
    col += white * nuc * (0.80 + 0.80 * flash);
    col += mix(cyan, white, 0.50) * core * (0.40 + 0.80 * flash);
    col += mix(cyan, white, 0.60) * eyes * (0.70 + 0.60 * energy);

    // Localised coverage: every term carries the same spatial mask its colour
    // does, so the object never spreads into a full-frame veil (guide §8).
    float aCov = armBody * 0.90 + armRim * 0.60 + bead * 0.55
               + mBody * 1.00 + mRim * 0.55
               + nuc * 0.95 + core * 0.40 + eyes * 0.50;

    // Soft tonemap so the acid lash and the beat flash roll off instead of
    // clipping to white.
    col = col / (1.0 + col * 0.25);

    // Radial safety bound. uv reaches only 0.5 on the axes, so the longest lash
    // (0.38 * 1.16 * 1.03 breath = 0.454 at the extreme) fades here, inside the
    // frame edge, instead of being sliced. render reports edge as 0.
    float rim = 1.0 - smoothstep(0.420, 0.478, r);
    col *= rim;

    // Coverage, then premultiply. Zero everywhere the creature is not.
    float alpha = smoothstep(0.015, 0.90, aCov) * rim;
    alpha = clamp(alpha, 0.0, 1.0);
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
