import { Match, StandingGroup } from "./types";

const BASE_URL = "https://api.football-data.org/v4";
const COMPETITION = "WC"; // FIFA World Cup

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

// Mock data so the UI works without an API key
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
