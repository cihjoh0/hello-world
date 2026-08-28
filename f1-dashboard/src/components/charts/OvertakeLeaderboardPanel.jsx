import { useState, useEffect, useMemo } from 'react';
import { getSessions, getOvertakesForSession } from '../../api/openf1';
import DashboardPanel from '../dashboard/DashboardPanel';
import LoadingSpinner from '../ui/LoadingSpinner';
import ErrorMessage from '../ui/ErrorMessage';

export default function OvertakeLeaderboardPanel({ year = new Date().getFullYear() }) {
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);
  const [racesLoaded, setRacesLoaded] = useState(0);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [sort, setSort] = useState('made');

  useEffect(() => {
    setStatus('idle');
    setError(null);
    setRows([]);
    setRacesLoaded(0);
    setProgress({ done: 0, total: 0 });
  }, [year]);

  const load = async () => {
    setStatus('loading');
    setError(null);
    try {
      const sessions = await getSessions(year, 'Race');
      if (!sessions.length) throw new Error(`No races found for ${year}`);

      setProgress({ done: 0, total: sessions.length });

      const results = [];
      const BATCH = 3;
      for (let i = 0; i < sessions.length; i += BATCH) {
        const batch = sessions.slice(i, i + BATCH);
        const batchResults = await Promise.all(batch.map(s => getOvertakesForSession(s.session_key)));
        results.push(...batchResults);
        setProgress({ done: results.length, total: sessions.length });
      }

      const driverInfo = {};
      const made = {};
      const suffered = {};
      for (const r of results) {
        for (const [num, d] of Object.entries(r.driverMap)) {
          if (!driverInfo[num]) driverInfo[num] = { name_acronym: d.name_acronym, team_colour: d.team_colour };
        }
        for (const o of r.overtakes) {
          made[o.attacker] = (made[o.attacker] ?? 0) + 1;
          suffered[o.defender] = (suffered[o.defender] ?? 0) + 1;
        }
      }

      const allNums = new Set([...Object.keys(driverInfo)].map(Number));
      const leaderboard = [...allNums].map(num => ({
        num,
        info: driverInfo[num] ?? {},
        made: made[num] ?? 0,
        suffered: suffered[num] ?? 0,
        net: (made[num] ?? 0) - (suffered[num] ?? 0),
      })).filter(r => r.made > 0 || r.suffered > 0);

      setRows(leaderboard);
      setRacesLoaded(sessions.length);
      setStatus('ready');
    } catch (e) {
      setError(e.message);
      setStatus('error');
    }
  };

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => b[sort] - a[sort]);
  }, [rows, sort]);

  const SortBtn = ({ val, label }) => (
    <button
      onClick={() => setSort(val)}
      style={{
        background: sort === val ? '#1e1e2e' : 'transparent',
        border: `1px solid ${sort === val ? '#444' : '#1e1e2e'}`,
        borderRadius: 4,
        color: sort === val ? '#e0e0e8' : '#666',
        fontSize: 10, fontWeight: 600, padding: '3px 9px', cursor: 'pointer',
        textTransform: 'uppercase', letterSpacing: '0.04em',
      }}
    >
      {label}
    </button>
  );

  return (
    <DashboardPanel title="Overtake Leaderboard" subtitle={`${year} · Season`}>
      {status === 'idle' && (
        <div style={{ textAlign: 'center', padding: '1.5rem' }}>
          <button className="stories-btn" onClick={load}>Load {year} Season</button>
          <p className="f1-footnote" style={{ marginTop: '0.75rem' }}>
            Runs overtake detection across every {year} race to rank drivers by passes made vs. suffered. May take a while — this loads every race of the season.
          </p>
        </div>
      )}

      {status === 'loading' && (
        <div style={{ padding: '1.5rem', textAlign: 'center' }}>
          <LoadingSpinner />
          {progress.total > 0 && (
            <p className="f1-footnote" style={{ marginTop: '0.75rem' }}>
              Loading race {Math.min(progress.done + 1, progress.total)} of {progress.total}…
            </p>
          )}
        </div>
      )}

      {status === 'error' && (
        <>
          <ErrorMessage message={error} />
          <div style={{ textAlign: 'center', marginTop: '1rem' }}>
            <button className="stories-btn" onClick={load}>Retry</button>
          </div>
        </>
      )}

      {status === 'ready' && (
        sorted.length === 0 ? (
          <p className="f1-hint" style={{ padding: '1rem', textAlign: 'center' }}>
            No overtakes detected across {racesLoaded} race{racesLoaded !== 1 ? 's' : ''} in {year}.
          </p>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <SortBtn val="made" label="By made" />
              <SortBtn val="suffered" label="By suffered" />
              <SortBtn val="net" label="By net" />
            </div>

            <div style={{
              display: 'grid', gridTemplateColumns: '2.5rem 1fr 5rem 6rem 4rem',
              gap: '0 8px', padding: '0 4px 6px', borderBottom: '1px solid #1e1e2e',
            }}>
              {[['#', 'left'], ['Driver', 'left'], ['Made', 'right'], ['Suffered', 'right'], ['Net', 'right']].map(([h, align]) => (
                <span key={h} style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: align }}>{h}</span>
              ))}
            </div>

            <div style={{ maxHeight: 500, overflowY: 'auto' }}>
              {sorted.map((r, i) => {
                const color = r.info.team_colour ? `#${r.info.team_colour}` : '#888';
                return (
                  <div key={r.num} style={{
                    display: 'grid', gridTemplateColumns: '2.5rem 1fr 5rem 6rem 4rem',
                    gap: '0 8px', alignItems: 'center', padding: '6px 4px',
                    borderBottom: '1px solid #0f0f18',
                  }}>
                    <span style={{ fontSize: 11, color: '#555' }}>{i + 1}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color }}>{r.info.name_acronym ?? `#${r.num}`}</span>
                    <span style={{ fontSize: 12, color: '#3ddc84', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.made}</span>
                    <span style={{ fontSize: 12, color: '#e8002d', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.suffered}</span>
                    <span style={{
                      fontSize: 12, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600,
                      color: r.net > 0 ? '#3ddc84' : r.net < 0 ? '#e8002d' : '#888',
                    }}>
                      {r.net > 0 ? '+' : ''}{r.net}
                    </span>
                  </div>
                );
              })}
            </div>

            <p className="f1-footnote" style={{ marginTop: '0.75rem' }}>
              Made = on-track passes completed. Suffered = times passed. Net = made minus suffered, across {racesLoaded} race{racesLoaded !== 1 ? 's' : ''} in {year}.
              Pit-stop and Safety Car position changes are excluded — this counts genuine racing passes only.
            </p>
          </>
        )
      )}
    </DashboardPanel>
  );
}
