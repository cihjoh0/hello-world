import { useMemo, useState, useEffect } from 'react';
import {
  ComposedChart, Bar, Line, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { useOpenF1 } from '../../hooks/useOpenF1';
import { resolveSession, getDrivers, getLaps, getStints, getPitStops } from '../../api/openf1';
import DashboardPanel from '../dashboard/DashboardPanel';
import LoadingSpinner from '../ui/LoadingSpinner';
import ErrorMessage from '../ui/ErrorMessage';

const ROLLING_N = 3;
const COLOR_A = '#e8002d';
const COLOR_B = '#00a0dd';

const COMPOUND_COLOR = {
  SOFT: '#e8002d', MEDIUM: '#ffd700', HARD: '#f0f0f0',
  INTERMEDIATE: '#39b54a', WET: '#00a0dd',
};
const COMPOUND_ABBR = { SOFT: 'S', MEDIUM: 'M', HARD: 'H', INTERMEDIATE: 'I', WET: 'W' };

async function fetchData(sessionType, sessionKey) {
  const session = await resolveSession(sessionType, sessionKey);
  if (!session) throw new Error(`No ${sessionType.toLowerCase()} session found`);
  const [drivers, laps, stints, pitStops] = await Promise.all([
    getDrivers(session.session_key),
    getLaps(session.session_key),
    getStints(session.session_key),
    getPitStops(session.session_key),
  ]);
  return { session, drivers, laps, stints, pitStops };
}

function getCompoundAtLap(stintList, lap) {
  if (!stintList) return null;
  const s = stintList.find(s => lap >= s.lapStart && lap <= (s.lapEnd ?? Infinity));
  return s ? { compound: s.compound, age: (s.tyreAge ?? 0) + (lap - s.lapStart) } : null;
}

function TyreStrip({ driverCode, stints, color, maxLap }) {
  if (!stints?.length) return null;
  const total = maxLap ?? stints[stints.length - 1]?.lapEnd ?? 1;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
      <span style={{ color, fontWeight: 700, fontSize: 11, minWidth: 28 }}>{driverCode}</span>
      <div style={{ flex: 1, display: 'flex', height: 9, borderRadius: 3, overflow: 'hidden', background: '#1a1a2a' }}>
        {stints.map((s, i) => {
          const lapEnd = s.lapEnd ?? total;
          const pct = ((lapEnd - s.lapStart + 1) / total) * 100;
          return (
            <div key={i}
              style={{ width: `${pct}%`, background: COMPOUND_COLOR[s.compound] ?? '#888', opacity: 0.85 }}
              title={`${s.compound}${s.tyreAge > 0 ? ` (+${s.tyreAge} used)` : ' (new)'} · L${s.lapStart}–${lapEnd}`}
            />
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }}>
        {stints.map((s, i) => (
          <span key={i} style={{ fontSize: 9, color: COMPOUND_COLOR[s.compound] ?? '#888', fontWeight: 600 }}>
            {COMPOUND_ABBR[s.compound] ?? s.compound[0]}
            {s.tyreAge > 0 ? `+${s.tyreAge}` : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function BattleTracker({ sessionType = 'Race', sessionKey = null }) {
  const { data, loading, error } = useOpenF1(
    () => fetchData(sessionType, sessionKey),
    [sessionType, sessionKey]
  );

  const [driverA, setDriverA] = useState(null);
  const [driverB, setDriverB] = useState(null);

  const { driverRows, lapMap, stintMap, pitSet, defaultA, defaultB, subtitle } = useMemo(() => {
    if (!data) return {};
    const { session, drivers, laps, stints, pitStops } = data;
    const driverMap = Object.fromEntries(drivers.map(d => [d.driver_number, d]));

    const lapMap = {};
    for (const { driver_number: num, lap_number: ln, lap_duration: dur } of laps) {
      if (!num || !ln || ln < 1 || !dur || dur <= 0) continue;
      if (!lapMap[num]) lapMap[num] = {};
      lapMap[num][ln] = dur;
    }

    const driverNums = Object.keys(lapMap).map(Number);
    const totalTime = num => Object.values(lapMap[num]).reduce((s, t) => s + t, 0);
    const sorted = [...driverNums].sort((a, b) => totalTime(a) - totalTime(b));

    const seenColors = new Set();
    const driverRows = sorted.map((num, i) => {
      const drv   = driverMap[num] ?? {};
      const color = drv.team_colour ? `#${drv.team_colour}` : '#888';
      const dash  = seenColors.has(color);
      seenColors.add(color);
      return { num, drv, rank: i + 1, color, isDashed: dash };
    });

    // Stint lookup: { driverNum: [{lapStart, lapEnd, compound, tyreAge}] }
    const stintMap = {};
    for (const s of (stints ?? [])) {
      const num = s.driver_number;
      if (!num) continue;
      if (!stintMap[num]) stintMap[num] = [];
      stintMap[num].push({
        lapStart: s.lap_start,
        lapEnd: s.lap_end,
        compound: s.compound?.toUpperCase() ?? 'UNKNOWN',
        tyreAge: s.tyre_age_at_start ?? 0,
      });
    }

    const pitSet = new Set((pitStops ?? []).map(p => `${p.driver_number}-${p.lap_number}`));

    return {
      driverRows, lapMap, stintMap, pitSet,
      defaultA: sorted[0] ?? null,
      defaultB: sorted[1] ?? null,
      subtitle: session
        ? `${session.location ?? ''} · ${session.year ?? ''} · Round ${session.round_number ?? '?'}`
        : undefined,
    };
  }, [data]);

  // Reset selections when session changes
  useEffect(() => { setDriverA(null); setDriverB(null); }, [sessionType, sessionKey]);

  // Fall back to top-2 finishers until user picks
  const activeA = driverA ?? defaultA ?? null;
  const activeB = driverB ?? defaultB ?? null;

  const handleClick = num => {
    if (num === activeA) {
      setDriverA(activeB);
      setDriverB(null);
    } else if (num === activeB) {
      setDriverB(null);
    } else if (!activeA) {
      setDriverA(num);
    } else if (!activeB) {
      setDriverB(num);
    } else {
      setDriverA(num);
    }
  };

  const { chartData, momentum } = useMemo(() => {
    if (!lapMap || !activeA || !activeB || activeA === activeB) return {};
    const lapA = lapMap[activeA] ?? {};
    const lapB = lapMap[activeB] ?? {};

    const sharedLaps = Object.keys(lapA)
      .map(Number)
      .filter(ln => lapB[ln] != null)
      .sort((a, b) => a - b);

    if (!sharedLaps.length) return { chartData: [] };

    const diffs = sharedLaps.map(ln => +(lapA[ln] - lapB[ln]).toFixed(3));

    const rollingAvg = diffs.map((_, i) => {
      const slice = diffs.slice(Math.max(0, i - ROLLING_N + 1), i + 1);
      return +(slice.reduce((s, v) => s + v, 0) / slice.length).toFixed(3);
    });

    const chartData = sharedLaps.map((ln, i) => ({
      lap: ln,
      diff: diffs[i],
      avg: rollingAvg[i],
    }));

    const recent = diffs.slice(-5);
    const avgTrend = +(recent.reduce((s, v) => s + v, 0) / recent.length).toFixed(3);

    return { chartData, momentum: { avgTrend } };
  }, [lapMap, activeA, activeB]);

  const rowA = driverRows?.find(r => r.num === activeA);
  const rowB = driverRows?.find(r => r.num === activeB);
  const codeA = rowA?.drv.name_acronym ?? activeA;
  const codeB = rowB?.drv.name_acronym ?? activeB;

  const momentumLabel = !momentum ? null
    : momentum.avgTrend < -0.05 ? `${codeA} +${Math.abs(momentum.avgTrend).toFixed(2)} s/lap`
    : momentum.avgTrend >  0.05 ? `${codeB} +${momentum.avgTrend.toFixed(2)} s/lap`
    : 'Evenly matched';

  const momentumColor = !momentum ? '#888'
    : momentum.avgTrend < -0.05 ? COLOR_A
    : momentum.avgTrend >  0.05 ? COLOR_B
    : '#888';

  const maxLap = chartData?.length ? chartData[chartData.length - 1].lap : undefined;

  const pitLapsA = chartData?.map(r => r.lap).filter(ln => pitSet?.has(`${activeA}-${ln}`)) ?? [];
  const pitLapsB = chartData?.map(r => r.lap).filter(ln => pitSet?.has(`${activeB}-${ln}`)) ?? [];

  const hasStints = stintMap && (stintMap[activeA] || stintMap[activeB]);

  return (
    <DashboardPanel title="Battle Tracker" subtitle={subtitle}>
      {loading && <LoadingSpinner />}
      {error   && <ErrorMessage message={error} />}
      {!loading && !error && driverRows && (
        <>
          {/* Driver selector: rank badge becomes A/B when selected */}
          <div className="qt-driver-list">
            {driverRows.map(({ num, drv, rank, color }) => {
              const isA = num === activeA;
              const isB = num === activeB;
              return (
                <button
                  key={num}
                  className={`qt-driver-btn ${isA || isB ? 'active' : ''}`}
                  style={{ '--dot': isA ? COLOR_A : isB ? COLOR_B : 'transparent' }}
                  onClick={() => handleClick(num)}
                  title={isA ? 'Driver A — click to swap/remove'
                       : isB ? 'Driver B — click to remove'
                       : 'Select as next driver'}
                >
                  <span className="qt-rank"
                    style={{ color: isA ? COLOR_A : isB ? COLOR_B : undefined, fontWeight: isA || isB ? 700 : undefined }}>
                    {isA ? 'A' : isB ? 'B' : `P${rank}`}
                  </span>
                  <span className="qt-code" style={{ color }}>{drv.name_acronym ?? num}</span>
                </button>
              );
            })}
          </div>

          {/* Momentum summary bar */}
          {momentum && rowA && rowB && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0', borderTop: '1px solid #1a1a2a', marginTop: '0.25rem' }}>
              <span style={{ color: COLOR_A, fontWeight: 700, fontSize: 13 }}>{codeA}</span>
              <span style={{ color: '#444', fontSize: 11 }}>vs</span>
              <span style={{ color: COLOR_B, fontWeight: 700, fontSize: 13 }}>{codeB}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: momentumColor, fontWeight: 600 }}>
                {momentumLabel} <span style={{ color: '#555', fontWeight: 400 }}>(last {Math.min(5, chartData?.length ?? 0)} laps)</span>
              </span>
            </div>
          )}

          {/* Tyre strategy strips */}
          {hasStints && rowA && rowB && (
            <div style={{ padding: '0.4rem 0 0.5rem', borderTop: '1px solid #1a1a2a' }}>
              <TyreStrip driverCode={codeA} stints={stintMap[activeA]} color={COLOR_A} maxLap={maxLap} />
              <TyreStrip driverCode={codeB} stints={stintMap[activeB]} color={COLOR_B} maxLap={maxLap} />
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.35rem' }}>
                {Object.entries(COMPOUND_COLOR).map(([c, col]) => (
                  <span key={c} style={{ fontSize: 9, color: col, display: 'flex', alignItems: 'center', gap: 3 }}>
                    <span style={{ width: 8, height: 8, background: col, borderRadius: 2, display: 'inline-block', opacity: 0.85 }} />
                    {c[0] + c.slice(1).toLowerCase()}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Differential chart */}
          {chartData?.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                <XAxis
                  dataKey="lap"
                  tick={{ fill: '#888', fontSize: 10 }}
                  label={{ value: 'Lap', position: 'insideBottomRight', offset: -8, fill: '#555', fontSize: 10 }}
                />
                <YAxis
                  tick={{ fill: '#888', fontSize: 10 }}
                  width={46}
                  tickFormatter={v => `${v > 0 ? '+' : ''}${v.toFixed(1)}s`}
                />
                <Tooltip
                  contentStyle={{ background: '#13131f', border: '1px solid #2a2a3e', fontSize: 11 }}
                  formatter={(v, name) => {
                    if (v == null) return ['—', name];
                    const label = v < 0 ? `${codeA} faster by ${Math.abs(v).toFixed(3)}s`
                                        : `${codeB} faster by ${v.toFixed(3)}s`;
                    return [label, name];
                  }}
                  labelFormatter={lap => {
                    const cA = getCompoundAtLap(stintMap?.[activeA], lap);
                    const cB = getCompoundAtLap(stintMap?.[activeB], lap);
                    const parts = [
                      cA ? `${codeA}: ${COMPOUND_ABBR[cA.compound] ?? cA.compound} (age ${cA.age})` : null,
                      cB ? `${codeB}: ${COMPOUND_ABBR[cB.compound] ?? cB.compound} (age ${cB.age})` : null,
                    ].filter(Boolean).join('  ·  ');
                    return `Lap ${lap}${parts ? `  —  ${parts}` : ''}`;
                  }}
                />
                <ReferenceLine y={0} stroke="#333" />
                <ReferenceLine y={0} stroke="none"
                  label={{ value: `▲ ${codeB} faster`, position: 'insideTopLeft', fill: '#555', fontSize: 9 }} />
                <ReferenceLine y={0} stroke="none"
                  label={{ value: `▼ ${codeA} faster`, position: 'insideBottomLeft', fill: '#555', fontSize: 9 }} />

                {/* Pit stop reference lines */}
                {pitLapsA.map(ln => (
                  <ReferenceLine key={`pitA-${ln}`} x={ln} stroke={COLOR_A}
                    strokeDasharray="3 2" strokeWidth={1} strokeOpacity={0.7}
                    label={{ value: 'P', position: 'top', fill: COLOR_A, fontSize: 8 }} />
                ))}
                {pitLapsB.map(ln => (
                  <ReferenceLine key={`pitB-${ln}`} x={ln} stroke={COLOR_B}
                    strokeDasharray="3 2" strokeWidth={1} strokeOpacity={0.7}
                    label={{ value: 'P', position: 'insideBottomRight', fill: COLOR_B, fontSize: 8 }} />
                ))}

                <Bar dataKey="diff" name="Lap Δ" maxBarSize={14} isAnimationActive={false}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.diff < 0 ? '#39b54a' : '#e8002d'} fillOpacity={0.75} />
                  ))}
                </Bar>
                <Line
                  dataKey="avg"
                  name={`${ROLLING_N}-lap avg`}
                  stroke="#fff"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            activeA && activeB && (
              <p className="f1-hint" style={{ padding: '1rem', textAlign: 'center' }}>
                No shared lap data for these drivers.
              </p>
            )
          )}

          <p className="f1-footnote" style={{ marginTop: '0.5rem' }}>
            Green = {codeA ?? 'A'} faster · Red = {codeB ?? 'B'} faster · White line = {ROLLING_N}-lap rolling avg.
            Dashed verticals = pit stops (red = {codeA ?? 'A'}, blue = {codeB ?? 'B'}).
            Hover the tooltip to see compound and tyre age at each lap.
          </p>
        </>
      )}
    </DashboardPanel>
  );
}
