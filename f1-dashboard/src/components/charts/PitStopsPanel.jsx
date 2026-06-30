import { useState, useMemo } from 'react';
import { useOpenF1 } from '../../hooks/useOpenF1';
import { resolveSession, getDrivers, getPitStops, getCarData } from '../../api/openf1';
import DashboardPanel from '../dashboard/DashboardPanel';
import LoadingSpinner from '../ui/LoadingSpinner';
import ErrorMessage from '../ui/ErrorMessage';

async function fetchData(sessionType, sessionKey) {
  const session = await resolveSession(sessionType, sessionKey);
  if (!session) throw new Error(`No ${sessionType.toLowerCase()} session found`);
  const [drivers, pitStops] = await Promise.all([
    getDrivers(session.session_key),
    getPitStops(session.session_key),
  ]);
  return { session, drivers, pitStops };
}

// Walk car telemetry around the pit stop date and find the longest zero-speed
// window. That window is the time the car was actually stationary in the box.
// Sampling is ~3.7 Hz (~270 ms intervals), so precision is inherently ±~0.3 s.
function calcBoxTime(carData, pitDate, pitDuration) {
  const SPEED_THRESHOLD = 5; // km/h — treat anything below this as stationary
  const t0 = new Date(pitDate).getTime();
  // Generous window: pit.date may be lane entry; pitDuration is total lane time
  const windowStart = t0 - 5_000;
  const windowEnd   = t0 + (pitDuration ?? 35) * 1000 + 5_000;

  const pts = carData
    .map(p => ({ speed: p.speed ?? 999, t: new Date(p.date).getTime() }))
    .filter(p => p.t >= windowStart && p.t <= windowEnd)
    .sort((a, b) => a.t - b.t);

  if (pts.length < 2) return null;

  let bestDur = 0;
  let runStart = null;

  for (let i = 0; i < pts.length; i++) {
    const still = pts[i].speed <= SPEED_THRESHOLD;
    if (still) {
      if (runStart === null) runStart = pts[i].t;
    } else if (runStart !== null) {
      const dur = (pts[i - 1].t - runStart) / 1000;
      if (dur > bestDur) bestDur = dur;
      runStart = null;
    }
  }
  if (runStart !== null) {
    const dur = (pts[pts.length - 1].t - runStart) / 1000;
    if (dur > bestDur) bestDur = dur;
  }

  return bestDur >= 0.5 ? bestDur : null;
}

export default function PitStopsPanel({ sessionType = 'Race', sessionKey = null }) {
  const { data, loading, error } = useOpenF1(
    () => fetchData(sessionType, sessionKey),
    [sessionType, sessionKey]
  );

  // `${driverNum}-${lapNum}` → { loading, boxTime, error }
  const [boxTimes, setBoxTimes] = useState({});
  const [sort, setSort] = useState('lap');

  const { rows, subtitle } = useMemo(() => {
    if (!data) return {};
    const { session, drivers, pitStops } = data;
    const driverMap = Object.fromEntries(drivers.map(d => [d.driver_number, d]));
    const rows = pitStops
      .filter(p => p.pit_duration > 0 && p.driver_number)
      .map(p => ({ ...p, driver: driverMap[p.driver_number] }));
    return {
      rows,
      subtitle: session
        ? `${session.location ?? ''} · ${session.year ?? ''} · ${session.session_type ?? ''}`
        : undefined,
    };
  }, [data]);

  const sorted = useMemo(() => {
    if (!rows) return [];
    return [...rows].sort((a, b) => {
      if (sort === 'lane') return a.pit_duration - b.pit_duration;
      if (sort === 'box') {
        const ta = boxTimes[`${a.driver_number}-${a.lap_number}`]?.boxTime ?? Infinity;
        const tb = boxTimes[`${b.driver_number}-${b.lap_number}`]?.boxTime ?? Infinity;
        return ta - tb;
      }
      return a.lap_number - b.lap_number || (a.date ?? '').localeCompare(b.date ?? '');
    });
  }, [rows, sort, boxTimes]);

  const measureOne = async (row) => {
    const key = `${row.driver_number}-${row.lap_number}`;
    let shouldFetch = false;
    setBoxTimes(prev => {
      if (prev[key] !== undefined) return prev;
      shouldFetch = true;
      return { ...prev, [key]: { loading: true, boxTime: null, error: null } };
    });
    if (!shouldFetch) return;
    try {
      const carData = await getCarData(data.session.session_key, row.driver_number);
      const boxTime = calcBoxTime(carData, row.date, row.pit_duration);
      setBoxTimes(prev => ({ ...prev, [key]: { loading: false, boxTime, error: null } }));
    } catch (e) {
      setBoxTimes(prev => ({ ...prev, [key]: { loading: false, boxTime: null, error: 'failed' } }));
    }
  };

  const measureAll = () => {
    if (sorted) sorted.forEach(row => measureOne(row));
  };

  const anyUnmeasured = sorted?.some(r => boxTimes[`${r.driver_number}-${r.lap_number}`] === undefined);

  const SortBtn = ({ val, label }) => (
    <button
      onClick={() => setSort(val)}
      style={{
        background: sort === val ? '#1e1e2e' : 'transparent',
        border: `1px solid ${sort === val ? '#444' : '#1e1e2e'}`,
        borderRadius: 4,
        color: sort === val ? '#e0e0e8' : '#555',
        fontSize: 10, fontWeight: 600, padding: '3px 8px', cursor: 'pointer',
        textTransform: 'uppercase', letterSpacing: '0.04em',
      }}
    >
      {label}
    </button>
  );

  return (
    <DashboardPanel title="Pit Stops" subtitle={subtitle}>
      {loading && <LoadingSpinner />}
      {error   && <ErrorMessage message={error} />}
      {!loading && !error && rows && (
        rows.length === 0 ? (
          <p className="f1-hint" style={{ padding: '1rem', textAlign: 'center' }}>
            No pit stops recorded for this session.
          </p>
        ) : (
          <>
            {/* Toolbar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <SortBtn val="lap"  label="By lap" />
                <SortBtn val="lane" label="Lane time" />
                <SortBtn val="box"  label="Box time" />
              </div>
              {anyUnmeasured && (
                <button
                  onClick={measureAll}
                  style={{
                    background: 'transparent', border: '1px solid #2a2a3e', borderRadius: 4,
                    color: '#666', fontSize: 10, fontWeight: 600, padding: '3px 10px',
                    cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}
                >
                  Measure all
                </button>
              )}
            </div>

            {/* Column headers */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '2.5rem 1fr 6rem 6rem 5rem',
              gap: '0 8px', padding: '0 4px 6px',
              borderBottom: '1px solid #1e1e2e',
            }}>
              {[['Lap', 'left'], ['Driver', 'left'], ['Lane', 'right'], ['Box', 'right'], ['', 'right']].map(([h, align]) => (
                <span key={h} style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: align }}>{h}</span>
              ))}
            </div>

            {/* Stop rows */}
            <div>
              {sorted.map((row, i) => {
                const key = `${row.driver_number}-${row.lap_number}`;
                const bt = boxTimes[key];
                const color = row.driver?.team_colour ? `#${row.driver.team_colour}` : '#888';
                const code  = row.driver?.name_acronym ?? `#${row.driver_number}`;

                return (
                  <div
                    key={`${key}-${i}`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '2.5rem 1fr 6rem 6rem 5rem',
                      gap: '0 8px', alignItems: 'center',
                      padding: '6px 4px',
                      borderBottom: '1px solid #0f0f18',
                    }}
                  >
                    <span style={{ fontSize: 11, color: '#555' }}>L{row.lap_number}</span>

                    <span style={{ fontSize: 12, fontWeight: 700, color }}>{code}</span>

                    <span style={{ fontSize: 12, color: '#888', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {row.pit_duration?.toFixed(1)}s
                    </span>

                    <span style={{
                      fontSize: 12, textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                      fontWeight: bt?.boxTime != null ? 600 : 400,
                      color: bt?.boxTime != null ? '#ffd700' : '#333',
                    }}>
                      {bt?.loading          ? '…'
                       : bt?.boxTime != null ? `${bt.boxTime.toFixed(1)}s`
                       : bt?.error          ? '—'
                       :                      '—'}
                    </span>

                    <div style={{ textAlign: 'right' }}>
                      {!bt && (
                        <button
                          onClick={() => measureOne(row)}
                          style={{
                            background: 'transparent', border: '1px solid #2a2a3e', borderRadius: 4,
                            color: '#555', fontSize: 10, fontWeight: 600,
                            padding: '2px 8px', cursor: 'pointer',
                          }}
                        >
                          Measure
                        </button>
                      )}
                      {bt?.error && (
                        <span style={{ fontSize: 10, color: '#555' }}>No data</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="f1-footnote" style={{ marginTop: '0.75rem' }}>
              Lane time: total time in the pit lane (entry to exit). Box time: stationary time at standstill,
              derived from car speed telemetry (±~0.3 s precision at 3.7 Hz). Click Measure to fetch
              telemetry for that stop on demand.
            </p>
          </>
        )
      )}
    </DashboardPanel>
  );
}
