/*{
  "ADITS": 1,
  "DESCRIPTION": "A bioluminescent mushroom seen from below, its gills spinning around a stem of light, and the spectrum chooses the species: a heavy ember toadstool with cream freckles when the bass owns the mix, a wide scalloped teal parasol through the low mids, a tall violet bell pitted like a honeycomb through the high mids, and an ivory lion's-mane hung with a curtain of glowing spines when the treble takes over. It rests as the ember toadstool.",
  "CREDIT": "claude-sonnet-5-5",
  "DATE": "2026-10-02",
  "CATEGORIES": ["generative", "morph", "botanical", "bioluminescent", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "low",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "sens",  "TYPE": "float", "DEFAULT": 0.80, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Morph Sensitivity" },
    { "NAME": "snap",  "TYPE": "float", "DEFAULT": 0.26, "MIN": 0.05, "MAX": 0.34,
      "LABEL": "Onset Snap" },
    { "NAME": "bias",  "TYPE": "float", "DEFAULT": 0.00, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Silence Species" },
    { "NAME": "size",  "TYPE": "float", "DEFAULT": 1.00, "MIN": 0.90, "MAX": 1.08,
      "LABEL": "Overall Size", "BIND": "bass", "BIND_DEPTH": 0.60 },
    { "NAME": "lume",  "TYPE": "float", "DEFAULT": 0.62, "MIN": 0.25, "MAX": 1.00,
      "LABEL": "Glow", "BIND": "level", "BIND_DEPTH": 0.50 },
    { "NAME": "spore", "TYPE": "float", "DEFAULT": 0.30, "MIN": 0.05, "MAX": 1.00,
      "LABEL": "Spore Light", "BIND": "treble", "BIND_DEPTH": 0.80 }
  ]
}*/

#define TAU 6.28318530718
#define PERIOD 16.0

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    return fract(p * (p + p));
}

float hash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

// Smooth kernel, one per species, centres 1.0 apart on the selector axis (§12.6).
float kern(float x, float c) {
    return smoothstep(0.0, 1.0, 1.0 - abs(x - c) * 1.5);
}

// Weight of the fourth species alone, evaluated at a per-spine selector offset.
float lastWeight(float x) {
    float a = kern(x, 0.0);
    float b = kern(x, 1.0);
    float c = kern(x, 2.0);
    float d = kern(x, 3.0);
    return d / (a + b + c + d + 1e-4);
}

vec3 mix4(vec4 w, vec3 a, vec3 b, vec3 c, vec3 d) {
    return a * w.x + b * w.y + c * w.z + d * w.w;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    float AA = 1.5 / RENDERSIZE.y;

    float ph    = fract(TIME / PERIOD);
    float phase = ph * TAU;

    // ---- Audio, shaped with a soft knee (§11.9) ---------------------------------
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float km = smoothstep(0.04, 0.95, md);

    // ---- Selector: the balance of the three bands (§12.2 to §12.4) --------------
    float sum  = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;
    float x    = (tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5;
    float live = smoothstep(0.02, 0.12, max(lo + md + hi, AUDIO_LEVEL));
    x = mix(bias, x, live);
    x += snap * (AUDIO_HAT - AUDIO_KICK);
    float sel = smoothstep(0.0, 1.0, x);

    // ---- Weights ------------------------------------------------------------------
    float sx = sel * 3.0;
    vec4 W = vec4(kern(sx, 0.0), kern(sx, 1.0), kern(sx, 2.0), kern(sx, 3.0));
    W /= (W.x + W.y + W.z + W.w + 1e-4);

    // ---- Shared object space ------------------------------------------------------
    float sc = size * (1.0 + 0.018 * sin(phase * 2.0));
    vec2 p0 = uv / sc;
    p0.y += 0.014 * AUDIO_KICK;                       // recoil, returns on its own

    float em = 0.50 + 0.90 * lume;

    // ---- Parameters, interpolated by weight (§12.6) ------------------------------
    float Rc    = dot(W, vec4(0.330, 0.365, 0.170, 0.250));
    float Hc    = dot(W, vec4(0.160, 0.085, 0.310, 0.150));
    float kk    = dot(W, vec4(0.270, 0.210, 0.170, 0.250));
    float taper = dot(W, vec4(0.000, 0.000, 0.520, 0.120));
    float yr    = dot(W, vec4(0.090, 0.130, 0.030, 0.190));
    float wTop  = dot(W, vec4(0.040, 0.016, 0.024, 0.030));
    float wBot  = dot(W, vec4(0.060, 0.028, 0.046, 0.042));
    float ruf   = dot(W, vec4(0.030, 0.050, 0.000, 0.040)) * (1.0 + 0.8 * km);
    float rho   = dot(W, vec4(0.300, 0.150, 0.440, 0.130));
    float hubR  = dot(W, vec4(0.046, 0.034, 0.040, 0.030));
    float yb    = -0.37;

    vec3 capB  = mix4(W, vec3(0.085, 0.012, 0.022), vec3(0.008, 0.055, 0.065),
                         vec3(0.045, 0.015, 0.085), vec3(0.110, 0.090, 0.060));
    vec3 spotC = mix4(W, vec3(1.00, 0.80, 0.62), vec3(0.35, 1.00, 0.92),
                         vec3(1.00, 0.38, 0.86), vec3(1.00, 0.93, 0.65));
    vec3 rimC  = mix4(W, vec3(1.00, 0.28, 0.14), vec3(0.10, 0.85, 1.00),
                         vec3(0.72, 0.32, 1.00), vec3(1.00, 0.86, 0.50));
    vec3 gillC = mix4(W, vec3(1.00, 0.52, 0.10), vec3(0.30, 1.00, 0.68),
                         vec3(1.00, 0.30, 0.72), vec3(1.00, 0.93, 0.70));
    vec3 stemC = mix4(W, vec3(1.00, 0.72, 0.40), vec3(0.55, 1.00, 0.92),
                         vec3(0.85, 0.55, 1.00), vec3(1.00, 0.95, 0.82));

    vec3  col = vec3(0.0);
    float cov = 0.0;

    // ---- Halo, bounded well inside the frame ---------------------------------------
    vec2  hd   = p0 - vec2(0.0, yr);
    float halo = 0.0030 / (dot(hd, hd) + 0.012) * (1.0 - smoothstep(0.20, 0.46, length(uv)));
    col += gillC * halo * 0.30 * em;
    cov  = clamp(halo * 0.22, 0.0, 0.30);

    // ---- Cap dome ----------------------------------------------------------------------
    vec2  pc = p0 - vec2(0.0, yr);
    float sH = clamp(pc.y / Hc, 0.0, 1.0);
    float Rx = Rc * (1.0 - taper * sH * sH);
    vec2  q  = vec2(pc.x / Rx, pc.y / Hc);
    float ql = length(q);
    float gd = length(vec2(q.x / Rx, q.y / Hc)) / max(ql, 1e-3);
    float dDome = (ql - 1.0) / max(gd, 1e-2);
    float mDome = (1.0 - smoothstep(-AA, AA, dDome)) * smoothstep(-0.006, 0.004, pc.y);
    float nz    = sqrt(max(1.0 - ql * ql, 0.0));
    float rimL  = pow(1.0 - nz, 3.0);
    float lon   = atan(q.x, max(nz, 1e-3));

    // Freckles, or a honeycomb net on the bell: one cell field, two read-outs.
    vec2 cu = vec2((lon + phase) * (24.0 / TAU), asin(clamp(q.y, 0.0, 0.999)) * 3.82);
    cu.x += 0.5 * mod(floor(cu.y), 2.0);
    vec2  cid = vec2(mod(floor(cu.x), 24.0), floor(cu.y));
    vec2  cj  = (vec2(hash21(cid + 3.1), hash21(cid + 9.7)) - 0.5) * 0.30 * (1.0 - W.z);
    float sd  = length(fract(cu) - 0.5 - cj);
    float rhoI = rho * (0.75 + 0.50 * hash21(cid + 1.7));
    float fillS = 1.0 - smoothstep(rhoI - 0.08, rhoI, sd);
    float ringS = 1.0 - smoothstep(0.0, 0.09, abs(sd - rhoI));
    float spotM = mix(fillS, ringS, W.z);

    // A slow lamp of sheen sweeping round the dome. Whole turns per loop.
    float sheen = pow(max(cos(lon * 2.0 + phase), 0.0), 10.0) * nz;
    float spill = smoothstep(0.55, 0.0, q.y);

    vec3 domeCol = capB * (0.50 + 0.90 * nz)
                 + spotC * spotM * (0.55 + 0.70 * nz) * (0.70 + 0.80 * spore) * em
                 + rimC * rimL * (0.90 + 2.00 * AUDIO_SNARE) * em
                 + mix(rimC, vec3(1.0), 0.5) * sheen * 0.22 * em
                 + gillC * spill * 0.35 * em;
    col = mix(col, domeCol, mDome);
    cov = cov + mDome * (1.0 - cov);

    // ---- Hanging spines (fourth species), staggered across the selector (§12.6) ----
    float pitch = 0.020;
    float sid   = floor(p0.x / pitch);
    float scx   = (sid + 0.5) * pitch;
    float shs   = hash11(sid * 1.93 + 4.7);
    float xi    = clamp(sx + 1.3 * (shs - 0.5), 0.0, 3.0);
    float wsp   = lastWeight(xi);
    float cf    = clamp(1.0 - (scx / Rc) * (scx / Rc), 0.0, 1.0);
    float y0    = yr - kk * Rc * sqrt(cf) * 0.92;
    float Ls    = 0.40 * wsp * (0.40 + 0.60 * shs) * (0.45 + 0.55 * sqrt(cf)) * smoothstep(0.0, 0.10, cf);
    float sS    = (y0 - p0.y) / max(Ls, 1e-3);
    float swayA = 0.0015 + 0.0025 * km;
    float xs    = scx + swayA * sin(phase + sid * 1.7 + sS * 2.0);
    float hw    = 0.0048 * pow(max(1.0 - sS, 0.0), 0.7) + 0.0006;
    float mSp   = (1.0 - smoothstep(hw - AA, hw + AA, abs(p0.x - xs)))
                * smoothstep(-0.002, 0.004, sS) * (1.0 - smoothstep(0.96, 1.0, sS))
                * smoothstep(0.010, 0.030, Ls);
    float spFl  = smoothstep(0.55, 1.0, hash11(sid * 2.71 + 0.9)) * AUDIO_HAT;
    vec3  spCol = vec3(1.0, 0.92, 0.70) * (0.40 + 0.80 * sS) * (0.80 + 1.4 * spFl) * em
                + vec3(1.0, 0.98, 0.85) * smoothstep(0.82, 1.0, sS) * 0.9 * em;
    col = mix(col, spCol, mSp);
    cov = cov + mSp * (1.0 - cov);

    // ---- Gill disc: the underside, a circle squashed by the upward tilt -------------
    vec2  dq  = vec2(p0.x, (p0.y - yr) / kk) / Rc;
    float rd  = length(dq);
    float ang = atan(dq.y, dq.x);
    float Rr  = 1.0 + ruf * cos(11.0 * ang + phase);
    float gr  = length(vec2(dq.x, dq.y / kk)) / (max(rd, 1e-3) * Rc);
    float dDisc = (rd - Rr) / max(gr, 1e-2);
    float mDisc = 1.0 - smoothstep(-AA, AA, dDisc);

    float ga   = (ang + phase) * (48.0 / TAU);
    float gi   = floor(ga);
    float gc   = abs(fract(ga) - 0.5);
    // Where the lamellae pack tighter than a few pixels, fade to their mean so they never alias.
    float gsp  = (TAU / 48.0) * Rc * sqrt(dq.y * dq.y + kk * kk * dq.x * dq.x);
    float gfa  = smoothstep(1.2 / RENDERSIZE.y, 3.5 / RENDERSIZE.y, gsp);
    float lamL = mix(0.45, smoothstep(0.30, 0.48, gc), gfa);
    float r0   = 0.16 + 0.26 * mod(gi, 2.0);
    float gVis = smoothstep(r0, r0 + 0.08, rd);
    float gGrd = 0.35 + 0.65 * smoothstep(0.10, 1.00, rd);
    float gFl  = smoothstep(0.55, 1.0, hash11(gi * 1.37 + 2.1)) * AUDIO_HAT;
    float edge = 1.0 - smoothstep(0.0, 0.05, abs(rd - Rr));

    vec3 discCol = capB * 0.55
                 + gillC * lamL * gVis * gGrd * (0.95 + 2.0 * gFl) * em
                 + gillC * (1.0 - lamL) * gVis * gGrd * 0.12 * em
                 + rimC * edge * (0.9 + 1.4 * AUDIO_SNARE) * em;
    discCol *= mix(0.40, 1.0, smoothstep(0.04, 0.22, rd));
    col = mix(col, discCol, mDisc);
    cov = cov + mDisc * (1.0 - cov);

    // ---- Stem: a lathe, shaded as a cylinder ---------------------------------------------
    float tS = clamp((p0.y - yb) / (yr - yb), 0.0, 1.0);
    float wS = mix(wBot, wTop, smoothstep(0.0, 1.0, tS)) * (1.0 + 0.9 * exp(-tS * 10.0))
             * (1.0 + 0.10 * km * sin(tS * 14.0 - phase * 2.0));
    float mStem = (1.0 - smoothstep(wS - AA, wS + AA, abs(p0.x)))
                * smoothstep(yb - 0.02, yb + 0.01, p0.y) * (1.0 - smoothstep(yr - 0.002, yr + 0.006, p0.y));
    float nxs  = p0.x / max(wS, 1e-3);
    float nzs  = sqrt(max(1.0 - nxs * nxs, 0.0));
    float lon2 = atan(nxs, max(nzs, 1e-3)) + phase;
    float vn   = abs(fract(lon2 * (5.0 / TAU) + 0.35 * sin(tS * 6.0)) - 0.5);
    float vein = 1.0 - smoothstep(0.0, 0.09, vn);
    float bnd  = fract(tS * 6.0 - ph * 2.0);
    float band = smoothstep(0.72, 0.92, bnd) * (1.0 - smoothstep(0.92, 1.0, bnd));

    vec3 stemCol = stemC * (0.10 + 0.34 * nzs) * em
                 + mix(stemC, vec3(1.0), 0.45) * exp(-nxs * nxs * 12.0) * 0.55 * em
                 + stemC * vein * 0.55 * em
                 + rimC * pow(1.0 - nzs, 2.5) * 0.9 * em
                 + vec3(1.0, 0.97, 0.88) * band * (0.35 + 1.30 * AUDIO_KICK) * em;
    col = mix(col, stemCol, mStem);
    cov = cov + mStem * (1.0 - cov);

    // ---- Neon bloom hugging the whole silhouette, outside only ------------------------------
    float dBody = min(dDisc, pc.y > 0.0 ? dDome : 1.0);
    float dStem = mix(1.0, abs(p0.x) - wS, smoothstep(yb, yb + 0.03, p0.y) * (1.0 - smoothstep(yr - 0.01, yr, p0.y)));
    float dAll  = min(dBody, dStem);
    float bloom = exp(-max(dAll, 0.0) * 34.0) * (1.0 - cov);
    col += mix(rimC, gillC, 0.5) * bloom * 0.38 * em;
    cov  = cov + bloom * 0.45 * (1.0 - cov);

    // ---- Shared core: mycelial mound and the luminous knot at the stem top ----------------
    vec2  mq   = vec2(p0.x / 0.13, (p0.y - yb + 0.004) / 0.04);
    float mm   = length(mq);
    float mMound = (1.0 - smoothstep(0.80, 1.00, mm)) * smoothstep(-0.01, 0.01, p0.y - yb + 0.03);
    vec3  moundCol = stemC * (0.30 + 0.70 * exp(-mm * mm * 1.6)) * em;
    col = mix(col, moundCol, mMound);
    cov = cov + mMound * (1.0 - cov);

    float hdist = length(p0 - vec2(0.0, yr));
    float hub   = 1.0 - smoothstep(hubR * 0.65, hubR, hdist);
    float hubG  = exp(-hdist * hdist / (hubR * hubR * 3.5));
    col = mix(col, vec3(1.0, 0.97, 0.88) * (1.0 + 0.8 * AUDIO_KICK), hub);
    col += gillC * hubG * 0.45 * em;
    cov  = cov + max(hub, hubG * 0.5) * (1.0 - cov);

    // ---- Drifting spores. Count is fixed; treble sets how bright they burn. ---------------------
    float motes = 0.0;
    for (int i = 0; i < 14; i++) {
        float fi  = float(i);
        float hh  = hash11(fi * 3.17 + 1.3);
        float cyc = fract(ph * 2.0 + fi / 14.0);
        float my  = mix(yr + 0.04, 0.43, cyc);
        float mx  = (hh - 0.5) * 0.52 * (0.35 + 0.65 * cyc) + 0.02 * sin(phase * 2.0 + fi * 1.9);
        vec2  dm  = p0 - vec2(mx, my);
        float fade = smoothstep(0.0, 0.12, cyc) * (1.0 - smoothstep(0.6, 1.0, cyc));
        float tw   = 0.55 + 0.45 * sin(phase * 3.0 + fi * 5.1);
        motes += fade * tw * 0.00004 / (dot(dm, dm) + 0.00003);
    }
    motes *= 0.30 + 1.00 * spore;
    col += mix(spotC, vec3(1.0), 0.5) * motes * em;
    cov  = cov + clamp(motes * 0.8, 0.0, 1.0) * (1.0 - cov);

    // Soft knee, then the radial safety bound: nothing reaches the frame edge.
    col = col / (1.0 + col * 0.22);
    float ef = (1.0 - smoothstep(0.40, 0.478, abs(uv.x))) * (1.0 - smoothstep(0.40, 0.478, abs(uv.y)));
    col *= ef;

    float alpha = clamp(cov * ef, 0.0, 1.0);
    col *= alpha;
    gl_FragColor = vec4(col, alpha);
}
