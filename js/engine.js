// Moteur de règles de Diplomacy (deux joueurs : W = Ouest, E = Est).
// Arbitrage des mouvements selon l'algorithme de Kruijswijk (« guess & check ») : soutiens, coupures,
// convois, échanges, rotations, paradoxes de convoi (règle de Szykman).
// Aucune dépendance au DOM : fonctionne dans le navigateur et dans un shell JS.
(function (g) {
  'use strict';
  const Dip = {};
  const PLAYER_IDS = ['W', 'E'];
  Dip.PLAYER_IDS = PLAYER_IDS;

  // ------------------------------------------------------------------ graphe
  Dip.makeGraph = function (map) {
    const R = {};
    map.regions.forEach(r => {
      R[r.id] = {
        id: r.id, name: r.name, type: r.type, adj: r.adj.slice(), landAdj: r.landAdj.slice(),
        coastalAdj: r.coastalAdj.slice(), seas: r.seas.slice(),
        coasts: r.coasts ? Object.fromEntries(Object.entries(r.coasts).map(([k, c]) => [k, { seas: c.seas.slice() }])) : null,
        center: !!r.center, home: (r.center && r.center.home) || null,
      };
    });
    const ids = Object.keys(R);
    return {
      R, ids,
      centers: ids.filter(i => R[i].center),
      homes: { W: ids.filter(i => R[i].home === 'W'), E: ids.filter(i => R[i].home === 'E') },
    };
  };

  const inter = (a, b) => a.some(x => b.includes(x));
  const isCoastal = (G, id) => G.R[id].type === 'land' && G.R[id].seas.length > 0;
  Dip.isCoastal = isCoastal;

  // positions atteignables par une flotte depuis (loc, coast) : [{to, coast?}]
  Dip.fleetMoves = function (G, loc, coast) {
    const r = G.R[loc], out = [];
    if (r.type === 'sea') {
      for (const id of r.adj) {
        const t = G.R[id];
        if (t.type === 'sea') out.push({ to: id });
        else if (t.type === 'land') {
          if (t.coasts) { for (const cn in t.coasts) if (t.coasts[cn].seas.includes(loc)) out.push({ to: id, coast: cn }); }
          else out.push({ to: id });
        }
      }
    } else if (r.type === 'land') {
      const here = r.coasts && coast ? r.coasts[coast].seas : r.seas;
      here.forEach(s => out.push({ to: s }));
      for (const id of r.coastalAdj) {
        const t = G.R[id];
        if (t.coasts) { for (const cn in t.coasts) if (inter(t.coasts[cn].seas, here)) out.push({ to: id, coast: cn }); }
        else if (inter(t.seas, here)) out.push({ to: id });
      }
    }
    return out;
  };

  // destinations directes d'une unité : [{to, coast?}]
  Dip.moveTargets = function (G, unit) {
    if (unit.type === 'A') return G.R[unit.loc].landAdj.map(to => ({ to }));
    return Dip.fleetMoves(G, unit.loc, unit.coast);
  };
  Dip.reach = (G, unit) => [...new Set(Dip.moveTargets(G, unit).map(m => m.to))];

  // ------------------------------------------------------------------ état
  Dip.initialState = function (G, startUnits, year) {
    const st = { year: year || 1950, season: 'spring', phase: 'orders', units: [], owners: {}, retreats: [], standoffs: [], nextId: 1, winner: null, log: [] };
    G.centers.forEach(c => { st.owners[c] = G.R[c].home || null; });
    PLAYER_IDS.forEach(p => (startUnits[p] || []).forEach(([type, loc, coast]) => st.units.push({ id: st.nextId++, owner: p, type, loc, coast: coast || null })));
    return st;
  };
  Dip.clone = s => JSON.parse(JSON.stringify(s));
  Dip.unitAt = (st, loc) => st.units.find(u => u.loc === loc) || null;
  Dip.centerCount = (st, p) => Object.values(st.owners).filter(o => o === p).length;
  Dip.unitCount = (st, p) => st.units.filter(u => u.owner === p).length + st.retreats.filter(d => d.unit.owner === p).length;
  Dip.phaseLabel = st => {
    if (st.phase === 'over') return 'Partie terminée';
    return (st.season === 'spring' ? 'Printemps' : 'Automne') + ' ' + st.year + ' — ' + ({ orders: 'Ordres', retreat: 'Retraites', build: 'Ajustements' })[st.phase];
  };
  Dip.hash = function (st) {
    const s = JSON.stringify([st.year, st.season, st.phase, st.units.map(u => [u.id, u.owner, u.type, u.loc, u.coast]), st.owners, st.retreats.map(d => d.unit.id)]);
    let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  };

  // ------------------------------------------------------------------ validation des ordres
  function normalize(G, st, u, raw) {
    const o = { unit: u, owner: u.owner, loc: u.loc, type: 'hold', note: null };
    if (!raw || !raw.type || raw.type === 'hold') return o;
    const R = G.R;
    const bad = msg => { o.type = 'hold'; o.note = 'ordre illégal : ' + msg; return o; };
    if (raw.type === 'move') {
      const to = raw.to, t = R[to];
      if (!t || to === u.loc) return bad('destination');
      if (u.type === 'A') {
        if (t.type !== 'land') return bad('une armée ne va pas en mer');
        const adjacent = R[u.loc].landAdj.includes(to);
        if (adjacent && !raw.convoy) { o.type = 'move'; o.to = to; o.viaConvoy = false; return o; }
        if (isCoastal(G, u.loc) && isCoastal(G, to)) { o.type = 'move'; o.to = to; o.viaConvoy = true; return o; }
        return bad('destination inaccessible');
      }
      const opts = Dip.fleetMoves(G, u.loc, u.coast).filter(m => m.to === to);
      if (!opts.length) return bad('destination inaccessible');
      let coast = null;
      if (t.coasts) {
        const cs = opts.map(m => m.coast);
        coast = raw.coast && cs.includes(raw.coast) ? raw.coast : cs.length === 1 ? cs[0] : null;
        if (!coast) return bad('côte à préciser');
      }
      o.type = 'move'; o.to = to; o.coast = coast; o.viaConvoy = false; return o;
    }
    if (raw.type === 'support') {
      const target = st.units.find(x => x.loc === raw.from);
      if (!target || target === u) return bad('soutien sans cible');
      const dest = raw.to || target.loc;
      if (!Dip.reach(G, u).includes(dest)) return bad('soutien hors de portée');
      o.type = 'support'; o.target = target; o.sTo = raw.to || null; return o;
    }
    if (raw.type === 'convoy') {
      const target = st.units.find(x => x.loc === raw.from);
      if (u.type !== 'F' || R[u.loc].type !== 'sea') return bad('seule une flotte en mer convoie');
      if (!target || target.type !== 'A' || !isCoastal(G, target.loc) || !raw.to || !isCoastal(G, raw.to)) return bad('convoi invalide');
      o.type = 'convoy'; o.target = target; o.cTo = raw.to; return o;
    }
    return o;
  }

  // ------------------------------------------------------------------ arbitrage des mouvements
  Dip.resolveMovement = function (G, st, rawOrders) {
    const R = G.R;
    const orders = st.units.map((u, i) => { const o = normalize(G, st, u, rawOrders[u.id]); o.i = i; return o; });
    const byLoc = {}; orders.forEach(o => { byLoc[o.loc] = o; });
    const moves = orders.filter(o => o.type === 'move');
    const supports = orders.filter(o => o.type === 'support');
    const convoys = orders.filter(o => o.type === 'convoy');
    const N = orders.length;
    const state = new Array(N).fill(0), res = new Array(N).fill(false);
    let dep = [];

    function resolve(i) {
      if (state[i] === 2) return res[i];
      if (state[i] === 1) { if (!dep.includes(i)) dep.push(i); return res[i]; }
      const old = dep.length;
      state[i] = 1; res[i] = false;
      const first = adjudicate(i);
      if (dep.length === old) { state[i] = 2; res[i] = first; return first; }
      if (dep[old] !== i) { if (!dep.includes(i)) dep.push(i); res[i] = first; state[i] = 0; return first; }
      for (let k = old + 1; k < dep.length; k++) state[dep[k]] = 0;
      dep.length = old + 1;
      state[i] = 1; res[i] = true;
      const second = adjudicate(i);
      if (first === second) {
        for (let k = old + 1; k < dep.length; k++) state[dep[k]] = 0;
        dep.length = old; state[i] = 2; res[i] = first; return first;
      }
      // pas de solution unique : règle de repli
      const cyc = dep.slice(old);
      cyc.forEach(k => { state[k] = 0; });
      dep.length = old;
      backup(cyc);
      return resolve(i);
    }
    function backup(cyc) {
      const cm = cyc.map(k => orders[k]).filter(o => o.type === 'move');
      const conv = cm.filter(o => o.viaConvoy);
      if (conv.length) conv.forEach(o => { state[o.i] = 2; res[o.i] = false; });   // paradoxe de convoi (Szykman)
      else cm.forEach(o => { state[o.i] = 2; res[o.i] = true; });                  // mouvement circulaire
    }

    const h2h = m => { const d = byLoc[m.to]; return d && d.type === 'move' && d.to === m.loc && !m.viaConvoy && !d.viaConvoy ? d : null; };
    const dislodgedBy = o => moves.some(n => n.to === o.loc && n.owner !== o.owner && resolve(n.i));

    function path(m) {
      if (!m.viaConvoy) return true;
      const fl = convoys.filter(c => c.target === m.unit && c.cTo === m.to && resolve(c.i));
      if (!fl.length) return false;
      const seen = new Set(), q = fl.filter(c => R[m.loc].adj.includes(c.loc));
      q.forEach(c => seen.add(c.i));
      for (let h = 0; h < q.length; h++) {
        const c = q[h];
        if (R[m.to].adj.includes(c.loc)) return true;
        fl.forEach(d => { if (!seen.has(d.i) && R[c.loc].adj.includes(d.loc)) { seen.add(d.i); q.push(d); } });
      }
      return false;
    }
    const moveSupport = (m, excludeOwner) => supports.filter(s => s.target === m.unit && s.sTo === m.to && s.owner !== excludeOwner && resolve(s.i)).length;
    function holdStrength(loc) {
      const u = byLoc[loc];
      if (!u) return 0;
      if (u.type === 'move') return resolve(u.i) ? 0 : 1;
      return 1 + supports.filter(s => s.target === u.unit && !s.sTo && resolve(s.i)).length;
    }
    function attackStrength(m) {
      if (!path(m)) return 0;
      const d = byLoc[m.to];
      let occupied = !!d;
      if (d && d.type === 'move' && !h2h(m)) occupied = !resolve(d.i);
      if (!occupied) return 1 + moveSupport(m, null);
      if (d.owner === m.owner) return 0;
      return 1 + moveSupport(m, d.owner);
    }
    const defendStrength = m => 1 + moveSupport(m, null);
    function preventStrength(n) {
      if (!path(n)) return 0;
      const opp = h2h(n);
      if (opp && resolve(opp.i)) return 0;
      return 1 + moveSupport(n, null);
    }

    function adjudicate(i) {
      const o = orders[i];
      switch (o.type) {
        case 'hold': case 'convoy': return !dislodgedBy(o);
        case 'support':
          if (dislodgedBy(o)) return false;
          return !moves.some(n => n.to === o.loc && n.owner !== o.owner && !(o.sTo && n.loc === o.sTo) && path(n));
        case 'move': {
          const as = attackStrength(o);
          const opp = h2h(o);
          if (opp) { if (!(as > defendStrength(opp))) return false; }
          else if (!(as > holdStrength(o.to))) return false;
          for (const n of moves) if (n !== o && n.to === o.to && !(as > preventStrength(n))) return false;
          return true;
        }
      }
      return false;
    }

    orders.forEach(o => resolve(o.i));

    // ---- résultats et nouvel état
    const ns = Dip.clone(st);
    const ok = i => res[i];
    const moved = new Set(moves.filter(m => ok(m.i)).map(m => m.i));
    const dislodgedList = [];
    const results = orders.map(o => {
      const r = { unitId: o.unit.id, owner: o.owner, type: o.type, loc: o.loc, to: o.to || null, target: o.target ? o.target.loc : null, sTo: o.sTo || null, cTo: o.cTo || null, coast: o.coast || null, viaConvoy: !!o.viaConvoy, success: false, note: o.note, utype: o.unit.type };
      if (o.type === 'move') r.success = ok(o.i);
      else r.success = ok(o.i);
      return r;
    });
    // unités délogées
    orders.forEach(o => {
      if (o.type === 'move' && moved.has(o.i)) return;
      const att = moves.find(m => m.to === o.loc && moved.has(m.i));
      if (att) { dislodgedList.push({ o, att }); results[o.i].dislodged = true; }
    });
    // échecs : on précise la raison
    results.forEach((r, i) => {
      const o = orders[i];
      if (o.type === 'move' && !r.success) r.note = r.note || (path(o) ? 'bloqué' : 'convoi coupé');
      if (o.type === 'support' && !r.success) r.note = r.note || 'soutien coupé';
      if (o.type === 'convoy' && !r.success) r.note = r.note || 'convoi rompu';
    });
    // positions
    const dislodgedIds = new Set(dislodgedList.map(d => d.o.unit.id));
    ns.units = ns.units.filter(u => !dislodgedIds.has(u.id));
    ns.units.forEach(u => {
      const o = orders.find(x => x.unit.id === u.id);
      if (o.type === 'move' && moved.has(o.i)) { u.loc = o.to; u.coast = o.coast || null; }
    });
    // empreintes : provinces vides après un bras de fer
    const attempts = {};
    moves.forEach(m => { if (path(m)) (attempts[m.to] = attempts[m.to] || []).push(m); });
    ns.standoffs = Object.keys(attempts).filter(to => attempts[to].length >= 2 && !attempts[to].some(m => moved.has(m.i)));
    // retraites
    ns.retreats = dislodgedList.map(({ o, att }) => {
      const unit = Dip.clone(o.unit);
      const options = Dip.moveTargets(G, unit).filter(t => {
        if (ns.units.some(x => x.loc === t.to)) return false;
        if (ns.standoffs.includes(t.to)) return false;
        if (t.to === att.loc && !att.viaConvoy) return false;
        return true;
      });
      return { unit, from: att.loc, options };
    });
    ns.retreats = ns.retreats.filter(d => true);
    return { state: ns, results, orders };
  };

  // ------------------------------------------------------------------ fin de phase
  function updateOwnership(G, ns) {
    G.centers.forEach(c => { const u = Dip.unitAt(ns, c); if (u) ns.owners[c] = u.owner; });
  }
  function checkWinner(G, ns) {
    const total = G.centers.length;
    for (const p of PLAYER_IDS) {
      if (Dip.centerCount(ns, p) * 2 > total) ns.winner = p;
      if (Dip.unitCount(ns, p) === 0 && Dip.centerCount(ns, p) === 0) ns.winner = PLAYER_IDS.find(x => x !== p);
    }
    if (ns.winner) ns.phase = 'over';
  }
  Dip.buildSites = function (G, st, p) {
    return G.homes[p].filter(c => st.owners[c] === p && !Dip.unitAt(st, c));
  };
  Dip.buildStatus = function (G, st) {
    const out = {};
    PLAYER_IDS.forEach(p => {
      const centers = Dip.centerCount(st, p), units = st.units.filter(u => u.owner === p).length;
      const sites = Dip.buildSites(G, st, p).length;
      out[p] = { centers, units, diff: centers - units, sites, builds: Math.max(0, Math.min(centers - units, sites)), disbands: Math.max(0, units - centers) };
    });
    return out;
  };
  // passe à la phase suivante (après mouvements ou retraites)
  Dip.advance = function (G, st) {
    const ns = Dip.clone(st);
    ns.retreats = []; ns.standoffs = [];
    if (ns.season === 'spring') { ns.season = 'fall'; ns.phase = 'orders'; return ns; }
    updateOwnership(G, ns);
    checkWinner(G, ns);
    if (ns.phase === 'over') return ns;
    const bs = Dip.buildStatus(G, ns);
    if (PLAYER_IDS.some(p => bs[p].builds > 0 || bs[p].disbands > 0)) ns.phase = 'build';
    else { ns.season = 'spring'; ns.year++; ns.phase = 'orders'; }
    return ns;
  };
  Dip.afterMovement = function (G, res) {
    const ns = res.state;
    if (ns.retreats.length) { ns.phase = 'retreat'; return ns; }
    return Dip.advance(G, ns);
  };

  // ------------------------------------------------------------------ retraites
  // orders : { unitId: {to, coast?} | {disband:true} }
  Dip.resolveRetreats = function (G, st, orders) {
    const ns = Dip.clone(st), results = [];
    const wanted = {};
    st.retreats.forEach(d => {
      const ord = orders[d.unit.id];
      if (ord && !ord.disband && ord.to) {
        const opt = d.options.filter(o => o.to === ord.to);
        if (opt.length) {
          let coast = opt[0].coast || null;
          if (opt.length > 1) coast = (opt.find(o => o.coast === ord.coast) || opt[0]).coast || null;
          (wanted[ord.to] = wanted[ord.to] || []).push({ d, coast });
          return;
        }
      }
      results.push({ unitId: d.unit.id, owner: d.unit.owner, loc: d.unit.loc, utype: d.unit.type, disbanded: true, note: 'dissous' });
    });
    Object.keys(wanted).forEach(to => {
      const w = wanted[to];
      if (w.length === 1) {
        const u = w[0].d.unit; const from = u.loc; u.loc = to; u.coast = w[0].coast; ns.units.push(u);
        results.push({ unitId: u.id, owner: u.owner, loc: from, to, utype: u.type, disbanded: false });
      } else w.forEach(x => results.push({ unitId: x.d.unit.id, owner: x.d.unit.owner, loc: x.d.unit.loc, utype: x.d.unit.type, disbanded: true, note: 'conflit de retraite' }));
    });
    ns.retreats = [];
    return { state: Dip.advance(G, ns), results };
  };

  // ------------------------------------------------------------------ ajustements (hiver)
  // orders : { W: [{type:'build', utype, loc, coast?} | {type:'disband', unitId}], E: [...] }
  function distToHome(G, p, loc) {
    const seen = { [loc]: 0 }, q = [loc], homes = G.homes[p];
    for (let h = 0; h < q.length; h++) {
      if (homes.includes(q[h])) return seen[q[h]];
      G.R[q[h]].adj.forEach(n => { if (!(n in seen)) { seen[n] = seen[q[h]] + 1; q.push(n); } });
    }
    return 99;
  }
  Dip.resolveBuilds = function (G, st, orders) {
    const ns = Dip.clone(st), results = [];
    const bs = Dip.buildStatus(G, st);
    PLAYER_IDS.forEach(p => {
      const list = (orders && orders[p]) || [];
      if (bs[p].disbands > 0) {
        let need = bs[p].disbands;
        list.filter(x => x.type === 'disband').forEach(x => {
          const u = ns.units.find(v => v.id === x.unitId && v.owner === p);
          if (u && need > 0) { ns.units = ns.units.filter(v => v !== u); need--; results.push({ owner: p, text: 'dissout ' + (u.type === 'A' ? 'armée' : 'flotte') + ' ' + u.loc }); }
        });
        while (need > 0) {  // dissolution d'office : la plus éloignée de chez soi
          const mine = ns.units.filter(v => v.owner === p).sort((a, b) => distToHome(G, p, b.loc) - distToHome(G, p, a.loc) || b.id - a.id);
          const u = mine[0]; ns.units = ns.units.filter(v => v !== u); need--;
          results.push({ owner: p, text: 'dissolution d\'office : ' + (u.type === 'A' ? 'armée' : 'flotte') + ' ' + u.loc });
        }
      } else if (bs[p].builds > 0) {
        let left = bs[p].builds;
        list.filter(x => x.type === 'build').forEach(x => {
          if (left <= 0) return;
          if (!Dip.buildSites(G, ns, p).includes(x.loc)) return;
          if (x.utype === 'F' && !isCoastal(G, x.loc)) return;
          let coast = null;
          if (x.utype === 'F' && G.R[x.loc].coasts) { coast = x.coast && G.R[x.loc].coasts[x.coast] ? x.coast : Object.keys(G.R[x.loc].coasts)[0]; }
          ns.units.push({ id: ns.nextId++, owner: p, type: x.utype === 'F' ? 'F' : 'A', loc: x.loc, coast });
          left--; results.push({ owner: p, text: 'construit ' + (x.utype === 'F' ? 'une flotte' : 'une armée') + ' à ' + x.loc });
        });
      }
    });
    ns.season = 'spring'; ns.year++; ns.phase = 'orders';
    return { state: ns, results };
  };

  // ------------------------------------------------------------------ codes d'échange (jeu à distance)
  Dip.encode = function (obj) {
    const s = JSON.stringify(obj);
    return (typeof btoa !== 'undefined' ? btoa(unescape(encodeURIComponent(s))) : s);
  };
  Dip.decode = function (code) {
    try { return JSON.parse(typeof atob !== 'undefined' ? decodeURIComponent(escape(atob(code.trim()))) : code); } catch (e) { return null; }
  };

  g.Dip = Dip;
})(typeof window !== 'undefined' ? window : globalThis);
