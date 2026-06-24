const BASE = 'https://api.football-data.org/v4';
const KEY  = import.meta.env.VITE_FOOTBALL_API_KEY;

async function get(path) {
  if (!KEY) return null;
  const res = await fetch(`${BASE}${path}`, { headers: { 'X-Auth-Token': KEY } });
  if (!res.ok) return null;
  return res.json();
}

export async function getMatches() {
  const data = await get('/competitions/WC/matches');
  if (data) return data.matches ?? [];
  return mockMatches();
}

export async function getStandings() {
  const data = await get('/competitions/WC/standings');
  if (data) return data.standings ?? [];
  return mockStandings();
}

export async function getTopScorers() {
  const data = await get('/competitions/WC/scorers?limit=20');
  if (data) return data.scorers ?? [];
  return mockScorers();
}

export async function getMatchStats(id) {
  const data = await get(`/matches/${id}`);
  if (data?.statistics) return normalizeStats(id, data);
  return mockStats(id);
}

function normalizeStats(matchId, data) {
  const s = data.statistics ?? {};
  const homeId = data.homeTeam?.id;
  const goals = (data.goals ?? []).map(g => ({
    minute: g.minute, extraMinute: g.extraTime,
    team: g.team.id === homeId ? 'home' : 'away',
    scorer: g.scorer.name, assist: g.assist?.name,
    type: g.type === 'Penalty' ? 'PENALTY' : g.type === 'Own Goal' ? 'OWN_GOAL' : 'REGULAR',
  }));
  const cards = (data.bookings ?? []).map(c => ({
    minute: c.minute, team: c.team.id === homeId ? 'home' : 'away',
    player: c.player.name,
    type: c.card === 'RED CARD' ? 'RED' : c.card === 'YELLOW RED CARD' ? 'YELLOW_RED' : 'YELLOW',
  }));
  return {
    matchId, goals, cards,
    possession:     s.ball_possession      ?? { home: 50, away: 50 },
    shots:          s.total_shots          ?? { home: 0, away: 0 },
    shotsOnTarget:  s.shots_on_goal        ?? { home: 0, away: 0 },
    corners:        s.corner_kicks         ?? { home: 0, away: 0 },
    fouls:          s.fouls                ?? { home: 0, away: 0 },
    yellowCards:    s.yellow_cards         ?? { home: 0, away: 0 },
    redCards:       s.red_cards            ?? { home: 0, away: 0 },
    passes:         s.passes               ?? { home: 0, away: 0 },
    passAccuracy:   s.passes_percentage    ?? { home: 0, away: 0 },
    tackles:        s.tackles              ?? { home: 0, away: 0 },
    saves:          s.goalkeeper_saves     ?? { home: 0, away: 0 },
    xG:             s.expected_goals       ?? { home: 0, away: 0 },
    bigChances:     s.big_chances          ?? { home: 0, away: 0 },
  };
}

// ─── Mock data ───────────────────────────────────────────

function mockMatches() {
  return [
    { id: 1, utcDate: '2026-06-23T18:00:00Z', status: 'FINISHED', matchday: 1, stage: 'GROUP_STAGE', group: 'Group A',
      homeTeam: { id: 9,  name: 'France',      shortName: 'FRA', crest: '🇫🇷' },
      awayTeam: { id: 10, name: 'Germany',     shortName: 'GER', crest: '🇩🇪' },
      score: { fullTime: { home: 2, away: 1 }, halfTime: { home: 1, away: 0 } } },
    { id: 2, utcDate: '2026-06-24T21:00:00Z', status: 'LIVE', matchday: 1, stage: 'GROUP_STAGE', group: 'Group B',
      homeTeam: { id: 11, name: 'Brazil',      shortName: 'BRA', crest: '🇧🇷' },
      awayTeam: { id: 12, name: 'Argentina',   shortName: 'ARG', crest: '🇦🇷' },
      score: { fullTime: { home: 1, away: 1 }, halfTime: { home: 0, away: 1 } } },
    { id: 3, utcDate: '2026-06-24T18:00:00Z', status: 'FINISHED', matchday: 1, stage: 'GROUP_STAGE', group: 'Group C',
      homeTeam: { id: 13, name: 'Spain',       shortName: 'ESP', crest: '🇪🇸' },
      awayTeam: { id: 14, name: 'Portugal',    shortName: 'POR', crest: '🇵🇹' },
      score: { fullTime: { home: 3, away: 2 }, halfTime: { home: 2, away: 1 } } },
    { id: 4, utcDate: '2026-06-25T15:00:00Z', status: 'SCHEDULED', matchday: 1, stage: 'GROUP_STAGE', group: 'Group D',
      homeTeam: { id: 15, name: 'England',     shortName: 'ENG', crest: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
      awayTeam: { id: 16, name: 'USA',         shortName: 'USA', crest: '🇺🇸' },
      score: { fullTime: { home: null, away: null }, halfTime: { home: null, away: null } } },
    { id: 5, utcDate: '2026-06-25T21:00:00Z', status: 'SCHEDULED', matchday: 1, stage: 'GROUP_STAGE', group: 'Group E',
      homeTeam: { id: 17, name: 'Netherlands', shortName: 'NED', crest: '🇳🇱' },
      awayTeam: { id: 18, name: 'Italy',       shortName: 'ITA', crest: '🇮🇹' },
      score: { fullTime: { home: null, away: null }, halfTime: { home: null, away: null } } },
    { id: 6, utcDate: '2026-06-26T18:00:00Z', status: 'SCHEDULED', matchday: 2, stage: 'GROUP_STAGE', group: 'Group A',
      homeTeam: { id: 9,  name: 'France',      shortName: 'FRA', crest: '🇫🇷' },
      awayTeam: { id: 19, name: 'Morocco',     shortName: 'MAR', crest: '🇲🇦' },
      score: { fullTime: { home: null, away: null }, halfTime: { home: null, away: null } } },
  ];
}

function mockStandings() {
  return [
    { stage: 'GROUP_STAGE', group: 'Group A', table: [
      { position: 1, team: { id: 9,  name: 'France',  shortName: 'FRA', crest: '🇫🇷' }, playedGames: 1, won: 1, draw: 0, lost: 0, goalsFor: 2, goalsAgainst: 1, goalDifference: 1,  points: 3 },
      { position: 2, team: { id: 10, name: 'Germany', shortName: 'GER', crest: '🇩🇪' }, playedGames: 1, won: 0, draw: 0, lost: 1, goalsFor: 1, goalsAgainst: 2, goalDifference: -1, points: 0 },
    ]},
    { stage: 'GROUP_STAGE', group: 'Group B', table: [
      { position: 1, team: { id: 11, name: 'Brazil',    shortName: 'BRA', crest: '🇧🇷' }, playedGames: 1, won: 0, draw: 1, lost: 0, goalsFor: 1, goalsAgainst: 1, goalDifference: 0, points: 1 },
      { position: 2, team: { id: 12, name: 'Argentina', shortName: 'ARG', crest: '🇦🇷' }, playedGames: 1, won: 0, draw: 1, lost: 0, goalsFor: 1, goalsAgainst: 1, goalDifference: 0, points: 1 },
    ]},
    { stage: 'GROUP_STAGE', group: 'Group C', table: [
      { position: 1, team: { id: 13, name: 'Spain',    shortName: 'ESP', crest: '🇪🇸' }, playedGames: 1, won: 1, draw: 0, lost: 0, goalsFor: 3, goalsAgainst: 2, goalDifference: 1,  points: 3 },
      { position: 2, team: { id: 14, name: 'Portugal', shortName: 'POR', crest: '🇵🇹' }, playedGames: 1, won: 0, draw: 0, lost: 1, goalsFor: 2, goalsAgainst: 3, goalDifference: -1, points: 0 },
    ]},
  ];
}

function mockScorers() {
  return [
    { player: { id: 1, name: 'Kylian Mbappé',    nationality: 'France',    position: 'Forward'    }, team: { id: 9,  name: 'France',    shortName: 'FRA', crest: '🇫🇷' }, goals: 1, assists: 1, penalties: 0, playedMatches: 1 },
    { player: { id: 2, name: 'Lionel Messi',      nationality: 'Argentina', position: 'Forward'    }, team: { id: 12, name: 'Argentina', shortName: 'ARG', crest: '🇦🇷' }, goals: 1, assists: 0, penalties: 1, playedMatches: 1 },
    { player: { id: 3, name: 'Pedri',             nationality: 'Spain',     position: 'Midfielder' }, team: { id: 13, name: 'Spain',     shortName: 'ESP', crest: '🇪🇸' }, goals: 1, assists: 1, penalties: 0, playedMatches: 1 },
    { player: { id: 4, name: 'Lamine Yamal',      nationality: 'Spain',     position: 'Forward'    }, team: { id: 13, name: 'Spain',     shortName: 'ESP', crest: '🇪🇸' }, goals: 1, assists: 1, penalties: 0, playedMatches: 1 },
    { player: { id: 5, name: 'Vinicius Jr.',      nationality: 'Brazil',    position: 'Forward'    }, team: { id: 11, name: 'Brazil',    shortName: 'BRA', crest: '🇧🇷' }, goals: 1, assists: 0, penalties: 0, playedMatches: 1 },
    { player: { id: 6, name: 'Cristiano Ronaldo', nationality: 'Portugal',  position: 'Forward'    }, team: { id: 14, name: 'Portugal',  shortName: 'POR', crest: '🇵🇹' }, goals: 1, assists: 0, penalties: 1, playedMatches: 1 },
    { player: { id: 7, name: 'Álvaro Morata',     nationality: 'Spain',     position: 'Forward'    }, team: { id: 13, name: 'Spain',     shortName: 'ESP', crest: '🇪🇸' }, goals: 1, assists: 0, penalties: 0, playedMatches: 1 },
    { player: { id: 8, name: 'Kai Havertz',       nationality: 'Germany',   position: 'Forward'    }, team: { id: 10, name: 'Germany',   shortName: 'GER', crest: '🇩🇪' }, goals: 1, assists: 0, penalties: 0, playedMatches: 1 },
  ];
}

function mockStats(id) {
  const map = {
    1: {
      matchId: 1, possession: { home: 58, away: 42 }, shots: { home: 16, away: 10 },
      shotsOnTarget: { home: 7, away: 4 }, corners: { home: 8, away: 3 },
      fouls: { home: 11, away: 14 }, yellowCards: { home: 1, away: 2 }, redCards: { home: 0, away: 0 },
      passes: { home: 612, away: 438 }, passAccuracy: { home: 88, away: 81 },
      tackles: { home: 18, away: 23 }, saves: { home: 3, away: 5 },
      xG: { home: 2.1, away: 0.9 }, bigChances: { home: 4, away: 2 },
      goals: [
        { minute: 23, team: 'home', scorer: 'K. Mbappé',  assist: 'A. Griezmann', type: 'REGULAR' },
        { minute: 61, team: 'away', scorer: 'K. Havertz',                          type: 'REGULAR' },
        { minute: 78, team: 'home', scorer: 'O. Giroud',  assist: 'K. Mbappé',    type: 'REGULAR' },
      ],
      cards: [
        { minute: 34, team: 'home', player: 'A. Tchouaméni', type: 'YELLOW' },
        { minute: 55, team: 'away', player: 'L. Goretzka',   type: 'YELLOW' },
        { minute: 82, team: 'away', player: 'A. Rüdiger',    type: 'YELLOW' },
      ],
    },
    2: {
      matchId: 2, possession: { home: 52, away: 48 }, shots: { home: 13, away: 11 },
      shotsOnTarget: { home: 5, away: 5 }, corners: { home: 6, away: 5 },
      fouls: { home: 13, away: 10 }, yellowCards: { home: 2, away: 1 }, redCards: { home: 0, away: 0 },
      passes: { home: 541, away: 498 }, passAccuracy: { home: 84, away: 86 },
      tackles: { home: 20, away: 17 }, saves: { home: 4, away: 4 },
      xG: { home: 1.4, away: 1.6 }, bigChances: { home: 3, away: 4 },
      goals: [
        { minute: 37, team: 'away', scorer: 'L. Messi',      assist: 'J. Álvarez',  type: 'PENALTY' },
        { minute: 58, team: 'home', scorer: 'Vinicius Jr.',  assist: 'R. Firmino',  type: 'REGULAR' },
      ],
      cards: [
        { minute: 29, team: 'home', player: 'B. Guimarães', type: 'YELLOW' },
        { minute: 44, team: 'home', player: 'Casemiro',     type: 'YELLOW' },
        { minute: 73, team: 'away', player: 'N. Otamendi',  type: 'YELLOW' },
      ],
    },
    3: {
      matchId: 3, possession: { home: 63, away: 37 }, shots: { home: 19, away: 13 },
      shotsOnTarget: { home: 9, away: 6 }, corners: { home: 10, away: 4 },
      fouls: { home: 9, away: 16 }, yellowCards: { home: 0, away: 3 }, redCards: { home: 0, away: 1 },
      passes: { home: 714, away: 401 }, passAccuracy: { home: 92, away: 79 },
      tackles: { home: 15, away: 26 }, saves: { home: 4, away: 6 },
      xG: { home: 2.8, away: 1.7 }, bigChances: { home: 6, away: 3 },
      goals: [
        { minute: 12, team: 'home', scorer: 'P. Yamal',  assist: 'P. Gavi',        type: 'REGULAR' },
        { minute: 28, team: 'away', scorer: 'C. Ronaldo',                           type: 'PENALTY' },
        { minute: 41, team: 'home', scorer: 'A. Morata', assist: 'P. Pedri',       type: 'REGULAR' },
        { minute: 67, team: 'away', scorer: 'R. Leão',   assist: 'B. Fernandes',   type: 'REGULAR' },
        { minute: 84, team: 'home', scorer: 'P. Pedri',  assist: 'P. Yamal',       type: 'REGULAR' },
      ],
      cards: [
        { minute: 48, team: 'away', player: 'P. Neves',      type: 'YELLOW'      },
        { minute: 62, team: 'away', player: 'João Cancelo',  type: 'YELLOW'      },
        { minute: 71, team: 'away', player: 'João Cancelo',  type: 'YELLOW_RED'  },
        { minute: 88, team: 'away', player: 'D. Dalot',      type: 'YELLOW'      },
      ],
    },
  };
  return map[id] ?? null;
}
