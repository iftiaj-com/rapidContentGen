// Local HTTP server for the fx harness. ES modules do not load from file://,
// and localhost is a secure context (WebGPU needs one).
//   /lib/...   -> library/ (the copied Adits code and the harness page)
//   /work/...  -> this run's work folder (input frames, job.json); PUT /work/out/<file> saves a frame
// `import X from './a.png?url'` (a Vite feature the Adits code uses) is answered
// with a module whose default export is the asset's URL.

import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { ROOT } from '../lib/config.mjs';

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.wasm': 'application/wasm', '.css': 'text/css', '.glb': 'model/gltf-binary', '.hdr': 'application/octet-stream',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
};

function inside(base, rel) {
  const p = normalize(join(base, decodeURIComponent(rel)));
  return p === base || p.startsWith(base + sep) ? p : null;
}

export function startServer(workDirIn) {
  const libRoot = resolve(ROOT, 'library');
  const workDir = resolve(workDirIn); // native separators, so inside() can compare prefixes
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const [, area, ...rest] = url.pathname.split('/');
    const base = area === 'lib' ? libRoot : area === 'work' ? workDir : null;
    const file = base && inside(base, rest.join('/'));
    if (!file) { res.writeHead(404).end(); return; }
    if (req.method === 'PUT' && area === 'work') {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, Buffer.concat(chunks));
        res.writeHead(204).end();
      });
      return;
    }
    if (url.searchParams.has('url') && extname(file) !== '.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript' });
      res.end(`export default ${JSON.stringify(url.pathname)};\n`);
      return;
    }
    if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end(); return; }
    const type = TYPES[extname(file).toLowerCase()] || 'application/octet-stream';
    const size = statSync(file).size;
    // Byte ranges: without them Chrome cannot seek a <video> (currentTime snaps back to 0).
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (m && (m[1] !== '' || m[2] !== '')) {
      const start = m[1] === '' ? Math.max(0, size - Number(m[2])) : Number(m[1]);
      const end = m[1] === '' || m[2] === '' ? size - 1 : Math.min(size - 1, Number(m[2]));
      if (start > end || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end(); return; }
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' });
      createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, close: () => new Promise((r) => server.close(r)) })));
}
