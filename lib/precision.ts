/** Précision mesurée d'une journée (pronostics figés avant le match). */
export interface RoundPrecision {
  seasonId: number;
  round: number;
  players: number;
  noteMae: number;
  baselineMae: number;
  startBrier: number;
  baselineBrier: number;
  scoredAt: string;
}
