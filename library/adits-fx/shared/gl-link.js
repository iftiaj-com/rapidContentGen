/**
 * gl-link.js — non-blocking WebGL program builds.
 *
 * Reading LINK_STATUS (or COMPILE_STATUS) right after linkProgram() forces the
 * driver to finish compiling on the spot, which stalls the frame the effect is
 * first used on. With the KHR_parallel_shader_compile extension the driver
 * compiles in the background and COMPLETION_STATUS_KHR says when it is done, so
 * the status reads can wait until then. Without the extension this degrades to
 * the old synchronous behaviour, so callers see the same contract everywhere:
 *
 *   const h = buildProgramDeferred(gl, VERT_SRC, FRAG_SRC, {
 *       label: 'MyEffect',
 *       onReady: (program) => { ...uniform lookups, one-time setup... },
 *       onFail:  (message) => { ...mark the effect failed... },
 *   });
 *   // h.status is 'pending' | 'ready' | 'failed' right after the call; onReady /
 *   // onFail fire exactly once, synchronously when the extension is missing.
 *
 * Callers should treat "program not yet assigned" as "draw the plain fallback
 * this frame". Nothing here touches the GL state beyond creating the program.
 */

/**
 * @param {WebGL2RenderingContext} gl
 * @param {string} vsSrc
 * @param {string} fsSrc
 * @param {{ label?: string, onReady?: (program: WebGLProgram) => void, onFail?: (message: string) => void }} [opts]
 * @returns {{ program: WebGLProgram, status: 'pending'|'ready'|'failed' }}
 */
export function buildProgramDeferred(gl, vsSrc, fsSrc, opts = {}) {
    const label = opts.label || 'WebGL';
    const handle = { program: null, status: 'pending' };

    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, vsSrc);
    gl.compileShader(vs);
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, fsSrc);
    gl.compileShader(fs);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    handle.program = program;

    let done = false;
    const fail = (msg) => {
        if (done) return;
        done = true;
        handle.status = 'failed';
        console.error(`${label} program build failed:`, msg);
        try { gl.deleteShader(vs); gl.deleteShader(fs); gl.deleteProgram(program); } catch (_) { /* context gone */ }
        opts.onFail?.(msg);
    };
    const finish = () => {
        if (done) return handle.status;
        if (gl.isContextLost()) { fail('context lost'); return handle.status; }
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            // Report the more specific shader error when there is one.
            let msg = gl.getProgramInfoLog(program) || '';
            if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) msg = 'vertex: ' + gl.getShaderInfoLog(vs);
            else if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) msg = 'fragment: ' + gl.getShaderInfoLog(fs);
            fail(msg);
            return handle.status;
        }
        done = true;
        handle.status = 'ready';
        // Shader objects are reference-held by the linked program.
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        opts.onReady?.(program);
        return handle.status;
    };

    const ext = gl.getExtension('KHR_parallel_shader_compile');
    if (!ext) { finish(); return handle; }
    if (gl.getProgramParameter(program, ext.COMPLETION_STATUS_KHR)) { finish(); return handle; }
    const poll = () => {
        if (done) return;
        if (gl.isContextLost()) { fail('context lost'); return; }
        if (gl.getProgramParameter(program, ext.COMPLETION_STATUS_KHR)) finish();
        else requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
    return handle;
}
