// Static server for the showroom, plus one local proxy per project that
// needs one (see tools/proxy.mjs and the `proxy` field in js/projects.js).
//   node tools/serve.mjs [port]      default port 8765
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startProxy } from './proxy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2]) || 8765;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.mp4': 'video/mp4',
  '.webmanifest': 'application/manifest+json', '.vcf': 'text/vcard; charset=utf-8',
};

// Read the project list (it assigns window.LEANX_PROJECTS).
function loadProjects() {
  try {
    const src = fs.readFileSync(path.join(ROOT, 'js', 'projects.js'), 'utf8');
    const w = {};
    new Function('window', src)(w);
    return w.LEANX_PROJECTS || [];
  } catch (e) { console.error('Could not read js/projects.js:', e.message); return []; }
}

const live = {};   // id -> port, for proxies that actually started

http.createServer((req, res) => {
  const urlPath0 = decodeURIComponent((req.url || '/').split('?')[0]);

  // The portal asks which proxies are up, so it can fall back to the
  // captured screens for any project whose proxy did not start.
  if (urlPath0 === '/__leanx/proxies') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ ok: true, ports: live }));
  }

  let urlPath = urlPath0;
  if (urlPath.endsWith('/')) urlPath += 'index.html';
  const file = path.normalize(path.join(ROOT, urlPath));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': ext === '.html' || ext === '.js' || ext === '.css' ? 'no-cache' : 'public, max-age=86400',
    });
    fs.createReadStream(file).pipe(res);
  });
}).listen(PORT, '127.0.0.1', async () => {
  console.log(`Leanx Showroom running at http://localhost:${PORT}/  (Ctrl+C to stop)`);
  for (const p of loadProjects()) {
    if (!p.proxy || !p.proxy.port) continue;
    try {
      await startProxy({ id: p.id, port: p.proxy.port, target: p.url, gate: p.gate });
      live[p.id] = p.proxy.port;
      console.log(`  proxy  ${p.id.padEnd(12)} localhost:${p.proxy.port}  ->  ${new URL(p.url).origin}`);
    } catch (e) {
      console.error(`  proxy  ${p.id.padEnd(12)} FAILED on port ${p.proxy.port}: ${e.message} (the showroom will show its screens instead)`);
    }
  }
});
