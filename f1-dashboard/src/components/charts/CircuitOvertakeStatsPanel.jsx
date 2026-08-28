import { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { resolveSession, getSessionsByLocation, getOvertakesForSession } from '../../api/openf1';
import DashboardPanel from '../dashboard/DashboardPanel';
import LoadingSpinner from '../ui/LoadingSpinner';
import ErrorMessage from '../ui/ErrorMessage';

const BUCKETS = [
  { label: '0–0.2s', min: 0,   max: 0.2 },
  { label: '0.2–0.4s', min: 0.2, max: 0.4 },
  { label: '0.4–0.6s', min: 0.4, max: 0.6 },
  { label: '0.6–0.8s', min: 0.6, max: 0.8 },
  { label: '0.8–1.0s', min: 0.8, max: 1.0 },
  { label: '1.0s+', min: 1.0, max: Infinity },
];

function bucketize(advantages) {
  return BUCKETS.map(b => ({
    label: b.label,
    count: advantages.filter(v => v >= b.min && v < b.max).length,
  }));
}

function median(nums) {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function Stat({ label, value, color = '#e0e0e8' }) {
  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    </div>
  );
}

export default function CircuitOvertakeStatsPanel({ sessionType = 'Race', sessionKey = null }) {
  const [status, setStatus] = useState('idle'); // idle | loading | ready | error
  const [error, setError] = useState(null);
  const [location, setLocation] = useState(null);
  const [perYear, setPerYear] = useState([]);
  const [advantages, setAdvantages] = useState([]); // pace-advantage magnitudes, clean passes only
  const [oddCount, setOddCount] = useState(0);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const load = async () => {
    setStatus('loading');
    setError(null);
    try {
      const session = await resolveSession(sessionType, sessionKey);
      if (!session) throw new Error('No session found');
      const loc = session.location;
      setLocation(loc);

      const sessions = await getSessionsByLocation(loc, 'Race');
      if (!sessions.length) throw new Error(`No race sessions found at ${loc}`);

      setProgress({ done: 0, total: sessions.length });

      // Load races sequentially in small batches to stay within rate limits
      // and give visible progress rather than a silent long wait.
      const results = [];
      const BATCH = 3;
      for (let i = 0; i < sessions.length; i += BATCH) {
        const batch = sessions.slice(i, i + BATCH);
        const batchResults = await Promise.all(
          batch.map(async s => {
            const { overtakes } = await getOvertakesForSession(s.session_key);
            return { year: s.year, overtakes };
          })
        );
        results.push(...batchResults);
        setProgress({ done: results.length, total: sessions.length });
      }

      const perYearCounts = results
        .map(r => ({ year: r.year, count: r.overtakes.length }))
        .sort((a, b) => a.year - b.year);

      const allOvertakes = results.flatMap(r => r.overtakes);
      // "Clean" passes: attacker was genuinely faster that lap. A pass can
      // occasionally happen with a positive paceDelta (defensive mistake, or
      // the pace gain came earlier in the lap than the pass itself) — those
      // don't fit the "pace deficit needed" question, so keep them separate.
      const clean = allOvertakes.filter(o => o.paceDelta < 0).map(o => -o.paceDelta);
      const odd = allOvertakes.length - clean.length;

      setPerYear(perYearCounts);
      setAdvantages(clean);
      setOddCount(odd);
      setStatus('ready');
    } catch (e) {
      setError(e.message);
      setStatus('error');
    }
  };

  const stats = useMemo(() => {
    if (!advantages.length) return null;
    const sum = advantages.reduce((s, v) => s + v, 0);
    return {
      count: advantages.length,
      mean: sum / advantages.length,
      median: median(advantages),
      buckets: bucketize(advantages),
    };
  }, [advantages]);

  const totalOvertakes = perYear.reduce((s, y) => s + y.count, 0);

  return (
    <DashboardPanel title="Circuit Overtake History" subtitle={location ? `${location} · across seasons` : undefined}>
      {status === 'idle' && (
        <div style={{ textAlign: 'center', padding: '1.5rem' }}>
          <button className="stories-btn" onClick={load}>Load circuit history</button>
          <p className="f1-footnote" style={{ marginTop: '0.75rem' }}>
            Aggregates every race held at this circuit to find the typical pace advantage needed to complete a pass here. May take several seconds.
          </p>
        </div>
      )}

      {status === 'loading' && (
        <div style={{ padding: '1.5rem', textAlign: 'center' }}>
          <LoadingSpinner />
          {progress.total > 0 && (
            <p className="f1-footnote" style={{ marginTop: '0.75rem' }}>
              Loading race {progress.done + 1 > progress.total ? progress.total : progress.done + 1} of {progress.total}…
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
        stats ? (
          <>
            <div style={{ display: 'flex', gap: '1.5rem', padding: '0.25rem 0 0.75rem', borderBottom: '1px solid #1e1e2e', marginBottom: 8, flexWrap: 'wrap' }}>
              <Stat label="Races analysed" value={perYear.length} />
              <Stat label="Total overtakes" value={totalOvertakes} />
              <Stat label="Median pace advantage" value={`${stats.median.toFixed(2)}s`} color="#3ddc84" />
              <Stat label="Mean pace advantage" value={`${stats.mean.toFixed(2)}s`} />
            </div>

            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={stats.buckets} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                <XAxis dataKey="label" tick={{ fill: '#888', fontSize: 10 }} />
                <YAxis tick={{ fill: '#888', fontSize: 10 }} width={30} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: '#13131f', border: '1px solid #2a2a3e', fontSize: 11 }}
                  formatter={v => [`${v} overtake${v !== 1 ? 's' : ''}`, 'Count']}
                />
                <Bar dataKey="count" fill="#3ddc84" radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>

            <div style={{ marginTop: 10 }}>
              <p style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                Overtakes per season
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {perYear.map(y => (
                  <span key={y.year} style={{ fontSize: 11, color: '#aaa', background: '#0f0f1a', border: '1px solid #1e1e2e', borderRadius: 4, padding: '3px 8px' }}>
                    {y.year}: {y.count}
                  </span>
                ))}
              </div>
            </div>

            <p className="f1-footnote" style={{ marginTop: '0.75rem' }}>
              Based on {stats.count} clean pace-advantage pass{stats.count !== 1 ? 'es' : ''} across {perYear.length} race{perYear.length !== 1 ? 's' : ''} at {location}.
              {oddCount > 0 && ` ${oddCount} additional overtake${oddCount !== 1 ? 's' : ''} happened despite the attacker's lap being slower overall and ${oddCount !== 1 ? 'are' : 'is'} excluded from the stats above.`}
            </p>
          </>
        ) : (
          <p className="f1-hint" style={{ padding: '1rem', textAlign: 'center' }}>
            No clean overtakes detected across {perYear.length} race{perYear.length !== 1 ? 's' : ''} at {location}.
          </p>
        )
      )}
    </DashboardPanel>
  );
}
