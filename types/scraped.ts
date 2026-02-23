/**
 * Types pour les données scrappées
 * Utilisées pour enrichir le pool MPG (blessures, transferts, forme, news)
 */

export type ScrapeSource =
  | "lequipe"
  | "transfermarkt"
  | "flashscore"
  | "sofascore"
  | "eurosport"
  | "rss_foot";

/** Une news/blessure/absence détectée par scraping */
export interface ScrapedNewsItem {
  source: ScrapeSource;
  /** Titre ou résumé */
  title: string;
  /** Extrait ou contenu */
  excerpt?: string;
  /** URL source */
  url?: string;
  /** Date de publication (ISO ou timestamp) */
  publishedAt?: string;
  /** Joueurs potentiellement concernés (noms normalisés) */
  playerNames?: string[];
  /** Clubs concernés */
  clubNames?: string[];
  /** Type: blessure, suspension, transfert, forme, autre */
  type: "injury" | "suspension" | "transfer" | "form" | "lineup" | "other";
  /** Niveau de confiance 0-1 (pour le matching) */
  confidence?: number;
}

/** Info de transfert */
export interface ScrapedTransfer {
  source: ScrapeSource;
  playerName: string;
  playerId?: string;
  fromClub?: string;
  toClub?: string;
  type?: "loan" | "free" | "purchase";
  date?: string;
  fee?: string;
  marketValue?: string;
  position?: string;
  age?: number;
  nationality?: string;
  url?: string;
}

/** Info de suspension (carton rouge, accumulation jaunes) */
export interface ScrapedSuspension {
  source: ScrapeSource;
  playerName: string;
  playerId?: string;
  clubName?: string;
  reason?: string;
  returnDate?: string;
  url?: string;
}

/** Info de blessure/absence (complément API-Football) */
export interface ScrapedInjury {
  source: ScrapeSource;
  playerName: string;
  /** ID Transfermarkt pour matching fiable */
  playerId?: string;
  clubName?: string;
  reason?: string;
  returnDate?: string;
  /** Date de début de la blessure */
  injurySince?: string;
  status: "out" | "doubtful";
  /** Position du joueur (gardien, défenseur, milieu, attaquant) */
  position?: string;
  age?: number;
  nationality?: string;
  marketValue?: string;
  url?: string;
}

/** Agrégat de toutes les données scrappées */
export interface ScrapedDataAggregate {
  news: ScrapedNewsItem[];
  injuries: ScrapedInjury[];
  transfers: ScrapedTransfer[];
  /** Suspensions (cartons rouges, accumulation jaunes) */
  suspensions?: ScrapedSuspension[];
  /** Date du dernier scrape */
  scrapedAt: string;
  /** Sources qui ont répondu */
  sourcesOk: ScrapeSource[];
  /** Sources en erreur */
  sourcesFailed: ScrapeSource[];
}
