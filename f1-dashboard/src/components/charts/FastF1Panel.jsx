import { useState, useEffect, useCallback } from 'react';
import {
  ComposedChart, LineChart, Line, Scatter, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ReferenceArea, ResponsiveContainer, Legend,
} from 'recharts';
import {
  getLatestRaceCoords, getSessionInfo,
  getDegradation, getUndercut, getPitWindow,
} from '../../api/analysis';
import DashboardPanel from '../dashboard/DashboardPanel';
import LoadingSpinner from '../ui/LoadingSpinner';

// ── Shared constants ──────────────────────────────────────────────────────────

const COMPOUND_COLOR = {
  SOFT: '#e8002d', MEDIUM: '#ffd700', HARD: '#d9d9d9',
  INTERMEDIATE: '#39b54a', WET: '#00a0dd', UNKNOWN: '#888',
};

function fmt(s) {
  if (s == null) return '—';
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toFixed(3).padStart(6, '0')}`;
}
function fmtd(s) {
  if (s == null) return '—';
  return (s >= 0 ? '+' : '') + s.toFixed(3) + 's';
}

// ── Degradation tab ───────────────────────────────────────────────────────────

/**
 * Build a flat dataset merging all stints for the selected driver.
 * Each row is one lap (by global lap number).
 * actual/predicted are in seconds; compound drives the dot color.
 */
function buildDegData(stints) {
  return stints.flatMap(stint =>
    stint.actual_s.map((t, i) => ({
      lap: stint.lap_start + i,
      actual: t,
      predicted: stint.predicted_s[i] ?? null,
      compound: stint.compound,
      stint: stint.stint,
    }))
  );
}

function DegTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="chart-tooltip">
      <p className="tooltip-lap">Lap {label} · {d?.compound}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {fmt(p.value)}
        </p>
      ))}
    </div>
  );
}

function DegradationTab({ year, round, drivers }) {
  const [driver, setDriver]     = useState(drivers[0] ?? '');
  const [state, setState]       = useState({ loading: false, data: null, error: null });
  const [selStint, setSelStint] = useState(0);

  const load = useCallback(async (drv) => {
    setState({ loading: true, data: null, error: null });
    try {
      const d = await getDegradation(year, round, drv);
      setState({ loading: false, data: d, error: null });
      setSelStint(0);
    } catch (e) {
      setState({ loading: false, data: null, error: e.message });
    }
  }, [year, round]);

  const driverData = state.data?.drivers?.find(d => d.driver === driver);
  const stints = driverData?.stints ?? [];
  const stint = stints[selStint];
  const chartData = stint ? buildDegData([stint]) : [];

  return (
    <div className="f1-tab-body">
      <div className="f1-row f1-row--wrap">
        <label className="f1-control">
          <span className="f1-label">Driver</span>
          <select className="f1-select" value={driver} onChange={e => setDriver(e.target.value)}>
            {drivers.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <button className="f1-btn" onClick={() => load(driver)} disabled={state.loading}>
          {state.loading ? 'Loading…' : 'Analyse'}
        </button>
        {!state.data && !state.loading && (
          <span className="f1-hint">First run downloads session data (~30 s)</span>
        )}
      </div>

      {state.error && <p className="f1-error">{state.error}</p>}

      {stints.length > 0 && (
        <>
          {/* Stint selector + summary table */}
          <div className="f1-stint-selector">
            {stints.map((s, i) => (
              <button
                key={i}
                className={`f1-stint-btn ${i === selStint ? 'active' : ''}`}
                style={{ '--cc': COMPOUND_COLOR[s.compound] ?? '#888' }}
                onClick={() => setSelStint(i)}
              >
                {s.compound[0]} Laps {s.lap_start}–{s.lap_end}
              </button>
            ))}
          </div>

          {stint && (
            <div className="f1-stint-meta">
              <span className="f1-stat"><span>Base pace</span><strong>{fmt(stint.base_pace_s)}</strong></span>
              <span className="f1-stat"><span>Deg rate</span><strong className={stint.deg_rate_s_per_lap > 0.1 ? 'neg' : 'pos'}>{fmtd(stint.deg_rate_s_per_lap)}/lap</strong></span>
              <span className="f1-stat"><span>Fit R²</span><strong style={{ color: stint.r_squared > 0.7 ? '#39b54a' : '#ffd700' }}>{stint.r_squared.toFixed(2)}</strong></span>
              <span className="f1-stat"><span>Laps run</span><strong>{stint.laps_run}</strong></span>
            </div>
          )}

          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
              <XAxis dataKey="lap" tick={{ fill: '#888', fontSize: 11 }}
                label={{ value: 'Lap', position: 'insideBottomRight', offset: -8, fill: '#555', fontSize: 11 }} />
              <YAxis tickFormatter={fmt} tick={{ fill: '#888', fontSize: 10 }} width={62} domain={['auto', 'auto']} />
              <Tooltip content={<DegTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Scatter dataKey="actual" name="Actual" fill={COMPOUND_COLOR[stint?.compound] ?? '#888'} />
              <Line dataKey="predicted" name="Model" stroke="#fff" strokeDasharray="5 3"
                dot={false} strokeWidth={1.5} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  );
}

// ── Undercut tab ──────────────────────────────────────────────────────────────

function UndercutTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <p className="tooltip-lap">Lap {label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {fmtd(p.value)}
        </p>
      ))}
    </div>
  );
}

function UndercutTab({ year, round, drivers, totalLaps }) {
  const [dA, setDA]         = useState(drivers[0] ?? '');
  const [dB, setDB]         = useState(drivers[1] ?? '');
  const [pitLap, setPitLap] = useState(Math.round((totalLaps || 50) * 0.4));
  const [dur, setDur]       = useState(23);
  const [state, setState]   = useState({ loading: false, result: null, error: null });

  const run = useCallback(async () => {
    setState({ loading: true, result: null, error: null });
    try {
      const r = await getUndercut(year, round, dA, dB, pitLap, dur);
      setState({ loading: false, result: r, error: null });
    } catch (e) {
      setState({ loading: false, result: null, error: e.message });
    }
  }, [year, round, dA, dB, pitLap, dur]);

  const r = state.result;
  const max = totalLaps || 60;

  return (
    <div className="f1-tab-body">
      <div className="f1-row f1-row--wrap">
        <label className="f1-control">
          <span className="f1-label">Pits (A)</span>
          <select className="f1-select" value={dA} onChange={e => setDA(e.target.value)}>
            {drivers.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label className="f1-control">
          <span className="f1-label">Stays out (B)</span>
          <select className="f1-select" value={dB} onChange={e => setDB(e.target.value)}>
            {drivers.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label className="f1-control f1-control--wide">
          <span className="f1-label">Pit lap <strong>{pitLap}</strong></span>
          <input type="range" min={3} max={max - 5} value={pitLap}
            onChange={e => setPitLap(Number(e.target.value))} className="pw-slider" />
        </label>
        <label className="f1-control">
          <span className="f1-label">Duration (s)</span>
          <input type="number" min={15} max={60} value={dur}
            onChange={e => setDur(Number(e.target.value))} className="pw-number" />
        </label>
        <button className="f1-btn" onClick={run} disabled={state.loading}>
          {state.loading ? 'Running…' : 'Simulate'}
        </button>
      </div>

      {state.error && <p className="f1-error">{state.error}</p>}

      {r && (
        <>
          <div className="f1-summary-row">
            <span className="f1-stat"><span>Gap at pit entry</span><strong className={r.gap_at_pit_s > 0 ? 'pos' : 'neg'}>{fmtd(r.gap_at_pit_s)}</strong></span>
            <span className="f1-stat"><span>A deg rate</span><strong>{r.deg_rate_a_s_per_lap.toFixed(3)}s/lap</strong></span>
            <span className="f1-stat"><span>B deg rate</span><strong>{r.deg_rate_b_s_per_lap.toFixed(3)}s/lap</strong></span>
            <span className="f1-stat"><span>Fresh pace est.</span><strong>{fmt(r.fresh_pace_estimate_s)}</strong></span>
            <span className={`f1-verdict f1-verdict--${r.undercut_works ? 'good' : 'bad'}`}>
              {r.undercut_works ? `Undercut works · crossover lap ${r.crossover_lap}` : 'Undercut fails'}
            </span>
          </div>

          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={r.simulation} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gapPos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#39b54a" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#39b54a" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gapNeg" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="5%" stopColor="#e8002d" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#e8002d" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
              <XAxis dataKey="lap" tick={{ fill: '#888', fontSize: 11 }}
                label={{ value: 'Lap', position: 'insideBottomRight', offset: -8, fill: '#555', fontSize: 11 }} />
              <YAxis tickFormatter={v => fmtd(v)} tick={{ fill: '#888', fontSize: 10 }} width={62}
                label={{ value: 'Virtual gap A−B', angle: -90, position: 'insideLeft', fill: '#555', fontSize: 10 }} />
              <Tooltip content={<UndercutTooltip />} />
              <ReferenceLine y={0} stroke="#555" strokeWidth={1.5} label={{ value: 'equal', fill: '#555', fontSize: 9 }} />
              {r.crossover_lap && (
                <ReferenceLine x={r.crossover_lap} stroke="#39b54a" strokeDasharray="4 3"
                  label={{ value: `X-over L${r.crossover_lap}`, position: 'top', fill: '#39b54a', fontSize: 9 }} />
              )}
              {/* Positive zone (A ahead = undercut worked) */}
              {r.simulation.some(s => s.virtual_gap_s > 0) && (
                <ReferenceArea y1={0} y2="auto" fill="#39b54a" fillOpacity={0.06} />
              )}
              <Line dataKey="virtual_gap_s" name="Gap A−B" stroke="#fff" dot={false}
                strokeWidth={2} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  );
}

// ── Pit window tab ────────────────────────────────────────────────────────────

function WindowTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <p className="tooltip-lap">Lap {label}</p>
      {payload.map(p => p.value != null && (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {fmtd(p.value)}
        </p>
      ))}
    </div>
  );
}

function PitWindowTab({ year, round, drivers, totalLaps }) {
  const [driver, setDriver] = useState(drivers[0] ?? '');
  const [dur, setDur]       = useState(23);
  const [state, setState]   = useState({ loading: false, result: null, error: null });

  const run = useCallback(async () => {
    setState({ loading: true, result: null, error: null });
    try {
      const r = await getPitWindow(year, round, driver, dur);
      setState({ loading: false, result: r, error: null });
    } catch (e) {
      setState({ loading: false, result: null, error: e.message });
    }
  }, [year, round, driver, dur]);

  const r = state.result;

  // Split benefit into positive (good to pit) and negative (too early/late)
  const chartData = r?.per_lap.map(p => ({
    lap: p.lap,
    benefit: p.net_benefit_s,
    positive: p.net_benefit_s > 0 ? p.net_benefit_s : 0,
    negative: p.net_benefit_s < 0 ? p.net_benefit_s : 0,
  }));

  return (
    <div className="f1-tab-body">
      <div className="f1-row f1-row--wrap">
        <label className="f1-control">
          <span className="f1-label">Driver</span>
          <select className="f1-select" value={driver} onChange={e => setDriver(e.target.value)}>
            {drivers.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label className="f1-control">
          <span className="f1-label">Pit duration (s)</span>
          <input type="number" min={15} max={60} value={dur}
            onChange={e => setDur(Number(e.target.value))} className="pw-number" />
        </label>
        <button className="f1-btn" onClick={run} disabled={state.loading}>
          {state.loading ? 'Analysing…' : 'Analyse'}
        </button>
      </div>

      {state.error && <p className="f1-error">{state.error}</p>}

      {r && (
        <>
          <div className="f1-summary-row">
            <span className="f1-stat"><span>Window opens</span><strong className="pos">Lap {r.window_opens ?? '—'}</strong></span>
            <span className="f1-stat"><span>Optimal lap</span><strong style={{ color: '#ffd700' }}>Lap {r.optimal_lap ?? '—'}</strong></span>
            <span className="f1-stat"><span>Window closes</span><strong className="neg">Lap {r.window_closes ?? '—'}</strong></span>
            <span className="f1-stat"><span>Race laps</span><strong>{r.total_laps}</strong></span>
          </div>

          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
              <XAxis dataKey="lap" tick={{ fill: '#888', fontSize: 11 }}
                label={{ value: 'Pit on lap', position: 'insideBottomRight', offset: -8, fill: '#555', fontSize: 11 }} />
              <YAxis tickFormatter={v => `${v > 0 ? '+' : ''}${v.toFixed(0)}s`}
                tick={{ fill: '#888', fontSize: 10 }} width={46} />
              <Tooltip content={<WindowTooltip />} />
              <ReferenceLine y={0} stroke="#555" strokeWidth={1.5} />
              {r.window_opens && <ReferenceLine x={r.window_opens} stroke="#39b54a" strokeDasharray="4 3"
                label={{ value: 'opens', position: 'top', fill: '#39b54a', fontSize: 9 }} />}
              {r.optimal_lap && <ReferenceLine x={r.optimal_lap} stroke="#ffd700" strokeWidth={2}
                label={{ value: `optimal L${r.optimal_lap}`, position: 'top', fill: '#ffd700', fontSize: 9 }} />}
              {r.window_closes && <ReferenceLine x={r.window_closes} stroke="#e8002d" strokeDasharray="4 3"
                label={{ value: 'closes', position: 'top', fill: '#e8002d', fontSize: 9 }} />}
              <Area dataKey="positive" name="Benefit" fill="#39b54a" fillOpacity={0.25}
                stroke="#39b54a" strokeWidth={0} />
              <Area dataKey="negative" name="Cost" fill="#e8002d" fillOpacity={0.25}
                stroke="#e8002d" strokeWidth={0} />
              <Line dataKey="benefit" name="Net benefit" stroke="#fff" dot={false}
                strokeWidth={2} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>

          <p className="f1-footnote">
            Net benefit = Σ(remaining laps)[old-tyre time − new-tyre time] − pit cost.
            Positive = pitting this lap recovers its own cost. Excludes track position.
          </p>
        </>
      )}
    </div>
  );
}

// ── Home Assistant tab ────────────────────────────────────────────────────────

function HomeAssistantTab() {
  const base = typeof window !== 'undefined' && window.location.hostname !== 'localhost'
    ? 'http://<analysis-server>:8000'
    : 'http://localhost:8000';

  const endpoints = [
    { path: '/ha/ping',          desc: '"ok" — server health check',                      interval: '—'      },
    { path: '/ha/session',       desc: 'event_name, location, country, date',              interval: '3600 s' },
    { path: '/ha/driver/{code}', desc: 'compound, deg_rate, window, status, current_lap', interval: '60 s'   },
  ];

  const sensorSnippet =
`- platform: rest
  name: f1_pit_window_ver
  resource: ${base}/ha/driver/VER
  scan_interval: 60
  value_template: "{{ value_json.pit_window_status }}"
  json_attributes:
    - current_compound
    - deg_rate_s_per_lap
    - optimal_pit_lap
    - pit_window_opens
    - pit_window_closes
    - in_pit_window
    - current_lap`;

  return (
    <div className="f1-tab-body">
      <p className="f1-ha-intro">
        The analysis server exposes <code>/ha/*</code> endpoints designed for{' '}
        <strong>Home Assistant REST sensors</strong>. Each driver endpoint returns
        flat JSON so HA can extract the main state and all strategy attributes
        with a single poll.
      </p>

      <table className="f1-ha-table">
        <thead>
          <tr>
            <th>Endpoint</th>
            <th>HA sensor state / attributes</th>
            <th>scan_interval</th>
          </tr>
        </thead>
        <tbody>
          {endpoints.map(e => (
            <tr key={e.path}>
              <td><code>{base}{e.path}</code></td>
              <td>{e.desc}</td>
              <td className="f1-ha-interval">{e.interval}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="f1-label" style={{ marginTop: '1.25rem', marginBottom: '0.4rem' }}>
        Example sensor — paste into HA <code>sensors.yaml</code>:
      </p>
      <pre className="f1-ha-yaml">{sensorSnippet}</pre>

      <p className="f1-ha-status-key">
        <strong>pit_window_status</strong> values:{' '}
        <span className="f1-ha-badge f1-ha-badge--before">before</span>{' '}
        <span className="f1-ha-badge f1-ha-badge--open">open</span>{' '}
        <span className="f1-ha-badge f1-ha-badge--after">after</span>{' '}
        <span className="f1-ha-badge f1-ha-badge--unknown">unknown</span>
        {' '}— automate on state transitions (e.g. "before" → "open").
      </p>

      <p className="f1-footnote" style={{ marginTop: '1rem' }}>
        Full config files in <code>f1-analysis/homeassistant/</code>:{' '}
        <code>sensors.yaml</code>, <code>automations.yaml</code>, <code>lovelace.yaml</code>.
      </p>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'deg',      label: 'Degradation'    },
  { id: 'undercut', label: 'Undercut Sim'   },
  { id: 'window',   label: 'Pit Window'     },
  { id: 'ha',       label: 'Home Assistant' },
];

export default function FastF1Panel() {
  const [status, setStatus]           = useState('loading'); // loading | offline | ready
  const [coords, setCoords]           = useState(null);
  const [sessionInfo, setSessionInfo] = useState(null);
  const [activeTab, setActiveTab]     = useState('deg');

  useEffect(() => {
    getLatestRaceCoords()
      .then(c => { setCoords(c); return getSessionInfo(c.year, c.round); })
      .then(info => { setSessionInfo(info); setStatus('ready'); })
      .catch(() => setStatus('offline'));
  }, []);

  const subtitle = sessionInfo
    ? `${sessionInfo.event_name} · ${sessionInfo.location} · ${coords?.year}`
    : undefined;

  return (
    <DashboardPanel title="FastF1 Analysis" subtitle={subtitle}>
      {status === 'loading' && <LoadingSpinner />}

      {status === 'offline' && (
        <>
          <div className="f1-offline">
            <p className="f1-offline-title">Analysis server not running</p>
            <code className="f1-offline-cmd">
              cd f1-analysis &amp;&amp; uvicorn main:app --reload --port 8000
            </code>
            <p className="f1-offline-note">
              Requires the FastF1 Python layer from <code>f1-analysis/</code>
            </p>
          </div>
          <div className="f1-tabs" style={{ marginTop: '1rem' }}>
            <button
              className={`f1-tab-btn ${activeTab === 'ha' ? 'active' : ''}`}
              onClick={() => setActiveTab('ha')}
            >
              Home Assistant
            </button>
          </div>
          {activeTab === 'ha' && <HomeAssistantTab />}
        </>
      )}

      {status === 'ready' && sessionInfo && (
        <>
          <div className="f1-tabs">
            {TABS.map(t => (
              <button key={t.id}
                className={`f1-tab-btn ${activeTab === t.id ? 'active' : ''}`}
                onClick={() => setActiveTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {activeTab === 'deg' && (
            <DegradationTab year={coords.year} round={coords.round}
              drivers={sessionInfo.drivers} />
          )}
          {activeTab === 'undercut' && (
            <UndercutTab year={coords.year} round={coords.round}
              drivers={sessionInfo.drivers} totalLaps={sessionInfo.total_laps} />
          )}
          {activeTab === 'window' && (
            <PitWindowTab year={coords.year} round={coords.round}
              drivers={sessionInfo.drivers} totalLaps={sessionInfo.total_laps} />
          )}
          {activeTab === 'ha' && <HomeAssistantTab />}
        </>
      )}
    </DashboardPanel>
  );
}
