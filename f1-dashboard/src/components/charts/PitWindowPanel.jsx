import { useState, useEffect, useMemo } from 'react';
import { useOpenF1 } from '../../hooks/useOpenF1';
import { getLatestSession, getDrivers, getLaps } from '../../api/openf1';
import DashboardPanel from '../dashboard/DashboardPanel';
import LoadingSpinner from '../ui/LoadingSpinner';
import ErrorMessage from '../ui/ErrorMessage';

// ── Model ─────────────────────────────────────────────────────────────────────

/**
 * Build running order at the end of lap N.
 * Primary sort: laps completed (desc) — lapped cars go to the back.
 * Secondary sort: cumulative race time (asc) — faster cars ahead.
 */
function buildRunningOrder(laps, drivers, lapN) {
  const driverMap = Object.fromEntries(drivers.map(d => [d.driver_number, d]));
  const cumTime = {};
  const lapCount = {};

  for (const lap of laps) {
    if (lap.lap_number > lapN || !lap.lap_duration || lap.lap_duration <= 0) continue;
    const n = lap.driver_number;
    cumTime[n] = (cumTime[n] ?? 0) + lap.lap_duration;
    lapCount[n] = Math.max(lapCount[n] ?? 0, lap.lap_number);
  }

  return Object.keys(cumTime)
    .map(n => ({ driverNum: Number(n), driver: driverMap[Number(n)], cumTime: cumTime[n], lapCount: lapCount[n] }))
    .filter(d => d.driver)
    .sort((a, b) => b.lapCount - a.lapCount || a.cumTime - b.cumTime);
}

/**
 * Return the running order with a ghost car inserted at its emergence position.
 * Ghost car has the same lap count as the pitting driver but cumTime += pitCost.
 * Any driver who was within pitCost seconds behind the pitter now comes out ahead.
 */
function withGhost(order, driverNum, pitCost) {
  const realIdx = order.findIndex(d => d.driverNum === driverNum);
  if (realIdx === -1) return { order, ghostPos: null, fromPos: null };

  const base = order[realIdx];
  const ghost = { ...base, cumTime: base.cumTime + pitCost, isGhost: true };
  const fromPos = realIdx + 1;

  // Remove real driver, insert ghost in correct position
  const rest = order.filter((_, i) => i !== realIdx);
  let insertAt = rest.length;
  for (let i = 0; i < rest.length; i++) {
    const d = rest[i];
    if (d.lapCount < ghost.lapCount) { insertAt = i; break; }
    if (d.lapCount === ghost.lapCount && d.cumTime > ghost.cumTime) { insertAt = i; break; }
  }

  const next = [...rest];
  next.splice(insertAt, 0, ghost);
  return { order: next, ghostPos: insertAt + 1, fromPos };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DriverNode({ entry, pos, isGhost, isSelected }) {
  const teamColor = entry.driver?.team_colour ? `#${entry.driver.team_colour}` : '#555';
  const code = entry.driver?.name_acronym ?? '?';

  return (
    <div
      className={[
        'pw-node',
        isGhost     ? 'pw-node--ghost'    : '',
        isSelected  ? 'pw-node--selected' : '',
      ].filter(Boolean).join(' ')}
      style={{ '--tc': teamColor }}
      title={`P${pos} · ${code} · ${(entry.cumTime / 60).toFixed(2)} min`}
    >
      <div className="pw-dot">{code}</div>
      <div className="pw-pos">P{pos}</div>
    </div>
  );
}

function TrackStrip({ order, ghostPos, fromPos, driverNum, pitCost, label, mode }) {
  if (!order.length) return null;

  const ghostIdx = ghostPos != null ? ghostPos - 1 : -1;
  const ghost = ghostIdx >= 0 ? order[ghostIdx] : null;
  const carAhead  = ghostIdx > 0            ? order[ghostIdx - 1] : null;
  const carBehind = ghostIdx < order.length - 1 ? order[ghostIdx + 1] : null;

  const gapAhead  = carAhead  && ghost ? (ghost.cumTime - carAhead.cumTime).toFixed(1)  : null;
  const gapBehind = carBehind && ghost ? (carBehind.cumTime - ghost.cumTime).toFixed(1) : null;

  const delta = ghostPos != null && fromPos != null ? ghostPos - fromPos : 0;
  const deltaLabel = delta === 0 ? '±0 positions' : delta > 0 ? `−${delta} position${delta > 1 ? 's' : ''}` : `+${-delta} position${-delta > 1 ? 's' : ''}`;
  const deltaClass = delta === 0 ? 'neutral' : delta > 0 ? 'bad' : 'good';

  return (
    <div className="pw-scenario">
      <div className="pw-scenario-header">
        <span className="pw-scenario-label">{label}</span>
        <span className={`pw-scenario-delta pw-delta--${deltaClass}`}>
          P{fromPos} → P{ghostPos} · {deltaLabel}
        </span>
        <span className="pw-scenario-cost">{pitCost}s pit cost</span>
      </div>

      <div className="pw-strip-scroll">
        <div className="pw-strip">
          {order.map((entry, i) => (
            <DriverNode
              key={`${entry.driverNum}-${entry.isGhost ? 'g' : 'r'}`}
              entry={entry}
              pos={i + 1}
              isGhost={!!entry.isGhost}
              isSelected={!entry.isGhost && entry.driverNum === driverNum}
            />
          ))}
        </div>
      </div>

      <div className="pw-neighbors">
        {carAhead ? (
          <span className="pw-neighbor pw-neighbor--ahead">
            ← {carAhead.driver?.name_acronym ?? '?'} +{gapAhead}s ahead
          </span>
        ) : (
          <span className="pw-neighbor pw-neighbor--ahead pw-neighbor--none">emerges in front</span>
        )}
        <span className="pw-neighbor-sep" />
        {carBehind ? (
          <span className="pw-neighbor pw-neighbor--behind">
            {carBehind.driver?.name_acronym ?? '?'} +{gapBehind}s behind →
          </span>
        ) : (
          <span className="pw-neighbor pw-neighbor--behind pw-neighbor--none">last car out</span>
        )}
      </div>
    </div>
  );
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchWindowData(sessionType) {
  const session = await getLatestSession(sessionType);
  if (!session) throw new Error(`No ${sessionType.toLowerCase()} session found`);
  const [drivers, laps] = await Promise.all([
    getDrivers(session.session_key),
    getLaps(session.session_key),
  ]);
  return { session, drivers, laps };
}

// ── Panel ─────────────────────────────────────────────────────────────────────

const DEFAULT_NORMAL_COST = 23;
const DEFAULT_SC_COST     = 20;

export default function PitWindowPanel({ sessionType = 'Race' }) {
  const { data, loading, error } = useOpenF1(() => fetchWindowData(sessionType), [sessionType]);

  const [driverNum,    setDriverNum]    = useState(null);
  const [lapN,         setLapN]         = useState(null);
  const [normalCost,   setNormalCost]   = useState(DEFAULT_NORMAL_COST);
  const [scCost,       setScCost]       = useState(DEFAULT_SC_COST);

  const maxLap = useMemo(() => {
    if (!data) return 1;
    return data.laps.reduce((m, l) => Math.max(m, l.lap_number), 1);
  }, [data]);

  // Set defaults once data loads
  useEffect(() => {
    if (!data || driverNum != null) return;
    setDriverNum(data.drivers[0]?.driver_number ?? null);
    setLapN(maxLap);
  }, [data, driverNum, maxLap]);

  // Keep lapN in range if maxLap changes
  useEffect(() => {
    if (lapN != null && lapN > maxLap) setLapN(maxLap);
  }, [maxLap, lapN]);

  const derived = useMemo(() => {
    if (!data || driverNum == null || lapN == null) return null;

    const base = buildRunningOrder(data.laps, data.drivers, lapN);
    const current = { order: base, ghostPos: base.findIndex(d => d.driverNum === driverNum) + 1, fromPos: null };
    const normal = withGhost(base, driverNum, normalCost);
    const sc     = withGhost(base, driverNum, scCost);

    return { base, normal, sc };
  }, [data, driverNum, lapN, normalCost, scCost]);

  const session = data?.session;
  const subtitle = session
    ? `${session.location ?? ''} · ${session.year ?? ''} · Round ${session.round_number ?? '?'}`
    : undefined;

  const drivers = data?.drivers ?? [];
  const selectedDriver = drivers.find(d => d.driver_number === driverNum);
  const isSprint = sessionType === 'Sprint';

  return (
    <DashboardPanel title="Pit Window" subtitle={subtitle}>
      {loading && <LoadingSpinner />}
      {error   && <ErrorMessage message={error} />}
      {isSprint && data && (
        <p className="session-type-note">
          Sprint races rarely feature pit stops — this shows where a driver would emerge if they did pit.
        </p>
      )}

      {!loading && !error && data && (
        <>
          {/* Controls */}
          <div className="pw-controls">
            <label className="pw-control-group">
              <span className="pw-control-label">Driver</span>
              <select
                className="pw-select"
                value={driverNum ?? ''}
                onChange={e => setDriverNum(Number(e.target.value))}
              >
                {drivers.map(d => (
                  <option key={d.driver_number} value={d.driver_number}>
                    {d.name_acronym ?? d.driver_number}
                  </option>
                ))}
              </select>
            </label>

            <label className="pw-control-group pw-control-group--wide">
              <span className="pw-control-label">Pit on lap <strong>{lapN}</strong> / {maxLap}</span>
              <input
                type="range"
                min={1}
                max={maxLap}
                value={lapN ?? 1}
                onChange={e => setLapN(Number(e.target.value))}
                className="pw-slider"
              />
            </label>

            <div className="pw-cost-group">
              <label className="pw-control-group">
                <span className="pw-control-label">Normal pit (s)</span>
                <input
                  type="number"
                  min={15}
                  max={60}
                  value={normalCost}
                  onChange={e => setNormalCost(Number(e.target.value))}
                  className="pw-number"
                />
              </label>
              <label className="pw-control-group">
                <span className="pw-control-label">SC pit (s)</span>
                <input
                  type="number"
                  min={10}
                  max={60}
                  value={scCost}
                  onChange={e => setScCost(Number(e.target.value))}
                  className="pw-number"
                />
              </label>
            </div>
          </div>

          {/* Current order reference strip */}
          {derived && (
            <div className="pw-current">
              <div className="pw-current-label">
                Running order after lap {lapN}
                {selectedDriver && (
                  <span className="pw-current-driver">
                    — {selectedDriver.name_acronym} currently P{derived.base.findIndex(d => d.driverNum === driverNum) + 1}
                  </span>
                )}
              </div>
              <div className="pw-strip-scroll">
                <div className="pw-strip pw-strip--current">
                  {derived.base.map((entry, i) => (
                    <DriverNode
                      key={entry.driverNum}
                      entry={entry}
                      pos={i + 1}
                      isGhost={false}
                      isSelected={entry.driverNum === driverNum}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Ghost scenarios */}
          {derived && (
            <div className="pw-scenarios">
              <TrackStrip
                order={derived.normal.order}
                ghostPos={derived.normal.ghostPos}
                fromPos={derived.normal.fromPos}
                driverNum={driverNum}
                pitCost={normalCost}
                label="Normal race"
                mode="normal"
              />
              <TrackStrip
                order={derived.sc.order}
                ghostPos={derived.sc.ghostPos}
                fromPos={derived.sc.fromPos}
                driverNum={driverNum}
                pitCost={scCost}
                label="Safety car"
                mode="sc"
              />
            </div>
          )}

          <p className="pw-footnote">
            Model: cumulative race time per driver through lap {lapN ?? '—'}. Ghost car's emergence time = current race time + pit cost.
            Gap to cars in front/behind is relative to ghost car exit. Safety car cost is lower because the field also slows — adjust SC cost to match expected SC lap time.
          </p>
        </>
      )}
    </DashboardPanel>
  );
}
