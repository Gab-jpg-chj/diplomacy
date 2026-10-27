var console = { log: print };
load('js/maskdata.js'); load('js/mapdef.js'); load('js/mapgen.js');
var M = buildMap();
print('lacs:', M.lakeCount);
M.regions.forEach(function (r) {
  if (!r.cells.length) print('!! VIDE', r.id);
});
M.regions.forEach(function (r) {
  if (r.type === 'sea') print(r.id.padEnd(5), 'SEA ', r.cells.length, '->', r.adj.join(' '));
});
print('---');
M.regions.forEach(function (r) {
  if (r.type !== 'sea') print(r.id.padEnd(5), r.type[0], String(r.cells.length).padStart(4), 'T' + r.tint, 'land:', r.landAdj.join(' '), '| seas:', r.seas.join(' '));
});
M.regions.forEach(function (r) { if (r.coasts) for (var k in r.coasts) print('coast', r.id, k, r.coasts[k].seas.join(',')); });
