# Diplomacy — Guerre froide

Jeu de Diplomacy à deux joueurs (Ouest contre Est) sur une carte du monde vue du pôle Nord.
Site statique, aucune installation : ouvrez `index.html` (ou servez le dossier, par ex. `python3 -m http.server`).

## Jouer
- **Même écran** : les deux joueurs partagent l'appareil, un écran de passage cache les ordres.
- **À distance** : chacun sur son appareil. À chaque phase, vous validez vos ordres, envoyez votre code à l'autre
  (message, mail…) et collez le sien pour résoudre le tour. Les deux parties doivent être lancées en mode « À distance »
  avec des camps opposés.
- Victoire : plus de la moitié des centres de ravitaillement.
- Règles complètes dans le bouton « Règles » du site : soutiens, coupures, convois (chaînes de flottes),
  échanges, rotations, retraites, ajustements d'hiver. Moteur : `js/engine.js` (algorithme de Kruijswijk).

## Publier (GitHub Pages)
Réglages du dépôt → Pages → branche `main`, dossier `/ (root)`.

## Carte
La carte est une version simplifiée de la carte « Guerre froide » d'origine : mêmes régions, mêmes centres et comptoirs,
formes et voisinages recalculés à partir d'une grille.
- `js/maskdata.js` : grille terre/mer (10 px par cellule).
- `js/mapdef.js` : régions (ancrages), centres, comptoirs (côtes), unités de départ, corrections de voisinage (`ADJ_BAN`, `ADJ_ADD`).
- `js/mapgen.js` : découpage en régions, voisinages et contours lissés.

Interprétations à vérifier : un comptoir (hexagone) est traité comme une **côte distincte** d'une province à plusieurs côtes ;
les cases grises sont infranchissables ; positions de départ et centres d'origine déduits de l'image.

## Tests
`tests/engine.test.js` (cas classiques d'arbitrage), exécutable avec n'importe quel moteur JS, par ex. `jsc tests/engine.test.js`.
