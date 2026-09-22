// Leanx Showroom — embed checker
// Asks every project's server whether it allows being displayed inside the
// portal, and prints what to set for `embed` in js/projects.js.
//
//   node tools/check-embed.mjs              check every project
//   node tools/check-embed.mjs ftech        check one
//
// A site can be embedded unless it sends X-Frame-Options, or a
// Content-Security-Policy with a frame-ancestors directive that does not
// include the kiosk origin (http://localhost:8765 by default).

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ONLY = process.argv.slice(2).filter(a => !a.startsWith('--'));
const KIOSK = (process.argv.find(a => a.startsWith('--kiosk=')) || '--kiosk=http://localhost:8765').split('=')[1];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const src = fs.readFileSync(path.join(ROOT, 'js', 'projects.js'), 'utf8');
const w = {}; new Function('window', src)(w);
const PROJECTS = (w.LEANX_PROJECTS || []).filter(p => !ONLY.length || ONLY.includes(p.id));

function head(url, depth = 0) {
  return new Promise(resolve => {
    let u; try { u = new URL(url); } catch { return resolve({ error: 'bad url' }); }
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request({ method: 'GET', hostname: u.hostname, path: u.pathname + u.search, port: u.port || undefined, headers: { 'user-agent': UA, accept: 'text/html' } }, res => {
      res.resume();
      const loc = res.headers.location;
      if (res.statusCode >= 300 && res.statusCode < 400 && loc && depth < 4) return head(new URL(loc, u).href, depth + 1).then(resolve);
      resolve({ status: res.statusCode, headers: res.headers, finalUrl: u.href });
    });
    req.setTimeout(20000, () => { req.destroy(); resolve({ error: 'timeout' }); });
    req.on('error', e => resolve({ error: e.message }));
    req.end();
  });
}

const verdictOf = h => {
  const xfo = (h['x-frame-options'] || '').trim();
  const csp = h['content-security-policy'] || '';
  const fa = (csp.match(/frame-ancestors([^;]*)/i) || [])[1];
  if (xfo) return { ok: false, why: `X-Frame-Options: ${xfo}` };
  if (fa !== undefined) {
    const kiosk = KIOSK.toLowerCase().replace(/\/$/, '');
    const allowed = fa.trim().toLowerCase().split(/\s+/).some(tok => {
      if (tok === "'none'" || tok === "'self'") return false;   // never allows the kiosk, which is a different origin
      if (tok === '*') return true;
      return kiosk === tok.replace(/^'|'$/g, '').replace(/\/$/, '');
    });
    if (!allowed) return { ok: false, why: `CSP frame-ancestors${fa}`.trim() };
  }
  return { ok: true, why: 'no frame restrictions' };
};

console.log(`Kiosk origin: ${KIOSK}\n`);
const rows = [];
for (const p of PROJECTS) {
  const r = await head(p.url);
  if (r.error || !r.headers) { rows.push([p.id, '?', 'unreachable: ' + (r.error || r.status), p.embed]); continue; }
  const v = verdictOf(r.headers);
  rows.push([p.id, v.ok ? 'LIVE' : 'SCREENS', v.why, p.embed]);
}
const pad = (s, n) => String(s).padEnd(n);
console.log(pad('project', 13) + pad('can embed', 11) + pad('currently', 13) + 'reason');
console.log('-'.repeat(92));
for (const [id, can, why, embed] of rows) {
  const now = pad(embed ? 'embed:true' : 'embed:false', 13);
  const mismatch = (can === 'LIVE') !== !!embed && can !== '?';
  console.log(pad(id, 13) + pad(can, 11) + now + why + (mismatch ? '   <-- update js/projects.js' : ''));
}
console.log('\nA project marked SCREENS can still be shown live if you either allow the kiosk as a');
console.log('frame ancestor on that site, or route it through the local proxy (see README.md).');
