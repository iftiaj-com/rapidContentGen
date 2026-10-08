/**
 * PhotoCubeGlass — builds a THREE.Group: an inner object (a photo cube, a GLB
 * scene, a planet…) enclosed by / fronted with a transmission glass shell.
 *
 * Glass styles (opts.style):
 *   'shell'       — rounded glass cube around the inner (original behavior).
 *   'crystal'     — glass sphere (acts as a refractive lens / crystal ball).
 *   'portal_card' — flat rounded glass card in FRONT of the inner, with an
 *                   optional striped depth backdrop tunnel (opts.backdrop) for a
 *                   "looking into a deep box" portal illusion.
 *
 * group.userData exposes { inner, photoCube, glassCube, glassMat } for live
 * material updates. _fitObject() in AnamorphicCamera normalises the group to ~2
 * world units. Disposal is handled by AnamorphicCamera._disposeObject() via traverse.
 */
export class PhotoCubeGlass {

    static GLASS_SIZE = 2.2;
    static PHOTO_SIZE = 2.0;

    /**
     * Build rounded-rect-extruded geometry approximating a rounded box.
     * curveRadius is a 0–0.5 proportional value (0 = sharp BoxGeometry fallback).
     */
    static _makeRoundedBoxGeo(THREE, size, curveRadius) {
        if (curveRadius <= 0) return new THREE.BoxGeometry(size, size, size);

        const r      = Math.min(curveRadius, 0.45) * (size / 2); // world-space corner radius
        const bevel  = r * 0.4;
        const inner  = r * 0.6;                                   // 2D shape corner radius
        const hw     = (size - bevel * 2) / 2;                    // shape half-width so total ≈ size

        const shape = new THREE.Shape();
        shape.moveTo(-hw + inner, -hw);
        shape.lineTo( hw - inner, -hw);
        shape.quadraticCurveTo( hw, -hw,  hw, -hw + inner);
        shape.lineTo( hw,  hw - inner);
        shape.quadraticCurveTo( hw,  hw,  hw - inner,  hw);
        shape.lineTo(-hw + inner,  hw);
        shape.quadraticCurveTo(-hw,  hw, -hw,  hw - inner);
        shape.lineTo(-hw, -hw + inner);
        shape.quadraticCurveTo(-hw, -hw, -hw + inner, -hw);

        const geo = new THREE.ExtrudeGeometry(shape, {
            depth:          size - bevel * 2,
            bevelEnabled:   true,
            bevelSegments:  4,
            bevelSize:      bevel,
            bevelThickness: bevel,
            curveSegments:  20,
        });
        geo.center();
        return geo;
    }

    /**
     * Flat rounded "card" geometry (w × h, shallow depth) for the Portal Card style.
     * curveRadius is a 0–0.5 proportional value (0 = sharp corners).
     */
    static _makeRoundedCardGeo(THREE, w, h, depth, curveRadius) {
        const r  = Math.max(0, Math.min(curveRadius, 0.45)) * (Math.min(w, h) / 2);
        const x  = -w / 2, y = -h / 2;

        const shape = new THREE.Shape();
        shape.moveTo(x + r, y);
        shape.lineTo(x + w - r, y);
        shape.quadraticCurveTo(x + w, y, x + w, y + r);
        shape.lineTo(x + w, y + h - r);
        shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        shape.lineTo(x + r, y + h);
        shape.quadraticCurveTo(x, y + h, x, y + h - r);
        shape.lineTo(x, y + r);
        shape.quadraticCurveTo(x, y, x + r, y);

        const geo = new THREE.ExtrudeGeometry(shape, {
            depth,
            bevelEnabled:   r > 0,
            bevelSegments:  3,
            bevelSize:      r * 0.3,
            bevelThickness: depth * 0.3,
            curveSegments:  16,
        });
        geo.center();
        return geo;
    }

    /** Shared transmission glass material (MeshPhysicalMaterial). */
    static _makeGlassMaterial(THREE, { glassTint = '#969696', ior = 1.5, opacity = 0.9 } = {}) {
        return new THREE.MeshPhysicalMaterial({
            color:              glassTint,
            transmission:       1.0,
            roughness:          0.0,
            metalness:          0.0,
            ior,
            thickness:          0.15,
            clearcoat:          1.0,
            clearcoatRoughness: 0.0,
            transparent:        true,
            opacity,
            side:               THREE.DoubleSide,
            depthWrite:         false,
        });
    }

    /** Glass geometry for the selected style. */
    static _makeGlassGeo(THREE, style, curveRadius) {
        const S = PhotoCubeGlass.GLASS_SIZE;
        if (style === 'crystal')     return new THREE.SphereGeometry(S / 2, 48, 32);
        if (style === 'portal_card') return PhotoCubeGlass._makeRoundedCardGeo(THREE, 1.6, 2.0, 0.22, curveRadius);
        return PhotoCubeGlass._makeRoundedBoxGeo(THREE, S, curveRadius); // 'shell'
    }

    /** Largest-dimension target the inner object is fit to, per style. */
    static _innerTarget(style, photoScale) {
        if (style === 'crystal')     return 1.20 * photoScale; // fit inside the sphere
        if (style === 'portal_card') return 1.50 * photoScale; // sit behind the card
        return PhotoCubeGlass.PHOTO_SIZE * photoScale;         // 'shell'
    }

    /** Z offset of the inner object, per style (portal card pushes it behind the glass). */
    static _innerPosZ(style) { return style === 'portal_card' ? -0.10 : 0; }

    /** Z offset of the glass mesh, per style (portal card places it in front). */
    static _glassPosZ(style) { return style === 'portal_card' ? 0.50 : 0; }

    /** Dark, subtly-striped canvas texture used by the portal depth backdrop. */
    static _makeStripeTexture(THREE) {
        const c = document.createElement('canvas');
        c.width = 8; c.height = 256;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#050507';
        ctx.fillRect(0, 0, 8, 256);
        ctx.fillStyle = 'rgba(150,160,200,0.55)';
        for (let y = 0; y < 256; y += 12) ctx.fillRect(0, y, 8, 2);
        const tex = new THREE.CanvasTexture(c);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        return tex;
    }

    /**
     * Open striped "tunnel" (back + 4 sides, no front) that recedes behind the
     * inner object for the Portal Card depth illusion. Dark/cool so it blends into
     * the scene background near the opening.
     */
    static _makeDepthBackdrop(THREE) {
        const tex = PhotoCubeGlass._makeStripeTexture(THREE);
        const mat = new THREE.MeshBasicMaterial({
            map: tex, side: THREE.DoubleSide, toneMapped: false, color: 0x3a4a88,
        });
        const grp = new THREE.Group();

        const W = 1.7, H = 2.1, D = 1.4;
        const frontZ = 0.35, backZ = frontZ - D, midZ = (frontZ + backZ) / 2;

        const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
        back.position.set(0, 0, backZ);
        grp.add(back);

        const top = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat);
        top.rotation.x = Math.PI / 2; top.position.set(0,  H / 2, midZ);
        const bot = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat);
        bot.rotation.x = Math.PI / 2; bot.position.set(0, -H / 2, midZ);
        grp.add(top); grp.add(bot);

        const left = new THREE.Mesh(new THREE.PlaneGeometry(D, H), mat);
        left.rotation.y = Math.PI / 2; left.position.set(-W / 2, 0, midZ);
        const right = new THREE.Mesh(new THREE.PlaneGeometry(D, H), mat);
        right.rotation.y = Math.PI / 2; right.position.set( W / 2, 0, midZ);
        grp.add(left); grp.add(right);

        grp.renderOrder = -1; // draw behind the inner object
        grp.userData.isBackdrop = true;
        return grp;
    }

    /**
     * Assemble the final group: fit + position the inner per style, add the glass
     * mesh (and optional depth backdrop). Shared by build() (image cube) and wrap()
     * (GLB / planet). Pass inner = null for a glass-only shell (particle mode).
     */
    static _assemble(THREE, inner, opts = {}, isPhotoCube = false) {
        const {
            photoScale = 0.85, curveRadius = 0.2,
            glassTint = '#969696', ior = 1.5, opacity = 0.9,
            style = 'shell', backdrop = false,
        } = opts;

        const group = new THREE.Group();

        if (inner) {
            const target = PhotoCubeGlass._innerTarget(style, photoScale);
            const box    = new THREE.Box3().setFromObject(inner);
            const size   = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z) || 1;
            const s      = target / maxDim;
            const zOff   = PhotoCubeGlass._innerPosZ(style);
            inner.scale.setScalar(s);
            inner.position.set(-center.x * s, -center.y * s, -center.z * s + zOff);
            inner.renderOrder = 0;
            group.add(inner);

            if (style === 'portal_card' && backdrop) group.add(PhotoCubeGlass._makeDepthBackdrop(THREE));
        }

        const glassMat  = PhotoCubeGlass._makeGlassMaterial(THREE, { glassTint, ior, opacity });
        const glassCube = new THREE.Mesh(PhotoCubeGlass._makeGlassGeo(THREE, style, curveRadius), glassMat);
        glassCube.position.z = PhotoCubeGlass._glassPosZ(style);
        glassCube.renderOrder = 1;
        glassCube.userData.isGlass = true; // let chrome-mode skip the glass mesh
        group.add(glassCube);

        group.userData = { inner: inner || null, photoCube: isPhotoCube ? inner : null, glassCube, glassMat };
        return group;
    }

    /**
     * Build and return a THREE.Group for an image. Resolves after the texture loads.
     * @param {object} THREE    — the three.js namespace (lazy-loaded by AnamorphicCamera)
     * @param {string} imageUrl — blob URL or data URL of the uploaded image
     * @param {object} opts     — { photoScale, curveRadius, glassTint, ior, opacity, style, backdrop, withPhoto, withGlass, imageFit }
     * @returns {Promise<THREE.Group>}
     */
    static async build(THREE, imageUrl, opts = {}) {
        const {
            photoScale = 0.85,
            withPhoto  = true,
            withGlass  = true,
            videoEl    = null,   // when set, the cube is textured from a live VideoTexture
            texture    = null,   // SHADEROBJ — when set, the cube is textured from this
                                 // ready-made texture and `imageUrl` is ignored. Used for
                                 // an uploaded shader, whose pixels live in an offscreen
                                 // render target rather than at a loadable URL, and by
                                 // ANAMBG's background cutout (a plain canvas texture).
            texturePremultiplied = true,  // ANAMBG — the shader's render target carries
                                 // PREMULTIPLIED alpha; the cutout module composites a
                                 // normal canvas, i.e. straight alpha. Blending straight
                                 // alpha as premultiplied darkens every feathered edge,
                                 // so the two sources have to declare which they are.
        } = opts;

        const PHOTO_SIZE = PhotoCubeGlass.PHOTO_SIZE;

        // ── Inner photo cube — same media on all 6 faces (scale 1; fit happens in _assemble) ──
        let photoCube = null;
        if (withPhoto && texture) {
            // SHADEROBJ — pre-supplied texture (a render target's). No load, no fit pass:
            // the source is already produced at the requested aspect. premultipliedAlpha
            // because adits_resolveAlpha() outputs premultiplied; blending it as straight
            // would multiply every soft edge by its alpha twice.
            photoCube = new THREE.Mesh(
                new THREE.BoxGeometry(PHOTO_SIZE, PHOTO_SIZE, PHOTO_SIZE),
                new THREE.MeshStandardMaterial({
                    map: texture, roughness: 0.15, metalness: 0.05,
                    transparent: true, alphaTest: 0.01, premultipliedAlpha: texturePremultiplied,
                })
            );
            photoCube.renderOrder = 0;
        } else if (withPhoto && videoEl) {
            // Video cube: live VideoTexture, stretched onto each face (Phase 1).
            const texture = new THREE.VideoTexture(videoEl);
            texture.colorSpace = THREE.SRGBColorSpace;
            photoCube = new THREE.Mesh(
                new THREE.BoxGeometry(PHOTO_SIZE, PHOTO_SIZE, PHOTO_SIZE),
                new THREE.MeshStandardMaterial({ map: texture, roughness: 0.15, metalness: 0.05, transparent: true, alphaTest: 0.01 })
            );
            photoCube.renderOrder = 0;
        } else if (withPhoto && imageUrl) {
            let texture = await new Promise((res, rej) =>
                new THREE.TextureLoader().load(imageUrl, res, undefined, rej));

            const fitMode = opts.imageFit || 'stretch';
            if (fitMode !== 'stretch' && texture.image) {
                const img = texture.image;
                const W_orig = img.width || img.naturalWidth;
                const H_orig = img.height || img.naturalHeight;
                let cvsW = W_orig, cvsH = H_orig;
                let dx = 0, dy = 0, sx = 0, sy = 0, sw = W_orig, sh = H_orig;

                if (fitMode === 'fit') {
                    const size = Math.max(W_orig, H_orig);
                    cvsW = size; cvsH = size;
                    dx = (size - W_orig) / 2;
                    dy = (size - H_orig) / 2;
                } else if (fitMode === 'fill') {
                    const size = Math.min(W_orig, H_orig);
                    cvsW = size; cvsH = size;
                    sx = (W_orig - size) / 2;
                    sy = (H_orig - size) / 2;
                    sw = size; sh = size;
                }

                // Keep texture sizes reasonable
                const MAX_SIZE = 2048;
                const scale = Math.max(cvsW, cvsH) > MAX_SIZE ? MAX_SIZE / Math.max(cvsW, cvsH) : 1;
                const W = Math.max(1, Math.round(cvsW * scale));
                const H = Math.max(1, Math.round(cvsH * scale));

                const cvs = document.createElement('canvas');
                cvs.width = W; cvs.height = H;
                const ctx2 = cvs.getContext('2d');
                ctx2.fillStyle = 'black';
                ctx2.fillRect(0, 0, W, H);

                if (fitMode === 'fill') {
                    ctx2.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
                } else if (fitMode === 'fit') {
                    // Blurred background layer
                    ctx2.filter = 'blur(15px) brightness(0.4)';
                    const bgScale = Math.max(W / W_orig, H / H_orig);
                    ctx2.drawImage(img, (W - W_orig * bgScale) / 2, (H - H_orig * bgScale) / 2, W_orig * bgScale, H_orig * bgScale);
                    ctx2.filter = 'none';
                    // Sharp foreground layer
                    ctx2.drawImage(img, dx * scale, dy * scale, W_orig * scale, H_orig * scale);
                } else {
                    ctx2.drawImage(img, dx * scale, dy * scale, W_orig * scale, H_orig * scale);
                }

                // Replace texture with our padded/cropped canvas
                texture.dispose();
                texture = new THREE.CanvasTexture(cvs);
            }

            texture.colorSpace = THREE.SRGBColorSpace;
            photoCube = new THREE.Mesh(
                new THREE.BoxGeometry(PHOTO_SIZE, PHOTO_SIZE, PHOTO_SIZE),
                new THREE.MeshStandardMaterial({ map: texture, roughness: 0.15, metalness: 0.05, transparent: true, alphaTest: 0.01 })
            );
            photoCube.renderOrder = 0;
        }

        // With glass: hand off to the shared style-aware assembler.
        if (withGlass) return PhotoCubeGlass._assemble(THREE, photoCube, opts, true);

        // No glass: just the photo cube (sized to photoScale), or an empty group.
        const group = new THREE.Group();
        if (photoCube) {
            photoCube.scale.setScalar(photoScale);
            group.add(photoCube);
        }
        group.userData = { inner: photoCube, photoCube, glassCube: null, glassMat: null };
        return group;
    }

    /**
     * Wrap an already-built inner Object3D (a GLB scene, a planet group, …) in the
     * selected glass style. The inner object is re-fitted to sit inside / behind the
     * glass. group.userData exposes { inner, glassCube, glassMat } so AnamorphicCamera
     * can live-update / dispose them exactly like the photo cube.
     *
     * @param {object}        THREE  — the three.js namespace
     * @param {THREE.Object3D} inner — the model to enclose (mutated: re-scaled/centered)
     * @param {object}        opts   — { photoScale, curveRadius, glassTint, ior, opacity, style, backdrop }
     * @returns {THREE.Group}
     */
    static wrap(THREE, inner, opts = {}) {
        return PhotoCubeGlass._assemble(THREE, inner, opts, false);
    }
}
