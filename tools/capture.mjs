// Leanx Showroom — screenshot capture tool
// Drives headless Chrome over the DevTools Protocol and writes preview frames
// for every project in js/projects.js into assets/shots/.
//
//   node tools/capture.mjs                 -> capture every project
//   node tools/capture.mjs nexova,byki     -> capture only these ids
//
// Frames written per project:  <id>-d1.jpg  <id>-d2.jpg  <id>-d3.jpg  (desktop, hero + scrolled)
//                              <id>-m1.jpg  <id>-m2.jpg               (mobile, hero + scrolled)
// Requires Node 22+ (built-in WebSocket) and Google Chrome or Microsoft Edge.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets', 'shots');
const ONLY = process.argv[2] ? process.argv[2].split(',') : null;
const PORT = 9333;
// A fresh profile per run: a previous headless Chrome that has not exited yet
// keeps a lock on its own folder.
const PROFILE = path.join(process.env.TEMP || 'C:/Temp', `leanx-capture-${process.pid}-${Date.now()}`);
const CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];
const CHROME = CANDIDATES.find(p => fs.existsSync(p));
if (!CHROME) { console.error('No Chrome/Edge found'); process.exit(1); }

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

// Load project list from js/projects.js (it assigns window.LEANX_PROJECTS).
const src = fs.readFileSync(path.join(ROOT, 'js', 'projects.js'), 'utf8');
const sandbox = { window: {} };
new Function('window', src)(sandbox.window);
const PROJECTS = sandbox.window.LEANX_PROJECTS;
if (!Array.isArray(PROJECTS) || !PROJECTS.length) { console.error('No projects found in js/projects.js'); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJson = url => new Promise((res, rej) => http.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej));

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.listeners = new Set();
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) { const p = this.pending.get(m.id); this.pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
      else if (m.method) { for (const l of this.listeners) l(m); }
    };
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id; const msg = { id, method, params }; if (sessionId) msg.sessionId = sessionId;
    this.ws.send(JSON.stringify(msg));
    return new Promise((res, rej) => this.pending.set(id, { res, rej }));
  }
  waitFor(method, sessionId, timeout) {
    return new Promise(res => {
      const fn = m => { if (m.method === method && (!sessionId || m.sessionId === sessionId)) { clearTimeout(t); this.listeners.delete(fn); res(m.params); } };
      const t = setTimeout(() => { this.listeners.delete(fn); res(null); }, timeout);
      this.listeners.add(fn);
    });
  }
}

// Clicks obvious "close" controls (cookie banners, promo popups, music prompts).
const DISMISS_JS = `(() => {
  const els = [...document.querySelectorAll('button, a, [role=button]')]; let n = 0;
  for (const el of els) {
    const t = (el.textContent || '').trim().toLowerCase();
    const a = ((el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('title') || '')).toLowerCase();
    if (['\\u00d7', '\\u2715', '\\u2716', 'close', 'tutup', 'tidak', 'no thanks'].includes(t) || /\\b(close|tutup|dismiss)\\b/.test(a)) { try { el.click(); n++; } catch (e) {} }
  }
  return n;
})()`;
// Scrolls through the page once so lazy images load, then returns to the top.
const LAZY_JS = `(async () => {
  const h = Math.min(document.documentElement.scrollHeight, 7000);
  for (let y = 0; y < h; y += 500) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); }
  window.scrollTo(0, 0); await new Promise(r => setTimeout(r, 300)); return h;
})()`;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1600,1000', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  let version = null;
  for (let i = 0; i < 60 && !version; i++) { try { version = await getJson(`http://127.0.0.1:${PORT}/json/version`); } catch { await sleep(500); } }
  if (!version) throw new Error('Chrome did not start');
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const cdp = new CDP(ws);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId: s } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  await cdp.send('Page.enable', {}, s); await cdp.send('Runtime.enable', {}, s); await cdp.send('Network.enable', {}, s);

  const shot = async file => { const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 86 }, s); fs.writeFileSync(path.join(OUT, file), Buffer.from(data, 'base64')); console.log('  wrote', file); };
  const evalJs = async expr => { try { const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, s); return r.result && r.result.value; } catch { return null; } };
  const wheel = async (x, y, deltaY, times, pause) => { for (let i = 0; i < times; i++) { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY }, s); await sleep(pause); } };
  const escape = async () => { for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, s); };
  const load = async (url, settle) => { const loaded = cdp.waitFor('Page.loadEventFired', s, 30000); await cdp.send('Page.navigate', { url }, s); await loaded; await sleep(settle); };

  for (const p of PROJECTS) {
    if (ONLY && !ONLY.includes(p.id)) continue;
    const cap = p.capture || {};
    const settle = cap.settle || 7000, wp = cap.wheelPause || 350;
    console.log('==', p.id);
    try {
      // Desktop frames
      await cdp.send('Network.setUserAgentOverride', { userAgent: DESKTOP_UA }, s);
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1.5, mobile: false }, s);
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false }, s);
      await load(p.url, settle);
      await escape(); await sleep(400); await evalJs(DISMISS_JS); await sleep(800);
      if (cap.prep) { await evalJs(cap.prep); await sleep(1500); }
      await evalJs(LAZY_JS); await sleep(1500);
      await shot(`${p.id}-d1.jpg`);
      await wheel(800, 500, 250, 4, wp); await sleep(1200); await shot(`${p.id}-d2.jpg`);
      await wheel(800, 500, 250, 6, wp); await sleep(1200); await shot(`${p.id}-d3.jpg`);
      // Mobile frames
      await cdp.send('Network.setUserAgentOverride', { userAgent: MOBILE_UA }, s);
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 2, mobile: true, screenWidth: 430, screenHeight: 932 }, s);
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, s);
      await load(p.url, Math.min(settle, 12000));
      await escape(); await sleep(400); await evalJs(DISMISS_JS); await sleep(800);
      if (cap.prep) { await evalJs(cap.prep); await sleep(1500); }
      await evalJs(LAZY_JS); await sleep(1500);
      await shot(`${p.id}-m1.jpg`);
      await wheel(215, 500, 220, 5, wp); await sleep(1200); await shot(`${p.id}-m2.jpg`);
    } catch (e) { console.log('  ERROR', p.id, e.message); }
  }
  try { await cdp.send('Browser.close'); } catch {}
  chrome.kill();
  console.log('CAPTURE DONE');
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
