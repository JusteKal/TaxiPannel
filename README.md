# TaxiPannel

Outil de « pannelisation » pour les panneaux publicitaires sur le toit des taxis
de [Mindcity](https://mindcity-rp.fr/) (LS Taxi).

On dépose des images pour le panneau droite et le panneau gauche, chaque panneau
enchaîne les siennes en fondu croisé, et l'export est un **atlas 2×2 de 512×256**
en GIF animé — la disposition que la ressource in-game attend.

## Ce que ça fait

- Deux panneaux indépendants, N images chacun, réordonnables.
- Fondu croisé linéaire entre images, durée d'affichage et de transition réglables.
- Aperçu animé en direct dans un `<canvas>`, avec lecture / pause / scrub, **avant**
  de générer quoi que ce soit.
- Encodage GIF **côté serveur** (ffmpeg + gifsicle), suivi en temps réel par SSE.
- Déduplication de trames : les images tenues sont fusionnées en une seule trame
  au délai cumulé, ce qui réduit fortement la taille sans toucher au rendu.

Hors périmètre volontairement : pas de comptes, pas de base de données, pas
d'historique. Tout l'état vit en mémoire et expire.

## Stack

- **Monorepo** — bun workspaces, deux paquets, aucun outil d'orchestration.
- **`apps/api`** — Bun + [Hono](https://hono.dev) 4 + Zod. Aucune étape de build :
  le paquet exporte du `.ts` brut, Bun l'exécute directement.
- **`apps/web`** — Vue 3.5 (`<script setup>`) + Vite 6 + vue-router + vue-i18n.
  Pas de Pinia, pas de Tailwind, pas de bibliothèque de composants.
- **Typage traversant** — `hc<AppType>` infère chemins, corps et réponses depuis
  le type de l'app Hono. Aucun codegen, aucun schéma dupliqué.
- **Encodage** — `sharp` pour décoder/redimensionner, composition en JS pur sur
  `Uint8Array`, puis `ffmpeg` (palettegen/paletteuse) et `gifsicle -O3`.
- **Outillage** — Biome 2.5.6 (lint + format + tri des imports, JS/TS/JSON/CSS).

## Arborescence

```
apps/
├── api/                                 @taxipannel/api
│   └── src/
│       ├── index.ts                     entrée Bun, janitors, barrel de types public
│       ├── app.ts                       UNE expression Hono chaînée -> AppType
│       ├── routes/                      valident et délèguent, rien d'autre
│       ├── controllers/                 sans HTTP : (sessionId, input) -> DTO
│       ├── views/                       DTO + point de passage unique des projections
│       ├── models/
│       │   ├── timeline.model.ts        ⭐ PARTAGÉ avec le navigateur, zéro import
│       │   ├── compose.model.ts         fondu RGBA, blits de quadrants, dedup
│       │   ├── encoder.model.ts         trois passes ffmpeg/gifsicle
│       │   ├── image.model.ts           sharp : décodage + redimensionnement
│       │   ├── asset.model.ts           Map<assetId, Asset> + janitor TTL
│       │   ├── job.model.ts             Map<jobId, Job> + file d'attente + janitor
│       │   └── errors.ts                PanelError + union fermée de codes
│       └── middleware/                  session, rate-limit
└── web/                                 @taxipannel/web
    ├── server.ts                        serveur statique de prod (~70 lignes de Bun)
    └── src/
        ├── api/client.ts                hc<AppType>, lecteur SSE, ré-exports de types
        ├── composables/                 stores singleton au scope module
        ├── components/<Nom>/<Nom>.vue   un dossier par composant, CSS colocalisé
        ├── views/BuilderView.vue        la page unique
        ├── i18n/                        fr = référence, en = typé sur elle
        └── styles/                      système mc-*, importé en layer(base)
```

## Développement

```bash
# ffmpeg et gifsicle doivent être installés (gifsicle >= 1.91 pour --lossy)
sudo dnf install ffmpeg-free gifsicle     # Fedora
sudo apt install ffmpeg gifsicle          # Debian / Ubuntu

bun install
bun run dev          # API sur :3000, front sur :5173
```

Le front n'appelle jamais qu'une base relative `/api`. En dev le proxy Vite la
réécrit vers `localhost:3000`, en prod Caddy fait exactement la même chose avec
`handle_path /api/*` — donc même origine partout, pas de CORS, un seul bundle.

`bun run ci` (Biome + typecheck des deux paquets) est le seul garde-fou
automatisé. Il n'y a **pas** de suite de tests ni de test runner.

## API

Toutes les routes exigent l'en-tête `x-session-id` sauf `/health`.

| Méthode | Chemin | Corps | Succès | Erreurs |
|---|---|---|---|---|
| `GET` | `/health` | — | `200 { ok, ffmpeg, gifsicle, assets, total, running, queued }` (503 si un encodeur manque) | — |
| `POST` | `/assets` | `multipart/form-data`, champ `file` | `201 AssetView` | `unsupportedImage`, `imageTooLarge`, `tooManyAssets`, `payloadTooLarge`, `rateLimited` |
| `DELETE` | `/assets/:id` | — | `204` | `assetNotFound` |
| `POST` | `/jobs` | `{ right[], left[], settings, acknowledgeFrames? }` | `202 JobView` | `invalidRequest`, `assetNotFound`, `framesExceeded`, `framesTooMany`, `serverBusy`, `encoderMissing` |
| `GET` | `/jobs/:id` | — | `200 JobView` | `jobNotFound` |
| `GET` | `/jobs/:id/events` | — | `200 text/event-stream` de `JobView` | `jobNotFound` |
| `GET` | `/jobs/:id/result` | — | `200 image/gif` | `jobNotFound`, `jobNotReady`, `jobFailed` |
| `DELETE` | `/jobs/:id` | — | `204` | `jobNotFound` |

### Erreurs

L'API **ne traduit jamais**. Elle renvoie un code stable et des paramètres ; le
client résout `errors.<code>` dans ses propres messages, ce qui fait que les
erreurs affichées suivent un changement de langue en cours de session.

```json
{
  "error": "Frame count above the recommended maximum",
  "code": "framesExceeded",
  "params": { "frames": 864, "max": 600 }
}
```

`framesExceeded` (409) et `framesTooMany` (413) sont deux codes distincts
volontairement : le premier veut dire « demande confirmation à l'utilisateur »
— renvoyer la requête avec `acknowledgeFrames: true` la fait passer — le second
veut dire « non ».

## Réglages, et ce qui a changé

Les six réglages, leurs valeurs par défaut et les maths de boucle sont repris
verbatim de la version d'origine. Deux écarts assumés :

**`Qualité GIF` ne veut plus tout à fait dire la même chose.** Dans `gif.js`
c'était le *sample factor* de NeuQuant : combien de pixels regarder en
construisant la palette. `palettegen` construit une meilleure palette
inconditionnellement, il n'y a donc plus rien à échantillonner. Le bouton est
remappé en « qualité contre taille », **avec 1–10 volontairement plat** pour que
la valeur par défaut (10) produise toujours un fichier 256 couleurs sans perte.
Au-delà de 10, on échange de la fidélité contre des octets.

| Qualité | Couleurs | `--lossy` |
|---|---|---|
| 1–10 (défaut) | 256 | 0 |
| 20 | 200 | 25 |
| 35 | 116 | 62 |
| 50 | 32 | 100 |

**`Ignorer trames similaires` à 0 fonctionne enfin.** L'ancien code faisait
`parseFloat(v) || 2`, donc saisir 0 donnait silencieusement 2 % alors que le
champ annonçait `min="0"`. Un zéro explicite est désormais respecté ; un champ
vidé retombe toujours sur la valeur par défaut.

Le rendu, lui, est inchangé : mêmes maths de fondu, même atlas 2×2, même
dimensions, mêmes délais par trame.

## Déploiement

```bash
cp .env.example .env      # ajuster si besoin
docker compose build
docker compose up -d
```

Puis copier `taxipannel.caddyfile` dans `/etc/caddy/sites/` sur un hôte qui fait
déjà tourner Caddy, et adapter le nom de domaine.

Les deux conteneurs n'écoutent que sur `127.0.0.1`, et c'est structurel : avec
`TRUST_PROXY=true` l'API fait confiance au dernier saut `X-Forwarded-For`, donc
tout ce qui peut l'atteindre directement peut forger sa propre identité de
rate-limiting.

**Un seul replica.** Assets, jobs et résultats vivent dans la mémoire du
processus ; un second replica distribuerait des identifiants que l'autre n'a
jamais vus.

### Points d'attention

- **L'image API pèse ~940 Mo.** La couche `apt` en représente 458, dominée par
  `libllvm19` (127 Mo) et `mesa-libgallium` (42 Mo), que `libavfilter` tire via
  `libplacebo`. Rien de tout cela ne sert au chemin rawvideo → palettegen → gif,
  mais le paquet `ffmpeg` de Debian est monolithique. Pour descendre vers
  ~550 Mo : copier un build statique de ffmpeg depuis une étape builder, au prix
  d'un téléchargement tiers épinglé dans la construction.
- **`sharp` exige la microarchitecture x86-64-v2.** Sur un VPS ancien, l'import
  échoue avec « Unsupported CPU ». La sonde `RUN cd apps/api && bun -e "import('sharp')"`
  du Dockerfile transforme ça en échec de build — mais seulement si le
  constructeur et l'hôte partagent l'architecture, ce qui n'est pas le cas sur
  GitHub Actions.
- **SSE et proxies.** `flush_interval -1` dans le Caddyfile désactive la
  bufferisation. Sans ça, la barre de progression reste à 0 % pendant tout
  l'encodage puis saute à 100 %.

## Licence

Aucun fichier `LICENSE` n'est présent dans le dépôt — à ajouter selon votre choix.

Les icônes sont des tracés [Font Awesome Free 6](https://fontawesome.com/license/free)
(solid), CC BY 4.0. La police Poppins est distribuée sous OFL via Fontsource.
