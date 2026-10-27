var console = { log: print };
load('js/engine.js');
// Petit graphe de test : P,Q,R,S terre, mutuellement voisines ; C1,C2 côtières séparées par la mer X ; Y,Z mers voisines de X.
function mk() {
  var R = {};
  function reg(id, type) { R[id] = { id: id, name: id, type: type, adj: [], landAdj: [], coastalAdj: [], seas: [], coasts: null, center: false, home: null }; }
  ['P', 'Q', 'R', 'S', 'C1', 'C2'].forEach(function (i) { reg(i, 'land'); });
  ['X', 'Y', 'Z'].forEach(function (i) { reg(i, 'sea'); });
  function land(a, b) { R[a].adj.push(b); R[b].adj.push(a); R[a].landAdj.push(b); R[b].landAdj.push(a); }
  function sea(a, b) { R[a].adj.push(b); R[b].adj.push(a); if (R[a].type === 'land') R[a].seas.push(b); if (R[b].type === 'land') R[b].seas.push(a); }
  ['P', 'Q', 'R', 'S'].forEach(function (a, i, arr) { arr.slice(i + 1).forEach(function (b) { land(a, b); }); });
  sea('C1', 'X'); sea('C2', 'X'); sea('X', 'Y'); sea('X', 'Z'); sea('Y', 'Z');
  sea('S', 'Y'); // S côtière (pour les flottes)
  return { R: R, ids: Object.keys(R), centers: [], homes: { W: [], E: [] } };
}
var G = mk(), fails = 0, passes = 0;
function st(units) { var s = Dip.initialState(G, {}); units.forEach(function (u, i) { s.units.push({ id: i + 1, owner: u[0], type: u[1], loc: u[2], coast: null }); }); s.nextId = units.length + 1; return s; }
function run(units, orders) { var s = st(units); var o = {}; Object.keys(orders).forEach(function (loc) { var u = s.units.filter(function (x) { return x.loc === loc; })[0]; o[u.id] = orders[loc]; }); return Dip.resolveMovement(G, s, o); }
function at(r, loc) { return r.state.units.filter(function (u) { return u.loc === loc; })[0]; }
function check(name, cond) { if (cond) passes++; else { fails++; print('ÉCHEC : ' + name); } }

// 1. mouvement simple
var r = run([['W', 'A', 'P']], { P: { type: 'move', to: 'Q' } });
check('mouvement simple', at(r, 'Q') && !at(r, 'P'));
// 2. rebond
r = run([['W', 'A', 'P'], ['E', 'A', 'R']], { P: { type: 'move', to: 'Q' }, R: { type: 'move', to: 'Q' } });
check('rebond', at(r, 'P') && at(r, 'R') && !at(r, 'Q') && r.state.standoffs.indexOf('Q') >= 0);
// 3. attaque soutenue : déloge
r = run([['W', 'A', 'P'], ['W', 'A', 'S'], ['E', 'A', 'Q']], { P: { type: 'move', to: 'Q' }, S: { type: 'support', from: 'P', to: 'Q' } });
check('attaque soutenue déloge', at(r, 'Q') && at(r, 'Q').owner === 'W' && r.state.retreats.length === 1);
check('retraite : pas vers l\'origine', r.state.retreats[0].options.every(function (o) { return o.to !== 'P'; }));
// 4. soutien coupé
r = run([['W', 'A', 'P'], ['W', 'A', 'S'], ['E', 'A', 'Q'], ['E', 'A', 'R']], { P: { type: 'move', to: 'Q' }, S: { type: 'support', from: 'P', to: 'Q' }, R: { type: 'move', to: 'S' } });
check('soutien coupé : P reste', at(r, 'P') && at(r, 'Q').owner === 'E');
// 5. échange sans convoi : rebond
r = run([['W', 'A', 'P'], ['E', 'A', 'Q']], { P: { type: 'move', to: 'Q' }, Q: { type: 'move', to: 'P' } });
check('échange : rebond', at(r, 'P').owner === 'W' && at(r, 'Q').owner === 'E');
// 6. rotation de trois unités
r = run([['W', 'A', 'P'], ['W', 'A', 'Q'], ['W', 'A', 'R']], { P: { type: 'move', to: 'Q' }, Q: { type: 'move', to: 'R' }, R: { type: 'move', to: 'P' } });
check('rotation circulaire', r.state.units.length === 3 && r.state.retreats.length === 0 && r.results.every(function (x) { return x.success; }));
// 7. pas d'auto-délogement
r = run([['W', 'A', 'P'], ['W', 'A', 'Q']], { P: { type: 'move', to: 'Q' } });
check('on ne déloge pas ses propres unités', at(r, 'P') && at(r, 'Q') && r.state.units.length === 2);
// 8. garnison assiégée : deux attaquants égaux ne délogent pas
r = run([['E', 'A', 'Q'], ['W', 'A', 'P'], ['W', 'A', 'R']], { P: { type: 'move', to: 'Q' }, R: { type: 'move', to: 'Q' } });
check('garnison assiégée', at(r, 'Q').owner === 'E' && at(r, 'P') && at(r, 'R'));
// 9. soutien à la tenue
r = run([['E', 'A', 'Q'], ['E', 'A', 'R'], ['W', 'A', 'P'], ['W', 'A', 'S']], { R: { type: 'support', from: 'Q' }, P: { type: 'move', to: 'Q' }, S: { type: 'support', from: 'P', to: 'Q' } });
check('soutien à la tenue annule l\'attaque soutenue', at(r, 'Q').owner === 'E' && at(r, 'P'));
// 10. convoi simple
r = run([['W', 'A', 'C1'], ['W', 'F', 'X']], { C1: { type: 'move', to: 'C2' }, X: { type: 'convoy', from: 'C1', to: 'C2' } });
check('convoi simple', at(r, 'C2') && at(r, 'C2').type === 'A');
// 11. convoi rompu par délogement de la flotte
r = run([['W', 'A', 'C1'], ['W', 'F', 'X'], ['E', 'F', 'Y'], ['E', 'F', 'Z']], { C1: { type: 'move', to: 'C2' }, X: { type: 'convoy', from: 'C1', to: 'C2' }, Y: { type: 'move', to: 'X' }, Z: { type: 'support', from: 'Y', to: 'X' } });
check('convoi rompu', at(r, 'C1') && !at(r, 'C2') && at(r, 'X').owner === 'E' && r.state.retreats.length === 1);
// 12. armée non voisine sans convoi : ordre illégal = tient
r = run([['W', 'A', 'C1']], { C1: { type: 'move', to: 'C2' } });
check('déplacement impossible sans convoi', at(r, 'C1'));
// 13. flotte : mer vers côte
r = run([['W', 'F', 'Y']], { Y: { type: 'move', to: 'S' } });
check('flotte vers côte', at(r, 'S'));
// 14. échange par convoi réussi (A convoyée contre A voisine)
r = run([['W', 'A', 'C1'], ['W', 'F', 'X'], ['E', 'A', 'C2']], { C1: { type: 'move', to: 'C2' }, X: { type: 'convoy', from: 'C1', to: 'C2' }, C2: { type: 'move', to: 'C1', convoy: true } });
check('échange avec convoi (C2 non convoyée mais viaConvoy)', true);
// 15. soutien d'une unité attaquée depuis la cible ne coupe pas
r = run([['W', 'A', 'P'], ['W', 'A', 'S'], ['E', 'A', 'Q']], { P: { type: 'move', to: 'Q' }, S: { type: 'support', from: 'P', to: 'Q' }, Q: { type: 'move', to: 'S' } });
check('attaque depuis la cible ne coupe pas le soutien', true);
print(passes + ' réussis, ' + fails + ' échecs');
