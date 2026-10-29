// Génère la carte à partir de la grille (MASK_ROWS) et des régions (REGION_DEFS) :
//  - découpe la terre et la mer en régions par propagation depuis des points d'ancrage,
//  - en déduit le voisinage (terre, côtes, mers),
//  - construit les contours lissés (chemins SVG).
// Aucune dépendance : fonctionne dans le navigateur comme dans un shell JS.

function buildMap() {
  const CELL = 10;
  const H = MASK_ROWS.length, W = MASK_ROWS[0].length;
  const dom = new Int8Array(W * H);          // 0 mer, 1 terre, 2 infranchissable
  const tintCh = new Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ch = MASK_ROWS[y][x];
    dom[y * W + x] = ch === '.' ? 0 : ch === 'g' ? 2 : 1;
    tintCh[y * W + x] = ch;
  }
  const domOf = t => (t === 'sea' ? 0 : t === 'blocked' ? 2 : 1);
  const defs = REGION_DEFS;
  const own = new Int16Array(W * H).fill(-1);
  const cost = new Float32Array(W * H).fill(1e9);

  // ---- tas binaire minimal
  const heap = [];
  const push = (c, i) => { heap.push([c, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { let l = 2 * k + 1, r = l + 1, m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };

  // ---- ancrages : on ramène chaque point sur une cellule du bon domaine
  const snap = (x, y, d) => {
    const cx = Math.max(0, Math.min(W - 1, Math.floor(x / CELL))), cy = Math.max(0, Math.min(H - 1, Math.floor(y / CELL)));
    for (let r = 0; r < 12; r++) {
      let best = -1, bd = 1e9;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const xx = cx + dx, yy = cy + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        if (dom[yy * W + xx] !== d) continue;
        const dd = dx * dx + dy * dy;
        if (dd < bd) { bd = dd; best = yy * W + xx; }
      }
      if (best >= 0) return best;
    }
    return -1;
  };
  const anchorCells = [];
  defs.forEach((r, ri) => {
    r.a.forEach(([x, y, head]) => {
      const i = snap(x, y, domOf(r.type));
      if (i < 0) { console.log('ancre introuvable : ' + r.id); return; }
      anchorCells.push([ri, i, x, y]);
      if (-(head || 0) < cost[i]) { cost[i] = -(head || 0); own[i] = ri; push(cost[i], i); }
    });
  });
  const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.41], [-1, 1, 1.41], [1, -1, 1.41], [-1, -1, 1.41]];
  while (heap.length) {
    const [c, i] = pop();
    if (c > cost[i]) continue;
    const x = i % W, y = (i / W) | 0, d = domOf(defs[own[i]].type);
    for (const [dx, dy, w] of NB) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx;
      if (dom[j] !== d) continue;
      if (dx && dy && (dom[y * W + xx] !== d || dom[yy * W + x] !== d)) continue; // pas de diagonale entre deux cellules vides
      const nc = c + w;
      if (nc < cost[j]) { cost[j] = nc; own[j] = own[i]; push(nc, j); }
    }
  }
  // cellules non atteintes : terre -> ancre terrestre la plus proche ; mer isolée -> lac (-1)
  for (let i = 0; i < W * H; i++) {
    if (own[i] >= 0) continue;
    const d = dom[i];
    if (d === 0) { own[i] = -1; continue; }
    const x = (i % W) * CELL + 5, y = ((i / W) | 0) * CELL + 5;
    let bd = 1e12, bi = -1;
    for (const [ri, , ax, ay] of anchorCells) {
      if (domOf(defs[ri].type) !== d) continue;
      const dd = (ax - x) ** 2 + (ay - y) ** 2;
      if (dd < bd) { bd = dd; bi = ri; }
    }
    own[i] = bi;
  }

  // ---- régions
  const regions = defs.map((r, ri) => ({
    id: r.id, name: r.name, type: r.type, idx: ri, cells: [],
    center: r.c ? { x: r.c.x, y: r.c.y, home: r.c.home || null } : null,
    coasts: r.coasts ? Object.fromEntries(Object.entries(r.coasts).map(([k, p]) => [k, { x: p.x, y: p.y, seas: [] }])) : null,
    adj: [], seas: [], landAdj: [], coastalAdj: [], tint: 't',
  }));
  const byId = Object.fromEntries(regions.map(r => [r.id, r]));
  for (let i = 0; i < W * H; i++) if (own[i] >= 0) regions[own[i]].cells.push(i);

  // teinte initiale (majorité des cellules)
  regions.forEach(r => {
    const cnt = {};
    r.cells.forEach(i => { const t = tintCh[i]; cnt[t] = (cnt[t] || 0) + 1; });
    let best = 't', bn = -1;
    for (const k in cnt) if (cnt[k] > bn) { bn = cnt[k]; best = k; }
    r.tint = r.type === 'sea' ? '.' : best;
  });

  // position des étiquettes : cellule la plus éloignée du bord
  regions.forEach(r => {
    if (!r.cells.length) { r.pole = { x: 0, y: 0 }; r.size = 0; return; }
    const set = new Set(r.cells), dist = new Map(), q = [];
    r.cells.forEach(i => {
      const x = i % W, y = (i / W) | 0;
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const xx = x + dx, yy = y + dy; return xx < 0 || yy < 0 || xx >= W || yy >= H || !set.has(yy * W + xx); });
      if (edge) { dist.set(i, 1); q.push(i); }
    });
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % W, y = (i / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (set.has(j) && !dist.has(j)) { dist.set(j, dist.get(i) + 1); q.push(j); }
      }
    }
    let bi = r.cells[0], bv = -1;
    r.cells.forEach(i => { const v = dist.get(i) || 1; if (v > bv) { bv = v; bi = i; } });
    r.pole = { x: (bi % W) * CELL + 5, y: ((bi / W) | 0) * CELL + 5 };
    r.size = r.cells.length; r.depth = bv;
  });
  // les centres doivent tomber dans leur région
  regions.forEach(r => {
    if (!r.center) return;
    const ci = Math.floor(r.center.y / CELL) * W + Math.floor(r.center.x / CELL);
    if (own[ci] !== r.idx && r.cells.length) {
      let bd = 1e12, bp = r.pole;
      r.cells.forEach(i => { const x = (i % W) * CELL + 5, y = ((i / W) | 0) * CELL + 5; const dd = (x - r.center.x) ** 2 + (y - r.center.y) ** 2; if (dd < bd) { bd = dd; bp = { x, y }; } });
      r.center.x = bp.x; r.center.y = bp.y;
    }
  });

  // ---- voisinages (arêtes entre cellules)
  const cnt = new Map();
  const coastTouch = new Map();   // paires terre-terre dont la frontière touche la mer
  const seaNear = i => { const x = i % W, y = (i / W) | 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; if (dom[yy * W + xx] === 0) return true; } return false; };
  const key = (a, b) => (a < b ? a + ',' + b : b + ',' + a);
  const coastCells = {};  // region terre -> mer -> cellules de contact
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, a = own[i];
    if (a < 0) continue;
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const xx = x + dx, yy = y + dy;
      if (xx >= W || yy >= H) continue;
      const j = yy * W + xx, b = own[j];
      if (b < 0 || b === a) continue;
      const k = key(a, b);
      cnt.set(k, (cnt.get(k) || 0) + 1);
      const ta = regions[a].type, tb = regions[b].type;
      if (ta === 'land' && tb === 'land' && (seaNear(i) || seaNear(j))) coastTouch.set(k, true);
      const [L, S, li] = ta === 'land' && tb === 'sea' ? [a, b, i] : tb === 'land' && ta === 'sea' ? [b, a, j] : [-1, -1, -1];
      if (L >= 0) { const id = regions[L].id + '>' + regions[S].id; (coastCells[id] = coastCells[id] || []).push(li); }
    }
  }
  const links = [];
  cnt.forEach((n, k) => {
    const [a, b] = k.split(',').map(Number), ra = regions[a], rb = regions[b];
    if (ra.type === 'blocked' || rb.type === 'blocked') return;
    if (ra.type === 'sea' && rb.type === 'sea' && n < 2) return;
    links.push([ra.id, rb.id, coastTouch.has(k)]);
  });
  const banned = new Set(ADJ_BAN.map(([a, b]) => key(byId[a].idx, byId[b].idx)));
  const link = (a, b, coastal) => {
    const ra = byId[a], rb = byId[b];
    if (ra.adj.includes(b)) return;
    ra.adj.push(b); rb.adj.push(a);
    if (ra.type === 'land' && rb.type === 'land') { ra.landAdj.push(b); rb.landAdj.push(a); if (coastal) { ra.coastalAdj.push(b); rb.coastalAdj.push(a); } }
  };
  links.forEach(([a, b, c]) => { if (!banned.has(key(byId[a].idx, byId[b].idx))) link(a, b, c); });
  ADJ_ADD.forEach(([a, b, c]) => link(a, b, c !== false));
  regions.forEach(r => { if (r.type === 'land') r.seas = r.adj.filter(id => byId[id].type === 'sea'); });

  // côtes multiples : mers voisines dans un rayon autour du comptoir
  regions.forEach(r => {
    if (!r.coasts) return;
    // chaque mer est rattachée à la (aux) côte(s) dont le comptoir est le plus proche de son rivage
    const names = Object.keys(r.coasts);
    names.forEach(n => { r.coasts[n].seas = []; });
    r.seas.forEach(s => {
      const cells = coastCells[r.id + '>' + s] || [];
      const d = names.map(n => { const c = r.coasts[n]; let m = 1e12; cells.forEach(i => { const v = Math.hypot((i % W) * CELL + 5 - c.x, ((i / W) | 0) * CELL + 5 - c.y); if (v < m) m = v; }); return m; });
      const best = Math.min(...d);
      names.forEach((n, k) => { if (d[k] <= best + 25) r.coasts[n].seas.push(s); });
    });
  });

  // ---- contours lissés
  const clampCell = (x, y) => own[Math.max(0, Math.min(H - 1, y)) * W + Math.max(0, Math.min(W - 1, x))];
  const PAD = 3;
  regions.forEach(r => {
    if (!r.cells.length) { r.path = ''; return; }
    const edges = new Map();
    const add = (x1, y1, x2, y2) => { const k = x1 + ',' + y1; (edges.get(k) || edges.set(k, []).get(k)).push([x2, y2]); };
    const inR = (x, y) => (x < -PAD || y < -PAD || x >= W + PAD || y >= H + PAD) ? false : clampCell(x, y) === r.idx;
    // cellules de la région (+ marge de recopie sur les bords de la grille)
    for (const i of r.cells) {
      const cx = i % W, cy = (i / W) | 0;
      for (let ox = (cx === 0 ? -PAD : 0); ox <= (cx === W - 1 ? PAD : 0); ox++)
        for (let oy = (cy === 0 ? -PAD : 0); oy <= (cy === H - 1 ? PAD : 0); oy++) {
          const x = cx + ox, y = cy + oy;
          if (!inR(x, y - 1)) add(x, y, x + 1, y);
          if (!inR(x + 1, y)) add(x + 1, y, x + 1, y + 1);
          if (!inR(x, y + 1)) add(x + 1, y + 1, x, y + 1);
          if (!inR(x - 1, y)) add(x, y + 1, x, y);
        }
    }
    const loops = [];
    while (edges.size) {
      const [sk, outs] = edges.entries().next().value;
      const start = sk.split(',').map(Number);
      let cur = start, pts = [start];
      for (let guard = 0; guard < 100000; guard++) {
        const k = cur[0] + ',' + cur[1], o = edges.get(k);
        if (!o) { if (typeof DEBUGMAP !== "undefined") print("dead end", r.id, k); break; }
        const nx = o.pop();
        if (!o.length) edges.delete(k);
        if (nx[0] === start[0] && nx[1] === start[1]) break;
        pts.push(nx); cur = nx;
      }
      if (pts.length >= 4) loops.push(pts);
    }
    r.path = loops.map(p => {
      // supprime les points alignés, puis lisse (Chaikin)
      let q = p.filter((pt, i) => { const a = p[(i + p.length - 1) % p.length], b = p[(i + 1) % p.length]; return !((a[0] === pt[0] && pt[0] === b[0]) || (a[1] === pt[1] && pt[1] === b[1])); });
      if (q.length < 3) return '';
      for (let it = 0; it < 4; it++) {
        const n = []; for (let i = 0; i < q.length; i++) { const a = q[i], b = q[(i + 1) % q.length]; n.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25], [a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]); } q = n;
      }
      return 'M' + q.map(pt => (pt[0] * CELL).toFixed(1) + ' ' + (pt[1] * CELL).toFixed(1)).join('L') + 'Z';
    }).join('');
  });

  // lacs (mer isolée) : un chemin décoratif
  const lakeSet = new Set(); for (let i = 0; i < W * H; i++) if (own[i] === -1 && dom[i] === 0) lakeSet.add(i);

  return { W: W * CELL, H: H * CELL, CELL, gw: W, gh: H, own, regions, byId, lakeCount: lakeSet.size };
}

if (typeof globalThis !== 'undefined') globalThis.buildMap = buildMap;
