# Leanx Showroom

An interactive exhibition portal for the Leanx Digital booth. It runs full-screen on a touchscreen
in landscape or portrait, and lets visitors explore every project we have built: swipe through the
showroom, filter by capability, search, read a short introduction, then open the live site inside the
portal (or its captured screens when a site refuses to be embedded).

No build step, no framework, no runtime dependencies. Plain HTML, CSS and JavaScript. It runs as a
static site on Vercel, or from a local server on the kiosk machine.

---

## Deploy to Vercel

The repository is already a static Vercel project: no build command, no framework, no environment
variables. `vercel.json` sets the caching and security headers, `.vercelignore` keeps the local
tooling out of the deployment.

**From the dashboard:** import the repository, leave the Framework Preset as **Other**, leave Build
Command and Output Directory empty, deploy.

**From the terminal:**

```bash
npx vercel --prod
```

After the first deploy, note the address (for example `https://showroom.leanxdigital.io`). Two
things follow from it:

1. Point the booth at it: `Start Showroom (kiosk).bat https://showroom.leanxdigital.io`
2. Allow that exact address to display FTECH and Nexova — see the next section.

The deployed portal is marked `noindex`, registers a service worker so the shell, fonts and preview
frames keep working if the venue wifi drops, and ships a web manifest so it can be installed
full-screen on a tablet.

---

## Sites that refuse to be embedded

Three of the fourteen projects needed a decision. Run the checker any time to see where each one
stands:

```bash
node tools/check-embed.mjs
```

It asks every project's server whether it allows being displayed inside another page and tells you
what `embed` should be set to in `js/projects.js`.

### FTECH and Nexova

Their servers refuse to be displayed inside any other page:

| Site | Header it sends | Effect |
| --- | --- | --- |
| ftechlighting.com | `X-Frame-Options: DENY` | no page anywhere may frame it, not even itself |
| nexova.my | `X-Frame-Options: SAMEORIGIN` + CSP `frame-ancestors 'self'` | only its own pages may frame it |

This is a server instruction, not a portal limitation. No browser lets the embedding page override
it, and there is no flag or setting on the kiosk that changes it. The header exists to stop
strangers from framing the site and tricking people into clicking through it, which is worth keeping
for the public internet. What we want is a narrow exception for our own showroom.

**The fix is on those two sites, and it is small.** `X-Frame-Options` cannot name a third-party
origin: `ALLOW-FROM` was dropped by Chrome years ago. So remove that header and express the rule
with `Content-Security-Policy: frame-ancestors` instead, which does take an allowlist. Both sites are
Next.js on Vercel, so in `next.config.js`:

```js
const SHOWROOM = 'https://showroom.leanxdigital.io'; // the deployed showroom address

module.exports = {
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        // Replaces X-Frame-Options: make sure that header is no longer sent
        // anywhere else (middleware, vercel.json, a security-headers helper).
        { key: 'Content-Security-Policy', value: `frame-ancestors 'self' ${SHOWROOM}` },
      ],
    }];
  },
};
```

If that site already sends a full `Content-Security-Policy` (Nexova does), add the `frame-ancestors`
directive to the existing policy rather than adding a second header, and delete its
`X-Frame-Options` line.

Then, in this project:

```bash
node tools/check-embed.mjs ftech --kiosk=https://showroom.leanxdigital.io
```

When it reports `LIVE`, set `embed: true` for that project in `js/projects.js` and remove its
`embedBlocked` line. Nothing else changes: the showroom starts opening it live.

Until then both are presented as full-screen captured screens with a QR code, and the viewer states
the reason on screen, so the booth can answer the question honestly.

### The local proxy (an alternative, if you cannot redeploy those sites)

`tools/proxy.mjs` is a loopback reverse proxy that fetches a site and strips the headers that block
framing, so the showroom can display it without touching the site itself. Give a project a port to
turn it on:

```js
embed: true, proxy: { port: 8801 },
```

`tools/serve.mjs` then starts that proxy, and the portal uses it automatically; if the proxy is not
running, the project falls back to its screens on its own.

Three warnings, so the decision is yours and informed:

- It is **local only**. `.vercelignore` keeps it out of the deployment, and it should stay out:
  a header-stripping proxy on a public address would let anyone frame our client's site under their
  own page, which is the exact thing the header is there to prevent.
- It only works for the kiosk running the local server, not for the deployed copy.
- **It has not been run yet.** Building it was fine; starting it was blocked in the session where it
  was written, so its code is unverified. Test it before the booth if you decide to use it.

Changing the header on the two sites is the better answer in almost every case.

### DISCOVA

DISCOVA blocks nothing: it is our own tool and it opens live inside the portal. It sits behind a
team sign-in, so a member of staff signs in once on the kiosk and every visitor after that lands
straight in the tool. A bar over the viewer explains that while it is locked, without covering the
sign-in, and the kiosk browser profile lives in `%LOCALAPPDATA%\LeanxShowroom\chrome-profile`, so the
session survives a restart.

One thing to confirm at the booth: the session must survive **inside** the frame. If the sign-in
appears to succeed but DISCOVA keeps asking for the password, its session cookie is `SameSite=Lax`,
which browsers do not send to a page embedded in another site. Setting that cookie to
`SameSite=None; Secure` in the DISCOVA app fixes it. (Running DISCOVA through the local proxy above
also fixes it, because the page then comes from the same site as the portal.)

---

## Run it at the booth

1. Install [Node.js](https://nodejs.org) 22 or newer on the kiosk PC (only needed for the local
   copy). Chrome or Edge must be installed.
2. Double-click **`Start Showroom (kiosk).bat`** for the local copy, or pass the deployed address:
   `Start Showroom (kiosk).bat https://showroom.leanxdigital.io`
3. To stop: press `Alt+F4` in Chrome, then close the minimised server window if one is running.

`Start Showroom (window).bat` opens the same thing in a normal browser window for checking edits.
Press **F** for full screen there.

### The screen

The portal reads the panel it is on and picks one of three compositions. There is nothing to
configure; rotating or swapping the monitor is enough.

| Panel | What it does |
| --- | --- |
| **Portrait** (taller than wide) | Vertical journey. Exhibits are phone-shaped previews stacked top to bottom, with the story beside each one. |
| **Landscape** up to about 2:1 | Horizontal journey. The focused exhibit sits centre stage with its neighbours peeking in. |
| **Wide and short**, 21:9 and wider | The title and the capability filters share one row, so the exhibits get the height back, and the focused exhibit sits left of centre with more of the showroom visible ahead of it. |

Type and spacing scale off the **short** side of the screen, so a wider panel buys more of the
showroom in view rather than bigger text. Tested at 1920×1080, 2560×1080, 3840×1080, 1920×720 and
1080×1920.

### Windows kiosk checklist

- Rotate the display in *Settings → System → Display → Orientation* for portrait. The portal detects
  the orientation itself; there is no setting inside it.
- Turn off screen sleep and screen saver (*Settings → System → Power*).
- The kiosk launcher already runs Chrome full screen, so the fullscreen button hides itself: it
  only appears when there is something for it to do. In a normal window it switches to an "exit"
  icon while full screen. If a browser refuses the request, the portal says so on screen and points
  at `F11` rather than leaving a button that does nothing.
- The portal draws its own touch keyboard for search, so the Windows touch keyboard can stay off.
- The kiosk needs internet for the live sites. The shell, fonts, previews and QR codes are local and
  keep working when the connection is slow or absent.

---

## How visitors use it

| Screen | What happens |
| --- | --- |
| **Opening** | The X appears, activates and flies into the top-left corner while the showroom emerges. Any touch skips ahead. |
| **Home** | The showroom floor: one exhibit in focus, neighbours peeking. Swipe (horizontal in landscape, vertical in portrait), or use the arrows. Capability chips filter the journey. |
| **Stage** | Tap an exhibit: the X wipes to the project introduction with previews, what we built, highlights and a QR code. Swipe or use Previous / Next to move between projects. |
| **Viewer** | "Experience it" opens the live site inside the portal. Back and the X (Home) are always visible in the top bar. Sites that refuse embedding are shown as full-screen captured screens with a QR code. |
| **All projects** | Every project grouped by capability. |
| **Search** | Instant search over names, industries, capabilities, descriptions and tags, with a large on-screen keyboard. |

The gold **X** in the top-left is always Home. Every enter and return passes through the X.

### Exhibition behaviour (see `CONFIG` at the top of `js/app.js`)

| Setting | Default | Meaning |
| --- | --- | --- |
| `idleHome` | 75 s | No touch on stage / map / search → back to the showroom, filters reset |
| `idleViewer` | 150 s | No touch while a live site is open → "Still exploring?" prompt |
| `idlePrompt` | 20 s | Prompt countdown before returning home by itself |
| `attractAfter` | 20 s | Idle on home → attract mode: exhibits advance on their own, "Touch to explore" |
| `attractStep` | 6 s | Pace of attract mode |
| `loadTimeout` | 20 s | Slow live site → "Taking longer than expected" with Try again / Back |

Touches inside a live site cannot be seen by the portal (browser security), which is why the viewer
uses a longer timeout plus a prompt instead of a silent reset.

### Staff shortcuts (keyboard)

`F` full screen · `H` or `Home` home · `Esc` back / close · `/` or `S` search · `M` all projects ·
arrow keys move the showroom · `Enter` opens the focused project.

The browser console also exposes `showroom` (for example `showroom.open('sxan')`,
`showroom.home(true)`, `showroom.lens('interactive')`).

---

## Adding, editing or reordering projects

Everything comes from **`js/projects.js`**. The interface, lenses, map, search, stage and viewer are
generated from it; adding a 15th project is a data change, not a design change.

1. Copy one project object, give it a new `id` (lowercase letters and digits), fill in the fields.
   The legend at the top of that file explains each one. `order` controls its position in the journey.
2. Capture its preview frames:

   ```bash
   node tools/capture.mjs <id>
   ```

   This drives headless Chrome, dismisses cookie banners and popups, and writes
   `assets/shots/<id>-d1.jpg … d3.jpg` (desktop) and `<id>-m1.jpg, m2.jpg` (mobile). Run it with no
   id to recapture everything. Your own JPGs with the same names work just as well.
3. Check whether it can be shown live, and set `embed` accordingly:

   ```bash
   node tools/check-embed.mjs <id>
   ```
4. Commit and push. Vercel redeploys; the kiosk picks it up on the next reload.

Capabilities (the lenses) are defined in the same file under `LEANX_CAPABILITIES`. A project can
belong to several.

---

## Files

```
index.html                    the portal
css/portal.css                design system, landscape and portrait compositions
js/projects.js                PROJECT DATA (edit this)
js/app.js                     application logic (rail physics, X transition, viewer, search, idle)
js/qrcode.js                  QR generator (MIT, vendored)
sw.js                         offline safety net for the booth
manifest.webmanifest          installable full-screen app
assets/brand/                 X mark, wordmark, app icons
assets/fonts/                 Outfit (variable), self-hosted
assets/shots/                 preview frames per project
vercel.json                   static deployment: headers and caching
tools/serve.mjs               local static server (and local proxies, if configured)
tools/proxy.mjs               local header-stripping proxy — opt-in, local only, unverified
tools/capture.mjs             preview frame capture (headless Chrome)
tools/check-embed.mjs         asks each site whether it can be displayed in the portal
tools/preview.mjs             renders every portal screen at a given size for QA
Start Showroom (kiosk).bat    exhibition launcher (local, or a deployed address)
Start Showroom (window).bat   normal window launcher
```

### QA renders

With the local server running:

```bash
node tools/preview.mjs 1920x1080
node tools/preview.mjs 2560x1080
node tools/preview.mjs 1080x1920
```

writes one JPG per screen (home, stage, live viewer, screens viewer, map, search, attract) into
`preview/`. Pass the booth's real resolution to check it before an event. Add `wipe` as a fifth
argument to render frozen frames of the X transition.
