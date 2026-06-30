import { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { getSessions, getDrivers, getLaps } from '../../api/openf1';
import DashboardPanel from '../dashboard/DashboardPanel';
import LoadingSpinner from '../ui/LoadingSpinner';
import ErrorMessage from '../ui/ErrorMessage';

const F1_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const DEFAULT_SHOWN = 10;

function deriveFinishingOrder(laps) {
  const byDriver = {};
  for (const { driver_number: num, lap_number: ln, lap_duration: dur } of laps) {
    if (!num || !ln || ln < 1 || !dur || dur <= 0) continue;
    if (!byDriver[num]) byDriver[num] = { maxLap: 0, totalTime: 0 };
    if (ln > byDriver[num].maxLap) byDriver[num].maxLap = ln;
    byDriver[num].totalTime += dur;
  }
  return Object.entries(byDriver)
    .map(([num, d]) => ({ num: Number(num), ...d }))
    .sort((a, b) => b.maxLap - a.maxLap || a.totalTime - b.totalTime);
}

export default function SeasonStandingsPanel({ year = new Date().getFullYear() }) {
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [rounds, setRounds] = useState([]);
  const [driverInfo, setDriverInfo] = useState({});
  const [selected, setSelected] = useState(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  useEffect(() => {
    setStatus('idle');
    setRounds([]);
    setDriverInfo({});
    setSelected(null);
    setError(null);
    setProgress({ done: 0, total: 0 });
  }, [year]);

  const load = async () => {
    setStatus('loading');
    setError(null);
    try {
      const sessions = await getSessions(year, 'Race');
      if (!sessions.length) throw new Error(`No races found for ${year}`);

      setProgress({ done: 0, total: sessions.length });

      // Load races sequentially in small batches to stay within rate limits
      // and give visible progress rather than a silent long wait.
      const results = [];
      const BATCH = 3;
      for (let i = 0; i < sessions.length; i += BATCH) {
        const batch = sessions.slice(i, i + BATCH);
        const batchResults = await Promise.all(
          batch.map(async s => {
            const [drivers, laps] = await Promise.all([
              getDrivers(s.session_key),
              getLaps(s.session_key),
            ]);
            return { round: s.round_number ?? 0, session: s, drivers, order: deriveFinishingOrder(laps) };
          })
        );
        results.push(...batchResults);
        setProgress({ done: results.length, total: sessions.length });
      }

      const info = {};
      for (const r of results) {
        for (const d of r.drivers) {
          if (!info[d.driver_number]) {
            info[d.driver_number] = { name_acronym: d.name_acronym, team_colour: d.team_colour };
          }
        }
      }

      setDriverInfo(info);
      setRounds(results.sort((a, b) => a.round - b.round));
      setStatus('ready');
    } catch (e) {
      setError(e.message);
      setStatus('error');
    }
  };

  const { chartData, driverRows, cumPoints } = useMemo(() => {
    if (!rounds.length) return {};

    const running = {};
    const chartData = rounds.map(r => {
      r.order.slice(0, F1_POINTS.length).forEach(({ num }, i) => {
        running[num] = (running[num] ?? 0) + F1_POINTS[i];
      });
      const row = { round: r.round };
      for (const [num, pts] of Object.entries(running)) row[`d${num}`] = pts;
      return row;
    });

    const finalRow = chartData[chartData.length - 1] ?? {};
    const driverNums = Object.keys(running).map(Number);
    const sorted = [...driverNums].sort((a, b) => (finalRow[`d${b}`] ?? 0) - (finalRow[`d${a}`] ?? 0));

    const seenColors = new Set();
    const driverRows = sorted.map((num, i) => {
      const info = driverInfo[num] ?? {};
      const color = info.team_colour ? `#${info.team_colour}` : '#888';
      const isDashed = seenColors.has(color);
      seenColors.add(color);
      return { num, info, rank: i + 1, color, isDashed, points: running[num] ?? 0 };
    });

    return { chartData, driverRows, cumPoints: running };
  }, [rounds, driverInfo]);

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
    <DashboardPanel title="Season Standings" subtitle={`${year} · Championship Points`}>
      {status === 'idle' && (
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <button className="stories-btn" onClick={load}>Load {year} Season</button>
          <p className="f1-footnote" style={{ marginTop: '0.75rem' }}>
            Fetches all {year} races to compute championship points. May take several seconds.
          </p>
        </div>
      )}
      {status === 'loading' && (
        <div style={{ padding: '1.5rem', textAlign: 'center' }}>
          <LoadingSpinner />
          {progress.total > 0 && (
            <p className="f1-footnote" style={{ marginTop: '0.75rem' }}>
              Loading race {progress.done + 1} of {progress.total}…
            </p>
          )}
        </div>
      )}
      {status === 'error'   && (
        <>
          <ErrorMessage message={error} />
          <div style={{ textAlign: 'center', marginTop: '1rem' }}>
            <button className="stories-btn" onClick={load}>Retry</button>
          </div>
        </>
      )}
      {status === 'ready' && driverRows && (
        <>
          <div className="qt-driver-list">
            {driverRows.map(({ num, info, rank, color, points }) => {
              const active = activeSet.has(num);
              return (
                <button
                  key={num}
                  className={`qt-driver-btn ${active ? 'active' : ''}`}
                  style={{ '--dot': active ? color : 'transparent' }}
                  onClick={() => toggleDriver(num)}
                >
                  <span className="qt-rank">P{rank}</span>
                  <span className="qt-code" style={{ color }}>{info.name_acronym ?? num}</span>
                  <span className="qt-time">{points} pts</span>
                </button>
              );
            })}
          </div>

          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData} margin={{ top: 8, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
              <XAxis
                dataKey="round"
                tick={{ fill: '#888', fontSize: 10 }}
                label={{ value: 'Round', position: 'insideBottomRight', offset: -8, fill: '#555', fontSize: 10 }}
              />
              <YAxis
                tick={{ fill: '#888', fontSize: 10 }}
                width={42}
                label={{ value: 'Points', angle: -90, position: 'insideLeft', fill: '#555', fontSize: 10 }}
              />
              <Tooltip
                contentStyle={{ background: '#13131f', border: '1px solid #2a2a3e', fontSize: 11 }}
                formatter={(v, name) => v == null ? ['—', name] : [`${v} pts`, name]}
                labelFormatter={r => `Round ${r}`}
              />
              {activeRows.map(({ num, info, color, isDashed }) => (
                <Line
                  key={num}
                  dataKey={`d${num}`}
                  name={info.name_acronym ?? num}
                  stroke={color}
                  strokeWidth={1.5}
                  strokeDasharray={isDashed ? '5 3' : undefined}
                  dot={false}
                  activeDot={{ r: 3, fill: color }}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>

          <p className="f1-footnote" style={{ marginTop: '0.5rem' }}>
            Finishing positions derived from cumulative lap times. Top 10 shown by default — click chips to toggle.
          </p>
        </>
      )}
    </DashboardPanel>
  );
}
