import { getSafetyCarPeriods } from './raceControl';

// Detects genuine on-track passes by comparing each driver's rank (by
// cumulative race time, same method RaceGapChart uses) between consecutive
// laps. Any pair whose relative order flips is a pass. Pit in/out laps and
// Safety Car / VSC laps are excluded since those position changes are
// strategy-driven, not a racing pass. Lap 1 (grid launch) is excluded too.
//
// Input: { drivers, laps, pitStops, raceControl } — the raw arrays from the
// OpenF1 API for a single session. Returns { overtakes, driverMap, maxLap }.
export function detectOvertakes({ drivers, laps, pitStops, raceControl }) {
  const driverMap = Object.fromEntries(drivers.map(d => [d.driver_number, d]));

  const lapDur = {};
  for (const { driver_number: num, lap_number: ln, lap_duration: dur } of laps) {
    if (!num || !ln || ln < 1 || !dur || dur <= 0) continue;
    if (!lapDur[num]) lapDur[num] = {};
    lapDur[num][ln] = dur;
  }

  const driverNums = Object.keys(lapDur).map(Number);
  const cumulative = {};
  for (const num of driverNums) {
    const lapNums = Object.keys(lapDur[num]).map(Number).sort((a, b) => a - b);
    let cum = 0;
    cumulative[num] = {};
    for (const ln of lapNums) { cum += lapDur[num][ln]; cumulative[num][ln] = cum; }
  }

  const maxLap = driverNums.length
    ? Math.max(...driverNums.flatMap(n => Object.keys(cumulative[n]).map(Number)))
    : 0;

  const rankAtLap = {};
  for (let lap = 1; lap <= maxLap; lap++) {
    rankAtLap[lap] = driverNums
      .filter(n => cumulative[n]?.[lap] != null)
      .sort((a, b) => cumulative[a][lap] - cumulative[b][lap]);
  }

  const pitLapsByDriver = {};
  for (const p of pitStops ?? []) {
    if (!p.driver_number || !p.lap_number) continue;
    if (!pitLapsByDriver[p.driver_number]) pitLapsByDriver[p.driver_number] = new Set();
    pitLapsByDriver[p.driver_number].add(p.lap_number);
  }

  const safetyCarPeriods = getSafetyCarPeriods(raceControl, maxLap);
  const underCaution = lap => safetyCarPeriods.some(p => lap >= p.start && lap <= p.end);
  const pitted = (num, lap) => pitLapsByDriver[num]?.has(lap) || pitLapsByDriver[num]?.has(lap - 1);

  const overtakes = [];
  for (let lap = 2; lap <= maxLap; lap++) {
    if (underCaution(lap)) continue;
    const prevRank = rankAtLap[lap - 1];
    const curRank = rankAtLap[lap];
    if (!prevRank?.length || !curRank?.length) continue;

    const prevPos = Object.fromEntries(prevRank.map((n, i) => [n, i]));
    const curPos = Object.fromEntries(curRank.map((n, i) => [n, i]));
    const common = curRank.filter(n => prevPos[n] != null);

    for (let i = 0; i < common.length; i++) {
      for (let j = i + 1; j < common.length; j++) {
        const attacker = common[i], defender = common[j]; // attacker ahead of defender now
        if (prevPos[attacker] <= prevPos[defender]) continue; // was already ahead — no swap
        if (pitted(attacker, lap) || pitted(defender, lap)) continue;

        const attackerLapTime = lapDur[attacker]?.[lap];
        const defenderLapTime = lapDur[defender]?.[lap];
        if (!attackerLapTime || !defenderLapTime) continue;

        overtakes.push({
          lap,
          attacker, defender,
          posAfter: curPos[attacker] + 1,
          paceDelta: +(attackerLapTime - defenderLapTime).toFixed(3), // negative = attacker faster
          gapBefore: cumulative[attacker]?.[lap - 1] != null && cumulative[defender]?.[lap - 1] != null
            ? +(cumulative[attacker][lap - 1] - cumulative[defender][lap - 1]).toFixed(3)
            : null,
        });
      }
    }
  }

  return { overtakes: overtakes.sort((a, b) => a.lap - b.lap), driverMap, maxLap };
}
