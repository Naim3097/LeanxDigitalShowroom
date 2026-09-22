// =====================================================================
// LEANX SHOWROOM — LOCAL SITE PROXY
// ---------------------------------------------------------------------
// Some of our client sites tell every browser "never display me inside
// another page" (X-Frame-Options / CSP frame-ancestors). That header is
// meant to stop strangers from framing the site; at our own booth, on our
// own kiosk, showing our own work, it just blocks the showroom.
//
// This is a small reverse proxy on loopback. It fetches the real site and
// passes it through untouched except for the headers that block framing.
// Each proxied project gets its own port, so the whole path space maps
// 1:1 to the real site and root-relative URLs (/about, /_next/...) work.
//
// It also makes a gated site usable: because the page is served from
// localhost, its login cookie is first-party and survives in the kiosk
// browser profile, so staff sign in once and every visitor after that
// lands straight in the tool.
//
// Nothing is cached, rewritten or stored. It is a pass-through.
// =====================================================================

import http from 'node:http';
import https from 'node:https';

// Headers that stop the page being displayed inside the showroom, or that
// would mis-apply to a loopback origin.
const STRIP = new Set([
  'x-frame-options',
  'content-security-policy',
  'content-security-policy-report-only',
  'cross-origin-opener-policy',
  'cross-origin-embedder-policy',
  'cross-origin-resource-policy',
  'strict-transport-security',   // would force https:// on localhost
  'report-to', 'nel', 'clear-site-data',
]);
// Request headers that must not be forwarded as-is.
const DROP_REQ = new Set(['host', 'connection', 'keep-alive', 'proxy-connection', 'upgrade', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-forwarded-port']);

const isLocal = origin => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(origin || '');

function cors(req, res) {
  const origin = req.headers.origin;
  if (isLocal(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
}

// Make a cookie the real site set for its own domain work on localhost.
function rewriteCookie(value) {
  const parts = value.split(';').filter(p => !/^\s*domain=/i.test(p));
  const sameSiteNone = /samesite\s*=\s*none/i.test(value);
  // "Secure" is fine over http://localhost in Chrome, but only keep it when
  // SameSite=None requires it; otherwise drop it so any browser accepts it.
  return (sameSiteNone ? parts : parts.filter(p => !/^\s*secure\s*$/i.test(p))).join(';');
}

// One upstream request. Returns the raw response for streaming.
function upstream(target, { method = 'GET', headers = {}, body = null, timeout = 25000 }) {
  const mod = target.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = mod.request({
      protocol: target.protocol, hostname: target.hostname,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      path: target.pathname + target.search, method, headers,
      servername: target.hostname,
    }, resolve);
    req.setTimeout(timeout, () => req.destroy(new Error('upstream timeout')));
    req.on('error', reject);
    if (body && body.pipe) body.pipe(req); else req.end(body || undefined);
  });
}

function readBody(res) {
  return new Promise(resolve => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); });
}

/**
 * Start one proxy.
 * @param {object} o
 * @param {string} o.id      project id (for logs and the ping response)
 * @param {number} o.port    loopback port to listen on
 * @param {string} o.target  the real site, e.g. 'https://www.ftechlighting.com/'
 * @param {object} [o.gate]  { loginPath, checkPath } for password-gated sites
 * @returns {Promise<http.Server>}
 */
export function startProxy({ id, port, target, gate }) {
  const base = new URL(target);
  const origin = base.origin;

  const server = http.createServer(async (req, res) => {
    try {
      if (req.url.startsWith('/__leanx/')) return await control(req, res);
      await forward(req, res);
    } catch (e) {
      if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Showroom proxy: upstream unavailable (' + (e && e.message ? e.message : 'error') + ')');
    }
  });

  // /__leanx/ping     — is this proxy alive?
  // /__leanx/session  — for gated sites: does this browser have a valid session?
  async function control(req, res) {
    cors(req, res);
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const path = req.url.split('?')[0];
    if (path === '/__leanx/ping') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, id, target: origin }));
    }
    if (path === '/__leanx/session') {
      if (!gate) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ unlocked: true, gated: false })); }
      const check = new URL(gate.checkPath || '/', base);
      let unlocked = false, reachable = true;
      try {
        const up = await upstream(check, {
          headers: {
            host: base.host,
            cookie: req.headers.cookie || '',
            'user-agent': req.headers['user-agent'] || 'LeanxShowroom',
            accept: 'text/html',
          },
          timeout: 12000,
        });
        up.resume(); // discard the body
        const loc = up.headers.location || '';
        const bounced = up.statusCode >= 300 && up.statusCode < 400 && loc.includes(gate.loginPath || '/login');
        unlocked = up.statusCode < 400 && !bounced;
      } catch { reachable = false; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ unlocked, gated: true, reachable }));
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false }));
  }

  async function forward(req, res) {
    const url = new URL(req.url, origin);
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) if (!DROP_REQ.has(k)) headers[k] = v;
    headers.host = base.host;
    // Frameworks (Next.js server actions in particular) reject a request whose
    // Origin does not match its Host, so both must look like the real site.
    if (req.headers.origin) headers.origin = origin;
    if (req.headers.referer) {
      try { const r = new URL(req.headers.referer); headers.referer = origin + r.pathname + r.search; } catch { delete headers.referer; }
    }
    headers['accept-encoding'] = req.headers['accept-encoding'] || 'gzip, deflate, br';

    const up = await upstream(url, { method: req.method, headers, body: req });

    const out = {};
    for (const [k, v] of Object.entries(up.headers)) {
      const key = k.toLowerCase();
      if (STRIP.has(key)) continue;
      if (key === 'location' && typeof v === 'string' && v.startsWith(origin)) { out.location = v.slice(origin.length) || '/'; continue; }
      if (key === 'set-cookie') { out['set-cookie'] = (Array.isArray(v) ? v : [v]).map(rewriteCookie); continue; }
      out[k] = v;
    }
    res.writeHead(up.statusCode || 502, out);
    up.pipe(res);
  }

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

export { readBody };
