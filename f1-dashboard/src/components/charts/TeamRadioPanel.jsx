import { useState, useMemo, useRef, useEffect } from 'react';
import { useOpenF1 } from '../../hooks/useOpenF1';
import { resolveSession, getTeamRadio, getDrivers, getLaps } from '../../api/openf1';
import DashboardPanel from '../dashboard/DashboardPanel';
import LoadingSpinner from '../ui/LoadingSpinner';
import ErrorMessage from '../ui/ErrorMessage';

async function fetchData(sessionType, sessionKey) {
  const session = await resolveSession(sessionType, sessionKey);
  if (!session) throw new Error(`No ${sessionType.toLowerCase()} session found`);
  const [radio, drivers, laps] = await Promise.all([
    getTeamRadio(session.session_key),
    getDrivers(session.session_key),
    getLaps(session.session_key),
  ]);
  return { session, radio, drivers, laps };
}

function fmtElapsed(ms) {
  if (ms == null || ms < 0) return null;
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = (s % 60).toString().padStart(2, '0');
  return `+${m}:${sec}`;
}

export default function TeamRadioPanel({ sessionType = 'Race', sessionKey = null }) {
  const { data, loading, error } = useOpenF1(
    () => fetchData(sessionType, sessionKey),
    [sessionType, sessionKey]
  );

  const [selected, setSelected] = useState(null); // null = all drivers shown
  const [playing, setPlaying] = useState(null);   // URL currently playing
  const audioRef = useRef(null);

  // Stop playback when session changes
  useEffect(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(null);
    setSelected(null);
  }, [sessionType, sessionKey]);

  const { driverMap, messages, subtitle } = useMemo(() => {
    if (!data) return {};
    const { session, radio, drivers, laps } = data;

    const sub = session
      ? `${session.location ?? ''} · ${session.year ?? ''} · ${session.session_type ?? ''}`
      : undefined;

    const driverMap = Object.fromEntries(drivers.map(d => [d.driver_number, d]));
    const sessionStart = session?.date_start ? new Date(session.date_start).getTime() : null;

    // Build per-driver lap-start timeline for cross-referencing radio timestamps
    const lapStarts = {};
    for (const lap of laps) {
      if (!lap.driver_number || !lap.lap_number || !lap.date_start) continue;
      if (!lapStarts[lap.driver_number]) lapStarts[lap.driver_number] = [];
      lapStarts[lap.driver_number].push({
        lap: lap.lap_number,
        t: new Date(lap.date_start).getTime(),
      });
    }
    for (const arr of Object.values(lapStarts)) arr.sort((a, b) => a.t - b.t);

    const messages = [...(radio ?? [])]
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .map(r => {
        const t = new Date(r.date).getTime();
        const elapsed = sessionStart ? t - sessionStart : null;

        // Most recent lap whose date_start falls before this radio message
        let lapNum = null;
        for (const { lap, t: lt } of lapStarts[r.driver_number] ?? []) {
          if (lt <= t) lapNum = lap;
          else break;
        }

        return {
          ...r,
          _t: t,
          _elapsed: elapsed,
          _lap: lapNum,
          _driver: driverMap[r.driver_number],
        };
      });

    return { driverMap, messages, subtitle: sub };
  }, [data]);

  // Sorted unique driver list ordered by first appearance in the radio log
  const driverList = useMemo(() => {
    if (!messages) return [];
    const seen = new Set();
    const list = [];
    for (const m of messages) {
      if (!m.driver_number || seen.has(m.driver_number)) continue;
      seen.add(m.driver_number);
      const d = m._driver;
      list.push({
        num: m.driver_number,
        code: d?.name_acronym ?? `#${m.driver_number}`,
        color: d?.team_colour ? `#${d.team_colour}` : '#888',
      });
    }
    return list.sort((a, b) => a.code.localeCompare(b.code));
  }, [messages]);

  const activeSet = selected ?? new Set(driverList.map(d => d.num));

  const filtered = useMemo(
    () => (messages ?? []).filter(m => activeSet.has(m.driver_number)),
    [messages, activeSet]
  );

  const toggleDriver = num => {
    setSelected(prev => {
      const base = prev ?? new Set(driverList.map(d => d.num));
      const next = new Set(base);
      next.has(num) ? next.delete(num) : next.add(num);
      return next;
    });
  };

  const playPause = url => {
    if (playing === url) {
      audioRef.current?.pause();
      audioRef.current = null;
      setPlaying(null);
    } else {
      audioRef.current?.pause();
      audioRef.current = null;
      const audio = new Audio(url);
      audio.onended = () => setPlaying(null);
      audio.play().catch(() => setPlaying(null));
      audioRef.current = audio;
      setPlaying(url);
    }
  };

  return (
    <DashboardPanel title="Team Radio" subtitle={subtitle}>
      {loading && <LoadingSpinner />}
      {error   && <ErrorMessage message={error} />}
      {!loading && !error && data && (
        <>
          {driverList.length > 0 && (
            <div className="driver-filter">
              {driverList.map(({ num, code, color }) => (
                <button
                  key={num}
                  className={`driver-chip ${activeSet.has(num) ? 'active' : ''}`}
                  style={{ '--chip-color': color }}
                  onClick={() => toggleDriver(num)}
                >
                  {code}
                </button>
              ))}
            </div>
          )}

          {filtered.length === 0 ? (
            <p className="f1-hint" style={{ padding: '1rem', textAlign: 'center' }}>
              No team radio recordings for this session.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 500, overflowY: 'auto' }}>
              {filtered.map((m, i) => {
                const color = m._driver?.team_colour ? `#${m._driver.team_colour}` : '#888';
                const code = m._driver?.name_acronym ?? `#${m.driver_number}`;
                const isPlaying = playing === m.recording_url;
                const elapsed = fmtElapsed(m._elapsed);
                return (
                  <div
                    key={`${m.driver_number}-${m.date}-${i}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      background: isPlaying ? '#15152a' : '#0f0f1a',
                      border: `1px solid ${isPlaying ? color : '#1e1e2e'}`,
                      borderRadius: 6, padding: '7px 12px',
                      transition: 'background 0.15s, border-color 0.15s',
                    }}
                  >
                    <span style={{ color, fontWeight: 700, fontSize: 12, minWidth: 32, flexShrink: 0 }}>
                      {code}
                    </span>
                    {m._lap != null && (
                      <span style={{ fontSize: 11, color: '#666', flexShrink: 0 }}>
                        Lap {m._lap}
                      </span>
                    )}
                    {elapsed && (
                      <span style={{ fontSize: 11, color: '#444', flexShrink: 0 }}>
                        {elapsed}
                      </span>
                    )}
                    <span style={{ flex: 1 }} />
                    <button
                      onClick={() => playPause(m.recording_url)}
                      style={{
                        background: isPlaying ? color : 'transparent',
                        color: isPlaying ? '#0d0d14' : color,
                        border: `1px solid ${color}`,
                        borderRadius: 4,
                        padding: '3px 10px',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                        flexShrink: 0,
                        transition: 'background 0.15s, color 0.15s',
                        letterSpacing: '0.03em',
                      }}
                    >
                      {isPlaying ? '■ Stop' : '▶ Play'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <p className="f1-footnote" style={{ marginTop: '0.75rem' }}>
            {filtered.length} recording{filtered.length !== 1 ? 's' : ''} · Audio via OpenF1.
            Filter by driver chip · ▶ Play to listen inline.
          </p>
        </>
      )}
    </DashboardPanel>
  );
}
