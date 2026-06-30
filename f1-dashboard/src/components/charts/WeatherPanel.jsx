import { useMemo } from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { useOpenF1 } from '../../hooks/useOpenF1';
import { resolveSession, getWeather } from '../../api/openf1';
import DashboardPanel from '../dashboard/DashboardPanel';
import LoadingSpinner from '../ui/LoadingSpinner';
import ErrorMessage from '../ui/ErrorMessage';

async function fetchData(sessionType, sessionKey) {
  const session = await resolveSession(sessionType, sessionKey);
  if (!session) throw new Error(`No ${sessionType.toLowerCase()} session found`);
  const weather = await getWeather(session.session_key);
  return { session, weather };
}

function StatChip({ label, value, color = '#ccc' }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 60 }}>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    </div>
  );
}

export default function WeatherPanel({ sessionType = 'Race', sessionKey = null }) {
  const { data, loading, error } = useOpenF1(
    () => fetchData(sessionType, sessionKey),
    [sessionType, sessionKey]
  );

  const { chartData, stats, subtitle } = useMemo(() => {
    if (!data) return {};
    const { session, weather } = data;
    const sub = session
      ? `${session.location ?? ''} · ${session.year ?? ''} · ${session.session_type ?? ''}`
      : undefined;

    if (!weather?.length) return { subtitle: sub };

    const sorted = [...weather].sort((a, b) => new Date(a.date) - new Date(b.date));
    const t0 = new Date(sorted[0].date).getTime();

    const chartData = sorted.map(w => ({
      min: Math.round((new Date(w.date).getTime() - t0) / 60000),
      track: w.track_temperature ?? null,
      air: w.air_temperature ?? null,
      humidity: w.humidity ?? null,
    }));

    const tracks = sorted.map(w => w.track_temperature).filter(v => v != null);
    const airs = sorted.map(w => w.air_temperature).filter(v => v != null);
    const winds = sorted.map(w => w.wind_speed ?? 0);
    const rainCount = sorted.filter(w => w.rainfall).length;
    const lastHumidity = [...sorted].reverse().find(w => w.humidity != null)?.humidity ?? null;

    const stats = {
      maxTrack: tracks.length ? `${Math.max(...tracks).toFixed(0)}°C` : '—',
      minTrack: tracks.length ? `${Math.min(...tracks).toFixed(0)}°C` : '—',
      humidity: lastHumidity != null ? `${lastHumidity}%` : '—',
      wind: winds.length ? `${(winds.reduce((s, v) => s + v, 0) / winds.length).toFixed(1)} m/s` : '—',
      rain: rainCount > 0,
    };

    return { chartData, stats, subtitle: sub };
  }, [data]);

  return (
    <DashboardPanel title="Weather" subtitle={subtitle}>
      {loading && <LoadingSpinner />}
      {error   && <ErrorMessage message={error} />}
      {!loading && !error && data && !chartData?.length && (
        <p className="f1-hint" style={{ padding: '1rem', textAlign: 'center' }}>No weather data for this session.</p>
      )}
      {!loading && !error && chartData?.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            <StatChip label="Track max" value={stats.maxTrack} color="#e8002d" />
            <StatChip label="Track min" value={stats.minTrack} color="#888" />
            <StatChip label="Humidity" value={stats.humidity} color="#00a0dd" />
            <StatChip label="Avg wind" value={stats.wind} />
            {stats.rain && <StatChip label="Rain" value="Yes" color="#00a0dd" />}
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 44, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
              <XAxis
                dataKey="min"
                tick={{ fill: '#888', fontSize: 10 }}
                label={{ value: 'Min into session', position: 'insideBottomRight', offset: -8, fill: '#555', fontSize: 10 }}
              />
              <YAxis
                yAxisId="temp"
                tick={{ fill: '#888', fontSize: 10 }}
                width={32}
                label={{ value: '°C', angle: -90, position: 'insideLeft', fill: '#555', fontSize: 10 }}
              />
              <YAxis
                yAxisId="hum"
                orientation="right"
                tick={{ fill: '#888', fontSize: 10 }}
                width={36}
                domain={[0, 100]}
                tickFormatter={v => `${v}%`}
              />
              <Tooltip
                contentStyle={{ background: '#13131f', border: '1px solid #2a2a3e', fontSize: 11 }}
                formatter={(v, name) => {
                  if (v == null) return ['—', name];
                  if (name === 'Humidity') return [`${v}%`, name];
                  return [`${v}°C`, name];
                }}
                labelFormatter={m => `+${m} min`}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line yAxisId="temp" dataKey="track" name="Track" stroke="#e8002d"
                dot={false} strokeWidth={1.5} isAnimationActive={false} connectNulls />
              <Line yAxisId="temp" dataKey="air" name="Air" stroke="#ffd700"
                dot={false} strokeWidth={1.5} strokeDasharray="4 2" isAnimationActive={false} connectNulls />
              <Line yAxisId="hum" dataKey="humidity" name="Humidity" stroke="#00a0dd"
                dot={false} strokeWidth={1} strokeDasharray="2 2" isAnimationActive={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </>
      )}
    </DashboardPanel>
  );
}
