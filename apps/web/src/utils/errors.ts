import type { PanelErrorCode, PanelErrorParams } from "../api/client";

export type ErrorCode = PanelErrorCode | "network" | "unknown";

// The API never sends prose, only a stable code and its params — so every
// message the user reads for a failed call is written here, and nowhere else.
const MESSAGES: Record<ErrorCode, (p: PanelErrorParams) => string> = {
  missingSessionId: () => "Session absente. Rechargez la page.",
  invalidRequest: () => "Requête invalide.",
  pinRequired: () => "Accès expiré. Entrez à nouveau le code PIN.",
  invalidPin: () => "Code PIN incorrect.",
  payloadTooLarge: () => "Fichier trop volumineux.",
  rateLimited: (p) => `Trop de requêtes. Réessayez dans ${p.retryAfter} s.`,
  serverBusy: (p) => `Le serveur est saturé (${p.queued} en attente). Réessayez dans un instant.`,
  unsupportedImage: () => "Format d'image non pris en charge.",
  staticImageOnly: (p) =>
    `« ${p.name} » est animé ou au format GIF : seules les images fixes sont acceptées.`,
  imageTooLarge: () => "Image trop volumineuse.",
  tooManyAssets: (p) => `Trop d'images dans cette session (maximum ${p.max}).`,
  assetNotFound: () => "Image introuvable. Elle a peut-être expiré — réimportez-la.",
  emptyPanel: () => "Ajoutez au moins une image dans chaque panneau.",
  framesExceeded: (p) => `${p.frames} trames, au-delà du maximum recommandé de ${p.max}.`,
  framesTooMany: (p) =>
    `${p.frames} trames : au-delà de la limite de ${p.max}. Réduisez la boucle.`,
  budgetExceeded: (p) =>
    `Impossible de descendre sous ${p.budget} : le meilleur essai fait ${p.bytes}. ` +
    "Réduisez l'échelle de sortie ou raccourcissez la boucle.",
  jobNotFound: () => "Génération introuvable.",
  jobNotReady: () => "La génération n'est pas terminée.",
  jobFailed: () => "La génération a échoué.",
  jobCanceled: () => "Génération annulée.",
  encodeFailed: () => "Une erreur est survenue pendant la génération du GIF.",
  encodeTimeout: (p) => `La génération a dépassé ${p.seconds} s et a été interrompue.`,
  encoderMissing: () => "L'encodeur est indisponible sur le serveur.",
  internal: () => "Erreur interne du serveur.",
  network: () => "Connexion au serveur perdue.",
  unknown: () => "Une erreur inattendue est survenue.",
};

export function errorMessage(code: ErrorCode, params?: PanelErrorParams): string {
  // A code the server added and the client has not learned yet still has to say
  // something, rather than render its own identifier at the user.
  return (MESSAGES[code] ?? MESSAGES.unknown)(params ?? {});
}
