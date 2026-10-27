// Définition de la carte « Guerre froide » : régions, centres, côtes, positions de départ.
// Coordonnées dans un repère 2000 x 1180. Un « anchor » est [x, y, avance] : point de départ
// d'une région, `avance` = avance (en cellules de 10px) pour que les grandes régions s'étendent plus.

const PLAYERS = {
  W: { id: 'W', name: 'Ouest', long: 'Bloc occidental', color: '#3f8fd9', dark: '#1d5a99' },
  E: { id: 'E', name: 'Est', long: 'Bloc soviétique', color: '#d9503f', dark: '#99281d' },
};

// type : land | sea | blocked ; c : centre de ravitaillement { x, y, home? }
// coasts : régions à plusieurs côtes (comptoirs) { nom: {x, y} }
const REGION_DEFS = [
  // ---------- Amérique du Nord ----------
  { id: 'Ala', name: 'Alaska', type: 'land', a: [[800, 326, 2]], c: { x: 781, y: 321 } },
  { id: 'LAn', name: 'Los Angeles', type: 'land', a: [[440, 350, 3], [400, 420, 2]], c: { x: 412, y: 308, home: 'W' } },
  { id: 'CaO', name: 'Canada Ouest', type: 'land', a: [[640, 400, 3], [700, 440, 1]],
    coasts: { co: { x: 622, y: 357 }, cn: { x: 690, y: 477 } } },
  { id: 'Que', name: 'Québec', type: 'land', a: [[563, 665, 3], [640, 720, 0]] },
  { id: 'Tor', name: 'Toronto', type: 'land', a: [[528, 543, 3]], c: { x: 438, y: 648 } },
  { id: 'mid', name: 'Midwest', type: 'land', a: [[400, 494, 3]] },
  { id: 'SoW', name: 'Sud-Ouest', type: 'land', a: [[310, 447, 3]] },
  { id: 'Flo', name: 'Floride', type: 'land', a: [[300, 600, 2], [330, 690, 0]] },
  { id: 'NYo', name: 'New York', type: 'land', a: [[409, 657, 2], [428, 712, 1]], c: { x: 428, y: 712, home: 'W' } },
  { id: 'Gro', name: 'Groenland', type: 'land', a: [[848, 629, 3], [790, 700, 2]] },
  { id: 'Isl', name: 'Islande', type: 'blocked', a: [[845, 800, 1]] },
  { id: 'Mex', name: 'Mexique', type: 'land', a: [[257, 400, 3], [190, 440, 1]],
    coasts: { co: { x: 265, y: 381 }, ce: { x: 203, y: 462 } } },
  { id: 'AmC', name: 'Amérique Centrale', type: 'land', a: [[95, 614, 1]],
    coasts: { co: { x: 75, y: 600 }, ce: { x: 120, y: 590 } } },
  { id: 'Pan', name: 'Panama', type: 'land', a: [[66, 677, 1]],
    coasts: { co: { x: 45, y: 690 }, ce: { x: 90, y: 680 } } },
  { id: 'Col', name: 'Colombie', type: 'land', a: [[27, 803, 2], [60, 760, 1]], c: { x: 51, y: 728 },
    coasts: { co: { x: 10, y: 770 }, ce: { x: 70, y: 790 } } },
  { id: 'Ven', name: 'Venezuela', type: 'land', a: [[108, 901, 2]] },
  { id: 'Bre', name: 'Brésil', type: 'land', a: [[64, 1059, 3], [120, 1130, 2]], c: { x: 153, y: 1116 } },
  { id: 'Cub', name: 'Cuba', type: 'land', a: [[183, 657, 0]], c: { x: 186, y: 722, home: 'E' } },
  { id: 'Hai', name: 'Haïti', type: 'blocked', a: [[190, 800, 0]] },

  // ---------- Europe ----------
  { id: 'GBr', name: 'Grande-Bretagne', type: 'land', a: [[925, 922, 1]], c: { x: 935, y: 943, home: 'W' } },
  { id: 'Ibe', name: 'Ibérie', type: 'land', a: [[887, 1037, 2]] },
  { id: 'Fra', name: 'France', type: 'land', a: [[958, 965, 2]], c: { x: 953, y: 985, home: 'W' },
    coasts: { cn: { x: 925, y: 975 }, cs: { x: 978, y: 1008 } } },
  { id: 'ita', name: 'Italie', type: 'land', a: [[1032, 1000, 1], [1023, 1050, 0]] },
  { id: 'Sui', name: 'Suisse', type: 'blocked', a: [[1008, 988, 0]] },
  { id: 'You', name: 'Yougoslavie', type: 'land', a: [[1058, 975, 1]] },
  { id: 'Alb', name: 'Albanie', type: 'land', a: [[1118, 998, 1]], c: { x: 1127, y: 1025, home: 'E' } },
  { id: 'Gre', name: 'Grèce', type: 'land', a: [[1145, 1030, 1]] },
  { id: 'AIO', name: 'Allemagne Ouest', type: 'land', a: [[1021, 950, 1]], c: { x: 1014, y: 927 } },
  { id: 'AlE', name: 'Allemagne Est', type: 'land', a: [[1080, 920, 1]], c: { x: 1048, y: 943 } },
  { id: 'Dan', name: 'Danemark', type: 'land', a: [[1010, 878, 0]], c: { x: 1027, y: 853 } },
  { id: 'Nge', name: 'Norvège', type: 'land', a: [[989, 840, 1]] },
  { id: 'Sue', name: 'Suède', type: 'land', a: [[1028, 781, 2]] },
  { id: 'Fin', name: 'Finlande', type: 'land', a: [[1065, 787, 2]] },
  { id: 'Len', name: 'Leningrad', type: 'land', a: [[1131, 810, 2], [1100, 760, 1]], c: { x: 1095, y: 848, home: 'E' },
    coasts: { cn: { x: 1090, y: 742 }, cs: { x: 1105, y: 833 } } },
  { id: 'mos', name: 'Moscou', type: 'land', a: [[1210, 796, 2], [1155, 877, 1]], c: { x: 1155, y: 877, home: 'E' } },
  { id: 'Ukr', name: 'Ukraine', type: 'land', a: [[1150, 938, 2]] },
  { id: 'Cau', name: 'Caucase', type: 'land', a: [[1272, 854, 2]] },

  // ---------- Moyen-Orient, Afrique ----------
  { id: 'Tur', name: 'Turquie', type: 'land', a: [[1252, 975, 2], [1200, 1010, 1]], c: { x: 1200, y: 1010, home: 'W' } },
  { id: 'Kur', name: 'Kurdistan', type: 'land', a: [[1310, 928, 1]] },
  { id: 'Irk', name: 'Irak', type: 'land', a: [[1370, 950, 2]] },
  { id: 'Lev', name: 'Levant', type: 'land', a: [[1318, 983, 2]] },
  { id: 'Arb', name: 'Arabie', type: 'land', a: [[1505, 1005, 3], [1430, 1050, 2]] },
  { id: 'Egy', name: 'Égypte', type: 'land', a: [[1276, 1104, 2], [1300, 1135, 1]], c: { x: 1281, y: 1082 } },
  { id: 'Lib', name: 'Libye', type: 'land', a: [[1191, 1115, 2]] },
  { id: 'Tun', name: 'Tunisie', type: 'land', a: [[1038, 1111, 1]], c: { x: 1040, y: 1093 } },
  { id: 'AfN', name: 'Afrique du Nord', type: 'land', a: [[983, 1120, 2], [900, 1150, 2]] },
  { id: 'AfE', name: 'Afrique de l\'Est', type: 'land', a: [[1600, 1107, 3], [1500, 1150, 2]] },

  // ---------- Asie ----------
  { id: 'Im', name: 'Iran', type: 'land', a: [[1466, 862, 3]], c: { x: 1414, y: 918 } },
  { id: 'afg', name: 'Afghanistan', type: 'land', a: [[1508, 769, 2]] },
  { id: 'Pak', name: 'Pakistan', type: 'land', a: [[1567, 747, 2]] },
  { id: 'Tib', name: 'Tibet', type: 'blocked', a: [[1600, 610, 0], [1570, 650, 0]] },
  { id: 'Ind', name: 'Inde', type: 'land', a: [[1678, 667, 3], [1620, 720, 2]], c: { x: 1630, y: 714 } },
  { id: 'Bng', name: 'Bng', type: 'land', a: [[1662, 491, 2]] },
  { id: 'uru', name: 'Ourounqi', type: 'land', a: [[1524, 547, 3]] },
  { id: 'Han', name: 'Han', type: 'land', a: [[1700, 384, 1]] },
  { id: 'AsS', name: 'AsS', type: 'land', a: [[1753, 410, 1]] },
  { id: 'SVi', name: 'SVi', type: 'land', a: [[1746, 328, 1]], c: { x: 1782, y: 338 } },
  { id: 'Sha', name: 'Chine', type: 'land', a: [[1550, 325, 3]], c: { x: 1523, y: 266, home: 'E' } },
  { id: 'mon', name: 'Mongolie', type: 'land', a: [[1412, 427, 2]] },
  { id: 'Man', name: 'Mandchourie', type: 'land', a: [[1335, 295, 2]] },
  { id: 'Vla', name: 'Vladivostok', type: 'land', a: [[1247, 298, 2]], c: { x: 1223, y: 287, home: 'E' } },
  { id: 'CdN', name: 'Corée du Nord', type: 'land', a: [[1437, 278, 0]] },
  { id: 'CdS', name: 'Corée du Sud', type: 'land', a: [[1420, 255, 0]], c: { x: 1403, y: 241 } },
  { id: 'Sib', name: 'Sibérie', type: 'land', a: [[1239, 465, 3], [1230, 400, 2]] },
  { id: 'Our', name: 'Oural', type: 'land', a: [[1227, 675, 3], [1250, 600, 2]] },
  { id: 'Ana', name: 'Anadyr', type: 'land', a: [[1075, 332, 3], [960, 320, 1]] },
  { id: 'Jap', name: 'Japon', type: 'land', a: [[1330, 165, 1], [1262, 163, 0]], c: { x: 1335, y: 167 } },
  { id: 'Phi', name: 'Philippines', type: 'land', a: [[1648, 113, 1]] },
  { id: 'Ids', name: 'Indonésie', type: 'land', a: [[1827, 172, 2]], c: { x: 1863, y: 241 } },
  { id: 'LAus', name: 'Australie', type: 'land', a: [[1935, 15, 2]], c: { x: 1975, y: 22, home: 'W' } },

  // ---------- Mers ----------
  { id: 'PAE', name: 'Pacifique Est', type: 'sea', a: [[175, 144, 4], [90, 300, 3]] },
  { id: 'PAO', name: 'Pacifique Nord', type: 'sea', a: [[1220, 51, 4], [900, 60, 3], [1450, 40, 3]] },
  { id: 'MBE', name: 'Mer de Béring', type: 'sea', a: [[925, 174, 3]] },
  { id: 'GAL', name: 'Golfe d\'Alaska', type: 'sea', a: [[682, 210, 3]] },
  { id: 'MJN', name: 'Mer du Japon Nord', type: 'sea', a: [[1527, 142, 3]] },
  { id: 'MJP', name: 'Mer du Japon', type: 'sea', a: [[1340, 205, 2]] },
  { id: 'MCS', name: 'Mer de Chine Sud', type: 'sea', a: [[1670, 245, 3]] },
  { id: 'GBE', name: 'Golfe du Bengale', type: 'sea', a: [[1810, 561, 3], [1900, 700, 2]] },
  { id: 'OIN', name: 'Océan Indien', type: 'sea', a: [[1849, 1000, 3], [1750, 1100, 3]] },
  { id: 'MAR', name: 'Mer d\'Arabie', type: 'sea', a: [[1651, 845, 3]] },
  { id: 'MRO', name: 'Mer Rouge', type: 'sea', a: [[1646, 979, 2]] },
  { id: 'MNO', name: 'Mer Noire', type: 'sea', a: [[1244, 940, 2]] },
  { id: 'MMO', name: 'Méditerranée Ouest', type: 'sea', a: [[989, 1045, 2]] },
  { id: 'MME', name: 'Méditerranée Est', type: 'sea', a: [[1248, 1039, 2]] },
  { id: 'MIO', name: 'Mer Ionienne', type: 'sea', a: [[1121, 1065, 2]] },
  { id: 'MDN', name: 'Mer du Nord', type: 'sea', a: [[942, 865, 2]] },
  { id: 'MBA', name: 'Mer Baltique', type: 'sea', a: [[1058, 854, 1]] },
  { id: 'ATO', name: 'Atlantique Ouest', type: 'sea', a: [[410, 891, 4], [300, 820, 2]] },
  { id: 'ATE', name: 'Atlantique Est', type: 'sea', a: [[704, 1000, 4], [780, 1100, 3]] },
  { id: 'MNG', name: 'Mer de Norvège', type: 'sea', a: [[927, 742, 3], [1000, 700, 3]] },
  { id: 'OAR', name: 'Océan Arctique', type: 'sea', a: [[937, 471, 5]] },
  { id: 'BHU', name: 'Baie d\'Hudson', type: 'sea', a: [[601, 566, 2]] },
  { id: 'GME', name: 'Golfe du Mexique', type: 'sea', a: [[213, 534, 2]] },
  { id: 'MCA', name: 'Mer des Caraïbes', type: 'sea', a: [[196, 869, 3]] },
];

// Forces de départ : [type, région, côte?]
const START_UNITS = {
  W: [['A', 'LAn'], ['A', 'NYo'], ['F', 'GBr'], ['A', 'Fra'], ['F', 'Tur'], ['F', 'LAus']],
  E: [['A', 'Vla'], ['A', 'Sha'], ['F', 'Cub'], ['F', 'Len', 'cs'], ['A', 'mos'], ['F', 'Alb']],
};

// Corrections manuelles du voisinage dérivé de la grille.
const ADJ_BAN = [     // paires [a, b] à retirer
  ['GBr', 'Fra'], ['Ibe', 'AfN'], ['Dan', 'Nge'], ['ita', 'Alb'], ['ita', 'You'], ['Ukr', 'Gre'], ['Ukr', 'Alb'],
  ['mos', 'Tur'], ['Ids', 'SVi'], ['Jap', 'CdS'], ['Cub', 'Flo'], ['Cub', 'Col'],
];
const ADJ_ADD = [];   // paires [a, b] à ajouter (terrestre) ou [mer, mer]
