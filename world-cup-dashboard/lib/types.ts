export interface Team {
  id: number;
  name: string;
  shortName: string;
  crest: string;
}

export interface Score {
  home: number | null;
  away: number | null;
}

export interface Match {
  id: number;
  utcDate: string;
  status: "SCHEDULED" | "LIVE" | "IN_PLAY" | "PAUSED" | "FINISHED" | "TIMED";
  matchday: number;
  stage: string;
  group?: string;
  homeTeam: Team;
  awayTeam: Team;
  score: {
    fullTime: Score;
    halfTime: Score;
  };
}

export interface Standing {
  position: number;
  team: Team;
  playedGames: number;
  won: number;
  draw: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export interface StandingGroup {
  stage: string;
  group: string;
  table: Standing[];
}

// --- Match Events ---

export interface GoalEvent {
  minute: number;
  extraMinute?: number;
  team: "home" | "away";
  scorer: string;
  assist?: string;
  type: "REGULAR" | "PENALTY" | "OWN_GOAL";
}

export interface CardEvent {
  minute: number;
  team: "home" | "away";
  player: string;
  type: "YELLOW" | "YELLOW_RED" | "RED";
}

export interface SubstitutionEvent {
  minute: number;
  team: "home" | "away";
  playerOut: string;
  playerIn: string;
}

// --- Match Stats ---

export interface StatPair {
  home: number;
  away: number;
}

export interface MatchStats {
  matchId: number;
  possession: StatPair;        // percentages
  shots: StatPair;
  shotsOnTarget: StatPair;
  shotsOffTarget: StatPair;
  blockedShots: StatPair;
  corners: StatPair;
  fouls: StatPair;
  yellowCards: StatPair;
  redCards: StatPair;
  offsides: StatPair;
  passes: StatPair;
  passAccuracy: StatPair;      // percentages
  aerialDuelsWon: StatPair;   // percentages
  tackles: StatPair;
  interceptions: StatPair;
  saves: StatPair;
  xG: StatPair;               // expected goals (2 decimal places)
  bigChances: StatPair;
  bigChancesMissed: StatPair;
  goals: GoalEvent[];
  cards: CardEvent[];
  substitutions: SubstitutionEvent[];
}

// --- Head to Head ---

export interface H2HRecord {
  homeWins: number;
  draws: number;
  awayWins: number;
  recentMatches: {
    date: string;
    homeTeam: string;
    awayTeam: string;
    homeScore: number;
    awayScore: number;
  }[];
}

// --- Top Scorers ---

export interface Scorer {
  player: {
    id: number;
    name: string;
    nationality: string;
    position: string;
  };
  team: Team;
  goals: number;
  assists: number;
  penalties: number;
  playedMatches: number;
}
