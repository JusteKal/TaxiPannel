// French is the product language, so French is the reference schema. Incognito
// has this the other way round (English reference) because English is
// authoritative there; the guarantee is the same, only mirrored — a key added
// here and forgotten in en.ts fails `bun run typecheck`.
export const fr = {
  app: {
    title: "Pannelisation Taxi",
    tagline: "Panneaux publicitaires · LS Taxi",
  },
  panel: {
    right: "Panneau droite",
    left: "Panneau gauche",
    count: "{n} image | {n} images",
  },
  upload: {
    hint: "Glissez vos images ici ou cliquez pour parcourir",
    drop: "Déposez pour ajouter",
    tooBig: "« {name} » dépasse {max}.",
    notAnImage: "« {name} » n'est pas une image.",
    state: {
      uploading: "Envoi…",
      failed: "Échec",
    },
  },
  gallery: {
    up: "Monter",
    down: "Descendre",
    remove: "Retirer",
    emptyTitle: "Aucune image",
    emptyText: "Ajoutez au moins une image pour ce panneau.",
  },
  settings: {
    title: "Paramètres d'animation",
    displayDuration: "Durée d'affichage (s)",
    transitionDuration: "Durée de transition (s)",
    fps: "Fluidité (images/s)",
    scale: "Échelle sortie",
    gifQuality: "Qualité GIF (1 = max qualité)",
    skipSimilarity: "Ignorer trames similaires (%)",
    fpsOption: {
      light: "{n} (léger)",
      plain: "{n}",
      recommended: "{n} (recommandé)",
      heavy: "{n} (lourd)",
    },
    scaleOption: {
      native: "100 % (native)",
      p75: "75 %",
      p50: "50 % (plus petit)",
      p25: "25 % (très petit)",
    },
    qualityLossless: "{colors} couleurs · sans perte",
    qualityLossy: "{colors} couleurs · compression avec perte {lossy} %",
    estimate: "Boucle complète : {seconds} s · {frames} images générées avant export",
    estimateEmpty: "Ajoutez des images dans les deux panneaux pour voir une estimation.",
    sizeHint: "Sortie {width}×{height}",
  },
  preview: {
    title: "Aperçu",
    empty: "Ajoutez des images dans les deux panneaux pour lancer l'aperçu.",
    play: "Lecture",
    pause: "Pause",
    scrub: "Position dans la boucle",
    alt: "Aperçu animé de l'atlas 2×2",
    viewAtlas: "Atlas",
    hintAtlas:
      "Chaque panneau apparaît deux fois, en diagonale — c'est la disposition attendue par le jeu.",
  },
  result: {
    title: "Résultat",
    empty: "Aucun résultat pour le moment.",
    download: "Télécharger",
    cancel: "Annuler",
    alt: "Animation pannelisée",
    frames: "{kept} trames sur {total}",
    phase: {
      queued: "En file d'attente…",
      decoding: "Préparation des images…",
      palette: "Analyse des couleurs…",
      encoding: "Encodage du GIF…",
      optimizing: "Optimisation…",
      settled: "Terminé",
    },
  },
  actions: {
    generate: "Générer le GIF",
    generating: "Génération…",
  },
  dialog: {
    framesTitle: "Beaucoup de trames à générer",
    framesBody:
      "Cette configuration produit {frames} trames (recommandé : {max} au maximum). La génération sera longue et le fichier lourd.",
    framesTip:
      "Astuce : mettez le même nombre d'images des deux côtés pour raccourcir fortement la boucle.",
    framesConfirm: "Générer quand même",
    cancel: "Annuler",
  },
  locale: {
    fr: "FR",
    en: "EN",
    switch: "Changer de langue",
  },
  errors: {
    missingSessionId: "Session absente. Rechargez la page.",
    invalidRequest: "Requête invalide.",
    payloadTooLarge: "Fichier trop volumineux.",
    rateLimited: "Trop de requêtes. Réessayez dans {retryAfter} s.",
    serverBusy: "Le serveur est saturé ({queued} en attente). Réessayez dans un instant.",
    unsupportedImage: "Format d'image non pris en charge.",
    imageTooLarge: "Image trop volumineuse.",
    tooManyAssets: "Trop d'images dans cette session (maximum {max}).",
    assetNotFound: "Image introuvable. Elle a peut-être expiré — réimportez-la.",
    emptyPanel: "Ajoutez au moins une image dans chaque panneau.",
    framesExceeded: "{frames} trames, au-delà du maximum recommandé de {max}.",
    framesTooMany: "{frames} trames : au-delà de la limite de {max}. Réduisez la boucle.",
    jobNotFound: "Génération introuvable.",
    jobNotReady: "La génération n'est pas terminée.",
    jobFailed: "La génération a échoué.",
    jobCanceled: "Génération annulée.",
    encodeFailed: "Une erreur est survenue pendant la génération du GIF.",
    encodeTimeout: "La génération a dépassé {seconds} s et a été interrompue.",
    encoderMissing: "L'encodeur est indisponible sur le serveur.",
    internal: "Erreur interne du serveur.",
    network: "Connexion au serveur perdue.",
    unknown: "Une erreur inattendue est survenue.",
  },
};

// No `as const`: the schema must constrain the SHAPE, not the strings. With
// literal types every English message would have to equal its French original.
export type MessageSchema = typeof fr;
