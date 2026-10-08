// ── MAGIC CARPET: wind-blown cloth plane for the 2D media model ──────────────
// Port of the cloth-shader tutorial: layered sine waves displace a subdivided
// plane in the vertex shader; the pin style gates where the cloth is loose
// (flying carpet / hanging banner / side flag). vZ carries the displacement
// into the fragment pass, which adds cloth self-shading, an optional torn
// edge, a woven hem border and a vintage grain/scratch/vignette pass.
//
// Extracted from core/AnamorphicCamera.js (model-plane feature, `anamCarpetEnabled`).
// Behaviour is byte-for-byte the pre-extraction behaviour — see masterplan.md
// Phase 8.
export const CARPET_VERTEX_SHADER = `
    uniform float uTime;
    uniform float uWindStrength;
    uniform float uFabricFreq;
    uniform float uPinMode;   // 0 = fly (free carpet), 1 = hang (pinned top), 2 = flag (pinned left)
    uniform float uSteer;     // -1..1 gesture banking lean (fly style)

    varying vec2 vUv;
    varying float vZ;

    void main() {
        vUv = uv;
        vec3 pos = position;

        // Where the cloth is loose: a flying carpet waves everywhere (calmer in
        // the middle where the "rider" sits); pinned styles stiffen toward the
        // pinned edge exactly like the tutorial's flag.
        float pinInfluence;
        if (uPinMode < 0.5) {
            float r = max(abs(uv.x - 0.5), abs(uv.y - 0.5)) * 2.0; // 0 centre → 1 rim
            pinInfluence = 0.35 + 0.65 * r * r;
        } else {
            float looseFactor = uPinMode < 1.5 ? (1.0 - uv.y) : uv.x;
            pinInfluence = pow(looseFactor, 1.8);
        }

        float wave1 = sin(uv.x * 5.0 + uTime * 2.0);
        float wave2 = sin(uv.x * 12.0 + uTime * 4.0 + uv.y * 5.0);
        float wave3 = sin(uTime * 1.5);
        float ripples = wave1 * 0.5 + wave2 * 0.2 + wave3 * 0.3;

        // ×1.5 vs the tutorial: this plane is ~2 local units tall (theirs ~1.3).
        float displacement = (uWindStrength * 3.0 + ripples * uFabricFreq * 1.5) * pinInfluence;

        pos.y += sin(displacement) * 0.15 * pinInfluence;
        pos.z += displacement;
        pos.z += uSteer * (uv.x - 0.5) * 0.8;   // banking lean while steering

        vZ = displacement;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
`;

export const CARPET_FRAGMENT_SHADER = `
    uniform sampler2D uTexture;
    uniform float uRatio;
    uniform float uEdgeScale;
    uniform float uEdgeAmp;
    uniform float uPhotoInset;
    uniform vec3 uHemColor;
    uniform float uScratchAmp;
    uniform float uGrainAmp;
    uniform float uVignette;
    uniform float uSeed;
    uniform float uShadowOpacity;

    varying vec2 vUv;
    varying float vZ;

    // --- Noise utils (simplex + fbm, from the tutorial) ---
    vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
    float snoise(vec2 v){
        const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
        vec2 i  = floor(v + dot(v, C.yy) );
        vec2 x0 = v - i + dot(i, C.xx);
        vec2 i1;
        i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec4 x12 = x0.xyxy + C.xxzz;
        x12.xy -= i1;
        i = mod(i, 289.0);
        vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
        vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
        m = m*m ;
        m = m*m ;
        vec3 x = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x) - 0.5;
        vec3 ox = floor(x + 0.5);
        vec3 a0 = x - ox;
        m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
        vec3 g;
        g.x  = a0.x  * x0.x  + h.x  * x0.y;
        g.yz = a0.yz * x12.xz + h.yz * x12.yw;
        return 130.0 * dot(m, g);
    }
    float fbm(vec2 x) {
        float v = 0.0; float a = 0.5; vec2 shift = vec2(100.0);
        mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.50));
        for (int i = 0; i < 5; ++i) { v += a * snoise(x + uSeed); x = rot * x * 2.0 + shift; a *= 0.5; }
        return v;
    }

    void main() {
        vec2 uv = vUv - 0.5;
        vec2 aspectUV = uv;
        aspectUV.x *= uRatio;

        // 1. SHAPE — ragged cloth silhouette
        float noise = fbm(aspectUV * uEdgeScale);
        float dist = max(abs(uv.x), abs(uv.y));
        float raggedDist = dist + noise * uEdgeAmp;
        float alpha = 1.0 - smoothstep(0.5, 0.51, raggedDist);
        if (alpha < 0.01) discard;

        // 2. HEM — woven border cloth around the media
        float clothGrain = fbm(vUv * 60.0);
        vec3 hemCol = uHemColor - clothGrain * 0.08;

        // 3. MEDIA
        vec4 photoTex = texture2D(uTexture, vUv);
        float photoNoise = snoise(aspectUV * 30.0) * 0.005;
        float photoLimit = 0.5 - uPhotoInset;
        float photoMask = 1.0 - smoothstep(photoLimit, photoLimit + 0.02, dist + photoNoise);

        // 4. VINTAGE — dust grain, scratches, vignette
        float scratches = snoise(vec2(vUv.x * 300.0, vUv.y * 3.0));
        float dust = fbm(vUv * 40.0 + uSeed);
        vec3 grunge = photoTex.rgb;
        grunge = mix(grunge, vec3(0.6, 0.5, 0.4), dust * uGrainAmp);
        grunge -= scratches * uScratchAmp;
        grunge -= length(uv) * uVignette;

        vec3 finalRGB = mix(hemCol, grunge, photoMask);

        // 5. CLOTH SHADING — folds brighten/darken with the wind displacement
        finalRGB += vZ * uShadowOpacity;

        // 6. EDGE SHADOW — soft dark falloff into the torn rim
        float edgeShadow = smoothstep(0.45, 0.5, raggedDist);
        finalRGB = mix(finalRGB, vec3(0.0), edgeShadow * 0.09);

        gl_FragColor = vec4(finalRGB, 1.0);
    }
`;

export class MagicCarpet {
    /** @param {object} THREE  the lazy-loaded three.js namespace (host._three.THREE) */
    constructor(THREE) {
        this.THREE = THREE;
        this.mat = null; this.mesh = null; this.group = null;
        this.time = 0; this.lastTs = 0; this.steer = 0; this.hemHex = '#d4a24b';
    }

    /**
     * Build the cloth mesh. Same raw-texture path as VoxelDrop (no lighting —
     * the shader does its own fold shading), wrapped in a Group so the hover-
     * flight motion in tick() can move the mesh without fighting _fitObject's
     * placement.
     * @param {object} texture  the host's _make2DMediaTexture() result.
     * @param {number} aspect   the media's aspect ratio (also feeds uRatio).
     * @param {object} geo      the host's _planeGeo(THREE, aspect, 64) result —
     *                          that helper stays on the host (masterplan §6.4).
     */
    build(texture, aspect, geo) {
        const THREE = this.THREE;
        const mat = new THREE.ShaderMaterial({
            vertexShader: CARPET_VERTEX_SHADER,
            fragmentShader: CARPET_FRAGMENT_SHADER,
            uniforms: {
                uTexture: { value: texture },
                uRatio: { value: aspect },
                uTime: { value: 0 },
                uWindStrength: { value: 0 },
                uFabricFreq: { value: 0.45 },
                uPinMode: { value: 0 },
                uSteer: { value: 0 },
                uEdgeScale: { value: 8.8 },
                uEdgeAmp: { value: 0.03 },
                uPhotoInset: { value: 0.015 },
                uHemColor: { value: new THREE.Color('#d4a24b') },
                uScratchAmp: { value: 0 },
                uGrainAmp: { value: 0 },
                uVignette: { value: 0 },
                uSeed: { value: Math.random() * 100 },
                uShadowOpacity: { value: 0.4 },
            },
            side: THREE.DoubleSide,
            transparent: true,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.frustumCulled = false; // wind displacement moves verts outside the static bounds
        const group = new THREE.Group();
        group.add(mesh);
        this.mat = mat; this.mesh = mesh; this.group = group;
        this.time = 0; this.lastTs = 0; this.steer = 0; this.hemHex = '#d4a24b';
        return group;
    }

    /**
     * Per-frame wind drive + uniform sync.
     * @param {object} f  the host's shared, preallocated frame context
     *                    (masterplan.md §6.5) — dom, track, audio, handOpenness.
     *                    Never store it. Never allocate here.
     */
    tick(f) {
        const d = f.dom;
        const now = performance.now();
        const dt = this.lastTs ? Math.min(0.1, (now - this.lastTs) / 1000) : 0;
        this.lastTs = now;
        // Accumulate time scaled by Wave Speed so speed changes never jump the cloth.
        this.time += dt * (parseFloat(d.anamCarpetSpeed?.value ?? 100) / 100);
        const t = this.time;

        // Wind = slider base × a slow two-sine gust cycle (the tutorial's animate()
        // drive), boosted by the audio band and/or the hand gesture when enabled.
        let force = parseFloat(d.anamCarpetWind?.value ?? 60) / 100;
        if (d.anamCarpetAudio?.checked) {
            const af = f.audio || {};
            const mode = d.anamCarpetAudioMode?.value || 'bass';
            const level = mode === 'bass' ? (af.bass || 0)
                : mode === 'mid' ? (af.mid || 0)
                : mode === 'treble' ? (af.treble || 0)
                : Math.max(af.bass || 0, af.mid || 0, af.treble || 0);
            force += level * 1.5;
        }
        let steerTarget = 0;
        if (d.anamCarpetGesture?.checked && f.track.has) {
            // Palm open = wind blast, fist = calm air; hand X banks / steers the carpet.
            if (f.handOpenness != null) force *= 0.25 + f.handOpenness * 2.0;
            steerTarget = Math.max(-1, Math.min(1, f.track.x * 2));
        }
        this.steer += (steerTarget - this.steer) * 0.08;
        const gust = Math.max(0, Math.sin(t * 0.7) + Math.sin(t * 2.3) * 0.5 + 0.5);

        const u = this.mat.uniforms;
        u.uTime.value = t;
        u.uWindStrength.value = gust * force * 0.3;
        u.uFabricFreq.value = parseFloat(d.anamCarpetRipples?.value ?? 45) / 100;
        const style = d.anamCarpetStyle?.value || 'fly';
        u.uPinMode.value = style === 'hang' ? 1 : style === 'flag' ? 2 : 0;
        u.uSteer.value = this.steer;
        u.uShadowOpacity.value = parseFloat(d.anamCarpetShadow?.value ?? 40) / 100;
        u.uEdgeAmp.value = (parseFloat(d.anamCarpetEdge?.value ?? 20) / 100) * 0.15;
        u.uPhotoInset.value = (parseFloat(d.anamCarpetHem?.value ?? 15) / 100) * 0.1;
        const hemHex = d.anamCarpetHemColor?.value || '#d4a24b';
        if (this.hemHex !== hemHex) { this.hemHex = hemHex; u.uHemColor.value.set(hemHex); }
        const vint = parseFloat(d.anamCarpetVintage?.value ?? 0) / 100;
        u.uGrainAmp.value = vint * 0.22;
        u.uScratchAmp.value = vint * 0.05;
        u.uVignette.value = vint * 0.5;

        // Hover Flight — the whole carpet bobs, pitches and banks like it's cruising.
        // Only meaningful for the free-floating fly style; pinned cloth stays put.
        const m = this.mesh;
        if (style === 'fly') {
            const bob = d.anamCarpetHover?.checked !== false ? 1 : 0;
            m.position.y = bob * (Math.sin(t * 0.9) * 0.14 + Math.sin(t * 1.7) * 0.05);
            m.rotation.x = bob * (-0.12 + Math.sin(t * 1.1) * 0.05);
            m.rotation.z = this.steer * 0.35 + bob * Math.sin(t * 0.6) * 0.06;
        } else {
            m.position.y = 0;
            m.rotation.x = 0;
            m.rotation.z = 0;
        }
    }

    /** Full teardown — geometry + material. Present for contract consistency;
     *  the mesh is parented inside `_modelGroup`, so the host's generic
     *  model-clear disposal loop in `_loadModel()` already handles this today
     *  — not wired to a call site, kept for a future direct caller. */
    dispose() {
        this.mesh?.geometry?.dispose?.();
        this.mat?.dispose?.();
        this.mesh = this.mat = this.group = null;
    }
}
