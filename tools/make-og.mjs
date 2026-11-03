// Leanx Showroom — share-card generator
// Builds the image that WhatsApp, LinkedIn and iMessage show when someone
// shares the link. Renders a real page with the showroom's own fonts and
// colours at 1200x630, then screenshots it.
//
//   node tools/make-og.mjs            -> assets/brand/og-cover.jpg
//
// Re-run it after adding projects, so the thumbnails stay current.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets', 'brand', 'og-cover.jpg');
const PORT = 9361;
const PROFILE = path.join(process.env.TEMP || 'C:/Temp', `leanx-og-${process.pid}-${Date.now()}`);
const CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];
const CHROME = CANDIDATES.find(p => fs.existsSync(p));
if (!CHROME) { console.error('Chrome/Edge not found'); process.exit(1); }

// The four projects whose previews lead the card.
const HERO = ['sxan', 'ceritera', 'mihas', 'nexova'];

const src = fs.readFileSync(path.join(ROOT, 'js', 'projects.js'), 'utf8');
const w = {}; new Function('window', src)(w);
const PROJECTS = w.LEANX_PROJECTS || [];
const count = PROJECTS.length;
const shots = HERO.filter(id => fs.existsSync(path.join(ROOT, 'assets', 'shots', `${id}-d1.jpg`)));

const page = `<!doctype html><html><head><meta charset="utf-8">
<style>
  @font-face { font-family:'Outfit'; src:url('/assets/fonts/outfit-latin.woff2') format('woff2'); font-weight:300 800; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:1200px; height:630px; background:#080B10; color:#F3F6F8;
         font-family:'Outfit',system-ui,sans-serif; overflow:hidden; position:relative; }
  .glow { position:absolute; width:1100px; height:1100px; border-radius:50%; top:-560px; left:-220px;
          background:#32A4BD; opacity:.26;
          -webkit-mask-image:radial-gradient(circle,#000 0%,rgba(0,0,0,.35) 30%,transparent 62%); }
  .glow2 { position:absolute; width:900px; height:900px; border-radius:50%; bottom:-520px; right:-180px;
           background:#FCC601; opacity:.14;
           -webkit-mask-image:radial-gradient(circle,#000 0%,rgba(0,0,0,.35) 30%,transparent 62%); }
  .wrap { position:relative; padding:64px 68px; height:100%; display:flex; flex-direction:column; }
  .top { display:flex; align-items:center; gap:22px; }
  .x { width:74px; }
  .mark { height:52px; }
  .eyebrow { margin-top:40px; font-size:19px; letter-spacing:.26em; text-transform:uppercase;
             color:#9AA6B2; font-weight:500; display:flex; align-items:center; gap:13px; }
  .dot { width:10px; height:10px; border-radius:50%; background:#FCC601; box-shadow:0 0 14px #FCC601; }
  h1 { margin-top:16px; font-size:78px; font-weight:700; letter-spacing:-.03em; line-height:1.0; }
  .sub { margin-top:20px; font-size:26px; color:#9AA6B2; font-weight:400; }
  .sub b { color:#F3F6F8; font-weight:600; }
  .strip { margin-top:auto; display:flex; gap:18px; }
  .card { flex:1; aspect-ratio:16/10; border-radius:14px; overflow:hidden;
          border:1px solid rgba(255,255,255,.17); box-shadow:0 26px 60px -24px rgba(0,0,0,.9); }
  .card img { width:100%; height:100%; object-fit:cover; object-position:top; display:block; }
</style></head><body>
  <div class="glow"></div><div class="glow2"></div>
  <div class="wrap">
    <div class="top">
      <img class="x" src="/assets/brand/x-3d.png">
      <img class="mark" src="/assets/brand/wordmark.png">
    </div>
    <p class="eyebrow"><span class="dot"></span>Digital showroom</p>
    <h1>Digital experiences<br>we&rsquo;ve built.</h1>
    <p class="sub"><b>${count} projects</b> &middot; 3D worlds, simulators, AI products, commerce and booking platforms</p>
    <div class="strip">${shots.map(id => `<div class="card"><img src="/assets/shots/${id}-d1.jpg"></div>`).join('')}</div>
  </div>
</body></html>`;

const TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/' || p === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(page);
  }
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJson = url => new Promise((res, rej) => http.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej));

async function main() {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT + 1}`, `--user-data-dir=${PROFILE}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--window-size=1200,630', 'about:blank'], { stdio: 'ignore' });
  let version = null;
  for (let i = 0; i < 60 && !version; i++) { try { version = await getJson(`http://127.0.0.1:${PORT + 1}/json/version`); } catch { await sleep(500); } }
  if (!version) throw new Error('Chrome did not start');

  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } };
  const send = (method, params = {}, sessionId) => { const i = ++id; const msg = { id: i, method, params }; if (sessionId) msg.sessionId = sessionId; ws.send(JSON.stringify(msg)); return new Promise((res, rej) => pending.set(i, { res, rej })); };

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId: s } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, s);
  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 630, deviceScaleFactor: 2, mobile: false }, s);
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` }, s);
  await sleep(3500);
  const { data } = await send('Page.captureScreenshot', { format: 'jpeg', quality: 92 }, s);
  fs.writeFileSync(OUT, Buffer.from(data, 'base64'));
  console.log(`wrote ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB, ${count} projects, ${shots.length} thumbnails)`);

  try { await send('Browser.close'); } catch {}
  chrome.kill(); server.close();
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
