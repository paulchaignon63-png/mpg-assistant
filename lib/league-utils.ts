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
  // #region agent log
  const logPayload = (result: LeagueStatus, reason: string) => {
    if (typeof fetch !== "undefined") {
      fetch('http://127.0.0.1:7244/ingest/6ee8e683-6091-464b-9212-cd2f05a911be',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'league-utils.ts:getLeagueStatus',message:'getLeagueStatus',data:{leagueName:league.name,rawStatus:league.status,rawMode:league.mode,teamId:!!league.teamId,finishedState:!!league.finishedState,result,reason},timestamp:Date.now(),hypothesisId:'post-fix'})}).catch(()=>{});
    }
  };
  // #endregion

  const rawStatus = league.status;
  const rawMode = league.mode;

  // L'API MPG envoie status/mode en NUMÉRIQUES (ex: 1, 3, 5). status 3 ou 5 = terminé.
  const statusNum = typeof rawStatus === "number" ? rawStatus : undefined;
  const modeNum = typeof rawMode === "number" ? rawMode : undefined;

  // finishedState présent et truthy = ligue archivée
  const hasFinishedState = league.finishedState != null && league.finishedState !== false;

  const isFinished =
    hasFinishedState ||
    (statusNum != null && FINISHED_STATUS_CODES.includes(statusNum));

  if (isFinished) {
    logPayload("finished", hasFinishedState ? "finishedState" : `status=${statusNum}`);
    return "finished";
  }
  if (!league.teamId) {
    logPayload("mercato", "no teamId");
    return "mercato";
  }
  logPayload("active", `status=${statusNum} mode=${modeNum}`);
  return "active";
}
