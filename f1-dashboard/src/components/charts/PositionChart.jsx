import { useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { useOpenF1 } from '../../hooks/useOpenF1';
import { resolveSession, getDrivers, getLaps } from '../../api/openf1';
import DashboardPanel from '../dashboard/DashboardPanel';
import LoadingSpinner from '../ui/LoadingSpinner';
import ErrorMessage from '../ui/ErrorMessage';

const DEFAULT_SHOWN = 10;

async function fetchData(sessionType, sessionKey) {
  const session = await resolveSession(sessionType, sessionKey);
  if (!session) throw new Error(`No ${sessionType.toLowerCase()} session found`);
  const [drivers, laps] = await Promise.all([
    getDrivers(session.session_key),
    getLaps(session.session_key),
  ]);
  return { session, drivers, laps };
}

export default function PositionChart({ sessionType = 'Race', sessionKey = null }) {
  const { data, loading, error } = useOpenF1(
    () => fetchData(sessionType, sessionKey),
    [sessionType, sessionKey]
  );

  const [selected, setSelected] = useState(null);

  const { chartData, driverRows, subtitle } = useMemo(() => {
    if (!data) return {};
    const { session, drivers, laps } = data;
    const driverMap = Object.fromEntries(drivers.map(d => [d.driver_number, d]));

    const byDriver = {};
    for (const { driver_number: num, lap_number: ln, lap_duration: dur } of laps) {
      if (!num || !ln || ln < 1 || !dur || dur <= 0) continue;
      if (!byDriver[num]) byDriver[num] = {};
      byDriver[num][ln] = dur;
    }

    const driverNums = Object.keys(byDriver).map(Number);
    if (!driverNums.length) return {};

    const cumulative = {};
    for (const num of driverNums) {
      const lapNums = Object.keys(byDriver[num]).map(Number).sort((a, b) => a - b);
      let cum = 0;
      cumulative[num] = {};
      for (const ln of lapNums) { cum += byDriver[num][ln]; cumulative[num][ln] = cum; }
    }

    const maxLap = Math.max(...driverNums.flatMap(n => Object.keys(cumulative[n]).map(Number)));

    // Rank drivers per lap by cumulative time; absent drivers get null (DNF/lapped out)
    const chartData = [];
    for (let lap = 1; lap <= maxLap; lap++) {
      const present = driverNums.filter(n => cumulative[n]?.[lap] != null);
      if (!present.length) continue;
      const ranked = [...present].sort((a, b) => cumulative[a][lap] - cumulative[b][lap]);
      const row = { lap };
      ranked.forEach((num, i) => { row[`d${num}`] = i + 1; });
      chartData.push(row);
    }

    const finalTime = num => {
      const lastLap = Math.max(...Object.keys(cumulative[num]).map(Number));
      return cumulative[num][lastLap] ?? Infinity;
    };
    const sorted = [...driverNums].sort((a, b) => finalTime(a) - finalTime(b));

    const seenColors = new Set();
    const driverRows = sorted.map((num, i) => {
      const drv   = driverMap[num] ?? {};
      const color = drv.team_colour ? `#${drv.team_colour}` : '#888';
      const dash  = seenColors.has(color);
      seenColors.add(color);
      return { num, drv, rank: i + 1, color, isDashed: dash };
    });

    return {
      chartData,
      driverRows,
      subtitle: session
        ? `${session.location ?? ''} · ${session.year ?? ''} · Round ${session.round_number ?? '?'}`
        : undefined,
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
  const totalDrivers = driverRows?.length ?? 20;
  const yTicks = [1, ...Array.from({ length: Math.floor(totalDrivers / 5) }, (_, i) => (i + 1) * 5)
    .filter(n => n < totalDrivers), totalDrivers];

  return (
    <DashboardPanel title="Race Position Tracker" subtitle={subtitle}>
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

          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData} margin={{ top: 8, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
              <XAxis
                dataKey="lap"
                tick={{ fill: '#888', fontSize: 10 }}
                label={{ value: 'Lap', position: 'insideBottomRight', offset: -8, fill: '#555', fontSize: 10 }}
              />
              <YAxis
                reversed
                domain={[1, totalDrivers]}
                ticks={yTicks}
                tick={{ fill: '#888', fontSize: 10 }}
                width={36}
                tickFormatter={v => `P${v}`}
              />
              <Tooltip
                contentStyle={{ background: '#13131f', border: '1px solid #2a2a3e', fontSize: 11 }}
                formatter={(v, name) => v == null ? ['—', name] : [`P${v}`, name]}
                labelFormatter={lap => `Lap ${lap}`}
              />
              <ReferenceLine y={1} stroke="#ffd700" strokeDasharray="4 2" strokeWidth={1}
                label={{ value: 'Lead', position: 'insideTopRight', fill: '#666', fontSize: 9 }} />
              {activeRows.map(({ num, drv, color, isDashed }) => (
                <Line
                  key={num}
                  dataKey={`d${num}`}
                  name={drv.name_acronym ?? num}
                  stroke={color}
                  strokeWidth={1.5}
                  strokeDasharray={isDashed ? '5 3' : undefined}
                  dot={false}
                  activeDot={{ r: 3, fill: color }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>

          <p className="f1-footnote" style={{ marginTop: '0.5rem' }}>
            Position derived from cumulative lap times — pit laps produce temporary drops.
            Dashed lines = teammate. Click chips to show/hide drivers.
          </p>
        </>
      )}
    </DashboardPanel>
  );
}
