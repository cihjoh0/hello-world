import { useState, useMemo } from 'react';
import { useOpenF1 } from '../../hooks/useOpenF1';
import { resolveSession, getRaceControl, getDrivers } from '../../api/openf1';
import DashboardPanel from '../dashboard/DashboardPanel';
import LoadingSpinner from '../ui/LoadingSpinner';
import ErrorMessage from '../ui/ErrorMessage';

async function fetchData(sessionType, sessionKey) {
  const session = await resolveSession(sessionType, sessionKey);
  if (!session) throw new Error(`No ${sessionType.toLowerCase()} session found`);
  const [raceControl, drivers] = await Promise.all([
    getRaceControl(session.session_key),
    getDrivers(session.session_key),
  ]);
  return { session, raceControl, drivers };
}

function fmtElapsed(ms) {
  if (ms == null || ms < 0) return null;
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = (s % 60).toString().padStart(2, '0');
  return `+${m}:${sec}`;
}

// Colour by flag first (most specific), falling back to category.
function eventColor(flag, category) {
  const f = (flag ?? '').toUpperCase();
  if (f.includes('RED')) return '#ff3b3b';
  if (f.includes('YELLOW')) return '#ffcc00';
  if (f.includes('GREEN')) return '#3ddc84';
  if (f.includes('CHEQUERED')) return '#e8e8f0';
  if (f.includes('BLUE')) return '#00a0dd';

  const c = (category ?? '').toUpperCase();
  if (c === 'SAFETYCAR') return '#ffd700';
  if (c === 'CAREVENT') return '#ff7043';
  if (c === 'DRS') return '#00a0dd';
  return '#888';
}

export default function RaceControlPanel({ sessionType = 'Race', sessionKey = null }) {
  const { data, loading, error } = useOpenF1(
    () => fetchData(sessionType, sessionKey),
    [sessionType, sessionKey]
  );

  const [activeCategory, setActiveCategory] = useState('All');

  const { events, categories, subtitle } = useMemo(() => {
    if (!data) return {};
    const { session, raceControl, drivers } = data;
    const driverMap = Object.fromEntries(drivers.map(d => [d.driver_number, d]));
    const sessionStart = session?.date_start ? new Date(session.date_start).getTime() : null;

    const events = [...(raceControl ?? [])]
      .filter(r => r.date)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .map((r, i) => {
        const t = new Date(r.date).getTime();
        const elapsed = sessionStart ? t - sessionStart : null;
        return {
          ...r,
          _key: `${r.date}-${i}`,
          _elapsed: elapsed,
          _driver: r.driver_number ? driverMap[r.driver_number] : null,
          _color: eventColor(r.flag, r.category),
        };
      });

    const categories = [...new Set(events.map(e => e.category).filter(Boolean))].sort();

    return {
      events,
      categories,
      subtitle: session
        ? `${session.location ?? ''} · ${session.year ?? ''} · ${session.session_type ?? ''}`
        : undefined,
    };
  }, [data]);

  const filtered = useMemo(() => {
    if (!events) return [];
    if (activeCategory === 'All') return events;
    return events.filter(e => e.category === activeCategory);
  }, [events, activeCategory]);

  const CategoryChip = ({ val, label }) => (
    <button
      onClick={() => setActiveCategory(val)}
      style={{
        background: activeCategory === val ? '#1e1e2e' : 'transparent',
        border: `1px solid ${activeCategory === val ? '#444' : '#1e1e2e'}`,
        borderRadius: 4,
        color: activeCategory === val ? '#e0e0e8' : '#666',
        fontSize: 10, fontWeight: 600, padding: '3px 9px', cursor: 'pointer',
        textTransform: 'uppercase', letterSpacing: '0.04em',
      }}
    >
      {label}
    </button>
  );

  return (
    <DashboardPanel title="Race Control" subtitle={subtitle}>
      {loading && <LoadingSpinner />}
      {error   && <ErrorMessage message={error} />}
      {!loading && !error && data && (
        events.length === 0 ? (
          <p className="f1-hint" style={{ padding: '1rem', textAlign: 'center' }}>
            No race control messages for this session.
          </p>
        ) : (
          <>
            {categories.length > 1 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                <CategoryChip val="All" label="All" />
                {categories.map(c => (
                  <CategoryChip key={c} val={c} label={c} />
                ))}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 500, overflowY: 'auto' }}>
              {filtered.map(e => {
                const elapsed = fmtElapsed(e._elapsed);
                const driverColor = e._driver?.team_colour ? `#${e._driver.team_colour}` : '#888';
                return (
                  <div
                    key={e._key}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                      background: '#0f0f1a',
                      borderLeft: `3px solid ${e._color}`,
                      borderRadius: 4, padding: '6px 10px',
                    }}
                  >
                    <span style={{ fontSize: 11, color: '#555', minWidth: 34, flexShrink: 0, paddingTop: 1 }}>
                      {e.lap_number != null ? `L${e.lap_number}` : '—'}
                    </span>
                    {elapsed && (
                      <span style={{ fontSize: 11, color: '#444', minWidth: 44, flexShrink: 0, paddingTop: 1 }}>
                        {elapsed}
                      </span>
                    )}
                    {e._driver && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: driverColor, minWidth: 32, flexShrink: 0, paddingTop: 1 }}>
                        {e._driver.name_acronym ?? `#${e.driver_number}`}
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: '#ccc', lineHeight: 1.4 }}>
                      {e.message}
                    </span>
                  </div>
                );
              })}
            </div>

            <p className="f1-footnote" style={{ marginTop: '0.75rem' }}>
              {filtered.length} message{filtered.length !== 1 ? 's' : ''} · Flags, safety cars, penalties
              and other race director messages. Filter by category above.
            </p>
          </>
        )
      )}
    </DashboardPanel>
  );
}
