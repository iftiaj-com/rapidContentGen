import { hexToVec3 } from './anam-utils.js';
// Static `?url` import, NOT `new URL(literal, import.meta.url)`. The latter makes
// Vite splice a placeholder into THIS file's own source, and the obfuscator's code
// generator re-emits it with the other quote character, which makes Vite's later
// plain-text substitution miss and breaks the prod build. Measured at 60/60 runs.
// `?url` routes the placeholder into a separate synthesized module (id ends in
// `.png?url`, not `.js`) that the obfuscator's include glob never sees.
import SMOKE_URL from '../../assets/visuals/smoke.png?url';

// ── Smoke: drifting smoke sprites (port of the "THE FOG" three.js pen) ────────
// SMOKE
// The pen spawns 60 textured planes, GSAP-tweens each one upward over 30–45 s
// while it grows 0.6→4 and fades in then out, and respawns it at the bottom via
// an onComplete. Here that lifecycle is closed-form per frame instead (see
// tick()) so it is frame-rate independent, survives pause/scrub, and leaves
// no timelines to leak when the environment is switched. All sprites share ONE
// InstancedMesh — one draw call instead of 60 — with per-instance alpha + tint.
// Half-depth of the column, in world units. The host's _fitObject() normalizes
// every model to a 2-unit box at the origin, so a ±1.5 spread centred on z = 0
// puts the model squarely INSIDE the fog with puffs on both sides of it.
const SMOKE_DEPTH = 1.5;
// Extra instances appended after the puffs: huge, near-static, very faint sprites
// that stand in for the residual room haze the reference video is left swimming in
// once the plume itself has dispersed.
const SMOKE_HAZE = 3;

const SMOKE_VERTEX_SHADER = `
    attribute float aAlpha;
    attribute vec3 aTint;
    varying vec2 vUv;
    varying float vAlpha;
    varying vec3 vTint;

    void main() {
        vUv = uv;
        vAlpha = aAlpha;
        vTint = aTint;
        // three auto-provides instanceMatrix for an InstancedMesh, ShaderMaterial included.
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    }
`;

const SMOKE_FRAGMENT_SHADER = `
    uniform sampler2D uTex;
    uniform float uGlow;
    varying vec2 vUv;
    varying float vAlpha;
    varying vec3 vTint;

    void main() {
        // smoke.png is white-on-black with no usable alpha channel, so read its
        // luminance as the density mask — the same .g channel three's own
        // alphaMap path uses.
        float d = texture2D(uTex, vUv).g;
        float a = d * vAlpha;
        if (a < 0.004) discard;   // skip the huge transparent border of the sprite
        // Thin wisps read greyer than dense cores — the reference fog is only pure
        // white where it is thick enough to bounce back all the room light.
        gl_FragColor = vec4(vTint * mix(0.68, 1.0, d) * (1.0 + uGlow * d), a);
    }
`;

// ── Mist: camera-locked ground-fog dome (port of the "Mist.js" reference pen) ──
// MIST
// The pen's core trick: a huge quad is parented to the CAMERA (not world space)
// and forced to the far depth plane in the vertex shader, so it always exactly
// fills the frustum and always paints behind every other object — a raymarched-
// looking backdrop for the price of one full-screen shader pass. Its fragment
// shader gates a 3D FBM noise field by the view direction's angle from world
// "up": near-zero at the zenith (looking up), full strength toward the nadir
// (looking down). That is the ENTIRE reason the fog stays low no matter how the
// camera orbits — it is a property of the view angle, not a screen-space
// gradient, so it can't be scrolled off the bottom by parallax or a slider.
// _buildMist() attaches it directly to the host's camera for exactly that
// reason — see its doc comment for why it deliberately bypasses _envGroup.
const MIST_VERTEX_SHADER = `
    varying vec3 vWorldPosition;

    void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position.z = gl_Position.w;   // pin to the far plane — always paints behind everything
    }
`;

const MIST_FRAGMENT_SHADER = `
    uniform vec3 uUp;
    uniform float uTime;
    uniform float uDensity;
    uniform float uGlow;
    uniform vec3 uColorA;
    uniform vec3 uColorB;
    varying vec3 vWorldPosition;

    // Simplex 3D noise — Ian McEwan / Stefan Gustavson (github.com/stegu/webgl-noise), MIT.
    vec4 mod289_4(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec3 mod289_3(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 permute4(vec4 x) { return mod289_4(((x * 34.0) + 1.0) * x); }
    vec4 taylorInvSqrt4(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

    float snoise(vec3 v) {
        const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
        const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
        vec3 i  = floor(v + dot(v, C.yyy));
        vec3 x0 = v - i + dot(i, C.xxx);
        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min(g.xyz, l.zxy);
        vec3 i2 = max(g.xyz, l.zxy);
        vec3 x1 = x0 - i1 + 1.0 * C.xxx;
        vec3 x2 = x0 - i2 + 2.0 * C.xxx;
        vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
        i = mod289_3(i);
        vec4 p = permute4(permute4(permute4(
                   i.z + vec4(0.0, i1.z, i2.z, 1.0))
                 + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                 + i.x + vec4(0.0, i1.x, i2.x, 1.0));
        float n_ = 1.0 / 7.0;
        vec3 ns = n_ * D.wyz - D.xzx;
        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_);
        vec4 x = x_ * ns.x + ns.yyyy;
        vec4 y = y_ * ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);
        vec4 b0 = vec4(x.xy, y.xy);
        vec4 b1 = vec4(x.zw, y.zw);
        vec4 s0 = floor(b0) * 2.0 + 1.0;
        vec4 s1 = floor(b1) * 2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));
        vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
        vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
        vec3 p0 = vec3(a0.xy, h.x);
        vec3 p1 = vec3(a0.zw, h.y);
        vec3 p2 = vec3(a1.xy, h.z);
        vec3 p3 = vec3(a1.zw, h.w);
        vec4 norm = taylorInvSqrt4(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
        p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
        vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
        m = m * m;
        return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
    }

    #define OCTAVES 8
    float fbm(vec3 direction) {
        float value = 0.0;
        float amplitude = 0.5;
        for (int i = 0; i < OCTAVES; i++) {
            value += amplitude * snoise(direction);
            direction *= 2.0;
            amplitude *= 0.5;
        }
        return value;
    }

    #define PI 3.1415926
    #define HP (PI * 0.5)

    void main() {
        vec3 direction = normalize(vWorldPosition - cameraPosition);
        float zenithAngle = acos(clamp(dot(uUp, direction), -1.0, 1.0));

        vec3 dir = direction;
        dir.xz += uTime * 0.00005;

        // The pen's exact gate, unmodified: 0 at the zenith, 1 toward the nadir —
        // this alone is what keeps the fog pinned to the bottom of the view.
        float gate = smoothstep(HP - 0.7, HP + 0.4, zenithAngle);
        vec3 driftDir = uUp * uTime * -0.0001;
        float n = (fbm(dir + driftDir) * 0.5 + 0.5) * gate;

        float a = clamp(smoothstep(0.125, 1.0, n) * uDensity * (1.0 + uGlow), 0.0, 1.0);
        vec3 col = mix(uColorB, uColorA, clamp(n, 0.0, 1.0));
        gl_FragColor = vec4(col, a);
    }
`;

// LAZY-LOADED (masterplan.md §6.6) — the host's _buildSmoke() dynamic-imports
// this file only when Smoke is first selected, guarded by _envToken so a
// build still in flight after the user switches away is discarded instead of
// parented.
//
// Extracted from core/AnamorphicCamera.js (environment key `smoke`).
// Behaviour is byte-for-byte the pre-extraction behaviour — see masterplan.md
// Phase 7.
export class SmokeEnv {
    static ENV_KEY = 'smoke';

    /** @param {object} THREE  the lazy-loaded three.js namespace (host._three.THREE) */
    constructor(THREE) {
        this.THREE = THREE;
        this.envGroup = null;   // stored at build() — needed for _smokeModelField()'s local-space math
        this.camera = null;     // stored at build() — the Mist quad's parent + Mist's fov/aspect source
        this.app = null;        // stored at build() — only for the texture-load paused-redraw callback
        this.mesh = null; this.mat = null; this.geo = null; this.tex = null;
        this.count = 0; this.total = 0;
        this.alphas = null; this.tints = null; this.p = null;
        this.t = 0; this._lastNow = 0; this.audioEnv = 0; this._tintKey = '';
        this.text = null; this.textMain = null; this.textGlow = null; this.textKey = null;
        this.mist = null;
        // Scratch objects — composing the instance matrices allocation-free.
        this.m4 = null; this.q = null; this.v3 = null; this.s3 = null; this.eul = null;
        // Model-avoidance field (see _smokeModelField) — the model's silhouette
        // half-extents in env-local space + the velocity it sweeps at.
        this.field = null;
        this.boundLocal = null; this.boundH = null; this._boundStamp = '';
        this.mCentre = null; this.mPrev = null; this.mScale = null; this._mSeeded = false;
    }

    /**
     * Build the scene content. Unlike the other environment modules, Smoke
     * parents TWO different Object3Ds into TWO different places (the puff
     * InstancedMesh into `envGroup`, the Mist quad straight onto `camera` —
     * see the MIST doc comment above), so — mirroring the pre-extraction
     * `_buildSmoke()`, which also did its own `_envGroup.add()` — this method
     * does all of its own parenting instead of returning an Object3D for the
     * host to add.
     * @param {object} dom      the host's cached DOM map (host._dom).
     * @param {object} envGroup the host's `_envGroup` — stored for later use
     *                          by _smokeModelField()'s local-space math and by
     *                          _syncSmokeText()'s title-plane group.
     * @param {object} camera   the host's `_camera` — the Mist quad's parent.
     *                          Must already be a member of the scene graph
     *                          (`_buildScene()` adds it once at creation,
     *                          tagged // MIST) or `renderer.render()` will
     *                          never traverse into it.
     * @param {object} app      the host App instance — only used by the
     *                          texture-load callback to trigger a paused-frame
     *                          redraw once the sprite texture finishes loading.
     */
    build(dom, envGroup, camera, app) {
        const THREE = this.THREE;
        this.envGroup = envGroup;
        this.camera = camera;
        this.app = app;

        const N = Math.max(10, Math.min(400, parseInt(dom.anamSmokeCount?.value ?? 120)));
        const total = N + SMOKE_HAZE;

        // Own texture instance — NOT the shared _visualTex.smoke cache. The host's
        // _loadEnv() disposes every texture hanging off the outgoing environment's
        // materials, which would yank the sprite out from under the Visuals "Smoke"
        // cloud style that shares that cache.
        const url = SMOKE_URL;
        const tex = new THREE.TextureLoader().load(url, () => {
            if (!this.app?.state?.isPlaying) this.app?.drawFrameSingle?.();
        });
        tex.colorSpace = THREE.SRGBColorSpace;

        const geo = new THREE.PlaneGeometry(1, 1);
        const alphas = new THREE.InstancedBufferAttribute(new Float32Array(total), 1);
        const tints = new THREE.InstancedBufferAttribute(new Float32Array(total * 3), 3);
        geo.setAttribute('aAlpha', alphas);
        geo.setAttribute('aTint', tints);

        const mat = new THREE.ShaderMaterial({
            vertexShader: SMOKE_VERTEX_SHADER,
            fragmentShader: SMOKE_FRAGMENT_SHADER,
            uniforms: {
                uTex:  { value: tex },
                uGlow: { value: 0 },
            },
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
        });

        const mesh = new THREE.InstancedMesh(geo, mat, total);
        mesh.frustumCulled = false;   // instance matrices move well outside the base bounds
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        // Real depth interleaving with the model — see the host's _applyEnvTransform().
        mesh.userData.envDepthSorted = true;
        this.envGroup.add(mesh);

        // Per-particle constants. Everything else is derived each frame from the
        // single clock `t`, so a rebuild is only ever needed for a count change.
        const p = {
            phase: new Float32Array(total),   // where in its own life this sprite starts
            rate:  new Float32Array(total),   // 1 / lifetime
            x:     new Float32Array(total),   // Ambient: spawn column offset, −1…1
            lat:   new Float32Array(total),   // Jet: position across the cone, −1…1
            z:     new Float32Array(total),   // fixed depth — see the sort note below
            rot:   new Float32Array(total),
            sway:  new Float32Array(total),   // personal turbulence rate
            curl:  new Float32Array(total),   // personal turbulence phase
            drift: new Float32Array(total),   // −1…1 personal sideways bias
            mix:   new Float32Array(total),   // Colour A → B blend factor
        };
        const span = Math.max(1, N - 1);
        for (let i = 0; i < total; i++) {
            p.phase[i] = Math.random();
            p.rate[i]  = 1 / (2.6 + Math.random() * 2.2);
            p.x[i]     = Math.random() * 2 - 1;
            // Cone position biased toward the axis (sqrt keeps the stem tight while
            // still filling the mushroom head) with a random sign.
            p.lat[i]   = Math.sqrt(Math.random()) * (Math.random() < 0.5 ? -1 : 1);
            // Depth ASCENDING with the instance index: one InstancedMesh draws its
            // instances in index order with no per-instance depth sort, so laying
            // them out back-to-front here is what keeps alpha blending correct.
            // The span straddles z = 0 — the model's own resting depth — so roughly
            // half the plume passes BEHIND the model and half in FRONT of it.
            p.z[i]     = i < N
                ? -SMOKE_DEPTH + 2 * SMOKE_DEPTH * (i / span) + (Math.random() - 0.5) * 0.05
                : SMOKE_DEPTH * (0.55 + 0.22 * (i - N));   // haze rides in front of everything
            p.rot[i]   = Math.random() * Math.PI * 2;
            p.sway[i]  = 0.5 + Math.random() * 1.1;
            p.curl[i]  = Math.random() * Math.PI * 2;
            p.drift[i] = Math.random() * 2 - 1;
            p.mix[i]   = Math.random();
        }

        this.mesh = mesh; this.mat = mat; this.geo = geo; this.tex = tex;
        this.count = N; this.total = total; this.alphas = alphas; this.tints = tints; this.p = p;
        this.t = 0; this._lastNow = 0; this.audioEnv = 0; this._tintKey = '';
        this.text = null; this.textMain = null; this.textGlow = null; this.textKey = null;
        this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion();
        this.v3 = new THREE.Vector3(); this.s3 = new THREE.Vector3(); this.eul = new THREE.Euler();
        this.field = { x: 0, y: 0, z: 0, hx: 0, hy: 0, hz: 0, vx: 0, vy: 0, on: false };
        this.boundLocal = new THREE.Vector3(); this.boundH = new THREE.Vector3(); this._boundStamp = '';
        this.mCentre = new THREE.Vector3(); this.mPrev = new THREE.Vector3();
        this.mScale = new THREE.Vector3(); this._mSeeded = false;

        this.mist = this._buildMist();
        this._syncSmokeText(dom);
    }

    /**
     * MIST — a camera-locked, always-fills-the-frustum ground-fog quad, ported
     * from the reference "Mist.js" pen. Deliberately NOT added to `envGroup`
     * like every other environment content (Clouds, Cloud Net, Grid Lines,
     * Cosmos): that group is subject to the shared Distance/Perspective/
     * Parallax/Hold-Still controls in the host's `_applyEnvTransform()`, which
     * rotate and reposition it — exactly the kind of transform that would tilt
     * or scroll a "stays at the bottom" ground fog off the horizon. Attaching
     * straight to the 3D camera instead (mirroring the pen's own
     * `camera.add(plane)`) keeps the one guarantee the user asked for
     * absolute: the fog's screen position is decided purely by
     * MIST_FRAGMENT_SHADER's view-angle gate, immune to every other
     * Environment slider in the panel.
     */
    _buildMist() {
        const THREE = this.THREE;
        const geo = new THREE.PlaneGeometry(1, 1);
        const mat = new THREE.ShaderMaterial({
            vertexShader: MIST_VERTEX_SHADER,
            fragmentShader: MIST_FRAGMENT_SHADER,
            uniforms: {
                uUp:      { value: new THREE.Vector3(0, 1, 0) },
                uTime:    { value: 0 },
                uDensity: { value: 1 },
                uGlow:    { value: 0 },
                uColorA:  { value: new THREE.Vector3(1, 1, 1) },
                uColorB:  { value: new THREE.Vector3(1, 1, 1) },
            },
            transparent: true,
            depthTest: false,
            depthWrite: false,
            side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.frustumCulled = false;
        mesh.visible = false;   // shown only while Source = Mist (see tick())
        this.camera.add(mesh);
        return { mesh, mat, t: 0 };
    }

    /** The pen's title layer: a filled text plane plus a blurred-stroke glow plane,
     *  both additive so they read as light inside the fog. Rebuilt ONLY when the
     *  text or its colour actually changes — never per frame. Empty text = no
     *  planes at all. */
    _syncSmokeText(dom) {
        const THREE = this.THREE;
        const txt = (dom.anamSmokeText?.value || '').trim();
        const color = dom.anamSmokeTextColor?.value || '#ffffff';
        const key = `${txt}|${color}`;
        if (this.textKey === key) return;
        this.textKey = key;
        if (this.text) {
            this.envGroup.remove(this.text);
            this._disposeGroup(this.text);
            this.text = this.textMain = this.textGlow = null;
        }
        if (!txt) return;

        const makeTex = (isGlow) => {
            const c = document.createElement('canvas');
            c.width = 2048; c.height = 512;
            const g = c.getContext('2d');
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            if ('letterSpacing' in g) g.letterSpacing = '65px';  // Chromium-only, degrades cleanly
            g.font = '100 240px system-ui, sans-serif';          // thin weight, like the pen's Roboto 100
            if (isGlow) {
                g.shadowColor = color;
                g.shadowBlur = 40;
                g.strokeStyle = color;
                g.lineWidth = 2;
                g.strokeText(txt, 1024, 256);
            } else {
                g.fillStyle = color;
                g.fillText(txt, 1024, 256);
            }
            const t = new THREE.CanvasTexture(c);
            t.colorSpace = THREE.SRGBColorSpace;
            return t;
        };
        // 4:1 like the pen's 2048×512 canvas; ~6 world units wide fills a 16:9 frame.
        const makePlane = (map, z) => {
            const m = new THREE.Mesh(new THREE.PlaneGeometry(6.0, 1.5), new THREE.MeshBasicMaterial({
                map, transparent: true, depthWrite: false, toneMapped: false,
                // The pen asks for THREE.ScreenBlending, which is not a three.js
                // constant (it silently falls back) — additive is the intent.
                blending: THREE.AdditiveBlending,
            }));
            m.position.z = z;
            m.userData.envDepthSorted = true;   // sits at its own depth among the puffs
            return m;
        };
        const grp = new THREE.Group();
        this.textMain = makePlane(makeTex(false), 0);
        this.textGlow = makePlane(makeTex(true), 0.01);
        grp.add(this.textMain);
        grp.add(this.textGlow);
        this.envGroup.add(grp);
        this.text = grp;
    }

    /**
     * The obstacle the fog has to flow around: the current model's bounding sphere
     * expressed in ENV-GROUP local space, plus the velocity it is sweeping through
     * the smoke at. Refreshed every frame — that is what carries ALL of the relative
     * motion, whichever side it comes from:
     *   • the model itself moving (spin, jiggle, Camera Movements, position sliders),
     *   • the camera orbiting/dollying while the environment is held still, which
     *     slides the model sideways through a fog bank that is glued to the screen.
     * The Box3 measurement is the expensive part, so it runs only when the model
     * actually changes; per frame we just re-project the cached local sphere through
     * the group's (cheap, self-only) world matrix.
     * @param {number} dt  seconds since the last tick — for the velocity EMA.
     * @param {object} f   the host's shared frame context — reads modelGroup + currentModelKey.
     */
    _smokeModelField(dt, f) {
        const fld = this.field;
        const grp = f.modelGroup;
        const THREE = this.THREE;
        if (!grp || !grp.children.length) { fld.on = false; this._mSeeded = false; return fld; }

        // Re-measure only on a real model change — Box3.setFromObject walks the
        // whole subtree and must not run per frame.
        const stamp = `${f.currentModelKey}|${grp.children.length}`;
        if (this._boundStamp !== stamp) {
            this._boundStamp = stamp;
            grp.updateWorldMatrix(true, true);
            const box = new THREE.Box3().setFromObject(grp);
            if (box.isEmpty()) { fld.on = false; return fld; }
            // World-space box → the group's own local space, so it stays valid as the
            // group is spun, scaled and moved afterwards.
            box.applyMatrix4(this.m4.copy(grp.matrixWorld).invert());
            box.getCenter(this.boundLocal);
            // Half-extents per axis, NOT one sphere radius: the fog has to wrap a
            // silhouette, and a head-and-shoulders model is nothing like a sphere.
            // hx/hy give an elliptical cross-section to steer around, hz gates which
            // puffs are deep enough to actually collide with it at all.
            box.getSize(this.v3);
            this.boundH.set(this.v3.x * 0.5, this.v3.y * 0.5, this.v3.z * 0.5);
        }
        if (!this.boundH.x || !this.boundH.y) { fld.on = false; return fld; }

        grp.updateWorldMatrix(true, false);      // parents + self only — children are cached
        this.envGroup.updateMatrixWorld(true);
        this.mCentre.copy(this.boundLocal).applyMatrix4(grp.matrixWorld);
        this.envGroup.worldToLocal(this.mCentre);
        grp.matrixWorld.decompose(this.v3, this.q, this.mScale);
        const envScale = Math.abs(this.envGroup.scale.x) || 1;
        const modelScale = Math.max(this.mScale.x, this.mScale.y, this.mScale.z) || 1;

        const k = modelScale / envScale;
        fld.x = this.mCentre.x; fld.y = this.mCentre.y; fld.z = this.mCentre.z;
        // NOTE: the half-extents are the model's own axis-aligned ones, carried
        // through scale only — a spinning model's silhouette is approximated, not
        // re-measured per frame (that would mean a Box3 walk every frame).
        fld.hx = Math.max(0.05, this.boundH.x * k);
        fld.hy = Math.max(0.05, this.boundH.y * k);
        fld.hz = Math.max(0.05, this.boundH.z * k);
        // Velocity in env-local units/s, EMA-smoothed so a single stuttered frame
        // doesn't fling the whole column sideways.
        if (this._mSeeded) {
            const inv = 1 / Math.max(dt, 1 / 240);
            fld.vx += (((this.mCentre.x - this.mPrev.x) * inv) - fld.vx) * 0.25;
            fld.vy += (((this.mCentre.y - this.mPrev.y) * inv) - fld.vy) * 0.25;
        } else {
            fld.vx = fld.vy = 0;
            this._mSeeded = true;
        }
        this.mPrev.copy(this.mCentre);
        fld.on = true;
        return fld;
    }

    /**
     * MIST — per-frame update. Advances its own clock, re-covers the frustum
     * (dolly zoom changes `camera.fov` live via the host's
     * `_applyCameraFromTrack()`, so a fixed scale would eventually leave a gap
     * at the frame edges), and pushes the panel values it shares with the puff
     * sources — Density (reuses `anamSmokeIntensity`), Drift Speed, Tint A/B,
     * Blend, Audio Reactive — into the shader. Deliberately does NOT touch
     * position/rotation: the quad's screen placement is entirely the
     * view-angle gate baked into MIST_FRAGMENT_SHADER, which is the whole
     * point (see _buildMist()).
     */
    _tickMist(env, dt, f) {
        const m = this.mist;
        if (!m) return;
        const THREE = this.THREE;
        const d = f.dom;
        m.t += dt * (parseFloat(d.anamSmokeSpeed?.value ?? 100) / 100);

        const wantBlend = (d.anamSmokeBlend?.value || 'normal') === 'additive'
            ? THREE.AdditiveBlending : THREE.NormalBlending;
        if (m.mat.blending !== wantBlend) {
            m.mat.blending = wantBlend;
            m.mat.needsUpdate = true;
        }

        const u = m.mat.uniforms;
        // The pen's noise-drift constants (0.00005 / -0.0001) are calibrated for
        // performance.now() milliseconds — feed the same units so the mist moves
        // at the reference pen's own pace at Drift Speed 100%.
        u.uTime.value = m.t * 1000;
        u.uDensity.value = (parseFloat(d.anamSmokeIntensity?.value ?? 55) / 100) * (1 + env * 0.6);
        u.uGlow.value = env * 0.5;
        const ca = hexToVec3(d.anamSmokeColor?.value || '#faf4f4');
        const cb = hexToVec3(d.anamSmokeColor2?.value || '#6d7378');
        u.uColorA.value.set(ca[0], ca[1], ca[2]);
        u.uColorB.value.set(cb[0], cb[1], cb[2]);

        // Re-cover the frustum every frame at a fixed camera-relative distance —
        // oversized by a 15% margin so aspect/fov changes never leave a gap.
        const dist = 50;
        const vFov = THREE.MathUtils.degToRad(this.camera.fov || 35);
        const halfH = Math.tan(vFov / 2) * dist * 1.15;
        const halfW = halfH * (this.camera.aspect || 1);
        m.mesh.position.z = -dist;
        m.mesh.scale.set(halfW * 2, halfH * 2, 1);
    }

    /**
     * Per-frame smoke update — advances the shared clock, rebuilds the instance
     * matrices + per-instance alpha from each sprite's phase, and pushes the live
     * anamSmoke* panel values.
     * @param {object} f  the host's shared, preallocated frame context
     *                    (masterplan.md §6.5) — dom, track, envParallax,
     *                    modelGroup, currentModelKey, audio. Never store it.
     */
    tick(f) {
        const THREE = this.THREE;
        const d = f.dom;
        const now = performance.now();
        const dt = this._lastNow ? Math.min(0.1, (now - this._lastNow) / 1000) : 1 / 60;
        this._lastNow = now;
        this.t += dt * (parseFloat(d.anamSmokeSpeed?.value ?? 20) / 100);

        // Audio Reactive — same fast-attack / slow-release envelope as Cloud Net;
        // swells the density and blooms the sprites on the beat.
        let env = 0;
        if (d.anamSmokeAudio?.checked) {
            const af = f.audio || {};
            const band = d.anamSmokeAudioBand?.value || 'bass';
            const level = band === 'bass' ? (af.bass || 0)
                : band === 'mid' ? (af.mid || 0)
                : band === 'treble' ? (af.treble || 0)
                : Math.max(af.bass || 0, af.mid || 0, af.treble || 0);
            this.audioEnv += (level - this.audioEnv) * (level > this.audioEnv ? 0.5 : 0.12);
            env = this.audioEnv;
        } else {
            this.audioEnv *= 0.9;
        }

        // MIST is a completely different rendering approach (one camera-locked
        // full-screen shader quad, no instances) from the puff-based Jet/Ambient
        // sources, so it gets its own short-circuit here rather than threading a
        // third case through every line of the puff loop below. The audio envelope
        // above and the title layer below are shared by all three sources.
        const source = d.anamSmokeSource?.value || 'jet';
        const mist = source === 'mist';
        if (mist) {
            this.mesh.visible = false;
            if (this.mist) {
                this.mist.mesh.visible = true;
                this._tickMist(env, dt, f);
            }
        } else {
        if (this.mist) this.mist.mesh.visible = false;
        this.mesh.visible = true;

        const intensity = parseFloat(d.anamSmokeIntensity?.value ?? 55) / 100;
        const sizeK  = parseFloat(d.anamSmokeSize?.value ?? 100) / 100;
        const spread = parseFloat(d.anamSmokeSpread?.value ?? 100) / 100;
        const wind   = parseFloat(d.anamSmokeWind?.value ?? 0) / 100;
        const swirl  = parseFloat(d.anamSmokeSwirl?.value ?? 100) / 100;
        const hazeAmt = parseFloat(d.anamSmokeHaze?.value ?? 20) / 100;
        // Jet ("fog machine") vs Ambient (the original slow drifting bank).
        const jet    = source === 'jet';
        const jetX   = (parseFloat(d.anamSmokeJetX?.value ?? 0) / 100) * 1.8;
        const jetY   = (parseFloat(d.anamSmokeJetY?.value ?? -125) / 100) * 1.8;
        const power  = parseFloat(d.anamSmokeJetPower?.value ?? 100) / 100;
        const bloom  = parseFloat(d.anamSmokeBloom?.value ?? 100) / 100;
        // Ambient fog hangs around ~10× longer than a jet puff (the pen's 30–45 s
        // life vs. the 3–5 s a fog-machine burst takes to cross the frame).
        const lifeK = jet ? 1 : 0.1;

        // The tracked face/hand leans the whole column sideways like a draught —
        // gated by the Environment's Parallax / Hold Still (see f.envParallax).
        const tx = (f.track?.x || 0) * f.envParallax;

        const wantBlend = (d.anamSmokeBlend?.value || 'normal') === 'additive'
            ? THREE.AdditiveBlending : THREE.NormalBlending;
        if (this.mat.blending !== wantBlend) {
            this.mat.blending = wantBlend;
            this.mat.needsUpdate = true;
        }
        this.mat.uniforms.uGlow.value = env * 0.8;

        // Per-instance tint (Colour A → B by the sprite's own mix factor). Rewritten
        // only when a picker actually moves, not every frame.
        const tintKey = (d.anamSmokeColor?.value || '#faf4f4') + (d.anamSmokeColor2?.value || '#6d7378');
        if (tintKey !== this._tintKey) {
            this._tintKey = tintKey;
            const a = hexToVec3(d.anamSmokeColor?.value || '#faf4f4');
            const b = hexToVec3(d.anamSmokeColor2?.value || '#6d7378');
            const arr = this.tints.array;
            for (let i = 0; i < this.total; i++) {
                const mm = this.p.mix[i];
                arr[i * 3]     = a[0] + (b[0] - a[0]) * mm;
                arr[i * 3 + 1] = a[1] + (b[1] - a[1]) * mm;
                arr[i * 3 + 2] = a[2] + (b[2] - a[2]) * mm;
            }
            this.tints.needsUpdate = true;
        }

        // The model is a moving obstacle in the fog, not a poster behind it.
        const field = this._smokeModelField(dt, f);

        // World height the ambient bank cycles through. Deliberately much taller than
        // the ~3.15-unit visible frame: fade-in/out (see the trapezoid profile below)
        // needs to happen OFF-SCREEN, below/above frame, so every height the camera
        // can actually see falls inside the flat full-alpha plateau of a puff's life
        // instead of on the fade ramp. Without this margin, alpha (which rides the
        // same L as height) forms a static bottom-dark/top-dark gradient baked into
        // the frame — visible as fog thinning to nothing near the edges of frame.
        const AMBIENT_SPAN = 6.4;
        const BASE = 0.9;   // sprite edge length at scale 1
        const RISE = 3.4 * power;   // how far a jet puff gets by the end of its life
        const alphas = this.alphas.array;
        const { m4, q, v3, s3, eul, p } = this;
        for (let i = 0; i < this.total; i++) {
            let x, y, sc, a, spin;
            let z = p.z[i];

            if (i >= this.count) {
                // ── Residual room haze: a couple of frame-filling sprites turning
                // almost imperceptibly. This is the milky wash the reference video
                // is left sitting in long after the plume itself has gone.
                const k = i - this.count;
                const ang = this.t * 0.035 + k * 2.1;
                x = Math.sin(ang) * 0.45;
                y = Math.cos(ang * 0.73) * 0.3;
                sc = BASE * 7.5 * sizeK;
                a = hazeAmt * 0.42 * (1 + env * 0.5);
                spin = p.rot[i] + this.t * 0.02 * (k % 2 ? 1 : -1);
                alphas[i] = Math.min(1, a);
                eul.set(0, 0, spin);
                q.setFromEuler(eul);
                v3.set(x, y, z);
                s3.set(sc, sc, 1);
                m4.compose(v3, q, s3);
                this.mesh.setMatrixAt(i, m4);
                continue;
            }

            // Closed-form life 0…1, wrapped — replaces the pen's per-sprite timeline.
            let L = p.phase[i] + this.t * p.rate[i] * lifeK;
            L -= Math.floor(L);

            if (jet) {
                // ── Fog-machine plume, the reference video's actual behaviour.
                // A buoyant jet leaves the nozzle fast and decelerates as it
                // entrains air, so height goes like L^0.62, not linearly — that is
                // what gives the tight bright stem near the nozzle and the slow,
                // billowing head up top.
                const h = Math.pow(L, 0.62) * RISE;
                const hN = RISE > 1e-3 ? h / RISE : 0;
                // Cone: nearly parallel-sided off the nozzle, opening out into the
                // cauliflower head as the jet loses its momentum.
                const cone = (0.05 + 0.72 * Math.pow(hN, 1.4)) * bloom * spread;
                const turb = (0.04 + 0.62 * hN) * bloom;
                // Open the plume in DEPTH by the same envelope — otherwise the
                // "cone" is only a cone in x and stays a full-depth slab at the
                // nozzle, which reads as a wall rather than a jet. This does put
                // instances slightly out of back-to-front order, which is
                // invisible here: every sprite is the same near-white fog.
                z = p.z[i] * (0.18 + 0.82 * hN);
                x = jetX + p.lat[i] * cone * 1.8
                    + Math.sin(this.t * p.sway[i] * 1.7 + p.curl[i]) * turb * 0.38
                    + (wind + tx * 0.6) * hN * 1.5;
                y = jetY + h
                    + Math.cos(this.t * p.sway[i] * 1.3 + p.curl[i]) * turb * 0.2;
                // Sprite size is what sells the jet: tiny at the nozzle, mushrooming
                // out as the puff slows and expands.
                sc = BASE * sizeK * (0.10 + 2.7 * Math.pow(hN, 1.25) * bloom);
                // Dense the instant it leaves the nozzle; thinning as it expands
                // (a fixed puff of fluid spread over a growing volume) then dying.
                const tail = L < 0.5 ? 1 : Math.cos((Math.PI / 2) * ((L - 0.5) / 0.5));
                a = Math.min(1, L / 0.05) * tail * (1 - 0.45 * hN) * intensity * (1 + env * 1.2);
                spin = p.rot[i] + (Math.sin(this.t * p.sway[i] * 0.8 + p.curl[i]) * 0.35
                    + this.t * p.drift[i] * 0.25) * swirl;
            } else {
                // ── Ambient bank: a hanging fog field that fills the WHOLE frame,
                // top to bottom, at all times — not a conveyor belt of puffs fading
                // in low and fading out high (that ties alpha 1:1 to height, since
                // height is itself just a linear map of the same L, and bakes in a
                // permanent dark band wherever life's fade ramps land in-frame).
                y = -AMBIENT_SPAN * 0.5 + L * AMBIENT_SPAN;
                x = p.x[i] * 1.9 * spread
                    + p.drift[i] * L * 0.35
                    + (wind + tx * 0.6) * L * 1.6;
                sc = BASE * sizeK * (0.6 + 3.4 * (1 - (1 - L) * (1 - L)));
                // Trapezoid, not a triangle: fade in/out only over the first/last
                // 15% of life, spent OFF-SCREEN above/below the visible frame at
                // this span — everything the camera can see sits on the flat
                // plateau in between, so the visible frame reads as continuous fog
                // rather than a gradient. A slow per-puff flicker keeps the plateau
                // from looking like a flat painted wall.
                const fadeIn = 0.15, fadeOut = 0.85;
                const fade = L < fadeIn
                    ? 0.5 - 0.5 * Math.cos(Math.PI * (L / fadeIn))
                    : L > fadeOut
                        ? 0.5 + 0.5 * Math.cos(Math.PI * ((L - fadeOut) / (1 - fadeOut)))
                        : 1;
                const flicker = 0.78 + 0.22 * (0.5 + 0.5 * Math.sin(this.t * p.sway[i] * 0.6 + p.curl[i]));
                a = fade * flicker * intensity * (1 + env * 1.2);
                spin = p.rot[i] + (Math.sin(this.t * p.sway[i] * 0.3) * 0.25
                    + this.t * p.drift[i] * 0.05) * swirl;
            }

            // ── Obstacle deflection ────────────────────────────────────────────
            // Fog does not pass through a body — it splits around the silhouette,
            // hugs it, and closes again above. Rather than a radial shove (which
            // reads as an explosion), a puff heading into the model is SLID
            // sideways just far enough to clear the silhouette at its own height,
            // then released — so the plume necks in around the shoulders and
            // reconverges over the head exactly like the reference footage.
            //
            // Four gates, all smooth so nothing pops:
            //   • front  — ASYMMETRIC by design, this is what makes it read as
            //              "surrounding" rather than a keep-out force field: fog
            //              already clearly IN FRONT of the model (dz beyond its
            //              front face) is left alone, free to drift and veil the
            //              face like the reference video's engulf phase — that
            //              veil-over-the-face look is the whole point of a fog
            //              machine, so deflecting every puff near the model would
            //              suppress the exact effect being asked for. Only puffs
            //              AT the model's own depth slice (crossing through it) or
            //              behind get the sideways parting treatment; ones behind
            //              are invisible anyway (depth test) so it costs nothing
            //              to also part them, ready for when the model turns.
            //   • height — the elliptical cross-section gives the clearance the
            //              puff needs at its own height (wide at the shoulders,
            //              narrow at the crown).
            //   • centre — a puff already outside that clearance is untouched.
            //   • margin — tight (not a padded halo) so fog can graze right up to
            //              the silhouette instead of leaving a dead ring of empty
            //              space around it.
            if (field.on) {
                const dz = z - field.z;
                const front = dz - field.hz * 0.5;   // >0 once past the model's front face
                const zGate = front > 0
                    ? Math.max(0, 1 - front / (field.hz * 0.6 + sc * 0.35))
                    : 1;
                if (zGate > 0) {
                    const dy = y - field.y;
                    const hy = field.hy * 1.08;
                    if (Math.abs(dy) < hy) {
                        const v = dy / hy;
                        const clear = field.hx * 0.95 * Math.sqrt(1 - v * v) + sc * 0.15;
                        const dx = x - field.x;
                        const ax = Math.abs(dx);
                        if (ax < clear) {
                            const g = zGate * zGate * (3 - 2 * zGate);
                            // Stable side choice — a puff dead on the centre line
                            // must not flip left/right frame to frame.
                            const side = (dx + p.drift[i] * 0.05) >= 0 ? 1 : -1;
                            const push = (clear - ax) * g;
                            x += side * push * 0.95;
                            // Squeezed flow accelerates past the obstacle (Venturi):
                            // the fog visibly speeds up as it necks around it.
                            y += push * 0.22;
                            // Wake: whatever the model is doing drags the fog with it.
                            const t = 1 - ax / clear;
                            x += field.vx * g * t * 0.14;
                            y += field.vy * g * t * 0.14;
                        }
                    }
                }
            }
            alphas[i] = Math.min(1, a);

            eul.set(0, 0, spin);
            q.setFromEuler(eul);
            v3.set(x, y, z);
            s3.set(sc, sc, 1);
            m4.compose(v3, q, s3);
            this.mesh.setMatrixAt(i, m4);
        }
        this.mesh.instanceMatrix.needsUpdate = true;
        this.alphas.needsUpdate = true;
        }   // end else (!mist) — puff/haze simulation

        // Title layer — the texture is rebuilt only on a text/colour change; depth
        // and the two opacities are live.
        this._syncSmokeText(d);
        if (this.text) {
            this.text.position.z = (parseFloat(d.anamSmokeTextDepth?.value ?? -20) / 100) * 2.0;
            const op = parseFloat(d.anamSmokeTextOpacity?.value ?? 15) / 100;
            const gl = parseFloat(d.anamSmokeTextGlow?.value ?? 30) / 100;
            this.textMain.material.opacity = Math.min(1, op * (1 + env));
            this.textGlow.material.opacity = Math.min(1, gl * (1 + env));
        }
    }

    /** Generic Object3D teardown for the title-text group — mirrors the host's
     *  own _disposeObject() (traverse + dispose geometry/materials/textures),
     *  reimplemented locally since that helper isn't reachable from here. */
    _disposeGroup(obj) {
        obj.traverse?.((n) => {
            if (n.geometry) n.geometry.dispose?.();
            if (n.material) {
                const mats = Array.isArray(n.material) ? n.material : [n.material];
                mats.forEach((m) => {
                    Object.values(m).forEach((v) => v?.isTexture && v.dispose?.());
                    m.dispose?.();
                });
            }
        });
    }

    /**
     * Full teardown. The Mist quad is parented to the CAMERA, not `envGroup`
     * (see build()'s doc comment), so — unlike every other environment
     * module's dispose() — removing it from its parent here is NOT optional:
     * the host's generic `_envGroup` disposal loop in `_loadEnv()` can never
     * reach it, and this is the only code path that ever will. The puff mesh
     * and title text ARE parented inside `envGroup`, so their removal from
     * the scene graph is left to that generic loop (which runs immediately
     * after this is called) — only their geometry/material/texture disposal
     * happens here, for full teardown per the module contract.
     */
    dispose() {
        if (this.mist) {
            this.camera?.remove(this.mist.mesh);
            this.mist.mesh?.geometry?.dispose?.();
            this.mist.mesh?.material?.dispose?.();
            this.mist = null;
        }
        this.geo?.dispose?.();
        this.mat?.dispose?.();
        this.tex?.dispose?.();
        if (this.text) this._disposeGroup(this.text);
        this.mesh = this.mat = this.geo = this.tex = null;
        this.text = this.textMain = this.textGlow = null;
        this.p = this.alphas = this.tints = null;
        this.count = this.total = 0;
        this.envGroup = this.camera = this.app = null;
    }
}
