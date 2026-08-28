import { useState, useMemo } from 'react';
import { useOpenF1 } from '../../hooks/useOpenF1';
import { resolveSession, getDrivers, getLaps, getPitStops, getRaceControl, getLocation } from '../../api/openf1';
import { detectOvertakes } from '../../utils/overtakes';
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

// Brute-force closest-approach between two GPS traces — n is small (~one
// lap at ~3.7Hz, a few hundred points per driver) so an O(n²) scan is fine
// and avoids any subtlety around time-alignment assumptions.
function findClosestApproach(pointsA, pointsB) {
  let best = null;
  for (const a of pointsA) {
    for (const b of pointsB) {
      const dx = a.x - b.x, dy = a.y - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (!best || dist < best.dist) best = { dist, point: a };
    }
  }
  return best;
}

function OvertakeMap({ trackPath, marker }) {
  if (!trackPath?.length) return null;
  const W = 380, H = 220, PAD = 16;
  const xs = trackPath.map(p => p.x), ys = trackPath.map(p => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  const sx = (W - 2 * PAD) / Math.max(x1 - x0, 1);
  const sy = (H - 2 * PAD) / Math.max(y1 - y0, 1);
  const sc = Math.min(sx, sy);
  const ox = PAD + ((W - 2 * PAD) - (x1 - x0) * sc) / 2;
  const oy = PAD + ((H - 2 * PAD) - (y1 - y0) * sc) / 2;
  const px = x => (ox + (x - x0) * sc).toFixed(1);
  const py = y => (H - oy - (y - y0) * sc).toFixed(1); // flip Y axis

  const outline = trackPath.map(p => `${px(p.x)},${py(p.y)}`).join(' ');

  return (
    <svg width={W} height={H} style={{ display: 'block', margin: '0 auto', borderRadius: 8, background: '#0d0d14' }}>
      <polyline points={outline} fill="none" stroke="#2a2a3e" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
      {marker && (
        <circle cx={px(marker.x)} cy={py(marker.y)} r={7} fill="#e8002d" stroke="#fff" strokeWidth={2} />
      )}
    </svg>
  );
}

export default function OvertakesPanel({ sessionType = 'Race', sessionKey = null }) {
  const { data, loading, error } = useOpenF1(
    () => fetchData(sessionType, sessionKey),
    [sessionType, sessionKey]
  );

  // `${lap}-${attacker}-${defender}` → { loading, map: {trackPath, marker}, error }
  const [located, setLocated] = useState({});
  const [activeKey, setActiveKey] = useState(null);

  const { overtakes, driverMap, summary, subtitle, lapWindowByDriver } = useMemo(() => {
    if (!data) return {};
    const { session, laps } = data;
    const { overtakes, driverMap } = detectOvertakes(data);

    const deltas = overtakes.map(o => o.paceDelta).filter(v => v != null);
    const avgPace = deltas.length ? deltas.reduce((s, v) => s + v, 0) / deltas.length : null;

    // driverNum -> lapNum -> {start, end} (ms epoch) for the "Locate" fetch window
    const lapWindowByDriver = {};
    for (const l of laps) {
      if (!l.driver_number || !l.lap_number || !l.date_start || !l.lap_duration) continue;
      if (!lapWindowByDriver[l.driver_number]) lapWindowByDriver[l.driver_number] = {};
      const start = new Date(l.date_start).getTime();
      lapWindowByDriver[l.driver_number][l.lap_number] = { start, end: start + l.lap_duration * 1000 };
    }

    return {
      overtakes, driverMap, lapWindowByDriver,
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

  const keyFor = o => `${o.lap}-${o.attacker}-${o.defender}`;

  const locate = async (o) => {
    const key = keyFor(o);
    setActiveKey(key);
    if (located[key]) return;

    const aWin = lapWindowByDriver?.[o.attacker]?.[o.lap];
    const dWin = lapWindowByDriver?.[o.defender]?.[o.lap];
    if (!aWin || !dWin) {
      setLocated(prev => ({ ...prev, [key]: { loading: false, map: null, error: 'No lap timing data' } }));
      return;
    }

    setLocated(prev => ({ ...prev, [key]: { loading: true, map: null, error: null } }));

    const PAD_MS = 2000;
    const t0 = Math.min(aWin.start, dWin.start) - PAD_MS;
    const t1 = Math.max(aWin.end, dWin.end) + PAD_MS;

    try {
      const [attackerLoc, defenderLoc] = await Promise.all([
        getLocation(data.session.session_key, o.attacker),
        getLocation(data.session.session_key, o.defender),
      ]);
      const extract = raw => raw
        .filter(p => { const t = new Date(p.date).getTime(); return t >= t0 && t <= t1; })
        .map(p => ({ x: p.x ?? 0, y: p.y ?? 0, t: new Date(p.date).getTime() }))
        .sort((a, b) => a.t - b.t);

      const aPts = extract(attackerLoc);
      const dPts = extract(defenderLoc);
      if (aPts.length < 2 || dPts.length < 2) {
        setLocated(prev => ({ ...prev, [key]: { loading: false, map: null, error: 'No GPS data for this lap' } }));
        return;
      }

      const closest = findClosestApproach(aPts, dPts);
      setLocated(prev => ({
        ...prev,
        [key]: { loading: false, error: null, map: { trackPath: aPts, marker: closest.point } },
      }));
    } catch (e) {
      setLocated(prev => ({ ...prev, [key]: { loading: false, map: null, error: e?.message ?? 'Failed to load' } }));
    }
  };

  const activeMap = activeKey ? located[activeKey] : null;
  const activeOvertake = overtakes?.find(o => keyFor(o) === activeKey);

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

            {activeKey && (
              <div style={{ marginBottom: 10, padding: '10px 0', borderBottom: '1px solid #1e1e2e' }}>
                {activeMap?.loading && <LoadingSpinner />}
                {activeMap?.error && (
                  <p className="f1-hint" style={{ textAlign: 'center' }}>{activeMap.error}</p>
                )}
                {activeMap?.map && (
                  <>
                    <OvertakeMap trackPath={activeMap.map.trackPath} marker={activeMap.map.marker} />
                    {activeOvertake && (
                      <p style={{ textAlign: 'center', fontSize: 11, color: '#888', marginTop: 6 }}>
                        Estimated closest-approach point — <DriverTag num={activeOvertake.attacker} /> past{' '}
                        <DriverTag num={activeOvertake.defender} /> on Lap {activeOvertake.lap}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            <div style={{
              display: 'grid', gridTemplateColumns: '2.5rem 1fr 4rem 5rem 6rem 5rem',
              gap: '0 8px', padding: '0 4px 6px', borderBottom: '1px solid #1e1e2e',
            }}>
              {[['Lap', 'left'], ['Pass', 'left'], ['To', 'right'], ['Gap', 'right'], ['Pace', 'right'], ['', 'right']].map(([h, align]) => (
                <span key={h} style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: align }}>{h}</span>
              ))}
            </div>

            <div style={{ maxHeight: 500, overflowY: 'auto' }}>
              {overtakes.map((o, i) => {
                const key = keyFor(o);
                const isActive = activeKey === key;
                return (
                  <div key={i} style={{
                    display: 'grid', gridTemplateColumns: '2.5rem 1fr 4rem 5rem 6rem 5rem',
                    gap: '0 8px', alignItems: 'center', padding: '6px 4px',
                    borderBottom: '1px solid #0f0f18',
                    background: isActive ? '#12121f' : 'transparent',
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
                    <div style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => locate(o)}
                        style={{
                          background: isActive ? '#1e1e2e' : 'transparent',
                          border: `1px solid ${isActive ? '#444' : '#2a2a3e'}`,
                          borderRadius: 4, color: isActive ? '#e0e0e8' : '#555',
                          fontSize: 10, fontWeight: 600, padding: '2px 8px', cursor: 'pointer',
                        }}
                      >
                        Locate
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="f1-footnote" style={{ marginTop: '0.75rem' }}>
              Detected by comparing driver rank (cumulative race time) lap-over-lap; pit in/out laps, Safety
              Car / VSC laps, and lap 1 are excluded. "Gap" = time the attacker was behind by before the pass.
              "Pace" = attacker's lap time minus defender's on the pass lap (green = attacker faster that lap) —
              covers the whole lap, not just the overtaking corner, so it can occasionally be positive even
              though the attacker ended the lap ahead. "Locate" fetches GPS for that lap and marks the point
              where the two cars were physically closest, as an estimate of where the pass happened.
            </p>
          </>
        )
      )}
    </DashboardPanel>
  );
}
