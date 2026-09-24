// Leanx Showroom — headless preview tool
// Renders the portal at an exact screen size and captures every screen.
//   node tools/preview.mjs 1920x1080 [outDir] [http://localhost:8765/]
//   node tools/preview.mjs 1080x1920
// Requires the local server to be running (node tools/serve.mjs).

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [W, H] = (process.argv[2] || '1920x1080').split('x').map(Number);
const OUT = path.resolve(process.argv[3] || path.join(ROOT, 'preview'));
const URL = process.argv[4] || 'http://localhost:8765/';
const PORT = 9344;
// A fresh profile per run: a previous headless Chrome that has not exited yet
// keeps a lock on its own folder, and that must not block a QA render.
const PROFILE = path.join(process.env.TEMP || 'C:/Temp', `leanx-preview-${process.pid}-${Date.now()}`);
const CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];
const CHROME = CANDIDATES.find(p => fs.existsSync(p));
const tag = `${W}x${H}`;

const MODE = process.argv[5] || 'screens';
// Frozen frames of the X transition (the real one runs at 60fps, too fast for headless screenshots).
const WIPE_STEPS = [
  { name: 'wipe-000', wait: 3200 },
  ...[40, 120, 200, 260, 300, 360, 440, 520, 600, 660].map(t => ({ name: `wipe-${String(t).padStart(3, '0')}`, js: `showroom.debugWipe(${t}, innerWidth * 0.5, innerHeight * 0.62)`, wait: 150 })),
  { name: 'wipe-end', js: 'showroom.debugWipe(-1)', wait: 200 },
];
const SCREEN_STEPS = [
  { name: 'boot', wait: 700 },
  { name: 'home', wait: 2600 },
  { name: 'home-2', js: 'showroom.goto(1)', wait: 900 },
  { name: 'lens', js: "showroom.lens('commerce')", wait: 900 },
  { name: 'stage', js: "showroom.lens('all'); showroom.open('ceritera')", wait: 1300 },
  { name: 'viewer-live', js: "showroom.enter('ceritera')", wait: 16000 },
  { name: 'stage-nexova', js: "showroom.back(); setTimeout(() => showroom.open('nexova'), 900)", wait: 2400 },
  { name: 'viewer-frames', js: "showroom.enter('nexova')", wait: 2000 },
  { name: 'viewer-gate', js: "showroom.home(); setTimeout(() => showroom.open('discova'), 700); setTimeout(() => showroom.enter('discova'), 1900)", wait: 11000 },
  { name: 'map', js: 'showroom.map()', wait: 1400 },
  { name: 'search', js: "showroom.search('3d')", wait: 900 },
  { name: 'attract', js: "showroom.state && (document.querySelector('#search').hidden = true); showroom.home(true); setTimeout(() => showroom.attract(), 1000)", wait: 2400 },
];
const STEPS = MODE === 'wipe' ? WIPE_STEPS : SCREEN_STEPS;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJson = url => new Promise((res, rej) => http.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej));

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && this.pending.has(m.id)) { const p = this.pending.get(m.id); this.pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } }; }
  send(method, params = {}, sessionId) { const id = ++this.id; const msg = { id, method, params }; if (sessionId) msg.sessionId = sessionId; this.ws.send(JSON.stringify(msg)); return new Promise((res, rej) => this.pending.set(id, { res, rej })); }
}

async function main() {
  if (!CHROME) throw new Error('Chrome/Edge not found');
  fs.mkdirSync(OUT, { recursive: true });
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--window-size=${W},${H}`, '--mute-audio', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
  let version = null;
  for (let i = 0; i < 60 && !version; i++) { try { version = await getJson(`http://127.0.0.1:${PORT}/json/version`); } catch { await sleep(500); } }
  if (!version) throw new Error('Chrome did not start');
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const cdp = new CDP(ws);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId: s } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  await cdp.send('Page.enable', {}, s); await cdp.send('Runtime.enable', {}, s);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false }, s);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 10 }, s);
  const errors = [];
  cdp.ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception?.description || '')); });
  await cdp.send('Page.navigate', { url: URL }, s);
  for (const st of STEPS) {
    if (st.js) { try { await cdp.send('Runtime.evaluate', { expression: st.js, awaitPromise: false }, s); } catch (e) { console.log('  js error', st.name, e.message); } }
    await sleep(st.wait);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 }, s);
    const file = path.join(OUT, `${tag}-${st.name}.jpg`);
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    console.log('wrote', path.relative(ROOT, file));
  }
  const stateJs = 'JSON.stringify({screen: document.body.dataset.screen, orient: document.body.dataset.orient, index: showroom.state.index, lens: showroom.state.lens})';
  const r = await cdp.send('Runtime.evaluate', { expression: stateJs, returnByValue: true }, s);
  console.log('final state', r.result.value);
  if (errors.length) console.log('PAGE ERRORS:\n' + errors.join('\n')); else console.log('no page errors');
  try { await cdp.send('Browser.close'); } catch {}
  chrome.kill();
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
