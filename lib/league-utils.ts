import type { LeagueStatus } from "@/components/StatusBadge";

/**
 * Détermine le statut d'une ligue à partir des données API.
 * - finished : status/mode contient une indication de fin
 * - mercato : pas de teamId (équipe non disponible)
 * - active : teamId présent et ligue non terminée
 */
/** MPG API: status 3 ou 5 = ligue terminée (codes numériques) */
const FINISHED_STATUS_CODES = [3, 5];

export function getLeagueStatus(league: {
  name?: string;
  teamId?: string;
  status?: unknown;
  mode?: unknown;
  finishedState?: unknown;
}): LeagueStatus {

  const rawStatus = league.status;

  // L'API MPG envoie status/mode en NUMÉRIQUES (ex: 1, 3, 5). status 3 ou 5 = terminé.
  const statusNum = typeof rawStatus === "number" ? rawStatus : undefined;

  // finishedState présent et truthy = ligue archivée
  const hasFinishedState = league.finishedState != null && league.finishedState !== false;

  const isFinished =
    hasFinishedState ||
    (statusNum != null && FINISHED_STATUS_CODES.includes(statusNum));

  if (isFinished) return "finished";
  if (!league.teamId) return "mercato";
  return "active";
}
