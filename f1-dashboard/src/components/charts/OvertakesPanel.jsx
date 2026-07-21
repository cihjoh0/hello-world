import { useMemo } from 'react';
import { useOpenF1 } from '../../hooks/useOpenF1';
import { resolveSession, getDrivers, getLaps, getPitStops, getRaceControl } from '../../api/openf1';
import { getSafetyCarPeriods } from '../../utils/raceControl';
import DashboardPanel from '../dashboard/DashboardPanel';
import LoadingSpinner from '../ui/LoadingSpinner';
import ErrorMessage from '../ui/ErrorMessage';

async function fetchData(sessionType, sessionKey) {
  const session = await resolveSession(sessionType, sessionKey);
  if (!session) throw new Error(`No ${sessionType.toLowerCase()} session found`);
  const [drivers, laps, pitStops, raceControl] = await Promise.all([
    getDrivers(session.session_key),
    getLaps(session.session_key),
    getPitStops(session.session_key),
    getRaceControl(session.session_key),
  ]);
  return { session, drivers, laps, pitStops, raceControl };
}

// Detects genuine on-track passes by comparing each driver's rank (by
// cumulative race time, same method RaceGapChart uses) between consecutive
// laps. Any pair whose relative order flips is a pass. Pit in/out laps and
// Safety Car / VSC laps are excluded since those position changes are
// strategy-driven, not a racing pass. Lap 1 (grid launch) is excluded too.
function detectOvertakes({ drivers, laps, pitStops, raceControl }) {
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

  return { overtakes: overtakes.sort((a, b) => a.lap - b.lap), driverMap };
}

export default function OvertakesPanel({ sessionType = 'Race', sessionKey = null }) {
  const { data, loading, error } = useOpenF1(
    () => fetchData(sessionType, sessionKey),
    [sessionType, sessionKey]
  );

  const { overtakes, driverMap, summary, subtitle } = useMemo(() => {
    if (!data) return {};
    const { session, ...rest } = data;
    const { overtakes, driverMap } = detectOvertakes(rest);

    const deltas = overtakes.map(o => o.paceDelta).filter(v => v != null);
    const avgPace = deltas.length ? deltas.reduce((s, v) => s + v, 0) / deltas.length : null;

    return {
      overtakes, driverMap,
      summary: { count: overtakes.length, avgPace },
      subtitle: session
        ? `${session.location ?? ''} · ${session.year ?? ''} · ${session.session_type ?? ''}`
        : undefined,
    };
  }, [data]);

  const DriverTag = ({ num }) => {
    const d = driverMap?.[num];
    const color = d?.team_colour ? `#${d.team_colour}` : '#888';
    return <span style={{ color, fontWeight: 700 }}>{d?.name_acronym ?? `#${num}`}</span>;
  };

  return (
    <DashboardPanel title="Overtakes" subtitle={subtitle}>
      {loading && <LoadingSpinner />}
      {error   && <ErrorMessage message={error} />}
      {!loading && !error && overtakes && (
        overtakes.length === 0 ? (
          <p className="f1-hint" style={{ padding: '1rem', textAlign: 'center' }}>
            No on-track overtakes detected for this session.
          </p>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '1.5rem', padding: '0.25rem 0 0.75rem', borderBottom: '1px solid #1e1e2e', marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#e0e0e8' }}>{summary.count}</div>
                <div style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Overtakes</div>
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#3ddc84' }}>
                  {summary.avgPace != null ? `${summary.avgPace.toFixed(2)}s` : '—'}
                </div>
                <div style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Avg pace advantage that lap
                </div>
              </div>
            </div>

            <div style={{
              display: 'grid', gridTemplateColumns: '2.5rem 1fr 4rem 5rem 6rem',
              gap: '0 8px', padding: '0 4px 6px', borderBottom: '1px solid #1e1e2e',
            }}>
              {[['Lap', 'left'], ['Pass', 'left'], ['To', 'right'], ['Gap', 'right'], ['Pace', 'right']].map(([h, align]) => (
                <span key={h} style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: align }}>{h}</span>
              ))}
            </div>

            <div style={{ maxHeight: 500, overflowY: 'auto' }}>
              {overtakes.map((o, i) => (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '2.5rem 1fr 4rem 5rem 6rem',
                  gap: '0 8px', alignItems: 'center', padding: '6px 4px',
                  borderBottom: '1px solid #0f0f18',
                }}>
                  <span style={{ fontSize: 11, color: '#555' }}>L{o.lap}</span>
                  <span style={{ fontSize: 12 }}>
                    <DriverTag num={o.attacker} /> <span style={{ color: '#444' }}>past</span> <DriverTag num={o.defender} />
                  </span>
                  <span style={{ fontSize: 12, color: '#888', textAlign: 'right' }}>P{o.posAfter}</span>
                  <span style={{ fontSize: 12, color: '#666', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {o.gapBefore != null ? `${o.gapBefore > 0 ? '+' : ''}${o.gapBefore.toFixed(1)}s` : '—'}
                  </span>
                  <span style={{
                    fontSize: 12, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600,
                    color: o.paceDelta < 0 ? '#3ddc84' : '#e8002d',
                  }}>
                    {o.paceDelta > 0 ? '+' : ''}{o.paceDelta.toFixed(2)}s
                  </span>
                </div>
              ))}
            </div>

            <p className="f1-footnote" style={{ marginTop: '0.75rem' }}>
              Detected by comparing driver rank (cumulative race time) lap-over-lap; pit in/out laps, Safety
              Car / VSC laps, and lap 1 are excluded. "Gap" = time the attacker was behind by before the pass.
              "Pace" = attacker's lap time minus defender's on the pass lap (green = attacker faster that lap) —
              covers the whole lap, not just the overtaking corner, so it can occasionally be positive even
              though the attacker ended the lap ahead.
            </p>
          </>
        )
      )}
    </DashboardPanel>
  );
}
