import { useMemo } from 'react';
import { useOpenF1 } from '../../hooks/useOpenF1';
import { resolveSession, getDrivers, getStints } from '../../api/openf1';
import DashboardPanel from '../dashboard/DashboardPanel';
import LoadingSpinner from '../ui/LoadingSpinner';
import ErrorMessage from '../ui/ErrorMessage';

const COMPOUND_COLOR = {
  SOFT:         { bg: '#e8002d', fg: '#fff' },
  MEDIUM:       { bg: '#ffd700', fg: '#0d0d14' },
  HARD:         { bg: '#d9d9d9', fg: '#0d0d14' },
  INTERMEDIATE: { bg: '#39b54a', fg: '#fff' },
  WET:          { bg: '#00a0dd', fg: '#fff' },
};

const COMPOUND_LABEL = {
  SOFT: 'S', MEDIUM: 'M', HARD: 'H', INTERMEDIATE: 'I', WET: 'W',
};

const FALLBACK = { bg: '#444', fg: '#fff' };

async function fetchStrategyData(sessionType, sessionKey) {
  const session = await resolveSession(sessionType, sessionKey);
  if (!session) throw new Error(`No ${sessionType.toLowerCase()} session found`);
  const [drivers, stints] = await Promise.all([
    getDrivers(session.session_key),
    getStints(session.session_key),
  ]);
  return { session, drivers, stints };
}

function buildRows(drivers, stints) {
  const driverMap = Object.fromEntries(
    drivers.map((d) => [d.driver_number, d])
  );

  // Total laps = highest lap_end seen across all stints
  const totalLaps = stints.reduce((max, s) => Math.max(max, s.lap_end ?? 0), 0);

  // Group stints by driver, sorted by stint_number
  const byDriver = {};
  for (const stint of stints) {
    const num = stint.driver_number;
    if (!byDriver[num]) byDriver[num] = [];
    byDriver[num].push(stint);
  }
  for (const num of Object.keys(byDriver)) {
    byDriver[num].sort((a, b) => a.stint_number - b.stint_number);
  }

  // Sort drivers by team then driver number for a clean grouped layout
  const rows = Object.entries(byDriver)
    .map(([num, driverStints]) => ({
      driver: driverMap[num],
      stints: driverStints,
    }))
    .filter((r) => r.driver)
    .sort((a, b) => {
      const teamA = a.driver.team_name ?? '';
      const teamB = b.driver.team_name ?? '';
      if (teamA !== teamB) return teamA.localeCompare(teamB);
      return (a.driver.driver_number ?? 0) - (b.driver.driver_number ?? 0);
    });

  return { rows, totalLaps };
}

// Render lap-number tick marks along the top axis
function LapAxis({ totalLaps }) {
  const interval = totalLaps <= 30 ? 5 : totalLaps <= 60 ? 10 : 15;
  const ticks = [];
  for (let lap = interval; lap <= totalLaps; lap += interval) {
    ticks.push(lap);
  }
  return (
    <div className="strategy-axis">
      {ticks.map((lap) => (
        <span
          key={lap}
          className="strategy-tick"
          style={{ left: `${((lap - 1) / totalLaps) * 100}%` }}
        >
          {lap}
        </span>
      ))}
    </div>
  );
}

function StintBar({ stint, totalLaps }) {
  const lapStart = stint.lap_start ?? 1;
  const lapEnd   = stint.lap_end   ?? lapStart;
  const compound = (stint.compound ?? '').toUpperCase();
  const palette  = COMPOUND_COLOR[compound] ?? FALLBACK;
  const label    = COMPOUND_LABEL[compound] ?? '?';

  const left  = ((lapStart - 1) / totalLaps) * 100;
  const width = ((lapEnd - lapStart + 1) / totalLaps) * 100;

  const title = [
    compound,
    `Laps ${lapStart}–${lapEnd}`,
    stint.tyre_age_at_start != null ? `Age: +${stint.tyre_age_at_start}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      className="strategy-stint"
      style={{ left: `${left}%`, width: `${width}%`, background: palette.bg, color: palette.fg }}
      title={title}
      aria-label={title}
    >
      {width > 4 && <span className="stint-label">{label}</span>}
    </div>
  );
}

export default function TireStrategyChart({ sessionType = 'Race', sessionKey = null }) {
  const { data, loading, error } = useOpenF1(() => fetchStrategyData(sessionType, sessionKey), [sessionType, sessionKey]);

  const { rows, totalLaps, subtitle } = useMemo(() => {
    if (!data) return {};
    const { rows, totalLaps } = buildRows(data.drivers, data.stints);
    const s = data.session;
    return {
      rows,
      totalLaps,
      subtitle: s ? `${s.location ?? ''} · ${s.year ?? ''} · Round ${s.round_number ?? '?'}` : undefined,
    };
  }, [data]);

  return (
    <DashboardPanel title="Tire Strategy" subtitle={subtitle}>
      {loading && <LoadingSpinner />}
      {error && <ErrorMessage message={error} />}
      {!loading && !error && rows && (
        <div className="strategy-wrap">
          <div className="strategy-legend">
            {Object.entries(COMPOUND_COLOR).map(([name, { bg, fg }]) => (
              <span key={name} className="compound-chip" style={{ background: bg, color: fg }}>
                {COMPOUND_LABEL[name]} {name.charAt(0) + name.slice(1).toLowerCase()}
              </span>
            ))}
          </div>

          <LapAxis totalLaps={totalLaps} />

          <div className="strategy-grid">
            {rows.map(({ driver, stints }) => (
              <div key={driver.driver_number} className="strategy-row">
                <span
                  className="strategy-driver"
                  style={{ color: driver.team_colour ? `#${driver.team_colour}` : '#888' }}
                >
                  {driver.name_acronym ?? driver.driver_number}
                </span>
                <div className="strategy-track">
                  {stints.map((stint) => (
                    <StintBar key={stint.stint_number} stint={stint} totalLaps={totalLaps} />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="strategy-lap-range">
            <span>Lap 1</span>
            <span>Lap {totalLaps}</span>
          </div>
        </div>
      )}
    </DashboardPanel>
  );
}
