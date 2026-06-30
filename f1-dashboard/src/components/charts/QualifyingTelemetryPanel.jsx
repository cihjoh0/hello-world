import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import {
  resolveSession, getQualifyingSession, getDrivers, getLaps, getCarData, getLocation,
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
const TABS = ['Speed', 'Throttle & Brake', 'Gear', 'Δ Time', 'Sectors'];
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

// Extract GPS points for a specific lap window
function extractLapLocation(rawLoc, lap) {
  if (!lap?.date_start || !lap?.lap_duration) return [];
  const t0 = new Date(lap.date_start).getTime();
  const t1 = t0 + lap.lap_duration * 1000;
  return rawLoc
    .filter(d => { const t = new Date(d.date).getTime(); return t >= t0 && t <= t1; })
    .map(d => ({ x: d.x ?? 0, y: d.y ?? 0 }));
}

// Add cumulative Euclidean distance to a GPS path
function buildTrackPath(loc) {
  if (!loc.length) return [];
  const out = [{ ...loc[0], dist: 0 }];
  for (let i = 1; i < loc.length; i++) {
    const dx = loc[i].x - loc[i - 1].x, dy = loc[i].y - loc[i - 1].y;
    out.push({ ...loc[i], dist: out[i - 1].dist + Math.sqrt(dx * dx + dy * dy) });
  }
  return out;
}

// gap > 0 = behind reference (red), gap < 0 = ahead (green)
function gapColor(gap, maxGap) {
  const t = Math.max(-1, Math.min(1, gap / Math.max(maxGap, 0.05)));
  if (t >= 0) return `rgba(220,${Math.round(220 * (1 - t))},${Math.round(220 * (1 - t))},0.9)`;
  return `rgba(${Math.round(220 * (1 + t))},220,${Math.round(220 * (1 + t))},0.9)`;
}

function CircuitMap({ path, segs, refCode, cmpCode }) {
  const W = 380, H = 220, PAD = 16;
  const xs = path.map(p => p.x), ys = path.map(p => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  const sx = (W - 2 * PAD) / Math.max(x1 - x0, 1);
  const sy = (H - 2 * PAD) / Math.max(y1 - y0, 1);
  const sc = Math.min(sx, sy);
  const ox = PAD + ((W - 2 * PAD) - (x1 - x0) * sc) / 2;
  const oy = PAD + ((H - 2 * PAD) - (y1 - y0) * sc) / 2;
  const px = x => (ox + (x - x0) * sc).toFixed(1);
  const py = y => (H - oy - (y - y0) * sc).toFixed(1); // flip Y axis

  const outline = path.map(p => `${px(p.x)},${py(p.y)}`).join(' ');

  return (
    <div style={{ marginTop: '0.75rem' }}>
      <svg width={W} height={H} style={{ display: 'block', margin: '0 auto', borderRadius: 8, background: '#0d0d14' }}>
        <polyline points={outline} fill="none" stroke="#1e1e2e" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
        {segs.map((s, i) => (
          <line key={i} x1={px(s.x1)} y1={py(s.y1)} x2={px(s.x2)} y2={py(s.y2)}
            stroke={s.color} strokeWidth={3} strokeLinecap="round" />
        ))}
        <circle cx={px(path[0].x)} cy={py(path[0].y)} r={5} fill="#fff" opacity={0.5} />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', fontSize: 10, color: '#888', marginTop: 4 }}>
        <span><span style={{ color: '#39b54a' }}>■</span> {refCode} faster</span>
        <span><span style={{ color: '#e8002d' }}>■</span> {cmpCode} faster</span>
      </div>
    </div>
  );
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
  const [locData,     setLocData]       = useState({});
  const [telLoading,  setTelLoading]    = useState({});
  const [telError,    setTelError]      = useState({});
  const [retryKey,    setRetryKey]      = useState(0);
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
    setLocData({});
    setTelLoading({});
    setTelError({});

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

        // Fastest lap per driver — require date_start so telemetry can be extracted
        const best = {};
        for (const lap of laps) {
          if (!lap.lap_duration || lap.lap_duration <= 0 || !lap.date_start) continue;
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
    setTelError(prev => { const n = { ...prev }; delete n[driverNum]; return n; });
    try {
      const [carData, rawLoc] = await Promise.all([
        getCarData(qualSession.session_key, driverNum),
        getLocation(qualSession.session_key, driverNum),
      ]);
      const points = extractLapTelemetry(carData, fastestLaps[driverNum]);
      const loc    = buildTrackPath(extractLapLocation(rawLoc, fastestLaps[driverNum]));
      if (points.length === 0) {
        setTelError(prev => ({ ...prev, [driverNum]: 'No car data returned by API' }));
      }
      setTelemetry(prev => ({ ...prev, [driverNum]: points }));
      setLocData(prev => ({ ...prev, [driverNum]: loc }));
    } catch (e) {
      setTelError(prev => ({ ...prev, [driverNum]: e?.message ?? 'Failed to load' }));
      setTelemetry(prev => ({ ...prev, [driverNum]: [] }));
      setLocData(prev => ({ ...prev, [driverNum]: [] }));
    } finally {
      setTelLoading(prev => ({ ...prev, [driverNum]: false }));
    }
  }, [qualSession, fastestLaps, telemetry, telLoading]);

  useEffect(() => {
    for (const num of selected) fetchTelForDriver(num);
  }, [selected, retryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleDriver = (num) => {
    setSelected(prev =>
      prev.includes(num)
        ? prev.filter(n => n !== num)
        : prev.length < MAX_DRIVERS ? [...prev, num] : prev
    );
  };

  const retryTelemetry = () => {
    setTelemetry({});
    setLocData({});
    setTelLoading({});
    setTelError({});
    setRetryKey(k => k + 1);
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

  // Sector comparison table (uses fastestLaps data, no telemetry needed)
  const sectorRows = useMemo(() => {
    if (activeTab !== 'Sectors' || !selected.length) return null;
    const fields = ['duration_sector_1', 'duration_sector_2', 'duration_sector_3'];
    const fastestPerSector = fields.map(f => {
      const times = selected.map(n => fastestLaps[n]?.[f]).filter(t => t != null && t > 0);
      return times.length ? Math.min(...times) : null;
    });
    const rows = selected.map((num, selIdx) => {
      const lap = fastestLaps[num];
      const drv = drivers.find(d => d.driver_number === num);
      const times = fields.map(f => (lap?.[f] ?? null));
      const deltas = times.map((t, i) =>
        t != null && fastestPerSector[i] != null ? t - fastestPerSector[i] : null
      );
      const lapTotal = times.every(t => t != null) ? times.reduce((s, t) => s + t, 0) : null;
      return { num, drv, selIdx, times, deltas, lapTotal };
    });
    const theoBest = fastestPerSector.every(t => t != null)
      ? fastestPerSector.reduce((s, t) => s + t, 0)
      : null;
    return { rows, fastestPerSector, theoBest };
  }, [activeTab, selected, fastestLaps, drivers]);

  // Circuit map: reference driver's GPS path colored by delta vs 2nd driver
  const circuitMapData = useMemo(() => {
    if (activeTab !== 'Δ Time' || chartData.length === 0) return null;
    const selNums = selected.filter(n => locData[n]?.length > 0);
    if (selNums.length < 2) return null;

    const refNum  = selNums[0];
    const cmpNum  = selNums[1];
    const cmpIdx  = selected.indexOf(cmpNum);
    const refPath = locData[refNum];
    if (!refPath?.length) return null;

    const gpsTotal   = refPath.at(-1).dist;
    const speedTotal = chartData.at(-1)?.dist ?? 1;
    const maxAbsDelta = Math.max(...chartData.map(r => Math.abs(r[`d${cmpIdx}`] ?? 0)), 0.05);

    const segs = refPath.slice(0, -1).map((pt, i) => {
      const next  = refPath[i + 1];
      const target = (pt.dist / gpsTotal) * speedTotal;
      let lo = 0, hi = chartData.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; chartData[mid].dist < target ? (lo = mid + 1) : (hi = mid); }
      const gap = chartData[lo]?.[`d${cmpIdx}`] ?? 0;
      return { x1: pt.x, y1: pt.y, x2: next.x, y2: next.y, color: gapColor(gap, maxAbsDelta) };
    });

    const refDrv = drivers.find(d => d.driver_number === refNum);
    const cmpDrv = drivers.find(d => d.driver_number === cmpNum);
    return { path: refPath, segs, refCode: refDrv?.name_acronym ?? refNum, cmpCode: cmpDrv?.name_acronym ?? cmpNum };
  }, [activeTab, chartData, selected, locData, drivers]);

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
              Loading telemetry… this may take several seconds while other panels load.
            </p>
          )}

          {isDelta && refDriver && (
            <p className="f1-hint" style={{ padding: '0.25rem 0' }}>
              Reference: <strong style={{ color: DRIVER_COLORS[selected.indexOf(refDriverNum)] }}>{refDriver.name_acronym ?? refDriverNum}</strong> — positive = behind reference
            </p>
          )}

          {/* Sectors table */}
          {activeTab === 'Sectors' && sectorRows && (
            <div style={{ marginTop: '0.75rem', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '4px 8px', color: '#666', fontWeight: 400 }}>Driver</th>
                    {['S1', 'S2', 'S3'].map(s => (
                      <th key={s} style={{ textAlign: 'right', padding: '4px 8px', color: '#666', fontWeight: 400 }}>{s}</th>
                    ))}
                    <th style={{ textAlign: 'right', padding: '4px 8px', color: '#666', fontWeight: 400 }}>Lap</th>
                  </tr>
                </thead>
                <tbody>
                  {sectorRows.rows.map(({ num, drv, selIdx, times, deltas, lapTotal }) => {
                    const teamColor = drv?.team_colour ? `#${drv.team_colour}` : '#888';
                    return (
                      <tr key={num} style={{ borderTop: '1px solid #1e1e2e' }}>
                        <td style={{ padding: '6px 8px' }}>
                          <span style={{ color: DRIVER_COLORS[selIdx], marginRight: 6 }}>●</span>
                          <span style={{ color: teamColor }}>{drv?.name_acronym ?? num}</span>
                        </td>
                        {times.map((t, i) => {
                          const isFastest = t != null && sectorRows.fastestPerSector[i] != null
                            && Math.abs(t - sectorRows.fastestPerSector[i]) < 0.0005;
                          const delta = deltas[i];
                          return (
                            <td key={i} style={{
                              textAlign: 'right', padding: '6px 8px',
                              color: isFastest ? '#a855f7' : '#ccc',
                              fontWeight: isFastest ? 700 : 400,
                            }}>
                              {t != null ? t.toFixed(3) : '—'}
                              {!isFastest && delta != null && delta > 0.0005 && (
                                <span style={{ color: '#666', fontSize: 10, marginLeft: 4 }}>+{delta.toFixed(3)}</span>
                              )}
                            </td>
                          );
                        })}
                        <td style={{ textAlign: 'right', padding: '6px 8px', color: '#aaa' }}>
                          {lapTotal != null ? fmtLap(lapTotal) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                  <tr style={{ borderTop: '2px solid #2a2a3e', color: '#a855f7' }}>
                    <td style={{ padding: '6px 8px', fontWeight: 700 }}>Theo Best</td>
                    {sectorRows.fastestPerSector.map((t, i) => (
                      <td key={i} style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 700 }}>
                        {t != null ? t.toFixed(3) : '—'}
                      </td>
                    ))}
                    <td style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 700 }}>
                      {sectorRows.theoBest != null ? fmtLap(sectorRows.theoBest) : '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="f1-footnote" style={{ marginTop: '0.5rem' }}>
                Sector times from each driver's personal best qualifying lap. Purple = fastest in sector.
                Theoretical best = sum of individually fastest sectors.
              </p>
            </div>
          )}

          {/* Chart — shown as soon as any driver's telemetry is available */}
          {activeTab !== 'Sectors' && chartData.length > 0 && (
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

          {activeTab !== 'Sectors' && !anyTelLoading && chartData.length === 0 && selected.length > 0 && (
            <div style={{ padding: '1rem', textAlign: 'center' }}>
              {Object.values(telError).length > 0 ? (
                <p className="f1-hint">
                  Failed to load car telemetry: {Object.values(telError)[0]}
                </p>
              ) : (
                <p className="f1-hint">
                  No car telemetry data available for this qualifying session.
                </p>
              )}
              <button className="stories-btn" style={{ marginTop: '0.5rem' }} onClick={retryTelemetry}>
                Retry
              </button>
            </div>
          )}

          {isDelta && circuitMapData && (
            <CircuitMap path={circuitMapData.path} segs={circuitMapData.segs}
              refCode={circuitMapData.refCode} cmpCode={circuitMapData.cmpCode} />
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
