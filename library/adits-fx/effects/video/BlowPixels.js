import { BaseEffect } from '../../shared/BaseEffect.js';

/**
 * Blow Pixels Effect (WebGPU)
 * Uses FBM noise to create a "wind" that blows media pixels.
 * Improved with motion blur and directional scattering.
 */
export class BlowPixels extends BaseEffect {
    constructor() {
        super('Blow Pixels (WebGPU)');
        this.isGPU = true;
        this.pipelineReady = false;
        this.initializing = false;
    }

    _sharedWgsl() {
        return /* wgsl */`
            struct VertexOutput {
                @builtin(position) position: vec4<f32>,
                @location(0) uv: vec2<f32>
            };

            @vertex
            fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
                var pos = array<vec2<f32>, 6>(
                    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
                    vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0)
                );
                var uv = array<vec2<f32>, 6>(
                    vec2<f32>(0.0, 1.0), vec2<f32>(1.0, 1.0), vec2<f32>(0.0, 0.0),
                    vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 1.0), vec2<f32>(1.0, 0.0)
                );
                var out: VertexOutput;
                out.position = vec4<f32>(pos[vertexIndex], 0.0, 1.0);
                out.uv = uv[vertexIndex];
                return out;
            }

            struct Uniforms {
                time: f32,
                intensity: f32,
                windStrength: f32,
                turbulence: f32,
                
                dirX: f32,
                dirY: f32,
                noiseSpeed: f32,
                midBoost: f32,
                
                speedSync: f32,
                particleSize: f32,
                colorMode: f32,
                _pad3: f32,
                
                uvRect: vec4<f32>
            };

            @group(0) @binding(0) var mySampler: sampler;
            @group(0) @binding(2) var<uniform> u: Uniforms;

            fn hash(p: vec2<f32>) -> f32 {
                return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453123);
            }

            fn getThermal(t: f32) -> vec3<f32> {
                let c1 = vec3<f32>(0.0, 0.0, 0.2);
                let c2 = vec3<f32>(0.0, 0.3, 1.0);
                let c3 = vec3<f32>(0.8, 0.0, 0.8);
                let c4 = vec3<f32>(1.0, 0.1, 0.0);
                let c5 = vec3<f32>(1.0, 0.9, 0.2);

                let val = t * 4.0;
                let phase = floor(val);
                let f = fract(val);

                if (phase < 1.0) { return mix(c1, c2, f); }
                if (phase < 2.0) { return mix(c2, c3, f); }
                if (phase < 3.0) { return mix(c3, c4, f); }
                return mix(c4, c5, f);
            }

            fn rgb2hsv(c: vec3<f32>) -> vec3<f32> {
                let K = vec4<f32>(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
                let p = mix(vec4<f32>(c.bg, K.wz), vec4<f32>(c.gb, K.xy), step(c.b, c.g));
                let q = mix(vec4<f32>(p.xyw, c.r), vec4<f32>(c.r, p.yzx), step(p.x, c.r));
                let d = q.x - min(q.w, q.y);
                let e = 1.0e-10;
                return vec3<f32>(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
            }

            fn hsv2rgb(c: vec3<f32>) -> vec3<f32> {
                let K = vec4<f32>(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
                let p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
                return c.z * mix(K.xxx, clamp(p - K.xxx, vec3<f32>(0.0), vec3<f32>(1.0)), c.y);
            }
        `;
    }

    _videoWgsl() {
        return this._sharedWgsl() + /* wgsl */`
            @group(0) @binding(1) var myTexture: texture_external;

            @fragment
            fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
                var uv = in.uv;
                
                // Particle Size (Pixelation)
                if (u.particleSize > 0.001) {
                    let cells = vec2<f32>(1.0 / u.particleSize);
                    uv = floor(uv * cells) / cells;
                }

                var progress = u.intensity;
                
                if (u.midBoost > 0.0) {
                    progress = clamp(progress + (u.midBoost * 0.3), 0.0, 1.0);
                }
                
                let noiseScale = max(u.turbulence, 1.0) * 10.0;
                
                let dirRaw = vec2<f32>(u.dirX, u.dirY);
                let dir = select(normalize(dirRaw), vec2<f32>(0.0), dot(dirRaw, dirRaw) < 1e-8);
                let gradient = dot(uv - vec2<f32>(0.5), dir) + 0.5;
                let noiseVal = hash(uv * noiseScale) * 0.4 + gradient * 0.6;
                
                var alphaMult = 1.0;
                var isFlying = false;
                var flyDist = 0.0;
                
                if (progress > noiseVal) {
                    isFlying = true;
                    flyDist = (progress - noiseVal) * 2.0;
                    let intensity = flyDist * max(u.windStrength, 0.1) * 5.0;
                    
                    var fly = vec2<f32>(u.dirX, u.dirY) * intensity;
                    fly.y += sin(u.time * u.noiseSpeed * 2.0 * u.speedSync + noiseVal * 10.0) * 0.1 * intensity;
                    
                    uv -= fly;
                    alphaMult = 1.0 - smoothstep(0.0, 1.0, flyDist);
                }
                
                let baseCorr = clamp(u.uvRect.xy + uv * u.uvRect.zw, u.uvRect.xy, u.uvRect.xy + u.uvRect.zw);
                var color = textureSampleBaseClampToEdge(myTexture, mySampler, baseCorr);
                
                // Color Modes for blown pixels
                if (isFlying && u.colorMode > 0.5) {
                    let luma = dot(color.rgb, vec3<f32>(0.299, 0.587, 0.114));
                    if (u.colorMode < 1.5) {
                        color = vec4<f32>(vec3<f32>(luma), color.a);
                    } else if (u.colorMode < 2.5) {
                        let hsv = rgb2hsv(color.rgb);
                        let newColor = hsv2rgb(vec3<f32>(fract(hsv.x + u.time * 0.5 + flyDist), 1.0, 1.0));
                        color = vec4<f32>(newColor, color.a);
                    } else if (u.colorMode < 3.5) {
                        let newColor = step(vec3<f32>(0.5), color.rgb);
                        color = vec4<f32>(newColor, color.a);
                    } else if (u.colorMode < 4.5) {
                        let chrome = smoothstep(0.2, 0.8, sin(luma * 15.0 + u.time) * 0.5 + 0.5);
                        color = vec4<f32>(vec3<f32>(chrome), color.a);
                    } else if (u.colorMode < 5.5) {
                        let neonColor = mix(vec3<f32>(0.0, 1.0, 1.0), vec3<f32>(1.0, 0.0, 1.0), luma + sin(flyDist * 5.0)*0.5);
                        color = vec4<f32>(neonColor, color.a);
                    } else {
                        color = vec4<f32>(getThermal(luma), color.a);
                    }
                }
                
                return vec4<f32>(color.rgb * alphaMult, color.a * alphaMult);
            }
        `;
    }

    _imageWgsl() {
        return this._sharedWgsl() + /* wgsl */`
            @group(0) @binding(1) var myTexture: texture_2d<f32>;

            @fragment
            fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
                var uv = in.uv;
                
                // Particle Size (Pixelation)
                if (u.particleSize > 0.001) {
                    let cells = vec2<f32>(1.0 / u.particleSize);
                    uv = floor(uv * cells) / cells;
                }

                var progress = u.intensity;
                
                if (u.midBoost > 0.0) {
                    progress = clamp(progress + (u.midBoost * 0.3), 0.0, 1.0);
                }
                
                let noiseScale = max(u.turbulence, 1.0) * 10.0;
                
                let dirRaw = vec2<f32>(u.dirX, u.dirY);
                let dir = select(normalize(dirRaw), vec2<f32>(0.0), dot(dirRaw, dirRaw) < 1e-8);
                let gradient = dot(uv - vec2<f32>(0.5), dir) + 0.5;
                let noiseVal = hash(uv * noiseScale) * 0.4 + gradient * 0.6;
                
                var alphaMult = 1.0;
                var isFlying = false;
                var flyDist = 0.0;
                
                if (progress > noiseVal) {
                    isFlying = true;
                    flyDist = (progress - noiseVal) * 2.0;
                    let intensity = flyDist * max(u.windStrength, 0.1) * 5.0;
                    
                    var fly = vec2<f32>(u.dirX, u.dirY) * intensity;
                    fly.y += sin(u.time * u.noiseSpeed * 2.0 * u.speedSync + noiseVal * 10.0) * 0.1 * intensity;
                    
                    uv -= fly;
                    alphaMult = 1.0 - smoothstep(0.0, 1.0, flyDist);
                }
                
                let baseCorr = clamp(u.uvRect.xy + uv * u.uvRect.zw, u.uvRect.xy, u.uvRect.xy + u.uvRect.zw);
                var color = textureSample(myTexture, mySampler, baseCorr);
                
                // Color Modes for blown pixels
                if (isFlying && u.colorMode > 0.5) {
                    let luma = dot(color.rgb, vec3<f32>(0.299, 0.587, 0.114));
                    if (u.colorMode < 1.5) {
                        color = vec4<f32>(vec3<f32>(luma), color.a);
                    } else if (u.colorMode < 2.5) {
                        let hsv = rgb2hsv(color.rgb);
                        let newColor = hsv2rgb(vec3<f32>(fract(hsv.x + u.time * 0.5 + flyDist), 1.0, 1.0));
                        color = vec4<f32>(newColor, color.a);
                    } else if (u.colorMode < 3.5) {
                        let newColor = step(vec3<f32>(0.5), color.rgb);
                        color = vec4<f32>(newColor, color.a);
                    } else if (u.colorMode < 4.5) {
                        let chrome = smoothstep(0.2, 0.8, sin(luma * 15.0 + u.time) * 0.5 + 0.5);
                        color = vec4<f32>(vec3<f32>(chrome), color.a);
                    } else if (u.colorMode < 5.5) {
                        let neonColor = mix(vec3<f32>(0.0, 1.0, 1.0), vec3<f32>(1.0, 0.0, 1.0), luma + sin(flyDist * 5.0)*0.5);
                        color = vec4<f32>(neonColor, color.a);
                    } else {
                        color = vec4<f32>(getThermal(luma), color.a);
                    }
                }
                
                return vec4<f32>(color.rgb * alphaMult, color.a * alphaMult);
            }
        `;
    }

    async initGPU(videoEngine) {
        if (!videoEngine.gpuDevice || this.pipelineReady) return;
        this.initializing = true;
        const device = videoEngine.gpuDevice;
        const format = videoEngine.gpuFormat || navigator.gpu.getPreferredCanvasFormat();

        try {
            const videoModule = device.createShaderModule({ code: this._videoWgsl() });
            const imageModule = device.createShaderModule({ code: this._imageWgsl() });

            const makePipeline = (module) => ({
                layout: 'auto',
                vertex:    { module, entryPoint: 'vs_main' },
                fragment:  { module, entryPoint: 'fs_main', targets: [{ format }] },
                primitive: { topology: 'triangle-list' }
            });

            this.videoPipeline = await device.createRenderPipelineAsync(makePipeline(videoModule));
            this.imagePipeline = await device.createRenderPipelineAsync(makePipeline(imageModule));

            this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
            this.uniformBuffer = device.createBuffer({
                size: 64,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
            });

            this.pipelineReady = true;
        } catch (e) {
            console.error("BlowPixels GPU Init Failed:", e);
        } finally {
            this.initializing = false;
        }
    }

    renderGPU(videoEngine, activeMedia, crop, audioFeatures) {
        if (!this.pipelineReady) {
            if (videoEngine.gpuDevice && !this.initializing) {
                this.initGPU(videoEngine);
            }
            return false;
        }
        if (!videoEngine.gpuDevice) return;

        const device  = videoEngine.gpuDevice;
        const context = videoEngine.gpuContext;

        const intensity    = parseFloat(document.getElementById('advBlowIntensity')?.value || '0.5');
        const windStrength = parseFloat(document.getElementById('advBlowStrength')?.value || '0.1');
        const turbulence   = parseFloat(document.getElementById('advBlowTurbulence')?.value || '10.0');
        const angleDeg     = parseFloat(document.getElementById('advBlowAngle')?.value || '90');
        const noiseSpeed   = parseFloat(document.getElementById('advBlowSpeed')?.value || '1.0');
        const particleSize = parseFloat(document.getElementById('advBlowSize')?.value || '0.0');
        const colorMode    = parseFloat(document.getElementById('advBlowColorMode')?.value || '0');
        const audioOn      = document.getElementById('advBlowAudio')?.checked ?? true;

        const angleRad = angleDeg * (Math.PI / 180.0);
        const dirX = Math.cos(angleRad);
        const dirY = Math.sin(angleRad);
        const midBoost = (audioOn && audioFeatures && typeof audioFeatures.mid === 'number' && !isNaN(audioFeatures.mid)) ? audioFeatures.mid : 0.0;
        
        const isSpeedSyncEnabled = document.getElementById('speedSyncToggle')?.checked ?? false;
        let speedSync = 1.0;
        if (isSpeedSyncEnabled && videoEngine.activeMedia && videoEngine.activeMedia.playbackRate && !isNaN(videoEngine.activeMedia.playbackRate)) {
            speedSync = videoEngine.activeMedia.playbackRate;
        }

        const time = performance.now() / 1000;
        const mw = activeMedia.naturalWidth  || activeMedia.videoWidth  || 1;
        const mh = activeMedia.naturalHeight || activeMedia.videoHeight || 1;
        const normSx = crop.sx / mw;
        const normSy = crop.sy / mh;
        const normSw = crop.sw / mw;
        const normSh = crop.sh / mh;

        device.queue.writeBuffer(this.uniformBuffer, 0, new Float32Array([
            time, intensity, windStrength, turbulence,
            dirX, dirY, noiseSpeed, midBoost,
            speedSync, particleSize, colorMode, 0.0,
            normSx, normSy, normSw, normSh
        ]));

        const isImage = activeMedia.tagName === 'IMG' || activeMedia.tagName === 'CANVAS';
        let textureResource;

        if (isImage) {
            const w = activeMedia.naturalWidth  || activeMedia.width  || videoEngine.targetW;
            const h = activeMedia.naturalHeight || activeMedia.height || videoEngine.targetH;
            
            if (!this.imgTexture || this.imgTexture.width !== w || this.imgTexture.height !== h) {
                if (this.imgTexture) this.imgTexture.destroy();
                this.imgTexture = device.createTexture({
                    size: [w, h],
                    format: 'rgba8unorm',
                    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
                });
            }
            device.queue.copyExternalImageToTexture({ source: activeMedia }, { texture: this.imgTexture }, [w, h]);
            textureResource = this.imgTexture.createView();
        } else {
            textureResource = device.importExternalTexture({ source: activeMedia });
        }

        const pipeline = isImage ? this.imagePipeline : this.videoPipeline;
        const bindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: this.sampler },
                { binding: 1, resource: textureResource },
                { binding: 2, resource: { buffer: this.uniformBuffer } }
            ]
        });

        const commandEncoder = device.createCommandEncoder();
        const passEncoder = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: context.getCurrentTexture().createView(),
                clearValue: { r: 0, g: 0, b: 0, a: 1 },
                loadOp: 'clear', storeOp: 'store'
            }]
        });

        passEncoder.setPipeline(pipeline);
        passEncoder.setBindGroup(0, bindGroup);
        passEncoder.draw(6);
        passEncoder.end();

        device.queue.submit([commandEncoder.finish()]);
    }
}
