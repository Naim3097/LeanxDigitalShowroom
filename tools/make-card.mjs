// Build a digital business card's files from card/<slug>/card.json:
//   the .vcf the "Save contact" button opens, and (when the live URL is
//   given) the QR code to print, as SVG and PNG in assets/card/.
//
//   node tools/make-card.mjs hakim
//   node tools/make-card.mjs hakim --url=https://showroom.leanxdigital.io/card/hakim
//
// The QR encodes only the URL, never the contact details, so the card can
// change without reprinting. It is generated at the highest error
// correction level, which is what lets the .X mark sit in the middle.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const slug = args.find(a => !a.startsWith('--'));
const url = (args.find(a => a.startsWith('--url=')) || '').slice(6);
if (!slug) { console.error('Usage: node tools/make-card.mjs <slug> [--url=https://.../card/<slug>]'); process.exit(1); }

const dir = path.join(ROOT, 'card', slug);
const card = JSON.parse(fs.readFileSync(path.join(dir, 'card.json'), 'utf8'));

/* ---------- vCard 3.0 ----------
   3.0 rather than 4.0: iOS and Android both import it without surprises.
   Lines end in CRLF and are folded at 75 bytes, which iOS insists on for
   the embedded photo. Commas, semicolons and newlines in values are escaped. */
const esc = s => String(s ?? '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\;');
const fold = line => {
  const out = []; let cur = '';
  for (const ch of line) {                       // fold on characters, never inside a UTF-8 sequence
    if (Buffer.byteLength(cur + ch) > 75) { out.push(cur); cur = ' ' + ch; } else cur += ch;
  }
  out.push(cur); return out.join('\r\n');
};
const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
lines.push(`N:${esc(card.name.family)};${esc(card.name.given)};;;`);
lines.push(`FN:${esc(card.name.full)}`);
if (card.org) lines.push(`ORG:${esc(card.org)}`);
if (card.title) lines.push(`TITLE:${esc(card.title)}`);
if (card.phone?.e164) lines.push(`TEL;TYPE=CELL,VOICE:${card.phone.e164}`);
if (card.email) lines.push(`EMAIL;TYPE=INTERNET,WORK:${card.email}`);
if (card.address) {
  const a = card.address;
  lines.push(`ADR;TYPE=WORK:;;${esc(a.street)};${esc(a.city)};${esc(a.region)};${esc(a.postcode)};${esc(a.country)}`);
}
if (card.website) lines.push(`URL:${card.website}`);
if (url) lines.push(`NOTE:${esc('Digital card: ' + url)}`);
if (card.photo) {
  const file = path.join(ROOT, card.photo);
  const type = /\.jpe?g$/i.test(file) ? 'JPEG' : 'PNG';
  lines.push(`PHOTO;ENCODING=b;TYPE=${type}:${fs.readFileSync(file).toString('base64')}`);
}
lines.push(`REV:${new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')}`);
lines.push('END:VCARD');
const vcf = lines.map(fold).join('\r\n') + '\r\n';
const vcfPath = path.join(dir, card.file || `${slug}.vcf`);
fs.writeFileSync(vcfPath, vcf);
console.log(`wrote ${path.relative(ROOT, vcfPath)} (${vcf.length} bytes)`);

if (!url) { console.log('No --url given: QR code not generated. Pass the live card address to make it.'); process.exit(0); }

/* ---------- QR code ---------- */
const lib = fs.readFileSync(path.join(ROOT, 'js', 'qrcode.js'), 'utf8');
const qrcode = new Function(lib + '\n;return qrcode;')();
const q = qrcode(0, 'H'); q.addData(url); q.make();
const n = q.getModuleCount(), quiet = 4, size = n + quiet * 2;

// The centre badge: the .X mark on its teal square, sized to ~22% of the
// code. Level H survives 30% damage, so this leaves a comfortable margin.
const badge = Math.round(n * 0.22) | 1;                 // odd, so it centres on a module
const b0 = quiet + (n - badge) / 2, b1 = b0 + badge;
const inBadge = (r, c) => r >= b0 - quiet - 0.5 && r < b1 - quiet + 0.5 && c >= b0 - quiet - 0.5 && c < b1 - quiet + 0.5;

let rects = '';
for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
  if (!q.isDark(r, c) || inBadge(r, c)) continue;
  rects += `<rect x="${c + quiet}" y="${r + quiet}" width="1" height="1"/>`;
}
const pad = 0.9, bx = b0 - pad, bw = badge + pad * 2, rr = bw * 0.16;
const xw = badge * 0.62, xh = xw * 100 / 110, xx = b0 + (badge - xw) / 2 + badge * 0.04, xy = b0 + (badge - xh) / 2;
const dot = badge * 0.075;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="1200" height="1200" shape-rendering="crispEdges">
<title>QR code: ${card.name.full}, ${card.org}</title>
<defs><linearGradient id="teal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2A9CC0"/><stop offset="1" stop-color="#0C5C7D"/></linearGradient></defs>
<rect width="${size}" height="${size}" fill="#FFFFFF"/>
<g fill="#0F1418">${rects}</g>
<rect x="${bx}" y="${bx}" width="${bw}" height="${bw}" rx="${rr}" fill="#FFFFFF"/>
<rect x="${b0}" y="${b0}" width="${badge}" height="${badge}" rx="${badge * 0.16}" fill="url(#teal)" shape-rendering="geometricPrecision"/>
<g transform="translate(${xx} ${xy}) scale(${xw / 110})" shape-rendering="geometricPrecision"><path fill="#FCC601" d="M0 0H40L55 21.4L70 0H110L75 50L110 100H70L55 78.6L40 100H0L35 50Z"/></g>
<circle cx="${b0 + badge * 0.16}" cy="${b1 - badge * 0.17}" r="${dot}" fill="#FCC601" shape-rendering="geometricPrecision"/>
</svg>
`;
const outDir = path.join(ROOT, 'assets', 'card'); fs.mkdirSync(outDir, { recursive: true });
const svgPath = path.join(outDir, `${slug}-qr.svg`);
fs.writeFileSync(svgPath, svg);
console.log(`wrote ${path.relative(ROOT, svgPath)}  (${n}x${n} modules, level H, encodes ${url})`);

// PNG for print: rendered by the local Chrome, the same one tools/preview.mjs uses.
const CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
];
const chrome = CANDIDATES.find(p => fs.existsSync(p));
if (!chrome) { console.log('Chrome not found: PNG not rendered (the SVG prints fine on its own).'); process.exit(0); }
const pngPath = path.join(outDir, `${slug}-qr.png`);
const r = spawnSync(chrome, [
  '--headless=new', '--hide-scrollbars', '--disable-gpu', '--no-first-run',
  `--user-data-dir=${fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'leanx-qr-'))}`,
  '--window-size=1200,1200', `--screenshot=${pngPath}`, `file://${svgPath}`,
], { stdio: 'ignore', timeout: 30000 });
if (r.status === 0 && fs.existsSync(pngPath)) console.log(`wrote ${path.relative(ROOT, pngPath)}  (1200x1200)`);
else console.log('Chrome could not render the PNG; use the SVG.');
