/*{
  "ADITS": 1,
  "DESCRIPTION": "An incandescent gas ball whose skin resolves into a sprawling web of white-hot filaments: it rests as that filament nova, bass fuses the web into a solid molten bulb, and treble shatters it into a needle-thin shockwave corona.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-23",
  "CATEGORIES": ["generative", "morph", "3d", "audio", "volumetric"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 12.0,
  "INPUTS": [
    { "NAME": "morph_sens", "TYPE": "float", "DEFAULT": 0.85, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Spectral Morph Gain" },
    { "NAME": "morph_rest", "TYPE": "float", "DEFAULT": 0.50, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Rest Archetype" },
    { "NAME": "density",    "TYPE": "float", "DEFAULT": 0.50, "MIN": 0.20, "MAX": 0.85,
      "LABEL": "Plasma Density", "BIND": "bass", "BIND_DEPTH": 0.40 },
    { "NAME": "turbulence", "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.15, "MAX": 0.90,
      "LABEL": "Ridge Turbulence", "BIND": "mid", "BIND_DEPTH": 0.45 },
    { "NAME": "core_heat",  "TYPE": "float", "DEFAULT": 0.72, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Core Incandescence", "BIND": "level", "BIND_DEPTH": 0.50 },
    { "NAME": "filament",   "TYPE": "float", "DEFAULT": 0.62, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Filament Detail", "BIND": "treble", "BIND_DEPTH": 0.45 }
  ]
}*/

#define TAU 6.28318530718
#define PERIOD 12.0

// The field lives in its own units: the plasma shell sits near radius 1.8 and everything
// is contained by BOUND. The camera focal length below is what fits that into the frame,
// so the noise frequencies never have to be rescaled to change the object's screen size.
#define BOUND 3.00

// Accumulation threshold. Density is only gathered where the shelled distance falls under
// this, so H together with the per-archetype shell width sets how thin a filament reads.
#define H 0.10

mat3 rotX(float a) {
    float c = cos(a), s = sin(a);
    return mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c);
}

mat3 rotY(float a) {
    float c = cos(a), s = sin(a);
    return mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c);
}

const mat3 mFBM = mat3(
     0.00,  0.80,  0.60,
    -0.80,  0.36, -0.48,
    -0.60, -0.48,  0.64
);

float hash31(vec3 p) {
    p = fract(p * vec3(443.897, 441.423, 437.195));
    p += dot(p, p.yzx + 19.19);
    return fract((p.x + p.y) * p.z);
}

float noise3D(vec3 p) {
    vec3 ip = floor(p);
    vec3 fp = fract(p);
    fp = fp * fp * (3.0 - 2.0 * fp);

    float n000 = hash31(ip + vec3(0.0, 0.0, 0.0));
    float n100 = hash31(ip + vec3(1.0, 0.0, 0.0));
    float n010 = hash31(ip + vec3(0.0, 1.0, 0.0));
    float n110 = hash31(ip + vec3(1.0, 1.0, 0.0));
    float n001 = hash31(ip + vec3(0.0, 0.0, 1.0));
    float n101 = hash31(ip + vec3(1.0, 0.0, 1.0));
    float n011 = hash31(ip + vec3(0.0, 1.0, 1.0));
    float n111 = hash31(ip + vec3(1.0, 1.0, 1.0));

    float nx00 = mix(n000, n100, fp.x);
    float nx10 = mix(n010, n110, fp.x);
    float nx01 = mix(n001, n101, fp.x);
    float nx11 = mix(n011, n111, fp.x);

    return mix(mix(nx00, nx10, fp.y), mix(nx01, nx11, fp.y), fp.z);
}

// Three octaves is enough: the filament structure comes from the ridged spiral below,
// and the FBM only has to roughen its creases.
float fbm(vec3 p) {
    float f = 0.5000 * noise3D(p); p = mFBM * p * 2.02;
    f += 0.2500 * noise3D(p); p = mFBM * p * 2.03;
    f += 0.1250 * noise3D(p);
    return f;
}

// Animation, audio and per-archetype field parameters
float g_turn;
mat3  g_rot;
float g_reach;
float g_ridge;
float g_detail;
float g_striate;
float g_shell;
float g_fil;
float g_heat;
float g_pulse;
vec3  g_drift;

// Otaviogood's spiral noise. Successive sin/cos waves at rising frequency, rotated as they
// go and rectified with abs, which is exactly what produces the sharp ridged creases the
// shell trick then lights up as filaments.
const float nudge = 4.0;
const float normalizer = 0.242535625; // 1.0 / sqrt(1.0 + 16.0)

float SpiralNoiseC(vec3 p) {
    float n = 0.0;
    float iter = 2.0;
    for (int i = 0; i < 8; i++) {
        n += -abs(sin(p.y * iter) + cos(p.x * iter)) / iter;
        p.xy += vec2(p.y, -p.x) * nudge;
        p.xy *= normalizer;
        p.xz += vec2(p.z, -p.x) * nudge;
        p.xz *= normalizer;
        iter *= 1.733733;
    }
    return n;
}

// Signed field for the plasma. Zero-crossings of this are the surfaces the march lights.
float explosionField(vec3 q) {
    vec3 p = g_rot * q;
    float r = length(p);

    // Differential twist: inner shells lead the outer ones, so the web shears against
    // itself rather than turning as one rigid lump. This is most of what reads as alive.
    // A twist preserves length, so r above is still correct and costs nothing to reuse.
    float tw = g_turn + r * 0.20;
    float cs = cos(tw), sn = sin(tw);
    p.xz = mat2(cs, -sn, sn, cs) * p.xz;

    float d = r - g_reach;

    // Fine billowing roughness, drifting through the domain so the web visibly boils
    // rather than only turning with the rigid tumble.
    d += g_detail * (fbm(p * (2.6 + 2.2 * g_fil) + g_drift) - 0.44);

    // The carver. Its mean is compensated out so the ridge gain changes how far the web
    // sprawls without also inflating the ball out of the frame.
    d += g_ridge * (SpiralNoiseC(p.zxy * 1.14 + 333.0 + g_drift) + 1.15);

    // Pressure wave travelling outward from the core, so the whole volume pumps. Onsets
    // drive its amplitude, which is what puts the hit into the object's shape.
    d += g_pulse * sin(r * 4.6 - g_turn * 3.0);

    // Concentric shockwave rings, the needle archetype's silhouette.
    d += g_striate * 0.34 * cos(r * 5.2 - g_turn * 2.0);

    return d;
}

// Thin wisps read as white-gold hot; stacked depth reads as deep ember red, which is what
// gives the web its sense of occluding itself. Radius then sets the temperature: a
// white-hot nucleus falling through gold and orange to a dark red rim.
vec3 flameColor(float dens, float rad) {
    vec3 c = mix(vec3(1.00, 0.44, 0.095), vec3(0.62, 0.055, 0.015), clamp(dens * 1.9, 0.0, 1.0));

    float k = clamp(rad * 0.42, 0.0, 1.0);
    vec3 temp = mix(vec3(4.10, 1.95, 0.80), vec3(3.75, 0.58, 0.042), smoothstep(0.0, 0.34, k));
    temp = mix(temp, vec3(2.10, 0.150, 0.013), smoothstep(0.34, 1.0, k));

    return c * temp;
}

vec2 iSphere(vec3 ro, vec3 rd, float rad) {
    float b = dot(ro, rd);
    float c = dot(ro, ro) - rad * rad;
    float h = b * b - c;
    if (h < 0.0) return vec2(-1.0);
    h = sqrt(h);
    return vec2(max(-b - h, 0.0), -b + h);
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    g_turn = fract(TIME / PERIOD) * TAU;

    // Spectral morph selector: the balance of the bands, never the clock
    float lo = AUDIO_BASS;
    float md = AUDIO_MID;
    float hi = AUDIO_TREBLE;
    float sumAudio = lo + md + hi + 1e-4;
    float tilt = (md * 0.5 + hi) / sumAudio;

    float selRaw = clamp((tilt - 0.5) * (1.6 + 3.4 * morph_sens) + 0.5, 0.0, 1.0);
    // Onset pulses shove the selector; they are the fastest signals the profile offers
    selRaw = clamp(selRaw + 0.45 * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);

    float isLive = smoothstep(0.02, 0.12, sumAudio);
    float sel = mix(morph_rest, selRaw, isLive);

    // Narrow kernel so the object holds a clean archetype most of the time
    float xw = sel * 2.0;
    float w0 = clamp(1.0 - abs(xw)       * 1.6, 0.0, 1.0);
    float w1 = clamp(1.0 - abs(xw - 1.0) * 1.6, 0.0, 1.0);
    float w2 = clamp(1.0 - abs(xw - 2.0) * 1.6, 0.0, 1.0);
    float ws = w0 + w1 + w2 + 1e-4;
    w0 /= ws; w1 /= ws; w2 /= ws;

    // One field, three parameter sets, so all three archetypes cost a single evaluation.
    //   w0 molten bulb   : short reach, tame ridge, wide shell  -> fused solid fireball
    //   w1 filament nova : mid reach, hard ridge, thin shell    -> sprawling incandescent web
    //   w2 needle corona : long reach, hardest ridge, ring term -> spiked shockwave shell
    g_reach   = 1.98 * w0 + 1.72 * w1 + 1.55 * w2;
    g_ridge   = 0.62 * w0 + 1.06 * w1 + 1.24 * w2;
    g_detail  = 0.58 * w0 + 0.45 * w1 + 0.34 * w2;
    g_striate =                          1.00 * w2;
    g_shell   = 0.028 * w0 + 0.062 * w1 + 0.070 * w2;

    // Shared continuous parameters, so the envelope keeps sliding even mid-blend
    g_reach += 0.13 * sin(g_turn) + 0.07 * sin(g_turn * 2.0) + 0.22 * AUDIO_KICK;
    g_ridge *= 0.78 + 0.44 * turbulence;
    g_shell *= 1.14 - 0.32 * density;
    g_fil = filament;
    g_heat = 0.62 + 1.15 * core_heat + 1.60 * AUDIO_BEAT;
    g_pulse = 0.060 + 0.130 * AUDIO_BEAT + 0.085 * AUDIO_SNARE;

    // One turn per loop on each axis, so the cycle closes exactly. Every rate below is an
    // integer multiple of the loop, and the fastest is 3 cycles per 12 s, which still
    // reads as a pump rather than a strobe when the host clock runs at 10x.
    g_rot = rotY(g_turn) * rotX(g_turn);
    g_drift = vec3(sin(g_turn), cos(g_turn), sin(g_turn * 2.0)) * 0.50
            + vec3(cos(g_turn * 2.0), sin(g_turn * 3.0), cos(g_turn)) * 0.22;

    // Camera follows the host's viewpoint. The focal length is what sizes the object:
    // BOUND projects to about 0.40 in uv, inside the 0.46 silhouette limit.
    const float ORBIT_DIST = 6.0;
    vec3 ro = CAM_DIR * ORBIT_DIST;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 0.66 * ww);

    vec4 sum = vec4(0.0);
    float glow = 0.0;

    vec2 hit = iSphere(ro, rd, BOUND);

    if (hit.y > 0.0) {
        float tEnd = hit.y;

        // Sub-step jitter breaks up banding from the adaptive march
        float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
        float t = hit.x + 0.06 * dither;

        float td = 0.0;

        const int SAMPLES = 64;
        for (int i = 0; i < SAMPLES; i++) {
            vec3 pos = ro + t * rd;
            float lDist = length(pos);

            // Fades the outermost shell so the bounding sphere never cuts a hard circle
            float outer = smoothstep(BOUND, BOUND * 0.84, lDist);

            // The shell trick: folding the signed field through abs turns its interior
            // into a thin skin around every zero-crossing, so the march lights a web of
            // filaments instead of a solid billowing mass.
            float d = max(abs(explosionField(pos)) + g_shell, 0.026);

            float stepLen = max(d * 0.26, 0.016);

            // Bounded radial haze around the core. Confined to the bounding sphere and
            // faded by the same `outer` term, so it can never reach the frame border.
            glow += exp(-lDist * lDist * lDist * 0.16) * outer * stepLen;

            if (d < H) {
                // Local density, strongest on the thinnest part of the shell
                float ld = (H - d) * outer;
                td += (1.0 - td) * ld + 0.005;

                // Sharpened shell centre: the white-hot spine down each filament
                float spine = ld / H;
                spine *= spine;

                vec3 c = flameColor(td, lDist)
                       + vec3(1.90, 0.70, 0.14) * g_heat * exp(-lDist * lDist * 2.80)
                       + vec3(3.30, 1.10, 0.18) * g_heat * spine * 0.62;

                float a = td * 0.27 * outer;
                sum += vec4(c * a, a) * (1.0 - sum.a);
            }

            // Ray-length fog, weighted by distance travelled so it does not depend on how
            // many steps the adaptive march happened to take
            td += stepLen * 0.06;

            if (td > 0.95 || sum.a > 0.99) break;

            t += stepLen;
            if (t > tEnd) break;
        }
    }

    // Additive haze, weighted by the same falloff that produced it, so coverage stays
    // localised to the object exactly as its colour does
    vec3 col = sum.rgb + vec3(1.00, 0.34, 0.085) * glow * 0.44;
    float alpha = clamp(sum.a + glow * 0.14, 0.0, 1.0);

    // Safety mask: reaches zero at 0.42, well inside the visible frame edge at 0.50
    float boundMask = smoothstep(0.465, 0.42, length(uv));
    col *= boundMask;
    alpha *= boundMask;

    // ACES tone mapping, then gamma, then premultiply
    col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);
    col = clamp(col, 0.0, 1.0);
    col = pow(col, vec3(0.4545));
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
