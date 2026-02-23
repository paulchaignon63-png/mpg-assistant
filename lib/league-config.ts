/**
 * Configuration des championnats - mapping vers Transfermarkt, filtres news/RSS
 * championshipId vient de MPG (1=L1, 2=PL, 3=Liga, 4=L2, 5=Serie A, 6=UCL, 7=Ligue Super)
 */

export interface LeagueConfig {
  /** Code Transfermarkt (FR1, GB1, ES1, IT1, L1, CL, etc.) */
  tmLeague: string;
  /** Mots-clés pour filtrer les news (titre + description) */
  keywords: string[];
  /** Noms de clubs pour contextualisation (match partiel OK) */
  clubNames: string[];
  /** IDs des flux RSS à inclure (rmc_ligue1, bbc_pl, etc.) - vide = tous */
  rssFeedIds?: string[];
}

const CHAMPIONSHIP_TO_CONFIG: Record<string, LeagueConfig> = {
  "1": {
    tmLeague: "FR1",
    keywords: ["ligue 1", "ligue-1", "l1 ", " l1", "ligue1", "domino ligue 2", "domino league 2"],
    clubNames: [
      "PSG", "Paris", "Paris SG", "Lens", "Lyon", "Marseille", "Lille", "Rennes", "Stade Rennais",
      "Strasbourg", "Strasbourg Alsace", "Monaco", "Lorient", "Toulouse", "Brest", "Stade Brestois",
      "Angers", "Angers SCO", "Le Havre", "Nice", "Paris FC", "Auxerre", "AJ Auxerre", "Nantes",
      "FC Nantes", "Metz", "FC Metz",
    ],
    rssFeedIds: ["rmc_ligue1", "rmc_football", "rmc_mercato", "rmc_general"],
  },
  LIGUE_1: {
    tmLeague: "FR1",
    keywords: ["ligue 1", "ligue-1", "l1 ", " l1", "ligue1"],
    clubNames: [
      "PSG", "Paris", "Lens", "Lyon", "Marseille", "Lille", "Rennes", "Strasbourg", "Monaco",
      "Lorient", "Toulouse", "Brest", "Angers", "Le Havre", "Nice", "Paris FC", "Auxerre", "Nantes", "Metz",
    ],
    rssFeedIds: ["rmc_ligue1", "rmc_football", "rmc_mercato", "rmc_general"],
  },
  "2": {
    tmLeague: "GB1",
    keywords: ["premier league", "premier-league", "pl ", " pl", "epl", "english premier"],
    clubNames: [
      "Arsenal", "Chelsea", "Liverpool", "Manchester United", "Manchester City", "Tottenham",
      "Spurs", "Newcastle", "West Ham", "Aston Villa", "Brighton", "Bournemouth", "Crystal Palace",
      "Everton", "Fulham", "Nottingham Forest", "Wolves", "Wolverhampton", "Brentford", "Leicester",
      "Ipswich", "Southampton",
    ],
    rssFeedIds: ["bbc_pl", "bbc_football"],
  },
  PREMIER_LEAGUE: {
    tmLeague: "GB1",
    keywords: ["premier league", "premier-league", "pl "],
    clubNames: ["Arsenal", "Chelsea", "Liverpool", "Manchester", "Tottenham", "Newcastle", "West Ham", "Aston Villa"],
    rssFeedIds: ["bbc_pl", "bbc_football"],
  },
  "3": {
    tmLeague: "ES1",
    keywords: ["la liga", "liga ", "primera división", "primera division", "espagne", "spain"],
    clubNames: [
      "Real Madrid", "Barcelona", "Atletico", "Atlético", "Sevilla", "Real Sociedad", "Villarreal",
      "Betis", "Athletic", "Bilbao", "Valencia", "Getafe", "Girona", "Mallorca", "Rayo Vallecano",
      "Celta", "Osasuna", "Alaves", "Las Palmas", "Cadiz", "Valladolid", "Espanyol",
    ],
    rssFeedIds: ["bbc_football", "rmc_general"],
  },
  LIGA: {
    tmLeague: "ES1",
    keywords: ["la liga", "liga ", "primera"],
    clubNames: ["Real Madrid", "Barcelona", "Atletico", "Sevilla", "Real Sociedad", "Villarreal", "Betis"],
    rssFeedIds: ["bbc_football", "rmc_general"],
  },
  "4": {
    tmLeague: "FR2",
    keywords: ["ligue 2", "ligue-2", "l2 ", " l2"],
    clubNames: [
      "Bordeaux", "Saint-Étienne", "Auxerre", "Caen", "Grenoble", "Laval", "Paris FC",
      "Rodez", "Troyes", "Amiens", "Bastia", "Concarneau", "Dunkerque", "Quevilly", "Valenciennes",
      "Angers", "Guingamp", "Pau", "Annecy",
    ],
    rssFeedIds: ["rmc_football", "rmc_general"],
  },
  LIGUE_2: {
    tmLeague: "FR2",
    keywords: ["ligue 2", "ligue-2", "l2 "],
    clubNames: ["Bordeaux", "Saint-Étienne", "Auxerre", "Caen", "Grenoble", "Laval"],
    rssFeedIds: ["rmc_football", "rmc_general"],
  },
  "5": {
    tmLeague: "IT1",
    keywords: ["serie a", "serie-a", "calcio", "italie", "italy"],
    clubNames: [
      "Inter", "Milan", "Juventus", "Juve", "Napoli", "Roma", "Lazio", "Atalanta", "Fiorentina",
      "Bologna", "Torino", "Udinese", "Sassuolo", "Empoli", "Monza", "Frosinone", "Genoa",
      "Cagliari", "Lecce", "Salernitana", "Verona",
    ],
    rssFeedIds: ["bbc_football", "rmc_general"],
  },
  SERIE_A: {
    tmLeague: "IT1",
    keywords: ["serie a", "serie-a", "calcio"],
    clubNames: ["Inter", "Milan", "Juventus", "Napoli", "Roma", "Lazio", "Atalanta"],
    rssFeedIds: ["bbc_football", "rmc_general"],
  },
  "6": {
    tmLeague: "CL",
    keywords: ["ligue des champions", "champions league", "uefa", "l.d.c"],
    clubNames: [],
    rssFeedIds: ["bbc_football", "rmc_football", "rmc_general"],
  },
  CHAMPIONS_LEAGUE: {
    tmLeague: "CL",
    keywords: ["champions league", "ligue des champions"],
    clubNames: [],
    rssFeedIds: ["bbc_football", "rmc_football"],
  },
  "7": {
    tmLeague: "TR1",
    keywords: ["ligue super", "super lig", "turquie", "turkey"],
    clubNames: ["Galatasaray", "Fenerbahce", "Besiktas", "Trabzonspor"],
    rssFeedIds: ["bbc_football", "rmc_general"],
  },
  LIGUE_SUPER: {
    tmLeague: "TR1",
    keywords: ["super lig", "turquie"],
    clubNames: ["Galatasaray", "Fenerbahce", "Besiktas"],
    rssFeedIds: ["bbc_football", "rmc_general"],
  },
};

/** Config par défaut (Ligue 1) si championnat inconnu */
const DEFAULT_CONFIG: LeagueConfig = CHAMPIONSHIP_TO_CONFIG["1"]!;

export function getLeagueConfig(championshipId: number | string | undefined): LeagueConfig {
  if (championshipId == null || championshipId === "") return DEFAULT_CONFIG;
  const key = String(championshipId).trim();
  return CHAMPIONSHIP_TO_CONFIG[key] ?? DEFAULT_CONFIG;
}

export function newsMatchesLeague(text: string, config: LeagueConfig): boolean {
  const lower = text.toLowerCase();
  return config.keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

export function extractClubMentions(text: string, config: LeagueConfig): string[] {
  const found: string[] = [];
  const lower = text.toLowerCase();
  for (const club of config.clubNames) {
    if (club.length < 3) continue;
    if (lower.includes(club.toLowerCase())) {
      found.push(club);
    }
  }
  return found;
}
