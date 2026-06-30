import { useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine, ReferenceArea,
} from 'recharts';
import { useOpenF1 } from '../../hooks/useOpenF1';
import { resolveSession, getDrivers, getLaps, getPitStops, getRaceControl, getPositions } from '../../api/openf1';
import DashboardPanel from '../dashboard/DashboardPanel';
import LoadingSpinner from '../ui/LoadingSpinner';
import ErrorMessage from '../ui/ErrorMessage';

const DEFAULT_SHOWN = 8;

async function fetchData(sessionType, sessionKey) {
  const session = await resolveSession(sessionType, sessionKey);
  if (!session) throw new Error(`No ${sessionType.toLowerCase()} session found`);
  const [drivers, laps, pitStops, raceControl, positions] = await Promise.all([
    getDrivers(session.session_key),
    getLaps(session.session_key),
    getPitStops(session.session_key),
    getRaceControl(session.session_key),
    getPositions(session.session_key),
  ]);
  return { session, drivers, laps, pitStops, raceControl, positions };
}

export default function RaceGapChart({ sessionType = 'Race', sessionKey = null }) {
  const { data, loading, error } = useOpenF1(
    () => fetchData(sessionType, sessionKey),
    [sessionType, sessionKey]
  );

  const [selected, setSelected] = useState(null); // null = default top-N

  const { chartData, driverRows, pitSet, safetyCarPeriods, subtitle } = useMemo(() => {
    if (!data) return {};
    const { session, drivers, laps, pitStops, raceControl, positions } = data;
    const driverMap = Object.fromEntries(drivers.map(d => [d.driver_number, d]));

    // Build { driverNum: { lapNum: duration } }
    const byDriver = {};
    for (const { driver_number: num, lap_number: ln, lap_duration: dur } of laps) {
      if (!num || !ln || ln < 1 || !dur || dur <= 0) continue;
      if (!byDriver[num]) byDriver[num] = {};
      byDriver[num][ln] = dur;
    }

    const driverNums = Object.keys(byDriver).map(Number);
    if (!driverNums.length) return {};

    // Cumulative race time per driver per lap
    const cumulative = {};
    for (const num of driverNums) {
      const lapNums = Object.keys(byDriver[num]).map(Number).sort((a, b) => a - b);
      let cum = 0;
      cumulative[num] = {};
      for (const ln of lapNums) { cum += byDriver[num][ln]; cumulative[num][ln] = cum; }
    }

    const maxLap = Math.max(...driverNums.flatMap(n => Object.keys(cumulative[n]).map(Number)));

    // Gap = driver cumulative time − leader's cumulative time at the same lap
    const chartData = [];
    for (let lap = 1; lap <= maxLap; lap++) {
      const times = driverNums.map(n => cumulative[n]?.[lap]).filter(t => t != null);
      if (!times.length) continue;
      const leaderTime = Math.min(...times);
      const row = { lap };
      for (const num of driverNums) {
        const t = cumulative[num]?.[lap];
        row[`d${num}`] = t != null ? +(t - leaderTime).toFixed(1) : null;
      }
      chartData.push(row);
    }

    // Sort by actual finishing position from the /position endpoint
    const lastPosByDriver = {};
    for (const p of positions ?? []) {
      if (!p.driver_number || p.position == null) continue;
      if (!lastPosByDriver[p.driver_number] || p.date > lastPosByDriver[p.driver_number].date) {
        lastPosByDriver[p.driver_number] = p;
      }
    }
    const sorted = [...driverNums].sort((a, b) =>
      (lastPosByDriver[a]?.position ?? 99) - (lastPosByDriver[b]?.position ?? 99)
    );

    // Teammates share a team colour → second driver gets dashed line
    const seenColors = new Set();
    const driverRows = sorted.map((num, i) => {
      const drv   = driverMap[num] ?? {};
      const color = drv.team_colour ? `#${drv.team_colour}` : '#888';
      const dash  = seenColors.has(color);
      seenColors.add(color);
      return { num, drv, rank: i + 1, color, isDashed: dash };
    });

    // Pit stop lookup: "driverNum-lapNum"
    const pitSet = new Set(
      (pitStops ?? []).map(p => `${p.driver_number}-${p.lap_number}`)
    );

    // Parse SC/VSC periods from race control messages
    const safetyCarPeriods = [];
    if (raceControl?.length) {
      let scStart = null, vscStart = null;
      const rcSorted = [...raceControl].sort((a, b) => (a.lap_number ?? 0) - (b.lap_number ?? 0));
      for (const rc of rcSorted) {
        const flag = (rc.flag ?? '').toUpperCase();
        const lap = rc.lap_number;
        if (!lap) continue;
        if (flag.includes('VSC DEPLOYED')) { vscStart = lap; }
        else if (flag.includes('VSC ENDING') && vscStart != null) {
          safetyCarPeriods.push({ type: 'VSC', start: vscStart, end: lap });
          vscStart = null;
        } else if (flag.includes('SC DEPLOYED')) { scStart = lap; }
        else if (flag.includes('SC ENDING') && scStart != null) {
          safetyCarPeriods.push({ type: 'SC', start: scStart, end: lap });
          scStart = null;
        }
      }
      if (scStart  != null) safetyCarPeriods.push({ type: 'SC',  start: scStart,  end: maxLap });
      if (vscStart != null) safetyCarPeriods.push({ type: 'VSC', start: vscStart, end: maxLap });
    }

    const s = session;
    return {
      chartData,
      driverRows,
      pitSet,
      safetyCarPeriods,
      subtitle: s ? `${s.location ?? ''} · ${s.year ?? ''} · Round ${s.round_number ?? '?'}` : undefined,
    };
  }, [data]);

  const defaultSelected = useMemo(
    () => new Set(driverRows?.slice(0, DEFAULT_SHOWN).map(r => r.num) ?? []),
    [driverRows]
  );
  const activeSet = selected ?? defaultSelected;

  const toggleDriver = num => {
    setSelected(prev => {
      const next = new Set(prev ?? defaultSelected);
      next.has(num) ? next.delete(num) : next.add(num);
      return next;
    });
  };

  const activeRows = driverRows?.filter(r => activeSet.has(r.num)) ?? [];

  return (
    <DashboardPanel title="Race Gap to Leader" subtitle={subtitle}>
      {loading && <LoadingSpinner />}
      {error   && <ErrorMessage message={error} />}
      {!loading && !error && driverRows && (
        <>
          <div className="qt-driver-list">
            {driverRows.map(({ num, drv, rank, color }) => {
              const active = activeSet.has(num);
              return (
                <button
                  key={num}
                  className={`qt-driver-btn ${active ? 'active' : ''}`}
                  style={{ '--dot': active ? color : 'transparent' }}
                  onClick={() => toggleDriver(num)}
                >
                  <span className="qt-rank">P{rank}</span>
                  <span className="qt-code" style={{ color }}>{drv.name_acronym ?? num}</span>
                </button>
              );
            })}
          </div>

          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData} margin={{ top: 8, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
              <XAxis
                dataKey="lap"
                tick={{ fill: '#888', fontSize: 10 }}
                label={{ value: 'Lap', position: 'insideBottomRight', offset: -8, fill: '#555', fontSize: 10 }}
              />
              <YAxis
                tick={{ fill: '#888', fontSize: 10 }}
                width={52}
                tickFormatter={v => `+${v}s`}
                label={{ value: 'Gap (s)', angle: -90, position: 'insideLeft', fill: '#555', fontSize: 10 }}
              />
              <Tooltip
                contentStyle={{ background: '#13131f', border: '1px solid #2a2a3e', fontSize: 11 }}
                formatter={(v, name) => v == null ? ['—', name] : [`+${v.toFixed(1)} s`, name]}
                labelFormatter={lap => `Lap ${lap}`}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine y={0} stroke="#555" strokeDasharray="4 2"
                label={{ value: 'Leader', position: 'insideTopRight', fill: '#555', fontSize: 9 }} />
              {(safetyCarPeriods ?? []).map((p, i) => (
                <ReferenceArea
                  key={`sc-${i}`}
                  x1={p.start} x2={p.end}
                  fill={p.type === 'SC' ? 'rgba(255,215,0,0.08)' : 'rgba(0,160,221,0.08)'}
                  stroke={p.type === 'SC' ? 'rgba(255,215,0,0.3)' : 'rgba(0,160,221,0.3)'}
                  strokeWidth={1}
                  label={{ value: p.type, position: 'insideTop', fill: p.type === 'SC' ? '#ffd700' : '#00a0dd', fontSize: 9 }}
                />
              ))}
              {activeRows.map(({ num, drv, color, isDashed }) => (
                <Line
                  key={num}
                  dataKey={`d${num}`}
                  name={drv.name_acronym ?? num}
                  stroke={color}
                  dot={({ cx, cy, payload }) =>
                    pitSet?.has(`${num}-${payload.lap}`)
                      ? <circle key={`pit-${num}-${payload.lap}`} cx={cx} cy={cy} r={4}
                          fill={color} stroke="#0d0d14" strokeWidth={1.5} />
                      : <g key={`np-${num}-${payload.lap}`} />
                  }
                  activeDot={{ r: 3, fill: color }}
                  strokeWidth={1.5}
                  strokeDasharray={isDashed ? '5 3' : undefined}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>

          <p className="f1-footnote" style={{ marginTop: '0.5rem' }}>
            Cumulative gap to the race leader at each lap crossing. Filled circles mark pit stops;
            the upward spike is the in-lap time. Dashed lines = teammate.
          </p>
        </>
      )}
    </DashboardPanel>
  );
}
