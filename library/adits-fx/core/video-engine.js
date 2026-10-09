/**
 * VideoEngine - Handles the render loop and canvas management
 */

export class VideoEngine {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        
        this.targetW = canvas.width;
        this.targetH = canvas.height;
        this.targetRatio = this.targetW / this.targetH;

        // WebGPU Bridge
        this.gpuDevice = null;
        this.gpuContext = null;
        this.gpuFormat = null;
        this.gpuCanvas = document.createElement('canvas');
        this.gpuCanvas.width = this.targetW;
        this.gpuCanvas.height = this.targetH;

        // Buffers
        this.offCanvas = document.createElement('canvas');
        this.offCtx = this.offCanvas.getContext('2d', { willReadFrequently: true });
        this.fxBufferCanvas = document.createElement('canvas');
        this.fxBufferCtx = this.fxBufferCanvas.getContext('2d', { willReadFrequently: true });
        this.bloomCanvas = document.createElement('canvas');
        // bloom/mask are draw-and-blit only (no getImageData anywhere), so they stay
        // GPU-backed. offCtx is read back by ~25 effects and keeps the flag; fxBufferCtx
        // keeps it too because an effect's postRender may read its target.
        this.bloomCtx = this.bloomCanvas.getContext('2d');
        this.maskCanvas = document.createElement('canvas');
        this.maskCtx = this.maskCanvas.getContext('2d');

        // AR Tracking State
        this.arTrackerFrameCount = 0;
        this.arPrevFrame = null;
        this.arSmoothedBoxes = [];
        this.arCachedBoxes = [];
        this.arAnaCanvas = document.createElement('canvas');
        this.arAnaCanvas.width = 80;
        this.arAnaCanvas.height = 45;
        this.arAnaCtx = this.arAnaCanvas.getContext('2d', { willReadFrequently: true });

        // Effect-specific state
        this.ghostBuffer = [];
        this.ringAngles = new Array(30).fill(0);
        this.ringAnglesV2 = new Array(30).fill(0);
        this.sliceDirection = 1;
        this.lastBeatTime = 0;
    }

    async initGPU() {
        if (!navigator.gpu) {
            console.warn("WebGPU not supported on this browser.");
            return false;
        }
        try {
            // Prefer the discrete/high-performance GPU; fall back to whatever is available.
            let adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
            if (!adapter) adapter = await navigator.gpu.requestAdapter();
            if (!adapter) return false;
            this.gpuDevice = await adapter.requestDevice();
            this.gpuDevice.lost.then((info) => {
                console.warn('WebGPU device lost (' + info.reason + '): ' + info.message + ' — falling back to Canvas2D.');
                this.gpuDevice = null;
                this.gpuContext = null;
                // Drop cached resources that belong to the dead device.
                this.fisheyePipeline = null; this.fisheyeUniformBuffer = null; this.fisheyeSampler = null; this._fisheyeBG = {};
                this._gvPipeline = null; this._gvUniformBuffer = null; this._gvSampler = null; this._gvBG = {};
                this._fisheyePending = false; this._gvPending = false;
                this._blitPipeline = null; this._blitSampler = null; this._blitPending = false; this._blitBG = {};
                this._frameTex = null; this._frameTexView = null;
                this._pingTex = null; this._pingTexView = null; this._chain = null;
            });
            this.gpuDevice.onuncapturederror = (e) => console.error('WebGPU uncaptured error:', e.error?.message ?? e);
            this.gpuContext = this.gpuCanvas.getContext('webgpu');
            this.gpuFormat = navigator.gpu.getPreferredCanvasFormat();
            this.gpuContext.configure({
                device: this.gpuDevice,
                format: this.gpuFormat,
                alphaMode: 'premultiplied'
            });
            // Start compiling the two post-pass pipelines now (async, off the render
            // loop) so the first Fisheye / BnW / Negative toggle does not stall a frame.
            this._ensureFisheyePipeline();
            this._ensureGvPipeline();
            this._ensureBlitPipeline();
            console.log("WebGPU Initialized Successfully.");
            return true;
        } catch (e) {
            console.error("WebGPU initialization failed:", e);
            return false;
        }
    }

    setSize(w, h) {
        this.targetW = w;
        this.targetH = h;
        this.targetRatio = w / h;
        this.canvas.width = w;
        this.canvas.height = h;
        this.gpuCanvas.width = w;
        this.gpuCanvas.height = h;
        this.ghostBuffer = []; // Reset buffers on size change
        // Reconfigure WebGPU context after canvas resize (resize unconfigures it)
        if (this.gpuDevice && this.gpuContext) {
            this.gpuContext.configure({
                device: this.gpuDevice,
                format: this.gpuFormat,
                alphaMode: 'premultiplied'
            });
        }
        // Pipelines are size-independent (fixed target format) and are kept; only
        // the size-bound texture and its bind groups are dropped.
        // Drop the cached frame texture — it is sized to the old dimensions
        if (this._frameTex) { this._frameTex.destroy(); this._frameTex = null; }
        if (this._pingTex) { this._pingTex.destroy(); this._pingTex = null; }
        this._fisheyeBG = {}; this._gvBG = {}; this._blitBG = {};
    }

    /**
     * Shared full-frame texture used by applyFisheye / applyGlobalVisuals.
     * Reused across frames (create+destroy per frame churned VRAM); recreated
     * only when the canvas size changes.
     */
    _getFrameTexture() {
        if (!this._frameTex || this._frameTexW !== this.targetW || this._frameTexH !== this.targetH) {
            if (this._frameTex) this._frameTex.destroy();
            if (this._pingTex) this._pingTex.destroy();
            this._frameTex = this.gpuDevice.createTexture({
                size: [this.targetW, this.targetH],
                format: 'rgba8unorm',
                usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
            });
            // Second texture for the post chain (ping-pong partner of _frameTex).
            this._pingTex = this.gpuDevice.createTexture({
                size: [this.targetW, this.targetH],
                format: 'rgba8unorm',
                usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
            });
            this._frameTexW = this.targetW;
            this._frameTexH = this.targetH;
            this._frameTexView = this._frameTex.createView();
            this._pingTexView = this._pingTex.createView();
            // Bind groups reference the old texture views — rebuild lazily
            this._fisheyeBG = {}; this._gvBG = {}; this._blitBG = {};
        }
        return this._frameTex;
    }

    // ── Post chain (item 1 of the 2026-09-03 efficiency plan) ───────────────────
    // Each GPU post pass used to do: 2D canvas → texture → WebGPU present canvas →
    // drawImage back onto the 2D canvas. With BnW + Fisheye both on the frame crossed
    // that bridge twice per frame. A chain uploads the canvas ONCE, runs the passes
    // texture-to-texture (ping-pong between _frameTex and _pingTex), then presents the
    // result with one trivial blit pass and one drawImage. Passes called outside a
    // chain behave exactly as before.
    //
    // beginPostChain() returns false (and the caller runs the passes standalone) unless
    // every pipeline that could run inside it is ready, so a chained pass never has to
    // fall back mid-chain and leave the uploaded frame stale.

    _ensureBlitPipeline() {
        if (!this.gpuDevice || this._blitPipeline || this._blitPending) return;
        this._blitPending = true;
        const device = this.gpuDevice;
        const module = device.createShaderModule({ code: `
            @group(0) @binding(0) var s: sampler;
            @group(0) @binding(1) var t: texture_2d<f32>;
            struct VO { @builtin(position) p: vec4<f32>, @location(0) uv: vec2<f32> };
            @vertex fn vs_main(@builtin(vertex_index) vi: u32) -> VO {
                let x = f32(i32(vi) == 1) * 4.0 - 1.0;
                let y = f32(i32(vi) == 2) * 4.0 - 1.0;
                var o: VO;
                o.p = vec4<f32>(x, y, 0.0, 1.0);
                o.uv = vec2<f32>(x * 0.5 + 0.5, 1.0 - (y * 0.5 + 0.5));
                return o;
            }
            @fragment fn fs_main(i: VO) -> @location(0) vec4<f32> { return textureSample(t, s, i.uv); }
        ` });
        this._blitSampler = device.createSampler({ magFilter: 'nearest', minFilter: 'nearest' });
        device.createRenderPipelineAsync({
            layout: 'auto',
            vertex: { module, entryPoint: 'vs_main' },
            fragment: { module, entryPoint: 'fs_main', targets: [{ format: this.gpuFormat }] },
            primitive: { topology: 'triangle-list' }
        }).then((pipeline) => {
            if (this.gpuDevice !== device) return;
            this._blitPipeline = pipeline;
            this._blitBG = {};
        }).catch((e) => {
            console.error('Post-chain blit pipeline failed to build:', e);
        }).finally(() => { this._blitPending = false; });
    }

    /** Ready check for the chain: every pass that may run inside it plus the blit. */
    postChainReady() {
        return !!(this.gpuDevice && this._blitPipeline && this._gvPipeline && this.fisheyePipeline);
    }

    /** Upload the 2D canvas once and start collecting passes. Returns false when the
     *  caller should run the passes standalone instead. */
    beginPostChain() {
        if (this._chain || !this.postChainReady()) return false;
        const texture = this._getFrameTexture();
        this.gpuDevice.queue.copyExternalImageToTexture({ source: this.canvas }, { texture }, [this.targetW, this.targetH]);
        this._chain = { srcKey: 'A', passes: 0 };
        return true;
    }

    /** Present the chained result: one blit pass into the WebGPU canvas, one drawImage. */
    endPostChain() {
        const chain = this._chain;
        this._chain = null;
        if (!chain || !this.gpuDevice) return;
        if (chain.passes === 0) return; // nothing ran; the 2D canvas is still current
        const view = chain.srcKey === 'A' ? this._frameTexView : this._pingTexView;
        this._drawFullscreen(this._blitPipeline, this._bindGroupFor(this._blitBG, chain.srcKey, this._blitPipeline, this._blitSampler, view, null),
            this.gpuContext.getCurrentTexture().createView());
        this.ctx.clearRect(0, 0, this.targetW, this.targetH);
        this.ctx.drawImage(this.gpuCanvas, 0, 0);
    }

    /** Bind group cache keyed by which texture ('A' = _frameTex, 'B' = _pingTex) is the input. */
    _bindGroupFor(cache, key, pipeline, sampler, view, uniformBuffer) {
        let bg = cache[key];
        if (!bg) {
            const entries = [
                { binding: 0, resource: sampler },
                { binding: 1, resource: view },
            ];
            if (uniformBuffer) entries.push({ binding: 2, resource: { buffer: uniformBuffer } });
            bg = cache[key] = this.gpuDevice.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries });
        }
        return bg;
    }

    _drawFullscreen(pipeline, bindGroup, targetView) {
        const commandEncoder = this.gpuDevice.createCommandEncoder();
        const passEncoder = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: targetView,
                clearValue: { r: 0, g: 0, b: 0, a: 1 },
                loadOp: 'clear', storeOp: 'store'
            }]
        });
        passEncoder.setPipeline(pipeline);
        passEncoder.setBindGroup(0, bindGroup);
        passEncoder.draw(3); // full-screen triangle
        passEncoder.end();
        this.gpuDevice.queue.submit([commandEncoder.finish()]);
    }

    /**
     * Run one post pass. Inside a chain: read the current source texture, write the
     * other one, swap. Standalone: upload the canvas, render to the WebGPU canvas,
     * drawImage back (the pre-chain behaviour).
     */
    _runPostPass(pipeline, sampler, uniformBuffer, cache) {
        const chain = this._chain;
        if (chain) {
            const inKey = chain.srcKey, outKey = inKey === 'A' ? 'B' : 'A';
            const inView = inKey === 'A' ? this._frameTexView : this._pingTexView;
            const outView = outKey === 'A' ? this._frameTexView : this._pingTexView;
            this._drawFullscreen(pipeline, this._bindGroupFor(cache, inKey, pipeline, sampler, inView, uniformBuffer), outView);
            chain.srcKey = outKey;
            chain.passes++;
            return;
        }
        const texture = this._getFrameTexture();
        this.gpuDevice.queue.copyExternalImageToTexture({ source: this.canvas }, { texture }, [this.targetW, this.targetH]);
        this._drawFullscreen(pipeline, this._bindGroupFor(cache, 'A', pipeline, sampler, this._frameTexView, uniformBuffer),
            this.gpuContext.getCurrentTexture().createView());
        this.ctx.clearRect(0, 0, this.targetW, this.targetH);
        this.ctx.drawImage(this.gpuCanvas, 0, 0);
    }

    getCropCoordinates(activeMedia, isImageMode) {
        const w = isImageMode ? activeMedia.naturalWidth : activeMedia.videoWidth;
        const h = isImageMode ? activeMedia.naturalHeight : activeMedia.videoHeight;
        if (!w || !h) return { sx: 0, sy: 0, sw: 1, sh: 1 };
        const videoRatio = w / h; 
        let sx, sy, sw, sh;
        if (videoRatio > this.targetRatio) { 
            sh = h; sw = sh * this.targetRatio; sx = (w - sw) / 2; sy = 0; 
        } else { 
            sw = w; sh = sw / this.targetRatio; sx = 0; sy = (h - sh) / 2; 
        }
        return { sx, sy, sw, sh };
    }

    getARBoxes(activeMedia, crop) {
        this.arTrackerFrameCount++;
        if (this.arTrackerFrameCount % 4 !== 0 && this.arPrevFrame) {
            return this.arCachedBoxes;
        }

        this.arAnaCtx.drawImage(activeMedia, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, 80, 45);
        const curr = this.arAnaCtx.getImageData(0, 0, 80, 45);
        const pixels = curr.data;
        let points = [];

        if (this.arPrevFrame) {
            for (let i = 0; i < pixels.length; i += 16) { 
                const diff = Math.abs(pixels[i] - this.arPrevFrame[i]);
                if (diff > 40) { 
                    const idx = i / 4;
                    points.push({ x: idx % 80, y: Math.floor(idx / 80) });
                }
            }
        }
        this.arPrevFrame = new Uint8ClampedArray(pixels);

        let clusters = [];
        const threshold = 8;
        for (let i = 0; i < points.length; i++) {
            let p = points[i];
            let foundCluster = null;
            for (let j = 0; j < clusters.length; j++) {
                let c = clusters[j];
                if (p.x >= c.minX - threshold && p.x <= c.maxX + threshold &&
                    p.y >= c.minY - threshold && p.y <= c.maxY + threshold) {
                    if (!foundCluster) {
                        c.minX = Math.min(c.minX, p.x); c.maxX = Math.max(c.maxX, p.x);
                        c.minY = Math.min(c.minY, p.y); c.maxY = Math.max(c.maxY, p.y);
                        c.count++; foundCluster = c;
                    } else {
                        foundCluster.minX = Math.min(foundCluster.minX, c.minX);
                        foundCluster.maxX = Math.max(foundCluster.maxX, c.maxX);
                        foundCluster.minY = Math.min(foundCluster.minY, c.minY);
                        foundCluster.maxY = Math.max(foundCluster.maxY, c.maxY);
                        foundCluster.count += c.count;
                        clusters.splice(j, 1); j--;
                    }
                }
            }
            if (!foundCluster) clusters.push({ minX: p.x, maxX: p.x, minY: p.y, maxY: p.y, count: 1 });
        }
        
        this.arCachedBoxes = clusters.filter(c => c.count > 5).map(c => ({
            x: c.minX / 80, y: c.minY / 45,
            w: Math.max(1, c.maxX - c.minX) / 80, h: Math.max(1, c.maxY - c.minY) / 45
        }));
        return this.arCachedBoxes;
    }

    drawTrackedBoxes(sourceCanvas, boxes, pad = 30) {
        const dw = this.targetW, dh = this.targetH;
        boxes.forEach((b) => {
            const bx = Math.floor((b.x * dw) - pad);
            const by = Math.floor((b.y * dh) - pad);
            const bw = Math.floor(Math.max(80, b.w * dw) + (pad * 2));
            const bh = Math.floor(Math.max(80, b.h * dh) + (pad * 2));

            const sx = Math.max(0, bx);
            const sy = Math.max(0, by);
            const sw = Math.min(dw - sx, bw - (sx - bx)); 
            const sh = Math.min(dh - sy, bh - (sy - by));

            if (sw > 0 && sh > 0) {
                this.ctx.drawImage(sourceCanvas, sx, sy, sw, sh, sx, sy, sw, sh);
            }
        });
    }

    applyBloom(intensity) {
        if (this.bloomCanvas.width !== this.targetW) { 
            this.bloomCanvas.width = this.targetW; 
            this.bloomCanvas.height = this.targetH; 
        }
        this.bloomCtx.clearRect(0, 0, this.targetW, this.targetH);
        this.bloomCtx.drawImage(this.canvas, 0, 0);

        this.ctx.save();
        this.ctx.globalCompositeOperation = 'screen';
        const blurAmt = intensity / 10;
        this.ctx.filter = `blur(${blurAmt}px)`;
        this.ctx.globalAlpha = (intensity / 100);
        this.ctx.drawImage(this.bloomCanvas, 0, 0);
        this.ctx.restore();
    }

    /**
     * Build the fisheye pipeline asynchronously (never blocks the frame). Idempotent:
     * one build per device. applyFisheye() skips its pass until this resolves — the
     * canvas is already correct without the distortion for those one or two frames.
     */
    _ensureFisheyePipeline() {
        if (!this.gpuDevice || this.fisheyePipeline || this._fisheyePending) return;
        this._fisheyePending = true;
        const device = this.gpuDevice;
        {
            // Improved spherical fisheye shader with aspect ratio correction & NaN protection
            const shader = `
                @group(0) @binding(0) var mySampler: sampler;
                @group(0) @binding(1) var myTexture: texture_2d<f32>;
                @group(0) @binding(2) var<uniform> params: vec4<f32>; // x=intensity, y=aspectRatio

                struct VertexOutput {
                    @builtin(position) position: vec4<f32>,
                    @location(0) uv: vec2<f32>
                };

                @vertex
                fn vs_main(@builtin(vertex_index) vi: u32) -> VertexOutput {
                    // Generates a triangle large enough to cover the entire screen
                    // vi=0: (-1, -1), vi=1: (3, -1), vi=2: (-1, 3)
                    let x = f32(i32(vi) == 1) * 4.0 - 1.0;
                    let y = f32(i32(vi) == 2) * 4.0 - 1.0;
                    
                    var out: VertexOutput;
                    out.position = vec4<f32>(x, y, 0.0, 1.0);
                    // UV mapping: 
                    // (-1, -1) -> (0, 1)
                    // ( 3, -1) -> (2, 1)
                    // (-1,  3) -> (0, -1)
                    out.uv = vec2<f32>(x * 0.5 + 0.5, 1.0 - (y * 0.5 + 0.5));
                    return out;
                }

                @fragment
                fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
                    let strength = params.x;
                    let aspect = params.y;

                    // Convert UV (0..1) to normalized coords (-1..1) with aspect ratio correction
                    var n = (in.uv * 2.0) - 1.0;
                    n.x *= aspect;

                    let r = length(n);

                    // Spherical fisheye mapping (only inside the unit circle to avoid edge artifacts)
                    if (r < 1.0 && r > 0.001) {
                        let theta = atan2(n.y, n.x);
                        // Spherical barrel distortion: mix between linear r and warped r
                        let nr = (r + (1.0 - sqrt(1.0 - r * r))) / 2.0;
                        // Blend between original radius and warped radius using intensity
                        let finalR = mix(r, nr, strength);
                        n = vec2<f32>(finalR * cos(theta), finalR * sin(theta));
                    }

                    // Undo aspect ratio correction
                    n.x /= aspect;

                    // Map back to texture UV space (0..1)
                    let warpedUV = (n + 1.0) / 2.0;

                    // Clamp to valid range (sampler also clamps, belt-and-suspenders)
                    let safeUV = clamp(warpedUV, vec2<f32>(0.0), vec2<f32>(1.0));

                    return textureSample(myTexture, mySampler, safeUV);
                }
            `;
            const module = device.createShaderModule({ code: shader });
            this.fisheyeUniformBuffer = device.createBuffer({
                size: 16, // vec4<f32> = 16 bytes
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
            });
            // Clamp-to-edge prevents black seams at texture boundaries during distortion
            this.fisheyeSampler = device.createSampler({
                magFilter: 'linear',
                minFilter: 'linear',
                addressModeU: 'clamp-to-edge',
                addressModeV: 'clamp-to-edge'
            });
            device.createRenderPipelineAsync({
                layout: 'auto',
                vertex: { module, entryPoint: 'vs_main' },
                fragment: {
                    module, entryPoint: 'fs_main',
                    targets: [{ format: this.gpuFormat }]
                },
                primitive: { topology: 'triangle-list' }
            }).then((pipeline) => {
                if (this.gpuDevice !== device) return; // device was lost meanwhile
                this.fisheyePipeline = pipeline;
                this._fisheyeBG = {};
            }).catch((e) => {
                console.error('Fisheye pipeline failed to build:', e);
            }).finally(() => { this._fisheyePending = false; });
        }
    }

    async applyFisheye(intensity) {
        if (!this.gpuDevice) return;
        if (!this.fisheyePipeline) { this._ensureFisheyePipeline(); return; }

        const aspect = this.targetW / this.targetH;
        this.gpuDevice.queue.writeBuffer(this.fisheyeUniformBuffer, 0, new Float32Array([intensity, aspect, 0, 0]));
        this._getFrameTexture(); // make sure the views + caches exist before binding
        this._runPostPass(this.fisheyePipeline, this.fisheyeSampler, this.fisheyeUniformBuffer, this._fisheyeBG || (this._fisheyeBG = {}));
    }

    /**
     * GPU-accelerated Global Visuals: BnW, Negative, RGB Chromatic Aberration.
     * Runs all three in a single shader pass — replaces the CPU pixel loop.
     * @param {{ bnw: boolean, negative: boolean, rgbColors: boolean }} flags
     */
    async applyGlobalVisuals(flags) {
        if (!this.gpuDevice) {
            // Fallback: use Canvas 2D composite operations (fast, no pixel loop)
            this._applyGlobalVisualsFallback(flags);
            return;
        }

        if (!this._gvPipeline) {
            // Pipeline still compiling (async): keep the frame correct via the 2D
            // composite fallback for these one or two frames.
            this._ensureGvPipeline();
            this._applyGlobalVisualsFallback(flags);
            return;
        }

        // Compute chromatic shift in pixels
        const rgbShift = flags.rgbColors ? Math.max(2, Math.round(this.targetW * 0.004)) : 0;
        const texelW = 1.0 / this.targetW;

        this.gpuDevice.queue.writeBuffer(this._gvUniformBuffer, 0, new Float32Array([
            flags.bnw ? 1.0 : 0.0,
            flags.negative ? 1.0 : 0.0,
            rgbShift,
            texelW
        ]));
        this._getFrameTexture(); // make sure the views + caches exist before binding
        this._runPostPass(this._gvPipeline, this._gvSampler, this._gvUniformBuffer, this._gvBG || (this._gvBG = {}));
    }

    /** Build the Global Visuals pipeline asynchronously (see _ensureFisheyePipeline). */
    _ensureGvPipeline() {
        if (!this.gpuDevice || this._gvPipeline || this._gvPending) return;
        this._gvPending = true;
        const device = this.gpuDevice;
        {
            const shader = `
                @group(0) @binding(0) var mySampler: sampler;
                @group(0) @binding(1) var myTexture: texture_2d<f32>;
                @group(0) @binding(2) var<uniform> params: vec4<f32>;
                // params.x = bnw (0 or 1)
                // params.y = negative (0 or 1)
                // params.z = rgbShift (pixel offset, 0 = disabled)
                // params.w = texelWidth (1.0 / textureWidth)

                struct VertexOutput {
                    @builtin(position) position: vec4<f32>,
                    @location(0) uv: vec2<f32>
                };

                @vertex
                fn vs_main(@builtin(vertex_index) vi: u32) -> VertexOutput {
                    let x = f32(i32(vi) == 1) * 4.0 - 1.0;
                    let y = f32(i32(vi) == 2) * 4.0 - 1.0;
                    var out: VertexOutput;
                    out.position = vec4<f32>(x, y, 0.0, 1.0);
                    out.uv = vec2<f32>(x * 0.5 + 0.5, 1.0 - (y * 0.5 + 0.5));
                    return out;
                }

                @fragment
                fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
                    let bnw      = params.x;
                    let neg      = params.y;
                    let shift    = params.z;    // chromatic shift in texels
                    let texelW   = params.w;    // 1.0 / texture width

                    // Sample center pixel
                    var color = textureSample(myTexture, mySampler, in.uv);

                    // RGB Chromatic Aberration: offset red right, blue left
                    if (shift > 0.0) {
                        let offsetUV = vec2<f32>(shift * texelW, 0.0);
                        let rSample = textureSample(myTexture, mySampler, in.uv + offsetUV);
                        let bSample = textureSample(myTexture, mySampler, in.uv - offsetUV);
                        color = vec4<f32>(rSample.r, color.g, bSample.b, color.a);
                    }

                    var r = color.r;
                    var g = color.g;
                    var b = color.b;

                    // BnW: luminance desaturation
                    if (bnw > 0.5) {
                        let lum = r * 0.299 + g * 0.587 + b * 0.114;
                        r = lum; g = lum; b = lum;
                    }

                    // Negative: invert
                    if (neg > 0.5) {
                        r = 1.0 - r;
                        g = 1.0 - g;
                        b = 1.0 - b;
                    }

                    return vec4<f32>(r, g, b, color.a);
                }
            `;
            const module = device.createShaderModule({ code: shader });
            this._gvUniformBuffer = device.createBuffer({
                size: 16,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
            });
            this._gvSampler = device.createSampler({
                magFilter: 'linear',
                minFilter: 'linear',
                addressModeU: 'clamp-to-edge',
                addressModeV: 'clamp-to-edge'
            });
            device.createRenderPipelineAsync({
                layout: 'auto',
                vertex: { module, entryPoint: 'vs_main' },
                fragment: {
                    module, entryPoint: 'fs_main',
                    targets: [{ format: this.gpuFormat }]
                },
                primitive: { topology: 'triangle-list' }
            }).then((pipeline) => {
                if (this.gpuDevice !== device) return; // device was lost meanwhile
                this._gvPipeline = pipeline;
                this._gvBG = {};
            }).catch((e) => {
                console.error('Global Visuals pipeline failed to build:', e);
            }).finally(() => { this._gvPending = false; });
        }
    }

    /**
     * Canvas 2D fallback for browsers without WebGPU.
     * Uses compositing operations instead of pixel loops — still much faster than getImageData.
     */
    _applyGlobalVisualsFallback(flags) {
        const ctx = this.ctx;
        const W = this.targetW;
        const H = this.targetH;

        // RGB Chromatic Aberration via compositing
        if (flags.rgbColors) {
            const shift = Math.max(2, Math.round(W * 0.004));
            // Copy current canvas
            if (this.bloomCanvas.width !== W || this.bloomCanvas.height !== H) {
                this.bloomCanvas.width = W;
                this.bloomCanvas.height = H;
            }
            this.bloomCtx.clearRect(0, 0, W, H);
            this.bloomCtx.drawImage(this.canvas, 0, 0);

            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = 0.5;
            // Red channel shifted right
            ctx.filter = 'saturate(3) hue-rotate(0deg)';
            ctx.drawImage(this.bloomCanvas, shift, 0, W, H);
            // Blue channel shifted left
            ctx.filter = 'saturate(3) hue-rotate(180deg)';
            ctx.drawImage(this.bloomCanvas, -shift, 0, W, H);
            ctx.filter = 'none';
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1.0;
            ctx.restore();
        }

        // BnW via saturation compositing
        if (flags.bnw) {
            ctx.save();
            ctx.globalCompositeOperation = 'saturation';
            ctx.globalAlpha = 1.0;
            ctx.fillStyle = '#808080';
            ctx.fillRect(0, 0, W, H);
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1.0;
            ctx.restore();
        }

        // Negative via difference compositing
        if (flags.negative) {
            ctx.save();
            ctx.globalCompositeOperation = 'difference';
            ctx.globalAlpha = 1.0;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, W, H);
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1.0;
            ctx.restore();
        }
    }
}
