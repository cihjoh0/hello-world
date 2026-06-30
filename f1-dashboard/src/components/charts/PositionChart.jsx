import { useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { useOpenF1 } from '../../hooks/useOpenF1';
import { resolveSession, getDrivers, getLaps, getPositions } from '../../api/openf1';
import DashboardPanel from '../dashboard/DashboardPanel';
import LoadingSpinner from '../ui/LoadingSpinner';
import ErrorMessage from '../ui/ErrorMessage';

const DEFAULT_SHOWN = 10;

async function fetchData(sessionType, sessionKey) {
  const session = await resolveSession(sessionType, sessionKey);
  if (!session) throw new Error(`No ${sessionType.toLowerCase()} session found`);
  const [drivers, laps, positions] = await Promise.all([
    getDrivers(session.session_key),
    getLaps(session.session_key),
    getPositions(session.session_key),
  ]);
  return { session, drivers, laps, positions };
}

// Latest position for a driver at or before targetMs (binary search)
function posAtTime(sorted, targetMs) {
  let lo = 0, hi = sorted.length - 1, result = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid].t <= targetMs) { result = sorted[mid].pos; lo = mid + 1; }
    else hi = mid - 1;
  }
  return result;
}

export default function PositionChart({ sessionType = 'Race', sessionKey = null }) {
  const { data, loading, error } = useOpenF1(
    () => fetchData(sessionType, sessionKey),
    [sessionType, sessionKey]
  );

  const [selected, setSelected] = useState(null);

  const { chartData, driverRows, subtitle } = useMemo(() => {
    if (!data) return {};
    const { session, drivers, laps, positions } = data;
    const driverMap = Object.fromEntries(drivers.map(d => [d.driver_number, d]));

    // lap lookup: driverNum → lapNum → { t0 (ms), dur (s) }
    const lapsByDriver = {};
    for (const { driver_number: num, lap_number: ln, lap_duration: dur, date_start } of laps) {
      if (!num || !ln || ln < 1 || !dur || dur <= 0 || !date_start) continue;
      (lapsByDriver[num] ??= {})[ln] = { t0: new Date(date_start).getTime(), dur };
    }

    // position time series per driver, sorted ascending
    const posByDriver = {};
    for (const p of positions) {
      if (!p.driver_number || p.position == null) continue;
      (posByDriver[p.driver_number] ??= []).push({
        t: new Date(p.date).getTime(),
        pos: p.position,
      });
    }
    for (const arr of Object.values(posByDriver)) arr.sort((a, b) => a.t - b.t);

    const driverNums = Object.keys(lapsByDriver).map(Number);
    if (!driverNums.length) return {};

    const maxLap = Math.max(...driverNums.flatMap(n => Object.keys(lapsByDriver[n]).map(Number)));

    const chartData = [];
    for (let lap = 1; lap <= maxLap; lap++) {
      const row = { lap };
      let hasAny = false;
      for (const num of driverNums) {
        const lapObj = lapsByDriver[num]?.[lap];
        if (!lapObj) continue;
        // Sample actual position at the moment the driver crosses the finish line
        const crossingMs = lapObj.t0 + lapObj.dur * 1000;
        const pos = posAtTime(posByDriver[num], crossingMs);
        if (pos != null) { row[`d${num}`] = pos; hasAny = true; }
      }
      if (hasAny) chartData.push(row);
    }

    // Sort driver list by last known position (DNFs fall to back)
    const finalPos = num => {
      const series = posByDriver[num];
      return series?.length ? series[series.length - 1].pos : 99;
    };
    const sorted = [...driverNums].sort((a, b) => finalPos(a) - finalPos(b));

    const seenColors = new Set();
    const driverRows = sorted.map((num, i) => {
      const drv = driverMap[num] ?? {};
      const color = drv.team_colour ? `#${drv.team_colour}` : '#888';
      const isDashed = seenColors.has(color);
      seenColors.add(color);
      return { num, drv, rank: i + 1, color, isDashed };
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
            On-track positions from live timing data, sampled at each driver's lap crossing.
            Dashed lines = teammate. Click chips to show/hide drivers.
          </p>
        </>
      )}
    </DashboardPanel>
  );
}
