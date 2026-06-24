import { Match, MatchStats, Scorer, StandingGroup } from "./types";

const BASE_URL = "https://api.football-data.org/v4";
const COMPETITION = "WC";

async function fetchFromAPI(path: string) {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) return null;

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "X-Auth-Token": apiKey },
  });

  if (!res.ok) return null;
  return res.json();
}

export async function getMatches(): Promise<Match[]> {
  const data = await fetchFromAPI(`/competitions/${COMPETITION}/matches`);
  if (data) return data.matches ?? [];
  return getMockMatches();
}

export async function getStandings(): Promise<StandingGroup[]> {
  const data = await fetchFromAPI(`/competitions/${COMPETITION}/standings`);
  if (data) return data.standings ?? [];
  return getMockStandings();
}

export async function getMatchStats(matchId: number): Promise<MatchStats | null> {
  const data = await fetchFromAPI(`/matches/${matchId}`);
  if (data?.statistics) {
    return normalizeAPIStats(matchId, data);
  }
  return getMockStats(matchId);
}

export async function getTopScorers(): Promise<Scorer[]> {
  const data = await fetchFromAPI(`/competitions/${COMPETITION}/scorers?limit=20`);
  if (data) return data.scorers ?? [];
  return getMockScorers();
}

function normalizeAPIStats(matchId: number, data: Record<string, unknown>): MatchStats {
  const stats = data.statistics as Record<string, { home: number; away: number }>;
  const goals = (data.goals as { minute: number; extraTime?: number; team: { id: number }; scorer: { name: string }; assist?: { name: string }; type: string }[]) ?? [];
  const cards = (data.bookings as { minute: number; team: { id: number }; player: { name: string }; card: string }[]) ?? [];
  const subs = (data.substitutions as { minute: number; team: { id: number }; playerOut: { name: string }; playerIn: { name: string } }[]) ?? [];
  const homeId = (data.homeTeam as { id: number }).id;

  return {
    matchId,
    possession: stats.ball_possession ?? { home: 50, away: 50 },
    shots: stats.total_shots ?? { home: 0, away: 0 },
    shotsOnTarget: stats.shots_on_goal ?? { home: 0, away: 0 },
    shotsOffTarget: stats.shots_off_goal ?? { home: 0, away: 0 },
    blockedShots: stats.blocked_shots ?? { home: 0, away: 0 },
    corners: stats.corner_kicks ?? { home: 0, away: 0 },
    fouls: stats.fouls ?? { home: 0, away: 0 },
    yellowCards: stats.yellow_cards ?? { home: 0, away: 0 },
    redCards: stats.red_cards ?? { home: 0, away: 0 },
    offsides: stats.offsides ?? { home: 0, away: 0 },
    passes: stats.passes ?? { home: 0, away: 0 },
    passAccuracy: stats.passes_percentage ?? { home: 0, away: 0 },
    aerialDuelsWon: stats.aerial_duels_won ?? { home: 50, away: 50 },
    tackles: stats.tackles ?? { home: 0, away: 0 },
    interceptions: stats.interceptions ?? { home: 0, away: 0 },
    saves: stats.goalkeeper_saves ?? { home: 0, away: 0 },
    xG: stats.expected_goals ?? { home: 0, away: 0 },
    bigChances: stats.big_chances ?? { home: 0, away: 0 },
    bigChancesMissed: stats.big_chances_missed ?? { home: 0, away: 0 },
    goals: goals.map((g) => ({
      minute: g.minute,
      extraMinute: g.extraTime,
      team: g.team.id === homeId ? "home" : "away",
      scorer: g.scorer.name,
      assist: g.assist?.name,
      type: g.type === "Penalty" ? "PENALTY" : g.type === "Own Goal" ? "OWN_GOAL" : "REGULAR",
    })),
    cards: cards.map((c) => ({
      minute: c.minute,
      team: c.team.id === homeId ? "home" : "away",
      player: c.player.name,
      type: c.card === "RED CARD" ? "RED" : c.card === "YELLOW RED CARD" ? "YELLOW_RED" : "YELLOW",
    })),
    substitutions: subs.map((s) => ({
      minute: s.minute,
      team: s.team.id === homeId ? "home" : "away",
      playerOut: s.playerOut.name,
      playerIn: s.playerIn.name,
    })),
  };
}

// ─── Mock data (used when no API key is set) ────────────────────────────────

function getMockMatches(): Match[] {
  return [
    {
      id: 1,
      utcDate: "2026-06-23T18:00:00Z",
      status: "FINISHED",
      matchday: 1,
      stage: "GROUP_STAGE",
      group: "Group A",
      homeTeam: { id: 9, name: "France", shortName: "FRA", crest: "🇫🇷" },
      awayTeam: { id: 10, name: "Germany", shortName: "GER", crest: "🇩🇪" },
      score: { fullTime: { home: 2, away: 1 }, halfTime: { home: 1, away: 0 } },
    },
    {
      id: 2,
      utcDate: "2026-06-24T21:00:00Z",
      status: "LIVE",
      matchday: 1,
      stage: "GROUP_STAGE",
      group: "Group B",
      homeTeam: { id: 11, name: "Brazil", shortName: "BRA", crest: "🇧🇷" },
      awayTeam: { id: 12, name: "Argentina", shortName: "ARG", crest: "🇦🇷" },
      score: { fullTime: { home: 1, away: 1 }, halfTime: { home: 0, away: 1 } },
    },
    {
      id: 3,
      utcDate: "2026-06-24T18:00:00Z",
      status: "FINISHED",
      matchday: 1,
      stage: "GROUP_STAGE",
      group: "Group C",
      homeTeam: { id: 13, name: "Spain", shortName: "ESP", crest: "🇪🇸" },
      awayTeam: { id: 14, name: "Portugal", shortName: "POR", crest: "🇵🇹" },
      score: { fullTime: { home: 3, away: 2 }, halfTime: { home: 2, away: 1 } },
    },
    {
      id: 4,
      utcDate: "2026-06-25T15:00:00Z",
      status: "SCHEDULED",
      matchday: 1,
      stage: "GROUP_STAGE",
      group: "Group D",
      homeTeam: { id: 15, name: "England", shortName: "ENG", crest: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
      awayTeam: { id: 16, name: "USA", shortName: "USA", crest: "🇺🇸" },
      score: { fullTime: { home: null, away: null }, halfTime: { home: null, away: null } },
    },
    {
      id: 5,
      utcDate: "2026-06-25T21:00:00Z",
      status: "SCHEDULED",
      matchday: 1,
      stage: "GROUP_STAGE",
      group: "Group E",
      homeTeam: { id: 17, name: "Netherlands", shortName: "NED", crest: "🇳🇱" },
      awayTeam: { id: 18, name: "Italy", shortName: "ITA", crest: "🇮🇹" },
      score: { fullTime: { home: null, away: null }, halfTime: { home: null, away: null } },
    },
    {
      id: 6,
      utcDate: "2026-06-26T18:00:00Z",
      status: "SCHEDULED",
      matchday: 2,
      stage: "GROUP_STAGE",
      group: "Group A",
      homeTeam: { id: 9, name: "France", shortName: "FRA", crest: "🇫🇷" },
      awayTeam: { id: 19, name: "Morocco", shortName: "MAR", crest: "🇲🇦" },
      score: { fullTime: { home: null, away: null }, halfTime: { home: null, away: null } },
    },
  ];
}

function getMockStats(matchId: number): MatchStats | null {
  const statsMap: Record<number, MatchStats> = {
    1: {
      matchId: 1,
      possession: { home: 58, away: 42 },
      shots: { home: 16, away: 10 },
      shotsOnTarget: { home: 7, away: 4 },
      shotsOffTarget: { home: 6, away: 5 },
      blockedShots: { home: 3, away: 1 },
      corners: { home: 8, away: 3 },
      fouls: { home: 11, away: 14 },
      yellowCards: { home: 1, away: 2 },
      redCards: { home: 0, away: 0 },
      offsides: { home: 2, away: 1 },
      passes: { home: 612, away: 438 },
      passAccuracy: { home: 88, away: 81 },
      aerialDuelsWon: { home: 54, away: 46 },
      tackles: { home: 18, away: 23 },
      interceptions: { home: 9, away: 12 },
      saves: { home: 3, away: 5 },
      xG: { home: 2.1, away: 0.9 },
      bigChances: { home: 4, away: 2 },
      bigChancesMissed: { home: 2, away: 2 },
      goals: [
        { minute: 23, team: "home", scorer: "K. Mbappé", assist: "A. Griezmann", type: "REGULAR" },
        { minute: 61, team: "away", scorer: "K. Havertz", type: "REGULAR" },
        { minute: 78, team: "home", scorer: "O. Giroud", assist: "K. Mbappé", type: "REGULAR" },
      ],
      cards: [
        { minute: 34, team: "home", player: "A. Tchouaméni", type: "YELLOW" },
        { minute: 55, team: "away", player: "L. Goretzka", type: "YELLOW" },
        { minute: 82, team: "away", player: "A. Rüdiger", type: "YELLOW" },
      ],
      substitutions: [
        { minute: 65, team: "home", playerOut: "O. Dembélé", playerIn: "K. Thuram" },
        { minute: 71, team: "away", playerOut: "T. Müller", playerIn: "L. Nmecha" },
      ],
    },
    2: {
      matchId: 2,
      possession: { home: 52, away: 48 },
      shots: { home: 13, away: 11 },
      shotsOnTarget: { home: 5, away: 5 },
      shotsOffTarget: { home: 5, away: 4 },
      blockedShots: { home: 3, away: 2 },
      corners: { home: 6, away: 5 },
      fouls: { home: 13, away: 10 },
      yellowCards: { home: 2, away: 1 },
      redCards: { home: 0, away: 0 },
      offsides: { home: 3, away: 2 },
      passes: { home: 541, away: 498 },
      passAccuracy: { home: 84, away: 86 },
      aerialDuelsWon: { home: 48, away: 52 },
      tackles: { home: 20, away: 17 },
      interceptions: { home: 11, away: 9 },
      saves: { home: 4, away: 4 },
      xG: { home: 1.4, away: 1.6 },
      bigChances: { home: 3, away: 4 },
      bigChancesMissed: { home: 2, away: 3 },
      goals: [
        { minute: 37, team: "away", scorer: "L. Messi", assist: "J. Álvarez", type: "PENALTY" },
        { minute: 58, team: "home", scorer: "Vinicius Jr.", assist: "R. Firmino", type: "REGULAR" },
      ],
      cards: [
        { minute: 29, team: "home", player: "B. Guimarães", type: "YELLOW" },
        { minute: 44, team: "home", player: "Casemiro", type: "YELLOW" },
        { minute: 73, team: "away", player: "N. Otamendi", type: "YELLOW" },
      ],
      substitutions: [
        { minute: 60, team: "home", playerOut: "R. Firmino", playerIn: "Rodrygo" },
        { minute: 77, team: "away", playerOut: "Á. Di María", playerIn: "P. Dybala" },
      ],
    },
    3: {
      matchId: 3,
      possession: { home: 63, away: 37 },
      shots: { home: 19, away: 13 },
      shotsOnTarget: { home: 9, away: 6 },
      shotsOffTarget: { home: 7, away: 5 },
      blockedShots: { home: 3, away: 2 },
      corners: { home: 10, away: 4 },
      fouls: { home: 9, away: 16 },
      yellowCards: { home: 0, away: 3 },
      redCards: { home: 0, away: 1 },
      offsides: { home: 1, away: 4 },
      passes: { home: 714, away: 401 },
      passAccuracy: { home: 92, away: 79 },
      aerialDuelsWon: { home: 59, away: 41 },
      tackles: { home: 15, away: 26 },
      interceptions: { home: 7, away: 15 },
      saves: { home: 4, away: 6 },
      xG: { home: 2.8, away: 1.7 },
      bigChances: { home: 6, away: 3 },
      bigChancesMissed: { home: 3, away: 1 },
      goals: [
        { minute: 12, team: "home", scorer: "P. Yamal", assist: "P. Gavi", type: "REGULAR" },
        { minute: 28, team: "away", scorer: "C. Ronaldo", type: "PENALTY" },
        { minute: 41, team: "home", scorer: "A. Morata", assist: "P. Pedri", type: "REGULAR" },
        { minute: 67, team: "away", scorer: "R. Leão", assist: "B. Fernandes", type: "REGULAR" },
        { minute: 84, team: "home", scorer: "P. Pedri", assist: "P. Yamal", type: "REGULAR" },
      ],
      cards: [
        { minute: 48, team: "away", player: "P. Neves", type: "YELLOW" },
        { minute: 62, team: "away", player: "João Cancelo", type: "YELLOW" },
        { minute: 71, team: "away", player: "João Cancelo", type: "YELLOW_RED" },
        { minute: 88, team: "away", player: "D. Dalot", type: "YELLOW" },
      ],
      substitutions: [
        { minute: 70, team: "home", playerOut: "A. Morata", playerIn: "F. Torres" },
        { minute: 75, team: "away", playerOut: "C. Ronaldo", playerIn: "G. Ramos" },
      ],
    },
  };

  return statsMap[matchId] ?? null;
}

function getMockStandings(): StandingGroup[] {
  return [
    {
      stage: "GROUP_STAGE",
      group: "Group A",
      table: [
        { position: 1, team: { id: 9, name: "France", shortName: "FRA", crest: "🇫🇷" }, playedGames: 1, won: 1, draw: 0, lost: 0, goalsFor: 2, goalsAgainst: 1, goalDifference: 1, points: 3 },
        { position: 2, team: { id: 10, name: "Germany", shortName: "GER", crest: "🇩🇪" }, playedGames: 1, won: 0, draw: 0, lost: 1, goalsFor: 1, goalsAgainst: 2, goalDifference: -1, points: 0 },
      ],
    },
    {
      stage: "GROUP_STAGE",
      group: "Group B",
      table: [
        { position: 1, team: { id: 11, name: "Brazil", shortName: "BRA", crest: "🇧🇷" }, playedGames: 1, won: 0, draw: 1, lost: 0, goalsFor: 1, goalsAgainst: 1, goalDifference: 0, points: 1 },
        { position: 2, team: { id: 12, name: "Argentina", shortName: "ARG", crest: "🇦🇷" }, playedGames: 1, won: 0, draw: 1, lost: 0, goalsFor: 1, goalsAgainst: 1, goalDifference: 0, points: 1 },
      ],
    },
    {
      stage: "GROUP_STAGE",
      group: "Group C",
      table: [
        { position: 1, team: { id: 13, name: "Spain", shortName: "ESP", crest: "🇪🇸" }, playedGames: 1, won: 1, draw: 0, lost: 0, goalsFor: 3, goalsAgainst: 2, goalDifference: 1, points: 3 },
        { position: 2, team: { id: 14, name: "Portugal", shortName: "POR", crest: "🇵🇹" }, playedGames: 1, won: 0, draw: 0, lost: 1, goalsFor: 2, goalsAgainst: 3, goalDifference: -1, points: 0 },
      ],
    },
  ];
}

function getMockScorers(): Scorer[] {
  return [
    { player: { id: 1, name: "Kylian Mbappé", nationality: "France", position: "Forward" }, team: { id: 9, name: "France", shortName: "FRA", crest: "🇫🇷" }, goals: 1, assists: 1, penalties: 0, playedMatches: 1 },
    { player: { id: 2, name: "Lionel Messi", nationality: "Argentina", position: "Forward" }, team: { id: 12, name: "Argentina", shortName: "ARG", crest: "🇦🇷" }, goals: 1, assists: 0, penalties: 1, playedMatches: 1 },
    { player: { id: 3, name: "Pedri", nationality: "Spain", position: "Midfielder" }, team: { id: 13, name: "Spain", shortName: "ESP", crest: "🇪🇸" }, goals: 1, assists: 1, penalties: 0, playedMatches: 1 },
    { player: { id: 4, name: "Lamine Yamal", nationality: "Spain", position: "Forward" }, team: { id: 13, name: "Spain", shortName: "ESP", crest: "🇪🇸" }, goals: 1, assists: 1, penalties: 0, playedMatches: 1 },
    { player: { id: 5, name: "Vinicius Jr.", nationality: "Brazil", position: "Forward" }, team: { id: 11, name: "Brazil", shortName: "BRA", crest: "🇧🇷" }, goals: 1, assists: 0, penalties: 0, playedMatches: 1 },
    { player: { id: 6, name: "Cristiano Ronaldo", nationality: "Portugal", position: "Forward" }, team: { id: 14, name: "Portugal", shortName: "POR", crest: "🇵🇹" }, goals: 1, assists: 0, penalties: 1, playedMatches: 1 },
    { player: { id: 7, name: "Álvaro Morata", nationality: "Spain", position: "Forward" }, team: { id: 13, name: "Spain", shortName: "ESP", crest: "🇪🇸" }, goals: 1, assists: 0, penalties: 0, playedMatches: 1 },
    { player: { id: 8, name: "Kai Havertz", nationality: "Germany", position: "Forward" }, team: { id: 10, name: "Germany", shortName: "GER", crest: "🇩🇪" }, goals: 1, assists: 0, penalties: 0, playedMatches: 1 },
  ];
}
