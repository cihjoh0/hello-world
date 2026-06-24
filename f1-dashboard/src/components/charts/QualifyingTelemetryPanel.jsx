import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import {
  resolveSession, getQualifyingSession, getDrivers, getLaps, getCarData,
} from '../../api/openf1';
import DashboardPanel from '../dashboard/DashboardPanel';
import LoadingSpinner from '../ui/LoadingSpinner';
import ErrorMessage from '../ui/ErrorMessage';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtLap(s) {
  if (s == null) return '—';
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toFixed(3).padStart(6, '0')}`;
}

const DRIVER_COLORS = ['#e8002d', '#00a0dd', '#39b54a', '#ff8700'];
const TABS = ['Speed', 'Throttle & Brake', 'Gear', 'Δ Time'];
const MAX_DRIVERS = 4;
const CHART_STEP_S = 0.25; // resample grid every 250 ms

// Binary search for the closest telemetry point at time t
function findClosest(series, t) {
  let lo = 0, hi = series.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].elapsed < t) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(series[lo - 1].elapsed - t) < Math.abs(series[lo].elapsed - t)) {
    return series[lo - 1];
  }
  return series[lo];
}

// Extract telemetry points belonging to a specific lap
function extractLapTelemetry(carData, lap) {
  if (!lap?.date_start || !lap?.lap_duration) return [];
  const t0 = new Date(lap.date_start).getTime();
  const t1 = t0 + lap.lap_duration * 1000;
  return carData
    .filter(d => {
      const t = new Date(d.date).getTime();
      return t >= t0 && t <= t1;
    })
    .map(d => ({
      elapsed: +((new Date(d.date).getTime() - t0) / 1000).toFixed(3),
      speed:    d.speed    ?? null,
      throttle: d.throttle ?? null,
      brake:    d.brake ? 100 : 0,
      gear:     d.n_gear   ?? null,
      rpm:      d.rpm      ?? null,
    }))
    .sort((a, b) => a.elapsed - b.elapsed);
}

// Add cumulative distance (metres) to each telemetry point via trapezoidal integration
function addDistance(tel) {
  if (!tel.length) return tel;
  const out = [{ ...tel[0], dist: 0 }];
  for (let i = 1; i < tel.length; i++) {
    const dt = tel[i].elapsed - tel[i - 1].elapsed;
    const avgSpeedMs = ((tel[i].speed ?? 0) + (tel[i - 1].speed ?? 0)) / 2 / 3.6;
    out.push({ ...tel[i], dist: out[i - 1].dist + avgSpeedMs * dt });
  }
  return out;
}

// Linear interpolation: find elapsed time at targetDist metres
function interpElapsed(telDist, targetDist) {
  let lo = 0, hi = telDist.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (telDist[mid].dist < targetDist) lo = mid + 1;
    else hi = mid;
  }
  if (lo === 0) return telDist[0].elapsed;
  const a = telDist[lo - 1], b = telDist[lo];
  if (b.dist === a.dist) return a.elapsed;
  const frac = (targetDist - a.dist) / (b.dist - a.dist);
  return a.elapsed + frac * (b.elapsed - a.elapsed);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function QualifyingTelemetryPanel({ sessionType = 'Race', sessionKey = null }) {
  const [qualSession, setQualSession]   = useState(null);
  const [drivers,     setDrivers]       = useState([]);
  const [fastestLaps, setFastestLaps]   = useState({});
  const [status,      setStatus]        = useState('idle');
  const [error,       setError]         = useState(null);

  const [selected,    setSelected]      = useState([]);
  const [telemetry,   setTelemetry]     = useState({});
  const [telLoading,  setTelLoading]    = useState({});
  const [activeTab,   setActiveTab]     = useState('Speed');

  // ── Phase 1: resolve qualifying session + fastest laps ──
  useEffect(() => {
    setStatus('loading');
    setError(null);
    setQualSession(null);
    setDrivers([]);
    setFastestLaps({});
    setSelected([]);
    setTelemetry({});
    setTelLoading({});

    (async () => {
      try {
        // Find the qualifying session for this race weekend
        const raceSess = await resolveSession(sessionType, sessionKey);
        if (!raceSess) throw new Error('Race session not found');
        const qualSess = await getQualifyingSession(raceSess.meeting_key);
        if (!qualSess) throw new Error('No qualifying session found for this round');
        setQualSession(qualSess);

        const [drvs, laps] = await Promise.all([
          getDrivers(qualSess.session_key),
          getLaps(qualSess.session_key),
        ]);
        setDrivers(drvs);

        // Fastest lap per driver
        const best = {};
        for (const lap of laps) {
          if (!lap.lap_duration || lap.lap_duration <= 0) continue;
          const num = lap.driver_number;
          if (!best[num] || lap.lap_duration < best[num].lap_duration) {
            best[num] = lap;
          }
        }
        setFastestLaps(best);

        // Default: top 3 by fastest lap
        const top3 = Object.entries(best)
          .sort(([, a], [, b]) => a.lap_duration - b.lap_duration)
          .slice(0, 3)
          .map(([num]) => Number(num));
        setSelected(top3);
        setStatus('ready');
      } catch (e) {
        setError(e.message);
        setStatus('error');
      }
    })();
  }, [sessionKey, sessionType]);

  // ── Phase 2: lazy-fetch telemetry for selected drivers ──
  const fetchTelForDriver = useCallback(async (driverNum) => {
    if (!qualSession || telemetry[driverNum] !== undefined || telLoading[driverNum]) return;
    setTelLoading(prev => ({ ...prev, [driverNum]: true }));
    try {
      const carData = await getCarData(qualSession.session_key, driverNum);
      const points  = extractLapTelemetry(carData, fastestLaps[driverNum]);
      setTelemetry(prev => ({ ...prev, [driverNum]: points }));
    } catch {
      setTelemetry(prev => ({ ...prev, [driverNum]: [] }));
    } finally {
      setTelLoading(prev => ({ ...prev, [driverNum]: false }));
    }
  }, [qualSession, fastestLaps, telemetry, telLoading]);

  useEffect(() => {
    for (const num of selected) fetchTelForDriver(num);
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleDriver = (num) => {
    setSelected(prev =>
      prev.includes(num)
        ? prev.filter(n => n !== num)
        : prev.length < MAX_DRIVERS ? [...prev, num] : prev
    );
  };

  // ── Derived data ──
  const rankedDrivers = useMemo(() => {
    const driverMap = Object.fromEntries(drivers.map(d => [d.driver_number, d]));
    return Object.entries(fastestLaps)
      .sort(([, a], [, b]) => a.lap_duration - b.lap_duration)
      .map(([num, lap], i) => ({
        driverNum: Number(num),
        driver:    driverMap[Number(num)],
        lap,
        rank: i + 1,
      }));
  }, [fastestLaps, drivers]);

  // Precompute cumulative distance for each driver's telemetry
  const telWithDist = useMemo(() => {
    const out = {};
    for (const num of selected) {
      if (telemetry[num]?.length > 0) out[num] = addDistance(telemetry[num]);
    }
    return out;
  }, [selected, telemetry]);

  const chartData = useMemo(() => {
    const selNums = selected.filter(n => telemetry[n]?.length > 0);
    if (!selNums.length) return [];

    if (activeTab === 'Δ Time') {
      // Reference = first selected driver (fastest qualifier in selection)
      const refNum = selNums[0];
      const refTel = telWithDist[refNum];
      if (!refTel?.length) return [];

      const maxDist = Math.min(...selNums.map(n => telWithDist[n]?.at(-1)?.dist ?? 0));
      const DIST_STEP = 50; // metres
      const points = [];

      for (let d = 0; d <= maxDist; d += DIST_STEP) {
        const row = { dist: Math.round(d) };
        const tRef = interpElapsed(refTel, d);
        for (const num of selNums) {
          const idx = selected.indexOf(num);
          const t   = interpElapsed(telWithDist[num], d);
          row[`d${idx}`] = num === refNum ? 0 : +( t - tRef).toFixed(3);
        }
        points.push(row);
      }
      return points;
    }

    const maxElapsed = Math.max(...selNums.map(n => telemetry[n].at(-1)?.elapsed ?? 0));
    const points = [];

    for (let t = 0; t <= maxElapsed + CHART_STEP_S; t += CHART_STEP_S) {
      const tRounded = +t.toFixed(2);
      const row = { elapsed: tRounded };
      for (const num of selNums) {
        const idx = selected.indexOf(num);
        const pt  = findClosest(telemetry[num], t);
        const k   = `d${idx}`;
        if (activeTab === 'Speed')              row[k]          = pt.speed;
        else if (activeTab === 'Throttle & Brake') {
          row[`${k}_thr`] = pt.throttle;
          row[`${k}_brk`] = pt.brake;
        } else                                  row[k]          = pt.gear;
      }
      points.push(row);
    }
    return points;
  }, [selected, telemetry, telWithDist, activeTab]);

  // ── Render ──
  const subtitle = qualSession
    ? `${qualSession.location ?? ''} · ${qualSession.year ?? ''} · Qualifying`
    : undefined;

  const anyTelLoading = selected.some(n => telLoading[n]);

  const isDelta = activeTab === 'Δ Time';
  const refDriverNum = selected.find(n => telemetry[n]?.length > 0);
  const refDriver    = drivers.find(d => d.driver_number === refDriverNum);

  const xKey   = isDelta ? 'dist' : 'elapsed';
  const xLabel = isDelta ? 'Distance (m)' : 'Elapsed (s)';
  const yLabel  = isDelta ? 'Gap (s)' : activeTab === 'Speed' ? 'km/h' : activeTab === 'Gear' ? 'Gear' : '%';

  return (
    <DashboardPanel title="Qualifying Telemetry" subtitle={subtitle}>
      {status === 'loading' && <LoadingSpinner />}
      {status === 'error'   && <ErrorMessage message={error} />}

      {status === 'ready' && (
        <>
          {/* Driver selector */}
          <div className="qt-driver-list">
            {rankedDrivers.map(({ driverNum, driver, lap, rank }) => {
              const isSelected = selected.includes(driverNum);
              const selIdx     = selected.indexOf(driverNum);
              const dotColor   = isSelected ? DRIVER_COLORS[selIdx] : 'transparent';
              const teamColor  = driver?.team_colour ? `#${driver.team_colour}` : '#888';
              return (
                <button
                  key={driverNum}
                  className={`qt-driver-btn ${isSelected ? 'active' : ''}`}
                  style={{ '--dot': dotColor }}
                  onClick={() => toggleDriver(driverNum)}
                  disabled={!isSelected && selected.length >= MAX_DRIVERS}
                  title={isSelected ? 'Click to deselect' : selected.length >= MAX_DRIVERS ? 'Max 4 drivers' : 'Click to compare'}
                >
                  <span className="qt-rank">P{rank}</span>
                  <span className="qt-code" style={{ color: teamColor }}>
                    {driver?.name_acronym ?? driverNum}
                  </span>
                  <span className="qt-time">{fmtLap(lap.lap_duration)}</span>
                </button>
              );
            })}
          </div>

          {/* Tab bar */}
          <div className="f1-tabs" style={{ marginTop: '0.75rem' }}>
            {TABS.map(t => (
              <button
                key={t}
                className={`f1-tab-btn ${activeTab === t ? 'active' : ''}`}
                onClick={() => setActiveTab(t)}
              >
                {t}
              </button>
            ))}
          </div>

          {anyTelLoading && (
            <p className="f1-hint" style={{ padding: '0.5rem 0' }}>
              Loading telemetry… (may take a few seconds)
            </p>
          )}

          {isDelta && refDriver && (
            <p className="f1-hint" style={{ padding: '0.25rem 0' }}>
              Reference: <strong style={{ color: DRIVER_COLORS[selected.indexOf(refDriverNum)] }}>{refDriver.name_acronym ?? refDriverNum}</strong> — positive = behind reference
            </p>
          )}

          {/* Chart */}
          {!anyTelLoading && chartData.length > 0 && (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                <XAxis
                  dataKey={xKey}
                  tick={{ fill: '#888', fontSize: 10 }}
                  label={{ value: xLabel, position: 'insideBottomRight', offset: -8, fill: '#555', fontSize: 10 }}
                />
                <YAxis
                  tick={{ fill: '#888', fontSize: 10 }}
                  width={42}
                  label={{ value: yLabel, angle: -90, position: 'insideLeft', fill: '#555', fontSize: 10 }}
                />
                <Tooltip
                  contentStyle={{ background: '#13131f', border: '1px solid #2a2a3e', fontSize: 11 }}
                  formatter={(v, name) => {
                    if (v == null) return '—';
                    if (isDelta) return `${v > 0 ? '+' : ''}${v.toFixed(3)} s`;
                    if (activeTab === 'Speed') return `${v} km/h`;
                    if (activeTab === 'Gear') return `Gear ${v}`;
                    return `${v}%`;
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {isDelta && <ReferenceLine y={0} stroke="#555" strokeDasharray="4 2" />}
                {selected.map((num, i) => {
                  const drv  = drivers.find(d => d.driver_number === num);
                  const code = drv?.name_acronym ?? num;
                  const col  = DRIVER_COLORS[i];
                  if (activeTab === 'Throttle & Brake') {
                    return [
                      <Line key={`d${i}_thr`} dataKey={`d${i}_thr`} name={`${code} Thr`}
                        stroke={col} dot={false} strokeWidth={1.5} isAnimationActive={false} />,
                      <Line key={`d${i}_brk`} dataKey={`d${i}_brk`} name={`${code} Brk`}
                        stroke={col} dot={false} strokeWidth={1.5} strokeDasharray="4 2" isAnimationActive={false} />,
                    ];
                  }
                  return (
                    <Line key={`d${i}`} dataKey={`d${i}`} name={isDelta && num === refDriverNum ? `${code} (ref)` : code}
                      stroke={col} dot={false} strokeWidth={isDelta && num === refDriverNum ? 1 : 1.5}
                      strokeDasharray={isDelta && num === refDriverNum ? '4 2' : undefined}
                      connectNulls isAnimationActive={false} />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          )}

          {!anyTelLoading && chartData.length === 0 && (
            <p className="f1-hint" style={{ padding: '1rem', textAlign: 'center' }}>
              No telemetry data available for this session.
            </p>
          )}

          <p className="f1-footnote" style={{ marginTop: '0.5rem' }}>
            Comparing each driver's personal fastest qualifying lap. Select up to 4 drivers.
            Solid = throttle, dashed = brake.
          </p>
        </>
      )}
    </DashboardPanel>
  );
}
