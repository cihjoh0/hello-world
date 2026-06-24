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

export interface AnalysisRequest {
  match: Match;
}
