# Diplomacy — Guerre froide

Jeu de Diplomacy à deux joueurs (Ouest contre Est) sur une carte du monde vue du pôle Nord.
Site statique, aucune installation : ouvrez `index.html` (ou servez le dossier, par ex. `python3 -m http.server`).

## Jouer
- **En ligne** : vous créez une partie, choisissez votre camp et envoyez le lien à votre ami (il prend l'autre camp).
  Chacun valide ses ordres de son côté ; le tour se résout tout seul dès que les deux ont validé, même si vous
  n'êtes pas connectés en même temps. La partie est stockée dans Supabase (`supabase/schema.sql`, fonctions `dip_*`).
- **Même écran** : les deux joueurs partagent l'appareil, un écran de passage cache les ordres.
- Victoire : plus de la moitié des centres de ravitaillement.
- Règles complètes dans le bouton « Règles » du site : soutiens, coupures, convois (chaînes de flottes),
  échanges, rotations, retraites, ajustements d'hiver. Moteur : `js/engine.js` (algorithme de Kruijswijk).

Limites du mode en ligne : toute personne qui a le lien de la partie peut y jouer, et les ordres déjà validés
par un joueur sont techniquement lisibles par l'autre via l'API avant qu'il valide les siens.

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
