/* =====================================================================
   LEANX SHOWROOM — APPLICATION
   Vanilla JS, no build step. Everything is generated from js/projects.js.
   ===================================================================== */
(() => {
  'use strict';

  const CONFIG = {
    idleHome: 75000,       // ms without touch (stage / map / search) before returning to the showroom
    idleViewer: 150000,    // ms without touch inside a live site before the "still exploring?" prompt
    idlePrompt: 20000,     // ms the prompt waits before going home by itself
    attractAfter: 20000,   // ms idle on the home screen before attract mode starts
    attractStep: 6000,     // ms between automatic moves in attract mode
    loadTimeout: 20000,    // ms before a slow live site shows the retry message
    stageCycle: 3400,      // ms between preview frames on the stage
    framesCycle: 4200,     // ms between slides when a site is shown as screens
  };

  const CAPS = window.LEANX_CAPABILITIES || [];
  const PROJECTS = [...(window.LEANX_PROJECTS || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
  const capById = Object.fromEntries(CAPS.map(c => [c.id, c]));
  const byId = id => PROJECTS.find(p => p.id === id);

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const pad = n => String(n).padStart(2, '0');
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shot = (p, k) => `assets/shots/${p.id}-${k}.jpg`;
  const capLabels = p => (p.capabilities || []).map(id => capById[id] && capById[id].label).filter(Boolean);
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const easeInOut = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const centreOf = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  const pt = e => {
    if (e && typeof e.clientX === 'number' && (e.clientX || e.clientY)) return { x: e.clientX, y: e.clientY };
    if (e && e.currentTarget && e.currentTarget.getBoundingClientRect) return centreOf(e.currentTarget);
    return null;
  };
  const ARROW = '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  const ARROW_L = '<svg viewBox="0 0 24 24"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>';
  const XICON = '<svg viewBox="0 0 110 100"><use href="#xmark"/></svg>';

  const state = { screen: 'home', orient: 'landscape', lens: 'all', list: PROJECTS, index: 0, current: null, booted: false, attract: false, busy: false, railDirty: false };
  const body = document.body;

  /* ------------------------------------------------------------------
     Live site or captured screens?
     A project opens live when it allows being displayed inside the portal.
     A project marked `proxy` only counts as live when tools/serve.mjs
     reports that its local proxy actually started, so a missing or failed
     proxy falls back to the screens instead of showing a broken frame.
  ------------------------------------------------------------------ */
  const PROXY = { ports: {} };
  function canEmbed(p) { return !!(p && p.embed && (!p.proxy || PROXY.ports[p.id])); }
  function viewerSrc(p) {
    const port = p.proxy && PROXY.ports[p.id];
    if (!port) return p.url;
    const u = new URL(p.url);
    return `http://${location.hostname || 'localhost'}:${port}${u.pathname}${u.search}`;
  }
  function proxyOrigin(p) {
    const port = p.proxy && PROXY.ports[p.id];
    return port ? `http://${location.hostname || 'localhost'}:${port}` : null;
  }
  async function probeProxies() {
    if (!PROJECTS.some(p => p.proxy) || location.protocol === 'file:') return;
    try {
      const r = await fetch('/__leanx/proxies', { cache: 'no-store', signal: AbortSignal.timeout(2500) });
      const d = await r.json();
      PROXY.ports = (d && d.ports) || {};
    } catch { PROXY.ports = {}; }
    if (state.screen === 'home') rail.build(state.list);   // refresh the Live marks
  }

  /* ------------------------------------------------------------------
     Orientation
  ------------------------------------------------------------------ */
  function applyOrient() {
    state.orient = innerHeight > innerWidth ? 'portrait' : 'landscape';
    body.dataset.orient = state.orient;
    $('#homeHintText').innerHTML = state.orient === 'portrait'
      ? 'Swipe up to explore &middot; tap a project to enter'
      : 'Swipe to explore &middot; tap a project to enter';
  }

  /* ------------------------------------------------------------------
     The X transition: a gold X grows from the touch point, covers the
     screen, the view swaps underneath, then the X collapses into the
     home button (so the X itself reads as "home").
  ------------------------------------------------------------------ */
  const X_POINTS = [[0, 0], [40, 0], [55, 21.4], [70, 0], [110, 0], [75, 50], [110, 100], [70, 100], [55, 78.6], [40, 100], [0, 100], [35, 50]];
  const X_INRADIUS = 16.4; // inradius of the crossing diamond, in X units
  function xPolygon(cx, cy, s, deg) {
    const r = deg * Math.PI / 180, cos = Math.cos(r), sin = Math.sin(r);
    return 'polygon(' + X_POINTS.map(([x, y]) => {
      const dx = (x - 55) * s, dy = (y - 50) * s;
      return (cx + dx * cos - dy * sin).toFixed(1) + 'px ' + (cy + dx * sin + dy * cos).toFixed(1) + 'px';
    }).join(',') + ')';
  }
  function homeTarget() {
    const r = $('.home-x').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, s: Math.max(0.05, r.width / 110) };
  }
  const WIPE_GROW = 320, WIPE_COLLAPSE = 380; // ms: grow from the touch point, then collapse into the home button
  function wipeSetup(origin) {
    const W = innerWidth, H = innerHeight;
    const o = origin || { x: W / 2, y: H / 2 };
    const far = Math.max(Math.hypot(o.x, o.y), Math.hypot(W - o.x, o.y), Math.hypot(o.x, H - o.y), Math.hypot(W - o.x, H - o.y));
    return { o, cover: far / X_INRADIUS * 1.12, s0: 0.5 };
  }
  // Shape of the X at time t (ms) of the transition. Scale moves exponentially (a zoom feels
  // linear in log space), the centre glides to the home button with an ease.
  function wipeShape(g, t, home) {
    if (t < WIPE_GROW) {
      const k = clamp(t / WIPE_GROW, 0, 1);
      return xPolygon(g.o.x, g.o.y, g.s0 * Math.pow(g.cover / g.s0, k), k * 70);
    }
    const k = clamp((t - WIPE_GROW) / WIPE_COLLAPSE, 0, 1), m = easeInOut(k);
    return xPolygon(g.o.x + (home.x - g.o.x) * m, g.o.y + (home.y - g.o.y) * m, g.cover * Math.pow(home.s / g.cover, k), 70 + 110 * m);
  }
  let wiping = false;
  function xWipe(origin, swap) {
    if (wiping) { try { swap(); } catch (e) { console.error(e); } return Promise.resolve(); }
    wiping = true;
    const layer = $('#xwipe');
    const g = wipeSetup(origin);
    layer.style.clipPath = xPolygon(g.o.x, g.o.y, g.s0, 0);
    layer.classList.add('is-on');
    return new Promise(resolve => {
      let t0 = null, swapped = false, home = null, done = false;
      const doSwap = () => { if (swapped) return; swapped = true; try { swap(); } catch (e) { console.error(e); } home = homeTarget(); };
      const finish = () => {
        if (done) return; done = true; clearTimeout(watchdog); doSwap();
        layer.classList.remove('is-on'); layer.style.clipPath = ''; wiping = false; litHome(); resolve();
      };
      // If animation frames stall (hidden tab, throttled display) the view still swaps.
      const watchdog = setTimeout(finish, WIPE_GROW + WIPE_COLLAPSE + 1200);
      const frame = now => {
        if (done) return;
        if (t0 === null) t0 = now;
        const t = now - t0;
        if (t >= WIPE_GROW) doSwap();
        layer.style.clipPath = wipeShape(g, t, home);
        if (t < WIPE_GROW + WIPE_COLLAPSE) requestAnimationFrame(frame); else finish();
      };
      requestAnimationFrame(frame);
    });
  }
  // Freeze the wipe at time t for inspection (t < 0 clears it). Used by tools/preview.mjs.
  function debugWipe(t, x, y) {
    const layer = $('#xwipe');
    if (t < 0) { layer.classList.remove('is-on'); layer.style.clipPath = ''; return; }
    const g = wipeSetup(x == null ? null : { x, y });
    layer.classList.add('is-on'); layer.style.clipPath = wipeShape(g, t, homeTarget());
  }
  function litHome() {
    const b = $('#homeBtn'); b.classList.remove('is-lit'); void b.offsetWidth; b.classList.add('is-lit');
    setTimeout(() => b.classList.remove('is-lit'), 700);
  }

  /* ------------------------------------------------------------------
     Opening sequence: X appears, activates, flies into the home button
     while the showroom emerges. Any touch skips ahead.
  ------------------------------------------------------------------ */
  function boot() {
    const bootEl = $('#boot'), x = $('#bootX');
    let flying = false, finished = false;
    const finish = () => {
      if (finished) return; finished = true;
      body.classList.remove('is-booting'); bootEl.classList.add('is-done');
      setTimeout(() => bootEl.remove(), 300);
      state.booted = true; litHome(); startIdleWatch();
    };
    const fly = () => {
      if (flying) return; flying = true;
      bootEl.classList.add('is-open'); body.classList.remove('is-booting');
      const target = $('.home-x').getBoundingClientRect(), r = x.getBoundingClientRect();
      const s = (target.width * 1.08) / r.width;
      const dx = (target.left + target.width / 2) - (r.left + r.width / 2), dy = (target.top + target.height / 2) - (r.top + r.height / 2);
      x.style.transform = 'scale(1) rotate(0deg)';
      bootEl.classList.add('is-flying');
      requestAnimationFrame(() => requestAnimationFrame(() => { x.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${s.toFixed(4)})`; }));
      setTimeout(finish, 700);
    };
    bootEl.classList.add('is-in');
    setTimeout(() => bootEl.classList.add('is-open'), 1000);
    setTimeout(() => body.classList.remove('is-booting'), 1060);
    setTimeout(fly, 1180);
    bootEl.addEventListener('pointerdown', fly, { once: true });
  }

  /* ------------------------------------------------------------------
     Exhibition behaviour: activity tracking, idle reset, attract mode,
     "still exploring?" prompt while a live site is open.
  ------------------------------------------------------------------ */
  let idleTimer = 0, attractTimer = 0, attractInterval = 0, promptTick = 0, promptOpen = false;
  function activity() { if (!state.booted) return; stopAttract(); scheduleIdle(); }
  function scheduleIdle() {
    clearTimeout(idleTimer); clearTimeout(attractTimer);
    if (state.screen === 'home' && !searchOpen) { attractTimer = setTimeout(startAttract, CONFIG.attractAfter); return; }
    idleTimer = setTimeout(onIdle, state.screen === 'viewer' ? CONFIG.idleViewer : CONFIG.idleHome);
  }
  function onIdle() { if (state.screen === 'viewer') showPrompt(); else resetToHome(); }
  function resetToHome() { closeSearch(); goHome(null, true); }
  function startIdleWatch() {
    ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'].forEach(ev => window.addEventListener(ev, activity, { passive: true, capture: true }));
    window.addEventListener('blur', activity);
    scheduleIdle();
  }
  function startAttract() {
    if (state.screen !== 'home' || searchOpen || state.attract || state.busy) return;
    state.attract = true;
    if (state.lens !== 'all') setLens('all');
    $('#touchHint').hidden = false;
    attractInterval = setInterval(() => {
      if (state.screen !== 'home' || state.busy) return stopAttract();
      const n = state.list.length; if (!n) return;
      rail.setIndex((state.index + 1) % n);
    }, CONFIG.attractStep);
  }
  function stopAttract() {
    if (!state.attract) return;
    state.attract = false; $('#touchHint').hidden = true; clearInterval(attractInterval);
  }
  function showPrompt() {
    if (promptOpen) return; promptOpen = true;
    const el = $('#idle'), c = $('#idleCount'); let left = Math.round(CONFIG.idlePrompt / 1000);
    c.textContent = left; el.hidden = false;
    promptTick = setInterval(() => { left--; c.textContent = Math.max(0, left); if (left <= 0) { hidePrompt(); resetToHome(); } }, 1000);
  }
  function hidePrompt() { if (!promptOpen) return; promptOpen = false; $('#idle').hidden = true; clearInterval(promptTick); }

  /* ------------------------------------------------------------------
     Capability lenses
  ------------------------------------------------------------------ */
  function buildLenses() {
    const nav = $('#lenses'); nav.innerHTML = '';
    const mk = (id, label, hue, count) => {
      const b = document.createElement('button');
      b.className = 'lens' + (state.lens === id ? ' is-on' : ''); b.dataset.lens = id; b.style.setProperty('--h', hue);
      b.innerHTML = (id === 'all' ? '' : '<i></i>') + esc(label) + ' <b>' + count + '</b>';
      b.addEventListener('click', () => setLens(id));
      return b;
    };
    nav.appendChild(mk('all', 'All projects', 45, PROJECTS.length));
    CAPS.forEach(c => { const n = PROJECTS.filter(p => (p.capabilities || []).includes(c.id)).length; if (n) nav.appendChild(mk(c.id, c.label, c.hue, n)); });
  }
  function setLens(id) {
    if (state.lens === id) return;
    state.lens = id;
    state.list = id === 'all' ? PROJECTS : PROJECTS.filter(p => (p.capabilities || []).includes(id));
    state.index = 0;
    $$('.lens').forEach(b => b.classList.toggle('is-on', b.dataset.lens === id));
    $('#railLensLabel').textContent = id === 'all' ? 'All projects' : capById[id].label;
    rail.build(state.list);
    const on = $('.lens.is-on'); if (on && on.scrollIntoView) on.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }

  /* ------------------------------------------------------------------
     The rail: a kinetic journey through the exhibits.
     Horizontal in landscape, vertical in portrait. Spring physics,
     momentum flicks, snap to the nearest exhibit, tap to enter.
  ------------------------------------------------------------------ */
  function exhibitNode(p, i) {
    const node = document.createElement('article');
    node.className = 'exhibit'; node.dataset.id = p.id; node.style.setProperty('--ac', p.accent || '#32A4BD');
    const caps = capLabels(p);
    const portrait = state.orient === 'portrait';
    const eager = i < 3;
    node.innerHTML = `
      <div class="ex-frame">
        <img class="for-landscape" src="${shot(p, 'd1')}" alt="" draggable="false" loading="${!portrait && eager ? 'eager' : 'lazy'}">
        <img class="for-portrait" src="${shot(p, 'm1')}" alt="" draggable="false" loading="${portrait && eager ? 'eager' : 'lazy'}">
        <div class="ex-shade"></div>
        ${p.featured ? '<span class="ex-badge">Featured</span>' : ''}
        ${canEmbed(p) ? '<span class="ex-live"><i></i>Live</span>' : ''}
      </div>
      <div class="ex-cap">
        <div>
          <div class="ex-num">${pad(i + 1)} &middot; ${esc(caps[0] || p.kind)}</div>
          <h3 class="ex-name">${esc(p.name)}</h3>
          <p class="ex-kind">${esc(p.kind)}</p>
          <p class="ex-tag">${esc(p.tagline)}</p>
        </div>
        <span class="ex-enter">Enter ${ARROW}</span>
      </div>`;
    return node;
  }

  const rail = (() => {
    const el = $('#rail'), track = $('#railTrack');
    let items = [], step = 1, pos = 0, vel = 0, target = 0, raf = 0, vertical = false, leadR = 0.5;
    let box = { w: 0, h: 0 }, exW = 0, exH = 0, gap = 0;
    let dragging = false, startPos = 0, startPt = 0, moved = false, samples = [], lastT = 0, pid = null, wheelAcc = 0, wheelLock = 0;
    const axis = e => (vertical ? e.clientY : e.clientX);
    const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

    function build(list) {
      cancelAnimationFrame(raf);
      track.innerHTML = '';
      items = list.map((p, i) => { const node = exhibitNode(p, i); track.appendChild(node); return { p, node }; });
      $('#railEmpty').hidden = items.length > 0;
      $('#railTotal').textContent = '/ ' + pad(items.length);
      pos = target = 0; vel = 0; state.index = 0;
      layout(); focusChanged();
    }
    function layout() {
      vertical = state.orient === 'portrait';
      const r = el.getBoundingClientRect(); box = { w: r.width, h: r.height };
      if (!box.w || !box.h) { state.railDirty = true; return; }
      state.railDirty = false;
      const R = rem();
      if (vertical) {
        gap = 1.4 * R; exH = Math.round(box.h * 0.6); exW = Math.round(box.w - 4 * R);
        el.style.setProperty('--ph-w', Math.round((exH - 10) * 430 / 932 + 10) + 'px');
        el.style.setProperty('--ex-w', exW + 'px'); el.style.setProperty('--ex-h', exH + 'px');
      } else {
        gap = 2.4 * R; exH = Math.round(box.h - 0.6 * R);
        const maxW = box.w * 0.58;
        // Size the card from the height that is actually free. Set a provisional
        // width, measure the caption (its height follows the font size, which on a
        // short panel is small), then give the preview every pixel left over.
        exW = Math.round(Math.min(maxW, (exH - 6 * R) * 1.6));
        el.style.setProperty('--ex-w', exW + 'px'); el.style.setProperty('--ex-h', exH + 'px');
        const cap = items.length ? items[0].node.querySelector('.ex-cap') : null;
        const capH = cap ? cap.offsetHeight : 6 * R;          // offsetHeight ignores the scale transform
        const frameH = Math.max(90, exH - capH - 0.9 * R);    // 0.9rem is the gap inside .exhibit
        // On a very short panel let the preview crop a little rather than shrink
        // the whole exhibit into the middle of a wide screen.
        const minW = Math.min(box.w * 0.34, frameH * 2);
        exW = Math.round(clamp(frameH * 1.6, Math.min(minW, maxW), maxW));
        el.style.setProperty('--ex-w', exW + 'px');
      }
      // On a wide panel the focused exhibit sits left of centre, so the journey
      // reads as running to the right instead of leaving a void beside it.
      leadR = (!vertical && innerWidth / innerHeight >= 1.95) ? 0.3 : 0.5;
      step = (vertical ? exH : exW) + gap;
      items.forEach((it, i) => {
        it.node.style.left = vertical ? Math.round((box.w - exW) / 2) + 'px' : Math.round(i * step) + 'px';
        it.node.style.top = vertical ? Math.round(i * step) + 'px' : Math.round((box.h - exH) / 2) + 'px';
      });
      pos = target = clamp(state.index, 0, Math.max(0, items.length - 1)) * step; vel = 0; render();
    }
    function render() {
      const lead = vertical ? (box.h - exH) / 2 : (box.w - exW) * leadR;
      const off = (lead - pos).toFixed(2);
      track.style.transform = vertical ? `translate3d(0, ${off}px, 0)` : `translate3d(${off}px, 0, 0)`;
      let nearest = 0, best = Infinity;
      items.forEach((it, i) => {
        const d = (i * step - pos) / step, a = Math.abs(d);
        if (a < best) { best = a; nearest = i; }
        if (a > 3) { it.node.style.visibility = 'hidden'; return; }
        it.node.style.visibility = '';
        const s = 1 - Math.min(a, 2) * (vertical ? 0.06 : 0.1);
        it.node.style.transform = `scale(${s.toFixed(4)})`;
        it.node.querySelector('.ex-shade').style.opacity = (Math.min(a, 1) * 0.62).toFixed(3);
      });
      items.forEach((it, i) => it.node.classList.toggle('is-focus', i === nearest));
      if (items.length && nearest !== state.index) { state.index = nearest; focusChanged(); }
    }
    function animate() { cancelAnimationFrame(raf); lastT = performance.now(); raf = requestAnimationFrame(tick); }
    function tick(now) {
      const dt = Math.min(0.032, (now - lastT) / 1000) || 0.016; lastT = now;
      const k = 190, c = 2 * Math.sqrt(k) * 0.92;
      vel += (-k * (pos - target) - c * vel) * dt; pos += vel * dt;
      if (Math.abs(pos - target) < 0.4 && Math.abs(vel) < 4) { pos = target; vel = 0; render(); return; }
      render(); raf = requestAnimationFrame(tick);
    }
    const maxPos = () => Math.max(0, (items.length - 1) * step);
    function setIndex(i, immediate) {
      const n = items.length; if (!n) return;
      i = clamp(i, 0, n - 1); target = i * step;
      if (immediate) { cancelAnimationFrame(raf); pos = target; vel = 0; render(); } else animate();
    }
    function onTap(e) {
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      const node = hit && hit.closest ? hit.closest('.exhibit') : null; if (!node) return;
      const i = items.findIndex(it => it.node === node); if (i < 0) return;
      if (i === state.index) openProject(items[i].p, { x: e.clientX, y: e.clientY }); else setIndex(i);
    }
    el.addEventListener('pointerdown', e => {
      if (!items.length || (e.pointerType === 'mouse' && e.button !== 0) || pid !== null) return;
      pid = e.pointerId; try { el.setPointerCapture(pid); } catch (_) {}
      cancelAnimationFrame(raf); dragging = true; moved = false; startPos = pos; startPt = axis(e); vel = 0;
      samples = [{ t: e.timeStamp, x: startPt }];
    });
    el.addEventListener('pointermove', e => {
      if (!dragging || e.pointerId !== pid) return;
      const x = axis(e), delta = x - startPt;
      if (Math.abs(delta) > 7) moved = true;
      let np = startPos - delta; const mx = maxPos();
      if (np < 0) np *= 0.35; else if (np > mx) np = mx + (np - mx) * 0.35;
      pos = np; samples.push({ t: e.timeStamp, x }); if (samples.length > 8) samples.shift();
      render();
    });
    const end = e => {
      if (!dragging || e.pointerId !== pid) return;
      dragging = false; pid = null; try { el.releasePointerCapture(e.pointerId); } catch (_) {}
      if (!moved) { target = clamp(Math.round(pos / step), 0, items.length - 1) * step; animate(); if (e.type === 'pointerup') onTap(e); return; }
      const last = samples[samples.length - 1]; let ref = samples[0];
      for (const s of samples) { if (last.t - s.t <= 120) { ref = s; break; } }
      const v = (last.x - ref.x) / Math.max(1, last.t - ref.t); // px per ms, finger direction
      const projected = pos - v * 160;
      let idx = Math.round(projected / step); const cur = Math.round(startPos / step);
      if (idx === cur && Math.abs(v) > 0.45) idx = cur - Math.sign(v);
      setIndex(idx);
    };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', e => {
      e.preventDefault(); if (performance.now() < wheelLock) return;
      wheelAcc += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (Math.abs(wheelAcc) > 50) { setIndex(state.index + Math.sign(wheelAcc)); wheelAcc = 0; wheelLock = performance.now() + 380; }
    }, { passive: false });
    return { build, layout, setIndex, count: () => items.length };
  })();

  function focusChanged() {
    const n = state.list.length, p = state.list[state.index];
    $('#railIndex').textContent = pad(n ? state.index + 1 : 0);
    $('#railProgress').style.width = n ? ((state.index + 1) / n * 100).toFixed(1) + '%' : '0%';
    if (p) { setAccent(p.accent); preload(p); }
  }
  function setAccent(c) { document.documentElement.style.setProperty('--accent', c || '#32A4BD'); }
  const preloaded = new Set();
  function preload(p) {
    if (preloaded.has(p.id)) return; preloaded.add(p.id);
    ['d2', 'd3', 'm1'].forEach(k => { const im = new Image(); im.src = shot(p, k); });
  }

  /* ------------------------------------------------------------------
     QR helper (qrcode-generator, vendored)
  ------------------------------------------------------------------ */
  function makeQr(el, url) {
    if (!el) return;
    try {
      const q = qrcode(0, 'M'); q.addData(url); q.make();
      el.innerHTML = q.createSvgTag({ cellSize: 2, margin: 0, scalable: true });
    } catch (e) { el.remove(); }
  }

  /* ------------------------------------------------------------------
     Stage: the project introduction
  ------------------------------------------------------------------ */
  let stageTimer = 0;
  function renderStage(p) {
    clearInterval(stageTimer);
    const sec = $('#screenStage');
    const idx = state.list.indexOf(p), n = state.list.length;
    const prev = n > 1 && idx >= 0 ? state.list[(idx - 1 + n) % n] : null;
    const next = n > 1 && idx >= 0 ? state.list[(idx + 1) % n] : null;
    const live = canEmbed(p);
    const note = live
      ? (p.access === 'private'
        ? 'Opens live here. It is our own tool, so ask us to unlock it and we will audit your site on this screen.'
        : 'Opens live, right here in the showroom.')
      : 'This site does not allow itself to be displayed inside another page, so the showroom presents its screens. Scan the code to open it on your phone.';
    sec.innerHTML = `
      <div class="stage" style="--ac:${esc(p.accent || '#32A4BD')}">
        <div class="stage-info">
          <p class="eyebrow"><span class="eyebrow-dot"></span>${esc(p.kind)} &middot; ${esc(p.industry)}</p>
          <h2 class="stage-name">${esc(p.name)}</h2>
          <p class="stage-tagline">${esc(p.tagline)}</p>
          <div class="chips">${(p.capabilities || []).map(id => capById[id] ? `<span class="chip" style="--h:${capById[id].hue}"><i></i>${esc(capById[id].label)}</span>` : '').join('')}</div>
          <div class="stage-block"><h4>What we built</h4><p class="stage-desc">${esc(p.description)}</p></div>
          <ul class="stage-hl">${(p.highlights || []).map(h => `<li>${XICON}${esc(h)}</li>`).join('')}</ul>
          <div class="stage-meta"><span>Client <b>${esc(p.client || p.name)}</b></span><span>Language <b>${esc(p.lang || 'EN')}</b></span><span>Showroom <b>${live ? 'Live site' : 'Screens'}</b></span></div>
          <div class="stage-actions">
            <button class="btn btn--gold" id="enterBtn">${live ? 'Experience it' : 'See the screens'} ${ARROW}</button>
            <div class="stage-qr"><div class="qr" id="stageQr"></div><small>Scan to open on your phone</small></div>
            <div class="stage-portrait-switch">
              ${prev ? `<button class="round-btn" data-switch="${prev.id}" aria-label="Previous project"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button>` : ''}
              ${next ? `<button class="round-btn" data-switch="${next.id}" aria-label="Next project"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg></button>` : ''}
            </div>
            <p class="stage-note">${esc(note)}</p>
          </div>
        </div>
        <div class="stage-visual">
          <div class="stage-screen-wrap">
            <div class="stage-screen">
              <img src="${shot(p, 'd1')}" class="is-on" alt="" draggable="false">
              <img src="${shot(p, 'd2')}" alt="" draggable="false">
              <img src="${shot(p, 'd3')}" alt="" draggable="false">
              <div class="stage-phone"><img src="${shot(p, 'm1')}" alt="" draggable="false"></div>
            </div>
          </div>
          <div class="stage-switch">
            ${prev ? `<button class="switch-btn switch-btn--prev" data-switch="${prev.id}">${ARROW_L}<span><small>Previous</small><b>${esc(prev.name)}</b></span></button>` : '<span></span>'}
            ${next ? `<button class="switch-btn switch-btn--next" data-switch="${next.id}"><span><small>Next</small><b>${esc(next.name)}</b></span>${ARROW}</button>` : '<span></span>'}
          </div>
        </div>
      </div>`;
    makeQr($('#stageQr', sec), p.url);
    $('#enterBtn', sec).addEventListener('click', e => enterProject(p, pt(e)));
    $$('[data-switch]', sec).forEach(b => b.addEventListener('click', () => switchProject(byId(b.dataset.switch))));
    $$('.stage-screen img, .stage-phone img', sec).forEach(im => im.addEventListener('error', () => { im.style.display = 'none'; }));
    const imgs = $$('.stage-screen > img', sec); let k = 0;
    stageTimer = setInterval(() => {
      if (state.screen !== 'stage') return;
      const alive = imgs.filter(im => im.style.display !== 'none' && im.complete && im.naturalWidth); if (alive.length < 2) return;
      k = (k + 1) % alive.length; imgs.forEach(im => im.classList.toggle('is-on', im === alive[k]));
    }, CONFIG.stageCycle);
    swipeToSwitch(sec, prev, next);
    setAccent(p.accent);
  }
  function swipeToSwitch(sec, prev, next) {
    let sx = 0, sy = 0, pid = null, moved = false;
    sec.onpointerdown = e => { if (e.target.closest('button')) return; pid = e.pointerId; sx = e.clientX; sy = e.clientY; moved = false; };
    sec.onpointermove = e => { if (e.pointerId !== pid || moved) return; const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) { moved = true; switchProject(dx < 0 ? next : prev); }
      else if (state.orient === 'portrait' && Math.abs(dy) > 90 && Math.abs(dy) > Math.abs(dx) * 1.5) { moved = true; switchProject(dy < 0 ? next : prev); } };
    sec.onpointerup = sec.onpointercancel = () => { pid = null; };
  }
  function switchProject(p) {
    if (!p || state.busy || state.screen !== 'stage') return;
    state.current = p; renderStage(p);
    const sec = $('#screenStage'); sec.classList.remove('is-fading'); void sec.offsetWidth; sec.classList.add('is-fading');
    const i = state.list.indexOf(p); if (i >= 0) { state.index = i; rail.setIndex(i, true); }
  }

  /* ------------------------------------------------------------------
     Viewer: the live site inside the showroom, or its screens when the
     site forbids embedding / needs a login.
  ------------------------------------------------------------------ */
  let loadTimer = 0, framesTimer = 0;
  function renderViewer(p) {
    const sec = $('#screenViewer'); clearTimeout(loadTimer); clearInterval(framesTimer);
    const live = canEmbed(p);
    $('#chromeTitle').innerHTML = `<b>${esc(p.name)}</b><span>${esc(p.kind)} &middot; ${esc(capLabels(p).join(' / '))}</span>`;
    if (!live) { renderFrames(sec, p); return; }
    const src = viewerSrc(p);
    sec.innerHTML = `
      <div class="viewer">
        <iframe class="viewer-frame" id="viewerFrame" title="${esc(p.name)}"
          sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-pointer-lock allow-presentation allow-orientation-lock"
          allow="accelerometer; autoplay; bluetooth; camera; fullscreen; gyroscope; microphone; xr-spatial-tracking"
          allowfullscreen referrerpolicy="no-referrer-when-downgrade"></iframe>
        <div class="viewer-cover" id="viewerCover"><div>${XICON.replace('<svg', '<svg class="x-pulse"')}<h3>Opening ${esc(p.name)}</h3><p>${esc(p.tagline)}</p></div></div>
        <div class="viewer-cover is-hidden" id="viewerProblem"><div>${XICON.replace('<svg', '<svg class="x-pulse"')}<h3>Taking longer than expected</h3><p>The live site is slow to respond right now. You can try again, or go back to the introduction.</p>
          <div class="cover-actions"><button class="btn btn--gold" id="retryBtn">Try again</button><button class="btn btn--ghost" id="problemBack">Back</button></div></div></div>
        ${p.gate ? `<div class="gate" id="gateBar"><svg class="gate-x" viewBox="0 0 110 100"><use href="#xmark"/></svg><p>${esc(p.gate.note)}</p><button class="gate-close" id="gateClose" aria-label="Hide this message">&times;</button></div>` : ''}
        <div class="viewer-qr"><div class="qr" id="viewerQr"></div><small>Scan to open on your phone</small></div>
      </div>`;
    const frame = $('#viewerFrame', sec), cover = $('#viewerCover', sec), problem = $('#viewerProblem', sec);
    const gateBar = $('#gateBar', sec);
    if (gateBar) $('#gateClose', sec).addEventListener('click', () => gateBar.remove());
    const start = () => {
      cover.classList.remove('is-hidden'); problem.classList.add('is-hidden');
      clearTimeout(loadTimer);
      loadTimer = setTimeout(() => { if (state.screen === 'viewer' && !cover.classList.contains('is-hidden')) problem.classList.remove('is-hidden'); }, CONFIG.loadTimeout);
      frame.src = src;
    };
    frame.addEventListener('load', () => { clearTimeout(loadTimer); cover.classList.add('is-hidden'); problem.classList.add('is-hidden'); });
    frame.addEventListener('error', () => { clearTimeout(loadTimer); problem.classList.remove('is-hidden'); });
    $('#retryBtn', sec).addEventListener('click', start);
    $('#problemBack', sec).addEventListener('click', e => goBack(pt(e)));
    makeQr($('#viewerQr', sec), p.url);
    start();
  }
  function renderFrames(sec, p) {
    const keys = ['d1', 'd2', 'd3', 'm1', 'm2'];
    const priv = p.access === 'private';
    sec.innerHTML = `
      <div class="viewer"><div class="frames">
        <div class="frames-stage" id="framesStage">
          <div class="frames-track" id="framesTrack">${keys.map(k => `<div class="frame-slide"><img src="${shot(p, k)}" alt="" class="${k[0] === 'm' ? 'is-mobile' : ''}" draggable="false"></div>`).join('')}</div>
          <div class="frames-dots" id="framesDots"></div>
        </div>
        <aside class="frames-side">
          <h3>${priv ? 'A private platform' : 'Screens from the live site'}</h3>
          <p>${priv ? 'This platform needs a team login, so the showroom presents its screens. Ask anyone at the booth for a walkthrough.' : 'This site does not allow itself to be displayed inside another page, so the showroom presents its screens. Scan the code to open the live site on your phone.'}</p>
          ${p.embedBlocked && !priv ? `<p class="frames-why">Its server says: <b>${esc(p.embedBlocked)}</b></p>` : ''}
          <div class="qr" id="framesQr"></div>
          <button class="btn btn--ghost" id="framesBack">${ARROW_L} Back to introduction</button>
        </aside>
      </div></div>`;
    makeQr($('#framesQr', sec), p.url);
    $('#framesBack', sec).addEventListener('click', e => goBack(pt(e)));
    const slider = makeSlider($('#framesStage', sec), $('#framesTrack', sec), $('#framesDots', sec));
    $$('.frame-slide img', sec).forEach(im => im.addEventListener('error', () => { im.parentElement.remove(); slider.refresh(); }));
    framesTimer = setInterval(() => { if (state.screen === 'viewer' && !slider.touched()) slider.next(); }, CONFIG.framesCycle);
  }
  function makeSlider(stage, track, dots) {
    let i = 0, w = stage.clientWidth || 1, touched = false, dragging = false, sx = 0, sp = 0, pid = null;
    const n = () => track.children.length;
    const paintDots = () => { if (dots.children.length !== n()) dots.innerHTML = Array.from({ length: n() }, () => '<i></i>').join(''); Array.from(dots.children).forEach((d, k) => d.classList.toggle('is-on', k === i)); };
    const render = (x, anim) => { track.style.transition = anim ? 'transform 420ms cubic-bezier(.22,.8,.22,1)' : 'none'; track.style.transform = `translate3d(${(-x).toFixed(1)}px,0,0)`; paintDots(); };
    const go = k => { i = clamp(k, 0, Math.max(0, n() - 1)); render(i * w, true); };
    stage.addEventListener('pointerdown', e => { pid = e.pointerId; try { stage.setPointerCapture(pid); } catch (_) {} dragging = true; touched = true; sx = e.clientX; sp = i * w; });
    stage.addEventListener('pointermove', e => { if (!dragging || e.pointerId !== pid) return; render(sp - (e.clientX - sx), false); });
    const end = e => { if (!dragging || e.pointerId !== pid) return; dragging = false; pid = null; const dx = e.clientX - sx; go(Math.abs(dx) > w * 0.12 ? i - Math.sign(dx) : i); };
    stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
    const refresh = () => { w = stage.clientWidth || 1; go(Math.min(i, n() - 1)); };
    window.addEventListener('resize', refresh);
    render(0, false);
    return { next: () => go((i + 1) % Math.max(1, n())), refresh, touched: () => touched };
  }
  function teardownViewer() {
    const sec = $('#screenViewer');
    clearTimeout(loadTimer); clearInterval(framesTimer);
    if (sec.innerHTML) sec.innerHTML = '';
    $('#chromeTitle').innerHTML = '';
  }

  /* ------------------------------------------------------------------
     Map: every project, grouped by capability
  ------------------------------------------------------------------ */
  function buildMap() {
    const wrap = $('#mapGroups'); wrap.innerHTML = '';
    CAPS.forEach(c => {
      const list = PROJECTS.filter(p => (p.capabilities || []).includes(c.id)); if (!list.length) return;
      const g = document.createElement('section'); g.className = 'map-group';
      g.innerHTML = `<div class="map-group-head"><h3><i style="--h:${c.hue}"></i>${esc(c.label)}</h3><p>${esc(c.blurb)}</p></div>
        <div class="map-grid">${list.map(p => `<button class="tile" data-id="${p.id}"><img src="${shot(p, 'd1')}" alt="" loading="lazy" draggable="false"><span class="tile-num">${pad(PROJECTS.indexOf(p) + 1)}</span><span class="tile-cap"><b>${esc(p.name)}</b><span>${esc(p.kind)}</span></span></button>`).join('')}</div>`;
      wrap.appendChild(g);
    });
    wrap.addEventListener('click', e => { const t = e.target.closest('.tile'); if (t) openProject(byId(t.dataset.id), pt(e)); });
  }

  /* ------------------------------------------------------------------
     Search: instant, with a large on-screen keyboard
  ------------------------------------------------------------------ */
  let searchOpen = false, query = '';
  const QUICK = ['3D', 'AI', 'E-commerce', 'Booking', 'Motor', 'Campaign', 'Simulator', 'Malay', 'CMS', 'WhatsApp'];
  function buildSearch() {
    const quick = $('#searchQuick');
    quick.innerHTML = '<span>Try</span>' + QUICK.map(q => `<button class="quick">${esc(q)}</button>`).join('');
    quick.addEventListener('click', e => { const b = e.target.closest('.quick'); if (b) { query = b.textContent; runSearch(); } });
    const rows = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
    const kb = $('#keyboard');
    kb.innerHTML = rows.map((r, ri) => `<div class="kb-row">${r.split('').map(ch => `<button class="key" data-key="${ch}">${ch}</button>`).join('')}${ri === 3 ? '<button class="key key--wide" data-key="backspace" aria-label="Backspace"><svg viewBox="0 0 24 24"><path d="M9 5h11a1 1 0 011 1v12a1 1 0 01-1 1H9l-6-7 6-7zM12 9l6 6M18 9l-6 6"/></svg></button>' : ''}</div>`).join('')
      + '<div class="kb-row"><button class="key key--wide" data-key="clear">Clear</button><button class="key key--space" data-key=" ">space</button><button class="key key--wide" data-key="close">Done</button></div>';
    kb.addEventListener('pointerdown', e => { const k = e.target.closest('.key'); if (!k) return; e.preventDefault(); press(k.dataset.key); });
    $('#searchResults').addEventListener('click', e => { const r = e.target.closest('.result'); if (r) { const p = byId(r.dataset.id); closeSearch(); openProject(p, pt(e)); } });
    $('#searchClear').addEventListener('click', () => { query = ''; runSearch(); });
    $('#searchClose').addEventListener('click', closeSearch);
    $('#search').addEventListener('click', e => { if (e.target === e.currentTarget) closeSearch(); });
  }
  function press(k) {
    if (k === 'backspace') query = query.slice(0, -1);
    else if (k === 'clear') query = '';
    else if (k === 'close') return closeSearch();
    else if (k === ' ') { if (query && !query.endsWith(' ')) query += ' '; }
    else if (query.length < 40) query += k;
    runSearch();
  }
  function openSearch() {
    if (searchOpen) return; searchOpen = true; stopAttract();
    query = ''; runSearch(); $('#search').hidden = false; scheduleIdle();
  }
  function closeSearch() { if (!searchOpen) return; searchOpen = false; $('#search').hidden = true; scheduleIdle(); }
  function tokensOf(q) { return q.trim().toLowerCase().split(/\s+/).filter(Boolean); }
  // A token matches a field when a word in it starts with the token
  // ("motor" -> "motorcycle", "3d" -> "3D"), or, for longer tokens, when it
  // appears anywhere ("store" -> "bookstore"). Short tokens never match
  // inside other words, so "ai" finds AI, not "Damai" or "retail".
  const words = s => String(s || '').toLowerCase().split(/[^a-z0-9+]+/).filter(Boolean);
  function hits(field, t) {
    const f = String(field || '').toLowerCase();
    if (words(f).some(w => w.startsWith(t))) return true;
    return t.length >= 4 && f.includes(t);
  }
  function scoreProject(p, tokens) {
    const name = p.name.toLowerCase();
    const tags = p.tags || [];
    const caps = capLabels(p);
    const desc = (p.description || '') + ' ' + (p.tagline || '');
    let score = 0; const why = [];
    for (const t of tokens) {
      let s = 0;
      if (name.startsWith(t)) s = 16; else if (hits(name, t)) s = 12;
      const tag = tags.find(x => hits(x, t)); if (tag) { s = Math.max(s, 8); why.push(tag); }
      if (hits(p.kind, t)) { s = Math.max(s, 7); why.push(p.kind); }
      if (hits(p.industry, t)) { s = Math.max(s, 7); why.push(p.industry); }
      const cap = caps.find(x => hits(x, t)); if (cap) { s = Math.max(s, 7); why.push(cap); }
      if (hits(p.client, t)) s = Math.max(s, 6);
      if (hits(desc, t)) s = Math.max(s, 3);
      if (!s) return null;
      score += s;
    }
    return { p, score, why: [...new Set(why)].slice(0, 3).join(' · ') };
  }
  function highlight(name, tokens) {
    const out = esc(name); if (!tokens.length) return out;
    const re = new RegExp('(' + tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'ig');
    return out.replace(re, '<mark>$1</mark>');
  }
  function runSearch() {
    const tokens = tokensOf(query);
    $('#searchValue').textContent = query; $('#searchPlaceholder').hidden = !!query; $('#searchClear').hidden = !query;
    const results = tokens.length
      ? PROJECTS.map(p => scoreProject(p, tokens)).filter(Boolean).sort((a, b) => b.score - a.score || a.p.order - b.p.order)
      : PROJECTS.map(p => ({ p, why: '' }));
    const head = tokens.length ? `${results.length} ${results.length === 1 ? 'match' : 'matches'}` : 'All projects';
    $('#searchResults').innerHTML = `<div class="search-count">${head}</div>` + (results.length
      ? results.map(({ p, why }) => `<button class="result" data-id="${p.id}"><img src="${shot(p, 'd1')}" alt="" loading="lazy" draggable="false"><div><b>${highlight(p.name, tokens)}</b><span>${esc(p.kind)} &middot; ${esc(p.industry)}</span>${why ? `<em>${esc(why)}</em>` : ''}</div></button>`).join('')
      : '<div class="search-empty">No project matches that yet. Try a shorter word, like &ldquo;3D&rdquo; or &ldquo;shop&rdquo;.</div>');
  }

  /* ------------------------------------------------------------------
     Navigation
  ------------------------------------------------------------------ */
  function showScreen(id) {
    $$('.screen').forEach(s => s.classList.toggle('is-active', s.dataset.screen === id));
    state.screen = id; body.dataset.screen = id;
    if (id !== 'stage') clearInterval(stageTimer);
    if (id !== 'viewer') teardownViewer();
    if (id !== 'home') stopAttract();
    scheduleIdle();
  }
  async function guarded(fn) {
    if (state.busy) return; state.busy = true;
    try { await fn(); } catch (e) { console.error(e); } finally { state.busy = false; }
  }
  function openProject(p, origin) {
    if (!p) return;
    return guarded(async () => {
      stopAttract(); closeSearch(); hidePrompt(); state.current = p;
      const i = state.list.indexOf(p);
      if (i < 0) { state.lens = 'all'; state.list = PROJECTS; $$('.lens').forEach(b => b.classList.toggle('is-on', b.dataset.lens === 'all')); $('#railLensLabel').textContent = 'All projects'; rail.build(state.list); }
      renderStage(p);
      await xWipe(origin, () => showScreen('stage'));
    });
  }
  function enterProject(p, origin) {
    return guarded(async () => { renderViewer(p); await xWipe(origin, () => showScreen('viewer')); });
  }
  function goHome(origin, reset) {
    if (state.screen === 'home' && !reset) { rail.setIndex(0); return; }
    return guarded(async () => {
      closeSearch(); hidePrompt();
      await xWipe(origin, () => {
        showScreen('home');
        if (reset) { if (state.lens !== 'all') setLens('all'); state.index = 0; }
        if (state.railDirty || reset) rail.layout(); else if (state.current) { const i = state.list.indexOf(state.current); if (i >= 0) rail.setIndex(i, true); }
        if (reset) rail.setIndex(0, true);
      });
    });
  }
  function goBack(origin) {
    if (state.screen === 'viewer') return guarded(async () => { hidePrompt(); await xWipe(origin, () => showScreen('stage')); });
    if (state.screen === 'stage' || state.screen === 'map') return goHome(origin);
  }
  function openMap(origin) {
    if (state.screen === 'map') return;
    return guarded(async () => { closeSearch(); await xWipe(origin, () => showScreen('map')); $('#mapGroups').scrollTop = 0; });
  }
  /* ------------------------------------------------------------------
     Fullscreen. Three things can happen and the visitor must be able to
     tell them apart:
       - it works        -> the button flips to an "exit" icon
       - already full    -> Chrome's --kiosk flag already fills the display,
                            so the Fullscreen API has nothing to add and the
                            button hides itself rather than sitting there dead
       - it is refused   -> some embedded browsers neither grant the request
                            nor reject it, leaving the promise unsettled
                            forever, so silence is treated as a failure and
                            the visitor is told what to press instead
  ------------------------------------------------------------------ */
  let toastTimer = 0;
  function toast(msg, ms = 4200) {
    const el = $('#toast'); if (!el) return;
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, ms);
  }
  const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  const windowFillsScreen = () =>
    !!screen.width && Math.abs(innerWidth - screen.width) <= 4 && Math.abs(innerHeight - screen.height) <= 4;

  function syncFullscreen() {
    const on = !!fsElement();
    body.classList.toggle('is-fs', on);
    const btn = $('#fullscreenBtn'); if (!btn) return;
    btn.setAttribute('aria-label', on ? 'Exit fullscreen' : 'Fullscreen');
    btn.hidden = !on && windowFillsScreen();
  }

  async function toggleFullscreen() {
    const el = document.documentElement;
    try {
      if (fsElement()) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) await exit.call(document);
      } else {
        const req = el.requestFullscreen || el.webkitRequestFullscreen;
        if (!req) throw new Error('unsupported');
        await Promise.race([
          Promise.resolve(req.call(el, { navigationUI: 'hide' })),
          new Promise((_, reject) => setTimeout(() => reject(new Error('no answer')), 1500)),
        ]);
      }
    } catch (e) {
      if (!fsElement()) {
        toast(windowFillsScreen()
          ? 'Already filling the whole screen.'
          : 'This browser would not switch to fullscreen. Press F11 instead.');
      }
    }
    syncFullscreen();
  }

  /* ------------------------------------------------------------------
     Wiring
  ------------------------------------------------------------------ */
  function bind() {
    $('#homeBtn').addEventListener('click', e => goHome(centreOf(e.currentTarget)));
    $('#backBtn').addEventListener('click', e => goBack(centreOf(e.currentTarget)));
    $('#mapBtn').addEventListener('click', e => openMap(centreOf(e.currentTarget)));
    $('#searchBtn').addEventListener('click', openSearch);
    $('#fullscreenBtn').addEventListener('click', toggleFullscreen);
    $('#prevBtn').addEventListener('click', () => rail.setIndex(state.index - 1));
    $('#nextBtn').addEventListener('click', () => rail.setIndex(state.index + 1));
    $('#idleStay').addEventListener('click', () => { hidePrompt(); scheduleIdle(); });
    $('#idleHome').addEventListener('click', e => { hidePrompt(); goHome(pt(e), true); });
    $('#idle').addEventListener('click', e => { if (e.target === e.currentTarget) { hidePrompt(); scheduleIdle(); } });

    document.addEventListener('keydown', e => {
      if (searchOpen) {
        if (e.key === 'Escape') closeSearch();
        else if (e.key === 'Backspace') press('backspace');
        else if (e.key === 'Enter') { const r = $('#searchResults .result'); if (r) r.click(); }
        else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) press(e.key.toLowerCase());
        return;
      }
      if (e.key === 'f' || e.key === 'F') toggleFullscreen();
      else if (e.key === 'Escape') { if (state.screen === 'home') stopAttract(); else goBack(); }
      else if (e.key === 'h' || e.key === 'H' || e.key === 'Home') goHome(centreOf($('#homeBtn')));
      else if (e.key === '/' || e.key === 's' || e.key === 'S') { e.preventDefault(); openSearch(); }
      else if (e.key === 'm' || e.key === 'M') openMap(centreOf($('#mapBtn')));
      else if (state.screen === 'home' && (e.key === 'ArrowRight' || e.key === 'ArrowDown')) rail.setIndex(state.index + 1);
      else if (state.screen === 'home' && (e.key === 'ArrowLeft' || e.key === 'ArrowUp')) rail.setIndex(state.index - 1);
      else if (state.screen === 'home' && e.key === 'Enter') { const p = state.list[state.index]; if (p) openProject(p, null); }
    });

    document.addEventListener('fullscreenchange', syncFullscreen);
    document.addEventListener('webkitfullscreenchange', syncFullscreen);

    let resizeT = 0;
    window.addEventListener('resize', () => {
      clearTimeout(resizeT);
      resizeT = setTimeout(() => {
        applyOrient(); syncFullscreen();
        if (state.screen === 'home') rail.layout(); else state.railDirty = true;
      }, 80);
    });
    document.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('error', e => console.error('Showroom error:', e.message));
    window.addEventListener('unhandledrejection', e => console.error('Showroom rejection:', e.reason));
  }

  function init() {
    applyOrient();
    buildLenses(); buildMap(); buildSearch();
    rail.build(state.list);
    $('#railLensLabel').textContent = 'All projects';
    bind();
    syncFullscreen();
    boot();
    probeProxies();
  }

  /* Small scripting API (staff tools, testing, remote control). */
  window.showroom = {
    config: CONFIG, state, projects: PROJECTS, capabilities: CAPS,
    open: id => openProject(byId(id) || state.list[state.index], null),
    enter: id => enterProject(byId(id) || state.current, null),
    home: reset => goHome(null, !!reset),
    back: () => goBack(null),
    map: () => openMap(null),
    search: q => { openSearch(); if (q) { query = q; runSearch(); } },
    lens: setLens,
    goto: i => rail.setIndex(i),
    attract: startAttract, stopAttract,
    fullscreen: toggleFullscreen,
    debugWipe,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
