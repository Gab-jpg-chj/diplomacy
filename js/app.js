// Interface du jeu : carte SVG, saisie des ordres, tours à deux (même écran ou à distance par codes).
(function () {
  'use strict';
  const MAP = buildMap();
  const G = Dip.makeGraph(MAP);
  const RG = id => MAP.byId[id];
  const SAVE_KEY = 'diplomacy-guerre-froide-v1';
  const SVGNS = 'http://www.w3.org/2000/svg';
  const $ = s => document.querySelector(s);
  const P = PLAYERS;
  const OTHER = p => (p === 'W' ? 'E' : 'W');
  const COAST_NAMES = { co: 'côte ouest', ce: 'côte est', cn: 'côte nord', cs: 'côte sud' };

  let game = null;                      // partie en cours (sauvegardée)
  const ui = { cur: null, curtainOk: null, sel: null, act: null, step: 0, pick: null, coastAsk: null, showLast: true, buildPick: null, retSel: null, zoomed: false };
  const SB_URL = 'https://sqoleuqcoctoklkciurp.supabase.co';
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNxb2xldXFjb2N0b2tsa2NpdXJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1MDEzMjUsImV4cCI6MjEwODA3NzMyNX0.t8McL0xEAfDhzv1LFLq6gLAL4L4YYUaYpRc0FdLh_jg';

  // ------------------------------------------------------------------ sauvegarde
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(game)); } catch (e) { /* ignore */ } }
  function load() { try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function newGame(mode, me) {
    game = { mode, me: me || null, st: Dip.initialState(G, START_UNITS, 1950), staged: { W: {}, E: {} }, done: { W: false, E: false }, history: [], last: null };
    ui.cur = null; ui.curtainOk = null; resetSel(); autoDone(); save(); render();
  }
  const resetSel = () => { ui.sel = null; ui.act = null; ui.step = 0; ui.pick = null; ui.coastAsk = null; ui.buildPick = null; ui.retSel = null; };

  // ------------------------------------------------------------------ phases
  const st = () => game.st;
  const phaseKey = () => st().year + st().season + st().phase;
  function needsInput(p) {
    const s = st();
    if (s.phase === 'orders') return s.units.some(u => u.owner === p);
    if (s.phase === 'retreat') return s.retreats.some(d => d.unit.owner === p && d.options.length > 0);
    if (s.phase === 'build') { const b = Dip.buildStatus(G, s)[p]; return b.builds > 0 || b.disbands > 0; }
    return false;
  }
  function autoDone() {
    if (!game || st().phase === 'over') return;
    Dip.PLAYER_IDS.forEach(p => { if (!needsInput(p)) game.done[p] = true; });
    maybeResolve();
  }
  function activePlayer() {
    if (game.mode === 'online') return game.me;
    return Dip.PLAYER_IDS.find(p => !game.done[p]) || null;
  }
  // résolution pure d'une phase : renvoie le nouvel état, les résultats et l'entrée d'historique
  function resolvePhase(s, staged) {
    const label = Dip.phaseLabel(s);
    let ns, last = null, entry;
    if (s.phase === 'orders') {
      const res = Dip.resolveMovement(G, s, Object.assign({}, staged.W, staged.E));
      last = { kind: 'orders', label, results: res.results };
      ns = Dip.afterMovement(G, res);
      entry = { label, lines: res.results.map(r => ({ owner: r.owner, text: describeResult(r), ok: r.success })) };
    } else if (s.phase === 'retreat') {
      const res = Dip.resolveRetreats(G, s, Object.assign({}, staged.W, staged.E));
      ns = res.state;
      last = { kind: 'retreat', label, results: res.results };
      entry = { label, lines: res.results.map(r => ({ owner: r.owner, text: (r.utype === 'A' ? 'A ' : 'F ') + r.loc + (r.disbanded ? ' est dissoute (' + (r.note || '') + ')' : ' se replie en ' + r.to), ok: !r.disbanded })) };
    } else {
      const res = Dip.resolveBuilds(G, s, { W: (staged.W && staged.W.list) || [], E: (staged.E && staged.E.list) || [] });
      ns = res.state;
      entry = { label, lines: res.results.map(r => ({ owner: r.owner, text: r.text, ok: true })) };
    }
    return { st: ns, last, entry };
  }
  function applyResolution(r) {
    game.st = r.st; game.last = r.last;
    if (r.entry) game.history.unshift(r.entry);
    game.history = game.history.slice(0, 30);
    game.staged = { W: {}, E: {} }; game.done = { W: false, E: false };
    ui.cur = null; ui.curtainOk = null; resetSel();
    if (st().phase === 'over') { save(); return; }
    autoDone();
    save();
  }
  function maybeResolve() {
    if (game.mode === 'online') return;          // géré par la synchro
    if (!Dip.PLAYER_IDS.every(p => game.done[p])) return;
    applyResolution(resolvePhase(st(), game.staged));
  }

  // ------------------------------------------------------------------ parties en ligne
  async function rpc(fn, args) {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 8000);   // une requête bloquée ne doit pas figer la synchro
    let r;
    try { r = await fetch(SB_URL + '/rest/v1/rpc/' + fn, { method: 'POST', signal: ctl.signal, headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(args) }); }
    finally { clearTimeout(timer); }
    if (!r.ok) throw new Error(await r.text());
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  }
  const pubGame = () => ({ st: game.st, history: game.history, last: game.last, creator: game.creator });
  const linkFor = code => location.origin + location.pathname + '?partie=' + code;
  function adopt(row) {
    const g = row.game;
    if (game.version >= 0 && game.version !== row.version && game.me && Object.keys(game.staged[game.me] || {}).length) game.notice = 'La situation a changé (nouveau tour) : vos ordres en cours ont été effacés.';
    game.st = g.st; game.history = g.history || []; game.last = g.last || null; game.creator = g.creator; game.version = row.version;
    game.staged = { W: {}, E: {} }; resetSel();
  }
  function recomputeDone() {
    const sub = game.sub || {};
    Dip.PLAYER_IDS.forEach(p => { game.done[p] = !needsInput(p) || !!(sub[p] && sub[p].k === phaseKey()); });
  }
  async function createOnline(me) {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let code = '';
    for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
    const st0 = Dip.initialState(G, START_UNITS, 1950);
    game = { mode: 'online', me, code, creator: me, version: 0, st: st0, staged: { W: {}, E: {} }, done: { W: false, E: false }, history: [], last: null, sub: {} };
    await rpc('dip_create', { p_code: code, p_game: pubGame() });
    resetSel(); recomputeDone(); save(); render();
  }
  async function joinOnline(code, camp) {
    code = code.trim().toUpperCase();
    const rows = await rpc('dip_get', { p_code: code });
    if (!rows || !rows.length) throw new Error('Partie introuvable');
    const row = rows[0], creator = row.game.creator;
    game = { mode: 'online', me: camp || OTHER(creator), code, creator, version: -1, st: row.game.st, staged: { W: {}, E: {} }, done: { W: false, E: false }, history: [], last: null, sub: {} };
    adopt(row); game.sub = row.submitted || {}; recomputeDone(); save(); render();
  }
  let resolving = false, polling = false, pollStart = 0;
  async function pull() {
    if (!game || game.mode !== 'online') return;
    if ((polling || resolving) && Date.now() - pollStart < 20000) return;
    polling = true; resolving = false; pollStart = Date.now();
    try {
      const rows = await rpc('dip_get', { p_code: game.code });
      if (!rows || !rows.length) { game.net = 'Partie introuvable.'; render(); return; }
      const row = rows[0]; let changed = !!game.net; game.net = null; lastSync = Date.now();
      if (row.version !== game.version) { adopt(row); changed = true; }
      const sub = row.submitted || {};
      if (JSON.stringify(sub) !== JSON.stringify(game.sub || {})) { game.sub = sub; changed = true; }
      recomputeDone();
      if (st().phase !== 'over' && Dip.PLAYER_IDS.every(p => game.done[p])) {
        resolving = true;
        const orders = {}; Dip.PLAYER_IDS.forEach(p => { orders[p] = sub[p] && sub[p].k === phaseKey() ? sub[p].o : {}; });
        const r = resolvePhase(st(), orders);
        const next = { st: r.st, history: [r.entry].concat(game.history).slice(0, 30), last: r.last, creator: game.creator };
        try { await rpc('dip_advance', { p_code: game.code, p_version: game.version, p_game: next }); } finally { resolving = false; }
        polling = false; return pull();
      }
      if (changed) { save(); render(); }
    } catch (e) { if (!game.net) { game.net = 'Connexion perdue, nouvelle tentative…'; render(); } }
    finally { polling = false; }
  }
  let lastSync = 0;
  setInterval(pull, 3000);
  setInterval(() => { const e = document.getElementById('syncage'); if (e && lastSync) { const n = Math.round((Date.now() - lastSync) / 1000); e.textContent = n <= 1 ? 'vérifié à l\'instant' : 'vérifié il y a ' + n + ' s'; } }, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pull(); });
  window.addEventListener('focus', () => pull());
  window.addEventListener('online', () => pull());
  async function submitOnline() {
    const me = game.me, v = game.version; game.notice = null;
    game.sub = Object.assign({}, game.sub, { [me]: { k: phaseKey(), o: game.staged[me] } });
    recomputeDone(); render();
    let ok = false;
    try { ok = await rpc('dip_submit', { p_code: game.code, p_player: me, p_key: phaseKey(), p_version: v, p_orders: game.staged[me] }); }
    catch (e) { game.net = 'Envoi impossible, réessayez.'; }
    if (!ok) {
      delete game.sub[me]; recomputeDone();
      if (!game.net) game.net = 'La situation a changé pendant que vous jouiez : vos ordres n\'ont pas été envoyés. Vérifiez la carte, puis validez de nouveau.';
      polling = false; await pull();
    }
    save(); render();
  }
  async function unsubmitOnline() {
    const me = game.me; delete game.sub[me]; recomputeDone(); render();
    try { await rpc('dip_unsubmit', { p_code: game.code, p_player: me }); } catch (e) { /* ignore */ }
  }

  // ------------------------------------------------------------------ textes
  const uname = (u, loc, coast) => (u.type === 'A' ? 'A ' : 'F ') + loc + (coast ? '/' + coast : '');
  function describeOrder(u, o) {
    const me = uname(u, u.loc, u.coast);
    if (!o || o.type === 'hold') return me + ' tient';
    const t = st().units.find(x => x.loc === o.from);
    const tn = t ? uname(t, t.loc, t.coast) : o.from;
    if (o.type === 'move') return me + ' → ' + o.to + (o.coast ? '/' + o.coast : '') + (o.convoy ? ' (par convoi)' : '');
    if (o.type === 'support') return me + ' soutient ' + tn + (o.to ? ' → ' + o.to : ' (tient)');
    if (o.type === 'convoy') return me + ' convoie ' + tn + ' → ' + o.to;
    return me;
  }
  function describeResult(r) {
    const me = (r.utype === 'A' ? 'A ' : 'F ') + r.loc;
    let s;
    if (r.type === 'move') s = me + ' → ' + r.to + (r.viaConvoy ? ' (convoi)' : '') + (r.success ? ' : réussi' : ' : échec');
    else if (r.type === 'support') s = me + ' soutient ' + r.target + (r.sTo ? ' → ' + r.sTo : '') + (r.success ? '' : ' : coupé');
    else if (r.type === 'convoy') s = me + ' convoie ' + r.target + ' → ' + r.cTo + (r.success ? '' : ' : rompu');
    else s = me + ' tient';
    if (r.dislodged) s += ' — DÉLOGÉE';
    if (r.note && /illégal/.test(r.note)) s += ' (' + r.note + ')';
    return s;
  }

  // ------------------------------------------------------------------ carte
  const svg = $('#map');
  let gStatic, gDyn, view = { x: 0, y: 0, w: MAP.W, h: MAP.H };
  const el = (tag, attrs, parent) => { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
  const regionEls = {};
  const LAND = { W: '#6d9fcb', E: '#cc6f66', t: '#cfbd90', g: '#59606b' };
  const SEA = '#1d3a63';

  function buildStatic() {
    svg.innerHTML = '';
    const defs = el('defs', {}, svg);
    ['W', 'E', 'n', 'y', 'bad'].forEach(k => {
      const col = k === 'W' ? P.W.color : k === 'E' ? P.E.color : k === 'y' ? '#f2c14e' : k === 'bad' ? '#888' : '#fff';
      const m = el('marker', { id: 'ah' + k, viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto-start-reverse' }, defs);
      el('path', { d: 'M0 0L10 5L0 10z', fill: col }, m);
    });
    const bg = el('rect', { x: -400, y: -300, width: MAP.W + 800, height: MAP.H + 600, fill: SEA }, svg);
    bg.setAttribute('id', 'bg');
    gStatic = el('g', {}, svg);
    // mers puis terres (les terres au-dessus)
    const order = [...MAP.regions].sort((a, b) => (a.type === 'sea' ? 0 : 1) - (b.type === 'sea' ? 0 : 1));
    order.forEach(r => {
      if (!r.path) return;
      const p = el('path', { d: r.path, 'fill-rule': 'evenodd', class: 'reg ' + r.type, 'data-id': r.id }, gStatic);
      p.setAttribute('fill', r.type === 'sea' ? SEA : LAND.t);
      if (r.type === 'sea') { p.style.strokeWidth = '1.5'; p.style.stroke = '#2b4c7c'; }
      regionEls[r.id] = p;
    });
    // étiquettes
    const gl = el('g', { class: 'ov' }, svg);
    MAP.regions.forEach(r => {
      if (!r.cells.length || r.type === 'blocked') return;
      const pos = labelPos(r);
      const fs = r.type === 'sea' ? Math.min(22, 12 + (r.depth || 1) * 1.2) : Math.max(11, Math.min(20, 9 + (r.depth || 1) * 1.7));
      const t = el('text', { x: pos.x, y: pos.y, class: 'lbl ' + r.type, 'font-size': fs }, gl);
      t.textContent = r.id;
    });
    gDyn = el('g', { class: 'ov' }, svg);
    applyView();
  }
  function labelPos(r) {
    if (r.center) return { x: r.center.x, y: r.center.y + 34 };
    if (r.coasts) return { x: r.pole.x, y: r.pole.y };
    return { x: r.pole.x, y: r.pole.y };
  }
  function unitPos(loc, coast) {
    const r = RG(loc);
    if (coast && r.coasts && r.coasts[coast]) { const c = r.coasts[coast]; return { x: c.x, y: c.y }; }
    if (r.center) return { x: r.center.x, y: r.center.y };
    return { x: r.pole.x, y: r.pole.y - (r.depth > 2 ? 4 : 0) };
  }
  function regionPoint(loc, coast) { return unitPos(loc, coast); }

  function applyView() { svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`); }
  function fitView() {
    const r = svg.getBoundingClientRect(), a = r.width / Math.max(r.height, 1), mapA = MAP.W / MAP.H;
    if (a > mapA) { view.h = MAP.H; view.w = MAP.H * a; view.x = (MAP.W - view.w) / 2; view.y = 0; }
    else { view.w = MAP.W; view.h = MAP.W / a; view.x = 0; view.y = (MAP.H - view.h) / 2; }
    applyView();
  }
  function zoomAt(f, cx, cy) {
    const r = svg.getBoundingClientRect();
    const mx = view.x + (cx - r.left) / r.width * view.w, my = view.y + (cy - r.top) / r.height * view.h;
    const nw = Math.max(260, Math.min(MAP.W * 1.4, view.w * f)), k = nw / view.w;
    view.x = mx - (mx - view.x) * k; view.y = my - (my - view.y) * k; view.w = nw; view.h *= k; applyView();
  }
  function setupPanZoom() {
    svg.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.deltaY > 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY); }, { passive: false });
    const pts = new Map(); let moved = 0, lastDist = 0;
    svg.addEventListener('pointerdown', e => { svg.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = 0; lastDist = 0; });
    svg.addEventListener('pointermove', e => {
      const p = pts.get(e.pointerId);
      if (!p) { hover(e); return; }
      const r = svg.getBoundingClientRect();
      if (pts.size === 2) {
        const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (lastDist) zoomAt(lastDist / d, (a.x + b.x) / 2, (a.y + b.y) / 2);
        lastDist = d; p.x = e.clientX; p.y = e.clientY; moved = 99; return;
      }
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 6) { svg.classList.add('drag'); view.x -= dx / r.width * view.w; view.y -= dy / r.height * view.h; applyView(); }
      p.x = e.clientX; p.y = e.clientY;
    });
    const end = e => {
      const wasClick = moved <= 6 && pts.size === 1 && pts.has(e.pointerId);
      pts.delete(e.pointerId); svg.classList.remove('drag');
      if (wasClick && e.type === 'pointerup') {
        const t = document.elementFromPoint(e.clientX, e.clientY);
        if (t && t.dataset && t.dataset.id) onRegionClick(t.dataset.id);
        else onRegionClick(null);
      }
    };
    svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
    $('#z-in').onclick = () => { const r = svg.getBoundingClientRect(); zoomAt(1 / 1.3, r.left + r.width / 2, r.top + r.height / 2); };
    $('#z-out').onclick = () => { const r = svg.getBoundingClientRect(); zoomAt(1.3, r.left + r.width / 2, r.top + r.height / 2); };
    $('#z-reset').onclick = fitView;
    window.addEventListener('resize', fitView);
  }
  function hover(e) {
    const t = document.elementFromPoint(e.clientX, e.clientY), h = $('#hover');
    if (t && t.dataset && t.dataset.id) {
      const r = RG(t.dataset.id);
      let s = '<b>' + r.id + '</b> — ' + r.name;
      if (r.center) { const o = st().owners[r.id]; s += ' · centre ' + (o ? '(' + P[o].name + ')' : '(neutre)'); }
      if (r.type === 'blocked') s += ' · infranchissable';
      h.innerHTML = s; h.classList.add('on');
    } else h.classList.remove('on');
  }

  // ------------------------------------------------------------------ dessin dynamique
  function unitIcon(parent, x, y, u, opts) {
    opts = opts || {};
    const g = el('g', { transform: `translate(${x} ${y})`, opacity: opts.ghost ? .55 : 1 }, parent);
    el('circle', { r: 17, fill: P[u.owner].color, stroke: opts.dislodged ? '#fff' : '#06101c', 'stroke-width': opts.dislodged ? 4 : 3 }, g);
    if (opts.dislodged) el('circle', { r: 21, fill: 'none', stroke: '#ff4d3a', 'stroke-width': 3, 'stroke-dasharray': '4 3' }, g);
    if (u.type === 'A') {
      el('rect', { x: -9, y: -2, width: 18, height: 8, rx: 2, fill: '#fff' }, g);
      el('rect', { x: -4, y: -7, width: 8, height: 5, rx: 1, fill: '#fff' }, g);
      el('line', { x1: 3, y1: -5, x2: 11, y2: -8, stroke: '#fff', 'stroke-width': 2.5, 'stroke-linecap': 'round' }, g);
    } else {
      el('path', { d: 'M-10 1 L10 1 L6 8 L-6 8Z', fill: '#fff' }, g);
      el('line', { x1: 0, y1: 1, x2: 0, y2: -9, stroke: '#fff', 'stroke-width': 2 }, g);
      el('path', { d: 'M1.5 -9 L9 -1 L1.5 -1Z', fill: '#fff' }, g);
    }
    return g;
  }
  function arrow(parent, a, b, cls) {
    // cls : {color, dash, w, head}
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
    const sx = a.x + dx / d * 20, sy = a.y + dy / d * 20, ex = b.x - dx / d * 20, ey = b.y - dy / d * 20;
    el('line', { x1: sx, y1: sy, x2: ex, y2: ey, stroke: cls.color, 'stroke-width': cls.w || 5, 'stroke-dasharray': cls.dash || '', 'stroke-linecap': 'round', 'marker-end': cls.head ? `url(#ah${cls.head})` : '', opacity: cls.op || .95 }, parent);
  }
  function ownerKey(o) { return o === 'W' || o === 'E' ? o : 'n'; }

  function drawOrderArrows(parent, entries) {
    // entries : [{u, o, ok}] u = unité {type,loc,coast,owner}, o = ordre brut ou résultat
    entries.forEach(({ u, o, ok }) => {
      const a = unitPos(u.loc, u.coast), col = P[u.owner].color, key = u.owner;
      const failed = ok === false;
      if (o.type === 'move') {
        const b = regionPoint(o.to, o.coast);
        arrow(parent, a, b, { color: failed ? '#9aa3b2' : col, w: 6, head: failed ? 'bad' : key, dash: o.convoy || o.viaConvoy ? '2 9' : failed ? '10 6' : '' });
        if (failed) { const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2; el('path', { d: `M${mx - 8} ${my - 8}L${mx + 8} ${my + 8}M${mx + 8} ${my - 8}L${mx - 8} ${my + 8}`, stroke: '#ff6b5a', 'stroke-width': 5, 'stroke-linecap': 'round' }, parent); }
      } else if (o.type === 'support') {
        const tgt = o.sTo || o.to;
        const t = o.target || null;
        const targetLoc = t || o.from;
        const to = tgt ? regionPoint(tgt) : unitPos(targetLoc);
        arrow(parent, a, to, { color: failed ? '#9aa3b2' : '#f2c14e', w: 4, dash: '9 6', head: 'y', op: .85 });
      } else if (o.type === 'convoy') {
        const to = o.cTo || o.to;
        arrow(parent, a, unitPos(o.target || o.from), { color: failed ? '#9aa3b2' : '#8be3ff', w: 3.5, dash: '3 7', op: .85 });
        el('circle', { cx: a.x, cy: a.y, r: 22, fill: 'none', stroke: '#8be3ff', 'stroke-width': 2, 'stroke-dasharray': '3 4' }, parent);
        void to;
      }
    });
  }

  function paintRegions() {
    const s = st();
    MAP.regions.forEach(r => {
      const p = regionEls[r.id]; if (!p) return;
      p.classList.remove('hl', 'hl2', 'sel');
      if (r.type === 'sea') { p.setAttribute('fill', SEA); return; }
      if (r.type === 'blocked') { p.setAttribute('fill', LAND.g); return; }
      let c = r.tint === 'b' ? '#86aac6' : r.tint === 'r' ? '#c98c84' : LAND.t;
      if (r.center) { const o = s.owners[r.id]; c = o ? LAND[o] : LAND.t; }
      else {
        // une province sans centre prend la couleur de l'unité qui l'occupe
        const u = Dip.unitAt(s, r.id); if (u) c = LAND[u.owner];
      }
      p.setAttribute('fill', c);
    });
  }

  function highlightSets() {
    const set = { hl: new Set(), hl2: new Set(), sel: new Set() };
    const s = st(), cur = activePlayer();
    if (!cur || !game) return set;
    if (s.phase === 'orders' && ui.sel) {
      const u = s.units.find(x => x.id === ui.sel); if (!u) return set;
      set.sel.add(u.loc);
      if (ui.act === 'move') {
        Dip.reach(G, u).forEach(id => set.hl.add(id));
        if (u.type === 'A' && Dip.isCoastal(G, u.loc)) G.ids.forEach(id => { if (id !== u.loc && Dip.isCoastal(G, id) && !set.hl.has(id)) set.hl2.add(id); });
      } else if (ui.act === 'support') {
        if (ui.step === 0) s.units.forEach(x => { if (x !== u && supportCandidates(u, x).length) set.hl.add(x.loc); });
        else { const t = s.units.find(x => x.id === ui.pick); set.sel.add(t.loc); set.hl2.add(t.loc); supportCandidates(u, t).forEach(id => id !== t.loc && set.hl.add(id)); }
      } else if (ui.act === 'convoy') {
        if (ui.step === 0) s.units.forEach(x => { if (x.type === 'A' && Dip.isCoastal(G, x.loc)) set.hl.add(x.loc); });
        else { const t = s.units.find(x => x.id === ui.pick); set.sel.add(t.loc); G.ids.forEach(id => { if (id !== t.loc && Dip.isCoastal(G, id)) set.hl.add(id); }); }
      }
    }
    if (s.phase === 'build') {
      const b = Dip.buildStatus(G, s)[cur];
      if (b.builds > 0) Dip.buildSites(G, s, cur).forEach(id => set.hl.add(id));
      if (b.disbands > 0) s.units.filter(u => u.owner === cur).forEach(u => set.hl.add(u.loc));
    }
    if (s.phase === 'retreat' && ui.retSel) {
      const d = s.retreats.find(x => x.unit.id === ui.retSel);
      if (d) { set.sel.add(d.unit.loc); d.options.forEach(o => set.hl.add(o.to)); }
    }
    return set;
  }
  // destinations qu'une unité `sup` peut soutenir pour `t` (t tient si dest == t.loc)
  function supportCandidates(sup, t) {
    const reach = Dip.reach(G, sup), out = [];
    if (reach.includes(t.loc)) out.push(t.loc);
    let tmoves = Dip.reach(G, t);
    if (t.type === 'A' && Dip.isCoastal(G, t.loc)) G.ids.forEach(id => { if (Dip.isCoastal(G, id) && id !== t.loc) tmoves.push(id); });
    tmoves.forEach(id => { if (id !== sup.loc && reach.includes(id) && !out.includes(id)) out.push(id); });
    return out;
  }

  function drawDynamic() {
    gDyn.innerHTML = '';
    paintRegions();
    const s = st(), cur = game ? activePlayer() : null;
    const hs = highlightSets();
    hs.hl.forEach(id => regionEls[id] && regionEls[id].classList.add('hl'));
    hs.hl2.forEach(id => regionEls[id] && regionEls[id].classList.add('hl2'));
    hs.sel.forEach(id => regionEls[id] && regionEls[id].classList.add('sel'));
    // centres
    G.centers.forEach(id => {
      const r = RG(id), o = s.owners[id], c = r.center;
      const g = el('g', { transform: `translate(${c.x} ${c.y})` }, gDyn);
      el('circle', { r: 24, fill: o ? P[o].color : '#e8e2cf', 'fill-opacity': .28, stroke: o ? P[o].color : '#fff', 'stroke-width': 4, 'stroke-dasharray': o ? '' : '5 4' }, g);
      if (!Dip.unitAt(s, id)) el('path', { d: 'M0 -11 L3.2 -3.5 L11 -3.5 L4.8 1.5 L7 9.5 L0 5 L-7 9.5 L-4.8 1.5 L-11 -3.5 L-3.2 -3.5Z', fill: o ? P[o].color : '#fff', stroke: '#06101c', 'stroke-width': 1.5 }, g);
      if (r.center.home) el('circle', { r: 28, fill: 'none', stroke: P[r.center.home].color, 'stroke-width': 2, opacity: .7 }, g);
    });
    // comptoirs
    MAP.regions.forEach(r => { if (r.coasts) Object.entries(r.coasts).forEach(([n, c]) => {
      const t = el('g', { transform: `translate(${c.x} ${c.y})` }, gDyn);
      el('polygon', { points: '0,-17 15,-8.5 15,8.5 0,17 -15,8.5 -15,-8.5', fill: '#f0b24a', stroke: '#fff', 'stroke-width': 3 }, t);
      const ic = el('text', { y: 7, 'font-size': 20, 'text-anchor': 'middle', fill: '#1b1405' }, t); ic.textContent = '⚓';
      const tt = el('text', { y: 34, class: 'lbl', 'font-size': 14, fill: '#ffd98a' }, t); tt.textContent = r.id + ' ' + COAST_NAMES[n];
    }); });
    // flèches des ordres
    const arrows = el('g', {}, gDyn);
    if (game && s.phase === 'orders') {
      if (cur && game.mode === 'local' ? ui.curtainOk === cur : !!cur) {
        const ents = [];
        s.units.filter(u => u.owner === cur).forEach(u => { const o = game.staged[cur][u.id]; if (o && o.type !== 'hold') ents.push({ u, o: Object.assign({}, o, { target: s.units.find(x => x.loc === o.from) && s.units.find(x => x.loc === o.from).loc }) }); });
        drawOrderArrows(arrows, ents);
      } else if (game.last && ui.showLast && game.last.kind === 'orders') {
        // rappel des résultats du tour précédent
        const ents = game.last.results.filter(r => r.type !== 'hold').map(r => ({ u: { type: r.utype, loc: r.loc, owner: r.owner, coast: null }, o: { type: r.type, to: r.to, sTo: r.sTo, from: r.target, target: r.target, cTo: r.cTo, convoy: r.viaConvoy, coast: r.coast }, ok: r.success }));
        drawOrderArrows(arrows, ents);
      }
    } else if (game && game.last && ui.showLast && game.last.kind === 'orders') {
      const ents = game.last.results.filter(r => r.type !== 'hold').map(r => ({ u: { type: r.utype, loc: r.loc, owner: r.owner, coast: null }, o: { type: r.type, to: r.to, sTo: r.sTo, from: r.target, target: r.target, cTo: r.cTo, convoy: r.viaConvoy, coast: r.coast }, ok: r.success }));
      drawOrderArrows(arrows, ents);
    }
    // unités
    const disbandMarks = game && s.phase === 'build' && cur ? (game.staged[cur].list || []).filter(x => x.type === 'disband').map(x => x.unitId) : [];
    s.units.forEach(u => {
      const p = unitPos(u.loc, u.coast);
      const g = unitIcon(gDyn, p.x, p.y, u, { ghost: disbandMarks.includes(u.id) });
      if (ui.sel === u.id) el('circle', { r: 24, fill: 'none', stroke: '#fff', 'stroke-width': 3 }, g);
      if (disbandMarks.includes(u.id)) el('path', { d: 'M-12 -12L12 12M12 -12L-12 12', stroke: '#ff4d3a', 'stroke-width': 5, 'stroke-linecap': 'round' }, g);
    });
    s.retreats.forEach(d => { const p = unitPos(d.unit.loc, d.unit.coast); unitIcon(gDyn, p.x + 22, p.y - 22, d.unit, { dislodged: true }); });
    // constructions prévues
    if (game && s.phase === 'build' && cur) (game.staged[cur].list || []).filter(x => x.type === 'build').forEach(x => {
      const p = unitPos(x.loc, x.coast); unitIcon(gDyn, p.x, p.y, { type: x.utype, owner: cur }, { ghost: true });
    });
  }

  // ------------------------------------------------------------------ clics sur la carte
  function onRegionClick(id) {
    if (!game) return;
    const s = st(), cur = activePlayer();
    if (!cur || (game.mode === 'local' && ui.curtainOk !== cur)) return;
    if (!id) { if (s.phase === 'orders') { resetSel(); render(); } return; }
    const staged = game.staged[cur];
    if (s.phase === 'orders') {
      const here = Dip.unitAt(s, id), u = ui.sel ? s.units.find(x => x.id === ui.sel) : null;
      if (u && ui.act === 'move') {
        const opts = Dip.moveTargets(G, u).filter(m => m.to === id);
        if (opts.length) {
          const cs = [...new Set(opts.map(m => m.coast).filter(Boolean))];
          if (G.R[id].coasts && cs.length > 1) { ui.coastAsk = { uid: u.id, to: id, cs }; render(); return; }
          staged[u.id] = { type: 'move', to: id, coast: cs[0] || undefined }; finishOrder(); return;
        }
        if (u.type === 'A' && id !== u.loc && Dip.isCoastal(G, u.loc) && Dip.isCoastal(G, id)) { staged[u.id] = { type: 'move', to: id, convoy: true }; finishOrder(); return; }
      }
      if (u && ui.act === 'support') {
        if (ui.step === 0 && here && here !== u && supportCandidates(u, here).length) { ui.pick = here.id; ui.step = 1; render(); return; }
        if (ui.step === 1) {
          const t = s.units.find(x => x.id === ui.pick);
          if (supportCandidates(u, t).includes(id)) { staged[u.id] = id === t.loc ? { type: 'support', from: t.loc } : { type: 'support', from: t.loc, to: id }; finishOrder(); return; }
        }
      }
      if (u && ui.act === 'convoy') {
        if (ui.step === 0 && here && here.type === 'A' && Dip.isCoastal(G, here.loc)) { ui.pick = here.id; ui.step = 1; render(); return; }
        if (ui.step === 1) {
          const t = s.units.find(x => x.id === ui.pick);
          if (id !== t.loc && Dip.isCoastal(G, id)) { staged[u.id] = { type: 'convoy', from: t.loc, to: id }; finishOrder(); return; }
        }
      }
      if (here && here.owner === cur) { ui.sel = here.id; ui.act = null; ui.step = 0; ui.pick = null; ui.coastAsk = null; render(); return; }
      if (!u) return;
    } else if (s.phase === 'retreat') {
      const d = s.retreats.find(x => x.unit.owner === cur && (x.unit.loc === id));
      if (d) { ui.retSel = d.unit.id; render(); return; }
      if (ui.retSel) {
        const dd = s.retreats.find(x => x.unit.id === ui.retSel), opts = dd.options.filter(o => o.to === id);
        if (opts.length) { staged[dd.unit.id] = { to: id, coast: opts[0].coast || undefined }; if (opts.length > 1) { ui.coastAsk = { uid: dd.unit.id, to: id, cs: opts.map(o => o.coast), retreat: true }; } render(); }
      }
    } else if (s.phase === 'build') {
      const b = Dip.buildStatus(G, s)[cur]; staged.list = staged.list || [];
      const have = staged.list.filter(x => x.type === 'build').length, dis = staged.list.filter(x => x.type === 'disband').length;
      if (b.disbands > 0) {
        const here = Dip.unitAt(s, id);
        if (here && here.owner === cur) {
          const k = staged.list.findIndex(x => x.type === 'disband' && x.unitId === here.id);
          if (k >= 0) staged.list.splice(k, 1); else if (dis < b.disbands) staged.list.push({ type: 'disband', unitId: here.id });
          save(); render();
        }
      } else if (b.builds > 0 && Dip.buildSites(G, s, cur).includes(id)) {
        const k = staged.list.findIndex(x => x.type === 'build' && x.loc === id);
        if (k >= 0) { staged.list.splice(k, 1); save(); render(); return; }
        if (have >= b.builds) return;
        ui.buildPick = id; render();
      }
    }
  }
  function finishOrder() { ui.act = null; ui.step = 0; ui.pick = null; ui.coastAsk = null; save(); render(); }

  // ------------------------------------------------------------------ panneau
  function esc(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
  function scoreHTML() {
    const s = st(), total = G.centers.length, need = Math.floor(total / 2) + 1;
    return '<div class="score">' + Dip.PLAYER_IDS.map(p => {
      const c = Dip.centerCount(s, p), u = s.units.filter(x => x.owner === p).length;
      return `<div class="${p}"><b>${c}</b> <span>${P[p].name}</span><small>${u} unité${u > 1 ? 's' : ''} · ${c}/${need} pour gagner</small><div class="bar ${p}"><i style="width:${Math.min(100, c / need * 100)}%"></i></div></div>`;
    }).join('') + '</div>';
  }
  function historyHTML() {
    if (!game.history.length) return '';
    return '<div class="card"><h3>Historique</h3>' + game.history.slice(0, 6).map(h => `<details><summary>${esc(h.label)}</summary><ul class="orders res">${h.lines.map(l => `<li><span class="dot ${l.owner}"></span><span class="t ${l.ok ? 'yes' : 'no'}">${esc(l.text)}</span></li>`).join('')}</ul></details>`).join('') + '</div>';
  }
  function ordersListHTML(cur) {
    const s = st(), mine = s.units.filter(u => u.owner === cur);
    return '<ul class="orders">' + mine.map(u => {
      const o = game.staged[cur][u.id];
      return `<li data-uid="${u.id}" class="${ui.sel === u.id ? 'sel' : ''}"><span class="dot ${cur}"></span><span class="t">${esc(describeOrder(u, o))}${o ? '' : ' <span class="hint">(par défaut)</span>'}</span>${o ? '<span class="x" data-clear="' + u.id + '" title="Effacer">✕</span>' : ''}</li>`;
    }).join('') + '</ul>';
  }

  function render() {
    if (!game) { renderSetup(); return; }
    const s = st(), cur = activePlayer();
    $('#phase').innerHTML = '<b>' + Dip.phaseLabel(s) + '</b>' + (cur ? (game.mode === 'online' ? ' · vous êtes <b style="color:' + P[cur].color + '">' + P[cur].name + '</b>' : ' · à <b style="color:' + P[cur].color + '">' + P[cur].name + '</b> de jouer') : '');
    drawDynamic();
    const panel = $('#panel');
    let h = scoreHTML();

    if (s.phase === 'over') {
      h += `<div class="card" style="border-color:${P[s.winner].color}"><h3>Victoire</h3><p style="margin:0;font-size:18px"><b style="color:${P[s.winner].color}">${P[s.winner].long}</b> remporte la partie !</p></div>` + lastResultsHTML() + historyHTML();
      panel.innerHTML = h; bindPanel(); return;
    }
    if (game.mode === 'local' && cur && ui.curtainOk !== cur) {
      h += `<div class="card curtain"><h2 style="color:${P[cur].color}">${P[cur].long}</h2><div class="hint">Passez l'écran à ce joueur. Les ordres de l'autre joueur resteront cachés.</div><button class="primary" id="curtain-ok">Je suis ${P[cur].name} — voir la carte</button></div>` + lastResultsHTML();
      panel.innerHTML = h; bindPanel(); return;
    }
    if (game.mode === 'online') {
      h = onlineCardHTML() + h;
      h += (!needsInput(cur) || game.done[cur]) ? waitHTML(cur) : phaseHTML(cur);
    } else if (cur) h += phaseHTML(cur);
    h += lastResultsHTML() + historyHTML() + legendHTML();
    panel.innerHTML = h; bindPanel();
  }
  function legendHTML() {
    const list = []; MAP.regions.forEach(r => { if (r.coasts) list.push(r.id + ' (' + Object.keys(r.coasts).map(c => COAST_NAMES[c].replace('côte ', '')).join('/') + ')'); });
    return `<div class="card"><h3>Légende</h3><div class="hint" style="line-height:1.8">
      <span style="color:#f0b24a;font-size:18px">⬢⚓</span> <b>Comptoir</b> : une côte d'une province qui en a plusieurs. Une flotte s'y poste sur <i>cette</i> côte et ne rejoint que les mers voisines de celle-ci.<br>
      <span style="font-size:16px">★</span> Centre de ravitaillement (anneau plein = déjà possédé, pointillé = neutre ; anneau fin = centre d'origine).<br>
      Provinces à comptoirs : ${list.join(', ')}.</div></div>`;
  }

  function lastResultsHTML() {
    if (!game.last) return '';
    const l = game.last;
    const rows = l.kind === 'orders'
      ? l.results.map(r => `<li><span class="dot ${r.owner}"></span><span class="t ${r.type === 'hold' || r.success ? (r.dislodged ? 'no' : 'yes') : 'no'}">${esc(describeResult(r))}</span></li>`).join('')
      : l.results.map(r => `<li><span class="dot ${r.owner}"></span><span class="t ${r.disbanded ? 'no' : 'yes'}">${esc((r.utype === 'A' ? 'A ' : 'F ') + r.loc + (r.disbanded ? ' dissoute (' + r.note + ')' : ' → ' + r.to))}</span></li>`).join('');
    return `<div class="card"><h3>Résultats — ${esc(l.label)}</h3><label class="hint"><input type="checkbox" id="showlast" ${ui.showLast ? 'checked' : ''}> afficher sur la carte</label><ul class="orders res" style="margin-top:6px">${rows}</ul></div>`;
  }

  function phaseHTML(cur) {
    const s = st(); let h = '';
    if (s.phase === 'orders') {
      h += `<div class="card"><h3>Vos ordres — ${P[cur].long}</h3>${ordersListHTML(cur)}<p class="hint" style="margin:8px 0 0">Les unités sans ordre tiennent leur position. Cliquez une unité sur la carte (ou dans la liste) pour lui donner un ordre.</p></div>`;
      const u = ui.sel ? s.units.find(x => x.id === ui.sel) : null;
      if (u) {
        h += `<div class="card"><h3>${uname(u, u.loc, u.coast)}</h3><div class="row">
          <button data-act="hold">Tenir</button>
          <button data-act="move" class="${ui.act === 'move' ? 'on' : ''}">Aller</button>
          <button data-act="support" class="${ui.act === 'support' ? 'on' : ''}">Soutenir</button>
          ${u.type === 'F' && G.R[u.loc].type === 'sea' ? `<button data-act="convoy" class="${ui.act === 'convoy' ? 'on' : ''}">Convoyer</button>` : ''}
        </div><div class="hint" style="margin-top:8px">${actHint(u)}</div>`;
        if (ui.coastAsk) h += `<div class="row" style="margin-top:8px"><span>Côte :</span>${ui.coastAsk.cs.map(c => `<button data-coast="${c}">${c}</button>`).join('')}</div>`;
        h += '</div>';
      }
      h += `<div class="row"><button class="primary" id="submit">Valider mes ordres</button><button class="ghost" id="clearall">Tout effacer</button></div>`;
    } else if (s.phase === 'retreat') {
      h += `<div class="card"><h3>Retraites — ${P[cur].long}</h3><p class="hint" style="margin-top:0">Une unité délogée doit se replier sur une province voisine libre, ou être dissoute. Deux unités qui se replient au même endroit sont toutes deux dissoutes.</p>`;
      s.retreats.filter(d => d.unit.owner === cur).forEach(d => {
        const o = game.staged[cur][d.unit.id];
        h += `<div class="card" style="margin-top:8px"><b>${uname(d.unit, d.unit.loc, d.unit.coast)}</b> délogée de ${d.from}<div class="row" style="margin-top:6px">`;
        d.options.forEach(op => { const on = o && !o.disband && o.to === op.to && (o.coast || null) === (op.coast || null); h += `<button class="${on ? 'on' : ''}" data-ret="${d.unit.id}" data-to="${op.to}" data-c="${op.coast || ''}">${op.to}${op.coast ? '/' + op.coast : ''}</button>`; });
        h += `<button class="${o && o.disband ? 'on' : ''}" data-ret="${d.unit.id}" data-dis="1">Dissoudre</button></div></div>`;
      });
      h += `</div><button class="primary" id="submit">Valider mes retraites</button>`;
    } else if (s.phase === 'build') {
      const b = Dip.buildStatus(G, s)[cur]; const list = game.staged[cur].list || [];
      h += `<div class="card"><h3>Ajustements — ${P[cur].long}</h3>`;
      if (b.disbands > 0) h += `<p style="margin-top:0">Vous avez trop d'unités : <b>dissolvez ${b.disbands}</b> unité${b.disbands > 1 ? 's' : ''} (cliquez-les sur la carte). Sinon, la plus éloignée de chez vous sera dissoute d'office.</p>`;
      else h += `<p style="margin-top:0">Vous pouvez construire <b>${b.builds}</b> unité${b.builds > 1 ? 's' : ''} sur vos centres d'origine libres (surlignés).</p>`;
      h += '<ul class="orders">' + list.map((x, i) => `<li><span class="dot ${cur}"></span><span class="t">${x.type === 'build' ? (x.utype === 'A' ? 'Armée' : 'Flotte') + ' à ' + x.loc + (x.coast ? '/' + x.coast : '') : 'Dissoudre ' + (s.units.find(u => u.id === x.unitId) ? uname(s.units.find(u => u.id === x.unitId), s.units.find(u => u.id === x.unitId).loc) : '')}</span><span class="x" data-rmb="${i}">✕</span></li>`).join('') + '</ul>';
      if (ui.buildPick) {
        const id = ui.buildPick, rc = G.R[id].coasts;
        h += `<div class="row" style="margin-top:8px"><span>Construire à ${id} :</span><button data-build="A">Armée</button>`;
        if (Dip.isCoastal(G, id)) h += rc ? Object.keys(rc).map(c => `<button data-build="F" data-bc="${c}">Flotte (${c})</button>`).join('') : '<button data-build="F">Flotte</button>';
        h += '</div>';
      }
      h += `</div><button class="primary" id="submit">Valider les ajustements</button>`;
    }
    return h;
  }
  function actHint(u) {
    if (!ui.act) return 'Choisissez un ordre.';
    if (ui.act === 'move') return 'Cliquez la destination (surlignée en jaune' + (u.type === 'A' ? ' ; en bleu : par convoi' : '') + ').';
    if (ui.act === 'support') return ui.step === 0 ? 'Cliquez l\'unité à soutenir.' : 'Cliquez la destination soutenue (ou l\'unité elle-même pour la soutenir sur place).';
    if (ui.act === 'convoy') return ui.step === 0 ? 'Cliquez l\'armée à convoyer.' : 'Cliquez la côte d\'arrivée.';
    return '';
  }

  function onlineCardHTML() {
    return `<div class="card"><h3>Partie en ligne · code ${game.code}</h3>
      <div class="row"><span class="dot ${game.me}"></span><span>Vous jouez <b style="color:${P[game.me].color}">${P[game.me].long}</b></span></div>
      <div class="row" style="margin-top:8px"><button id="copylink">Copier le lien à envoyer</button></div>
      <div id="netmsg" class="hint ${game.net || game.notice ? 'bad' : ''}" style="margin-top:6px">${game.net ? esc(game.net) : game.notice ? esc(game.notice) : 'Synchronisée : situation n°' + (game.version + 1) + ', identique pour les deux joueurs.'} <span id="syncage"></span></div></div>`;
  }
  function waitHTML(cur) {
    const opp = OTHER(cur), s = st();
    const mineDone = needsInput(cur) && game.done[cur];
    const oppDone = game.done[opp] && needsInput(opp);
    let msg;
    if (!needsInput(cur)) msg = `Rien à faire pour vous cette phase. En attente de <b>${P[opp].name}</b>…`;
    else msg = `Vos ordres sont envoyés. ${oppDone ? 'Résolution…' : `En attente de <b>${P[opp].name}</b>…`}`;
    void s;
    return `<div class="card"><h3>${mineDone ? 'Ordres validés' : 'En attente'}</h3><p style="margin:0">${msg}</p>
      <p class="hint" style="margin:6px 0 0">La page se met à jour toute seule dès que l'adversaire a validé.</p>
      ${mineDone ? '<div class="row" style="margin-top:8px"><button class="ghost" id="undo-submit">Modifier mes ordres</button></div>' : ''}</div>`;
  }

  function bindPanel() {
    const panel = $('#panel');
    const on = (sel, fn) => panel.querySelectorAll(sel).forEach(e => e.addEventListener('click', ev => fn(e, ev)));
    const cur = activePlayer(), s = st();
    on('#curtain-ok', () => { ui.curtainOk = cur; resetSel(); render(); });
    on('#showlast', (e) => { ui.showLast = e.checked; drawDynamic(); });
    on('[data-uid]', (e, ev) => {
      if (ev.target.dataset.clear) { delete game.staged[cur][ev.target.dataset.clear]; save(); render(); return; }
      ui.sel = +e.dataset.uid; ui.act = null; ui.step = 0; ui.pick = null; ui.coastAsk = null; render();
    });
    on('[data-act]', e => {
      const u = s.units.find(x => x.id === ui.sel); if (!u) return;
      if (e.dataset.act === 'hold') { game.staged[cur][u.id] = { type: 'hold' }; finishOrder(); return; }
      ui.act = e.dataset.act; ui.step = 0; ui.pick = null; ui.coastAsk = null; render();
    });
    on('[data-coast]', e => {
      const a = ui.coastAsk;
      if (a.retreat) game.staged[cur][a.uid] = { to: a.to, coast: e.dataset.coast };
      else game.staged[cur][a.uid] = { type: 'move', to: a.to, coast: e.dataset.coast };
      finishOrder();
    });
    on('[data-ret]', e => {
      const id = +e.dataset.ret;
      game.staged[cur][id] = e.dataset.dis ? { disband: true } : { to: e.dataset.to, coast: e.dataset.c || undefined };
      ui.retSel = id; save(); render();
    });
    on('[data-build]', e => {
      game.staged[cur].list = game.staged[cur].list || [];
      game.staged[cur].list.push({ type: 'build', utype: e.dataset.build, loc: ui.buildPick, coast: e.dataset.bc || undefined });
      ui.buildPick = null; save(); render();
    });
    on('[data-rmb]', e => { game.staged[cur].list.splice(+e.dataset.rmb, 1); save(); render(); });
    on('#clearall', () => { game.staged[cur] = {}; resetSel(); save(); render(); });
    on('#submit', () => {
      if (game.mode === 'online') { resetSel(); submitOnline(); return; }
      game.done[cur] = true; resetSel(); save();
      ui.curtainOk = null; maybeResolve();
      render();
    });
    on('#undo-submit', () => { if (game.mode === 'online') unsubmitOnline(); });
    on('#copylink', e => { const url = linkFor(game.code); try { navigator.clipboard.writeText(url); e.textContent = 'Lien copié ✓'; } catch (err) { prompt('Copiez ce lien :', url); } });
  }

  // ------------------------------------------------------------------ écrans modaux
  function modal(html) { const m = $('#modal'); m.innerHTML = '<div class="box">' + html + '</div>'; m.classList.remove('hidden'); return m; }
  function closeModal() { $('#modal').classList.add('hidden'); }
  function renderSetup(errMsg) {
    drawDynamicSafe();
    $('#panel').innerHTML = '<div class="card"><h3>Nouvelle partie</h3><p class="hint">Choisissez un mode de jeu.</p></div>';
    const m = modal(`<h2>Diplomacy — Guerre froide</h2>
      <p>Deux blocs, une carte du monde vue du pôle Nord. Contrôlez la majorité des centres de ravitaillement pour l'emporter.</p>
      <div class="choice">
        <button id="m-online"><b>En ligne</b><small>Chacun sur son appareil, synchronisé automatiquement. Vous créez la partie et envoyez un lien à votre ami.</small></button>
        <button id="m-local"><b>Même écran</b><small>Vous jouez à deux sur cet appareil. Les ordres sont cachés derrière un écran de passage.</small></button>
      </div>
      <div id="side" class="hidden"><h4>Créer une partie : votre camp</h4><div class="row"><button class="W" id="s-W">Ouest — ${P.W.long}</button><button class="E" id="s-E">Est — ${P.E.long}</button></div>
      <p class="hint">Votre ami rejoindra avec l'autre camp grâce au lien.</p>
      <h4>…ou rejoindre une partie</h4><div class="row"><input id="joincode" placeholder="Code (ex. K7M2P)" maxlength="8" style="padding:8px;border-radius:8px;border:1px solid var(--line);background:#0b1424;color:var(--text);text-transform:uppercase"><button id="join">Rejoindre</button></div></div>
      <div id="err" class="bad hint" style="margin-top:8px">${errMsg ? esc(errMsg) : ''}</div>
      <div class="row" style="margin-top:14px"><button class="ghost" id="m-rules">Lire les règles</button>${load() ? '<button class="ghost" id="m-resume">Reprendre la partie sauvegardée</button>' : ''}</div>`);
    const fail = e => { m.querySelector('#err').textContent = 'Erreur : ' + (e.message || e); };
    m.querySelector('#m-local').onclick = () => { closeModal(); newGame('local'); };
    m.querySelector('#m-online').onclick = () => m.querySelector('#side').classList.remove('hidden');
    m.querySelector('#s-W').onclick = () => createOnline('W').then(closeModal).catch(fail);
    m.querySelector('#s-E').onclick = () => createOnline('E').then(closeModal).catch(fail);
    m.querySelector('#join').onclick = () => joinOnline(m.querySelector('#joincode').value).then(closeModal).catch(fail);
    m.querySelector('#m-rules').onclick = showRules;
    const rs = m.querySelector('#m-resume'); if (rs) rs.onclick = () => { game = load(); closeModal(); render(); pull(); };
  }
  function drawDynamicSafe() { try { gDyn.innerHTML = ''; } catch (e) { /* */ } }
  function showRules() {
    const m = modal(`<h2>Règles</h2>
      <h4>But</h4><p>Posséder plus de la moitié des centres de ravitaillement (cercles et étoiles sur la carte). Un centre appartient à celui qui l'occupe à la fin de l'automne.</p>
      <h4>Tours</h4><p>Chaque année : <b>Printemps</b> (ordres, retraites) puis <b>Automne</b> (ordres, retraites) puis <b>Ajustements</b> (construire ou dissoudre selon le nombre de centres). Les deux joueurs donnent leurs ordres en secret, puis tout est résolu en même temps.</p>
      <h4>Unités</h4><p>Une <b>armée</b> (A) circule sur les terres, une <b>flotte</b> (F) sur les mers et sur les côtes. Une seule unité par province.</p>
      <h4>Ordres</h4><ul><li><b>Tenir</b> : rester sur place.</li><li><b>Aller</b> : se déplacer vers une province voisine.</li><li><b>Soutenir</b> : ajouter +1 à l'attaque ou à la défense d'une unité voisine de la province visée. Un soutien est coupé si l'unité qui soutient est attaquée (sauf par celle visée par le soutien) ou délogée.</li><li><b>Convoyer</b> : une flotte en mer transporte une armée côtière d'une côte à l'autre. Une chaîne de flottes peut convoyer. Si une flotte du convoi est délogée, le convoi échoue.</li></ul>
      <h4>Combats</h4><p>Le plus fort (1 + soutiens) l'emporte. À force égale, c'est un blocage : personne ne bouge. On ne peut jamais déloger ses propres unités. Une unité délogée doit battre en retraite vers une province voisine vide (pas celle d'où vient l'attaquant, pas une province où il y a eu un blocage) ou disparaître.</p>
      <h4>Comptoirs (hexagones)</h4><p>Certaines provinces ont plusieurs côtes (France, Mexique, Panama, Canada Ouest, Leningrad…). Une flotte y est postée sur une côte précise (hexagone) et ne peut aller que vers les mers qui bordent cette côte.</p>
      <h4>Cases grisées</h4><p>Infranchissables (Islande, Tibet, Suisse, Haïti).</p>
      <h4>Ajustements</h4><p>Après l'automne, chacun compare ses centres à ses unités : en excès de centres, on construit sur ses centres d'origine encore libres ; en défaut, on dissout.</p>
      <div class="row" style="margin-top:14px"><button class="primary" id="close">Fermer</button></div>`);
    m.querySelector('#close').onclick = () => { closeModal(); if (!game) renderSetup(); };
  }

  // ------------------------------------------------------------------ démarrage
  function init() {
    buildStatic(); setupPanZoom();
    requestAnimationFrame(fitView);
    $('#btn-rules').onclick = showRules;
    $('#btn-new').onclick = () => { if (!game || confirm('Abandonner la partie en cours ?')) { game = null; render(); } };
    const saved = load();
    const qs = new URLSearchParams(location.search), wanted = (qs.get('partie') || '').toUpperCase(), camp = qs.get('camp');
    if (saved && saved.st) { game = saved; ui.cur = null; }
    if (wanted && !(game && game.mode === 'online' && game.code === wanted)) {
      game = null; renderSetup();
      joinOnline(wanted, camp === 'W' || camp === 'E' ? camp : null).then(closeModal).catch(e => renderSetup('Impossible de rejoindre ' + wanted + ' : ' + (e.message || e)));
    } else if (game) { render(); pull(); } else renderSetup();
    window.__dip = { get game() { return game; }, MAP, G, ui };
  }
  init();
})();
