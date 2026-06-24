import { useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useOpenF1 } from '../../hooks/useOpenF1';
import { resolveSession, getDrivers, getLaps } from '../../api/openf1';
import DashboardPanel from '../dashboard/DashboardPanel';
import LoadingSpinner from '../ui/LoadingSpinner';
import ErrorMessage from '../ui/ErrorMessage';

// Converts "1:32.456" or 92.456 (seconds) to total seconds
function toSeconds(lapTime) {
  if (!lapTime) return null;
  if (typeof lapTime === 'number') return lapTime;
  const parts = String(lapTime).split(':');
  if (parts.length === 2) {
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return parseFloat(lapTime);
}

function formatTime(seconds) {
  if (seconds == null) return '—';
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(3).padStart(6, '0');
  return `${m}:${s}`;
}

// Palette cycling for driver lines
const COLORS = [
  '#e8002d', '#00a0dd', '#39b54a', '#ff8700', '#0090ff',
  '#ffffff', '#fe86bc', '#b6babd', '#52e252', '#64c4ff',
];

async function fetchRaceData(sessionType, sessionKey) {
  const session = await resolveSession(sessionType, sessionKey);
  if (!session) throw new Error(`No ${sessionType.toLowerCase()} session found`);
  const [drivers, laps] = await Promise.all([
    getDrivers(session.session_key),
    getLaps(session.session_key),
  ]);
  return { session, drivers, laps };
}

// Build per-lap rows: { lap: N, [driverCode]: seconds, ... }
function buildChartData(drivers, laps, visibleDrivers) {
  const driverMap = Object.fromEntries(
    drivers.map((d) => [d.driver_number, d.name_acronym ?? d.driver_number])
  );

  const byLap = {};
  for (const lap of laps) {
    const code = driverMap[lap.driver_number];
    if (!code || !visibleDrivers.has(code)) continue;
    const secs = toSeconds(lap.lap_duration);
    if (secs == null || secs <= 0) continue;

    const lapNum = lap.lap_number;
    if (!byLap[lapNum]) byLap[lapNum] = { lap: lapNum };
    byLap[lapNum][code] = secs;
  }

  return Object.values(byLap).sort((a, b) => a.lap - b.lap);
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <p className="tooltip-lap">Lap {label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} style={{ color: entry.color }}>
          {entry.dataKey}: {formatTime(entry.value)}
        </p>
      ))}
    </div>
  );
}

export default function LapTimeChart({ sessionType = 'Race', sessionKey = null }) {
  const { data, loading, error } = useOpenF1(() => fetchRaceData(sessionType, sessionKey), [sessionType, sessionKey]);
  const [visibleSet, setVisibleSet] = useState(null); // null = show top 5 by default

  const { session, drivers, chartData, driverCodes } = useMemo(() => {
    if (!data) return {};

    const codes = [
      ...new Set(
        data.laps
          .map((l) => {
            const d = data.drivers.find((dr) => dr.driver_number === l.driver_number);
            return d?.name_acronym ?? null;
          })
          .filter(Boolean)
      ),
    ];

    // Default: top 5 drivers (first 5 alphabetically from unique set)
    const defaultVisible = new Set(codes.slice(0, 5));
    const active = visibleSet ?? defaultVisible;

    return {
      session: data.session,
      drivers: data.drivers,
      chartData: buildChartData(data.drivers, data.laps, active),
      driverCodes: codes,
    };
  }, [data, visibleSet]);

  const activeDrivers = visibleSet ?? (driverCodes ? new Set(driverCodes.slice(0, 5)) : new Set());

  function toggleDriver(code) {
    setVisibleSet((prev) => {
      const base = prev ?? new Set(driverCodes.slice(0, 5));
      const next = new Set(base);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  const subtitle = session
    ? `${session.location ?? ''} · ${session.year ?? ''} · Round ${session.round_number ?? '?'}`
    : undefined;

  return (
    <DashboardPanel title="Lap Times" subtitle={subtitle}>
      {loading && <LoadingSpinner />}
      {error && <ErrorMessage message={error} />}
      {!loading && !error && chartData && (
        <>
          <div className="driver-filter">
            {driverCodes.map((code, i) => (
              <button
                key={code}
                className={`driver-chip ${activeDrivers.has(code) ? 'active' : ''}`}
                style={{ '--chip-color': COLORS[i % COLORS.length] }}
                onClick={() => toggleDriver(code)}
              >
                {code}
              </button>
            ))}
          </div>

          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
              <XAxis
                dataKey="lap"
                label={{ value: 'Lap', position: 'insideBottomRight', offset: -8, fill: '#888' }}
                tick={{ fill: '#888', fontSize: 12 }}
              />
              <YAxis
                tickFormatter={formatTime}
                tick={{ fill: '#888', fontSize: 11 }}
                width={60}
                domain={['auto', 'auto']}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {driverCodes
                .filter((code) => activeDrivers.has(code))
                .map((code, i) => (
                  <Line
                    key={code}
                    type="monotone"
                    dataKey={code}
                    stroke={COLORS[i % COLORS.length]}
                    dot={false}
                    strokeWidth={2}
                    connectNulls
                  />
                ))}
            </LineChart>
          </ResponsiveContainer>
        </>
      )}
    </DashboardPanel>
  );
}
