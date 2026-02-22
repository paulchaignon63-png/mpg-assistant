// Types MPG - basés sur mpg-coach-bot

export interface UserSignIn {
  token: string;
  userId: string;
}

export interface League {
  leagueId: string;
  divisionId: string;
  divisionTotalUsers: number;
  name: string;
  championshipId: string;
  status?: { status: string };
  mode?: { mode: string };
  currentTeamStatus?: number;
  isLive?: boolean;
  isFollowed?: boolean;
  nextRealGameWeekDate?: string;
}

export interface Dashboard {
  leaguesDivisionsItems?: League[];
}

export interface Division {
  usersTeams?: Record<string, string>;
  liveState?: {
    totalGameWeeks: number;
    currentGameWeek: number;
  };
}

export interface MpgPlayer {
  id?: string;
  name?: string;
  position?: string;
  quotation?: number;
  clubId?: string;
  clubName?: string;
  average?: number;
  matchs?: number;
  goals?: number;
}

export interface Team {
  name: string;
  budget: number;
  squad?: Record<string, MpgPlayer[]>;
  bids?: unknown[];
  bonuses?: Record<string, unknown>;
}

export interface Coach {
  matchTeamFormation?: {
    id: string;
    composition: number;
    captain?: string;
    selectedBonus?: unknown;
  };
}

export interface ChampionshipType {
  L1: string;
  L2: string;
  PL: string;
  PD: string;
  SA: string;
}
