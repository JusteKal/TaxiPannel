# CLAUDE.md

Le README couvre le produit, la table de l'API et le déploiement. Ce fichier
couvre ce qui n'est **pas** visible en lisant un seul fichier.

## Commandes

```bash
bun install
bun run dev          # API :3000 + front :5173
bun run ci           # Biome + typecheck des deux paquets — le SEUL garde-fou
bun run lint:fix     # applique les corrections Biome
```

Il n'y a pas de suite de tests ni de test runner. `bun run ci` doit passer après
chaque modification. Ne pas ajouter de framework de test sans qu'on le demande.

## La timeline est partagée, et c'est tout le design

`apps/api/src/models/timeline.model.ts` est importé par **le serveur et le
navigateur**. Il contient les maths de boucle, l'état du fondu, la table des
quadrants de l'atlas, le spec des réglages et le mapping qualité.

L'aperçu rejoue exactement la même fonction que l'encodeur. S'ils divergent,
l'utilisateur règle ses curseurs contre un mensonge et le taxi affiche autre
chose que ce qu'il a vu.

Conséquences pratiques :

1. **Le module doit rester sans import et sans effet de bord.** Passer par
   `index.ts` traînerait `hono`, `zod` et surtout `sharp` dans le bundle du SPA.
2. **Le sous-chemin est déclaré deux fois**, et les deux sont nécessaires :
   `exports["./timeline"]` dans `apps/api/package.json` (résolution Vite et Bun)
   et `paths` dans `apps/web/tsconfig.json` (résolution `vue-tsc`). En oublier
   une casse exactement un des deux outils, sans message clair.
3. Toute nouvelle constante que les deux côtés doivent partager va **là**, pas
   dupliquée.

## `ATLAS_QUADRANTS` est un contrat avec le jeu

```
haut-gauche  = droite      haut-droite = gauche
bas-gauche   = gauche      bas-droite  = droite
```

Chaque panneau apparaît deux fois, sur des coins opposés, parce que le toit du
taxi montre le même panneau des deux côtés. **Réordonner ces quatre tuples casse
l'asset in-game.** L'aperçu affiche l'atlas complet par défaut précisément pour
qu'une inversion droite/gauche se voie avant l'export.

## Les sources animées tournent sur l'horloge absolue de la boucle

`composePanelFrame` prend deux temps : `position` (où en est le panneau dans son
propre cycle, ce qui décide quelle image est affichée) et `clock` (le temps
absolu de la boucle, qui décide quelle trame de la source animée est montrée).
Les deux diffèrent dès qu'un panneau a moins d'images que l'autre.

Ancrer la source sur le début de son créneau serait plus intuitif mais faux :
une image commence à apparaître en fondu **avant** que son créneau démarre, donc
sa phase serait négative et elle se figerait sur la trame 0 pendant tout le
fondu. `sourceLoopsCleanly()` sert à signaler l'effet de bord — une source dont
la durée ne divise pas la boucle a une coupure au point de bouclage.

Le décodage GIF côté client (`utils/gif.ts`) doit reproduire la composition que
libvips fait en interne : gifuct rend des **patches** avec offset et mode de
disposal, pas des trames complètes. Les modes 2 (effacer) et 3 (restaurer) sont
gérés explicitement. Se tromper ici fait diverger l'aperçu de l'export, ce que
l'architecture entière cherche à empêcher. Les bitmaps sont créés directement à
la géométrie du panneau, ce qui reproduit le `fit: "fill"` de sharp et borne la
mémoire à 120 trames × 128 Kio.

## Le budget de taille ne touche jamais `scale`

`degradeForBudget()` réessaie jusqu'à quatre fois en dégradant palette, puis
déduplication, puis fps. L'échelle de sortie est exclue : les dimensions de
l'atlas sont un contrat avec le jeu. Quand l'échelle est épuisée, on échoue avec
`budgetExceeded` plutôt que de livrer un asset aux mauvaises dimensions.

Chaque tentative repart des réglages **d'origine**, pas des précédents, pour que
l'échelle reste absolue et qu'un utilisateur ayant déjà demandé une qualité 40
ne soit jamais ramené à 20.

Les tentatives de réduction sont regroupées dans une phase `shrinking` : rejouer
`palette`/`encoding` ferait reculer la barre de progression.

## L'encodage est en deux passes ffmpeg, et ce n'est pas négociable

Le filtergraph mono-passe habituel —
`split[a][b];[a]palettegen[p];[b][p]paletteuse` — semble plus simple mais
`palettegen` n'émet sa palette qu'à EOF. ffmpeg doit donc bufferiser **tout le
flux** dans le `split` : ~314 Mo pour 600 trames, par job, ce qui tombe en OOM
dès qu'il y a de la concurrence.

Les deux passes sont O(1) en nombre de trames. Régénérer les trames pour la
passe B, ce sont des memcpy sur des buffers déjà décodés — quelques dizaines de
millisecondes. La mémoire résidente par job reste à ~2 Mo quelle que soit la
longueur de la boucle. Ne pas « simplifier » ça.

## `skipSimilarity` reste en JS — pas de `mpdecimate`

`vf_mpdecimate` ne déclare que des formats YUV planaires. L'insérer force
swscale à convertir `rgb24 → yuv420p` **au milieu du graphe** : sous-échantillonnage
chroma sur de l'affiche à aplats nets, avant que `palettegen` ne voie un pixel.
C'est une perte de fidélité irrécupérable. Et `mpdecimate` score des blocs 8×8,
donc son `frac` ne voudrait de toute façon pas dire ce que `skipSimilarity` veut
dire.

Les délais variables sont écrits par `gifsicle -d<cs> "#a-b"`, après coup.

## Les délais reportent leur résidu d'arrondi

Le GIF stocke des centisecondes et 12 fps fait 83 ms. Arrondir chaque trame
indépendamment perd ~3 ms par trame, soit une boucle de 21,6 s livrée en 20,7 s.
`toCentiseconds()` dérive chaque délai du total idéal courant : la boucle tombe
juste, et aucune trame ne bouge de plus d'une centiseconde.

## La chaîne `hc<AppType>`

`app.ts` et les deux `*.routes.ts` sont chacun **une seule expression chaînée**.
`hc<AppType>` infère tous les chemins, corps et réponses depuis `typeof app`.
Couper la chaîne en instructions séparées effondre l'inférence — silencieusement,
sans erreur nulle part.

La route SSE est l'endroit le plus probable où quelqu'un cassera ça, parce que
`streamSSE` renvoie un type de réponse différent. Après y avoir touché, vérifier
que `hc` résout encore.

`hc` ne modélise que les réponses de succès : sur un `DELETE` typé `204`,
comparer `res.status` à 404 est une erreur de type alors que le serveur renvoie
bien des 404. D'où les `res.status as number` dans `client.ts`.

## Discipline de réactivité Vue

Les galeries sont des `shallowRef` et **chaque mutation réassigne le tableau**.
L'aperçu les lit à chaque frame d'animation ; faire du deep-tracking sur N
vignettes à 60 fps est du gaspillage pur.

Tout `ImageBitmap`, tout `<canvas>` et tout contexte 2D est `markRaw` à la
création. Un canvas derrière un Proxy n'est pas une `CanvasImageSource` valide et
`drawImage()` lève dessus.

## Cycle de vie des ressources

Chaque acquisition a exactement une libération, et elles vivent au même endroit :
`useGalleries.ts` pour les vignettes (`revokeObjectURL` + `bitmap.close()`),
`useEncodeJob.ts` pour le GIF résultat. Le lien de téléchargement réutilise
l'object URL de la balise `<img>` plutôt que d'en forger un troisième —
c'était le troisième site de fuite de la version d'origine.

Le point de sortie unique est le handler `pagehide` de `App.vue` (`pagehide` et
pas `beforeunload` : ce dernier ne se déclenche jamais sur Safari mobile).

## i18n : le français est la référence

Incognito fait l'inverse. Ici `fr.ts` exporte `MessageSchema = typeof fr` et
`en.ts` est typé dessus, donc une clé ajoutée en français et oubliée en anglais
fait **échouer `bun run typecheck`**. Pas de `as const` sur `fr` : le schéma doit
contraindre la forme, pas les chaînes.

`tk(key, named)` est l'échappatoire pour les composables, qui n'ont pas de
contexte `useI18n()`.

## Un seul replica

Assets, jobs et résultats vivent dans des `Map` en mémoire. Deux replicas
distribueraient des identifiants que l'autre n'a jamais vus. Les janitors
(`setInterval` toutes les 5 min, avec `timer.unref?.()` pour ne pas retenir le
processus) balaient sur TTL.

## Conventions

**Commentaires.** Le code se lit tout seul. Ne pas commenter ce que le code dit
déjà. Un commentaire sert à l'inattendu : une contrainte invisible depuis le
code, un comportement de bibliothèque qui surprend, un littéral opaque, la raison
d'un `catch {}` vide. Pas de JSDoc qui répète une signature, pas de bandeaux de
section, pas de narration de la ligne suivante. Si un commentaire est nécessaire
pour expliquer *ce que* fait le code, renommer ou découper à la place.

Chaque fichier de configuration s'ouvre sur un commentaire qui dit **pourquoi il
a cette forme et ce qui casse si on la change** — pas ce qu'il fait.

**Nommage.** Les fichiers de l'API portent leur couche en suffixe
(`job.routes.ts`, `job.controller.ts`, `job.view.ts`, `encoder.model.ts`) ; les
middlewares non (`session.ts`, `rate-limit.ts`). Les composants Vue : un dossier
PascalCase, `Nom.vue` + `Nom.css` colocalisé, y compris quand le CSS serait vide.
Composables en `use*.ts`. Clés de stockage préfixées `taxipannel:`.

**CSS.** Les primitives partagées vont dans `styles/`, importées en `layer(base)`.
Une règle rejoint `styles/` au moment où un **second** composant en a besoin —
d'ici là elle reste dans le CSS du composant (`.mc-topnav` par exemple). Les
media queries vivent en bas du fichier qui possède le sélecteur, jamais dans un
bloc commun. Jamais de `scoped`, toujours `<style src="./Nom.css">`.

## Pièges de l'environnement

Le linker isolé de bun place les dépendances de workspace dans
`apps/<pkg>/node_modules`, pas à la racine. Un `bun -e "import('sharp')"` lancé
depuis `/app` échoue ; depuis `apps/api` il passe. La résolution à l'exécution
part du fichier importateur, donc l'application n'est pas concernée — seuls les
scripts one-shot le sont.
