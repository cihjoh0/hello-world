import { useMemo, useState, useEffect } from 'react';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { useOpenF1 } from '../../hooks/useOpenF1';
import { getLatestSession, getDrivers, getLaps, getPitStops, getStints } from '../../api/openf1';
import DashboardPanel from '../dashboard/DashboardPanel';
import LoadingSpinner from '../ui/LoadingSpinner';
import ErrorMessage from '../ui/ErrorMessage';

const COLOR_A = '#e8002d';
const COLOR_B = '#00a0dd';

const COMPOUND_SHORT = { SOFT: 'S', MEDIUM: 'M', HARD: 'H', INTERMEDIATE: 'I', WET: 'W' };
const COMPOUND_COLOR = { SOFT: '#e8002d', MEDIUM: '#ffd700', HARD: '#d9d9d9', INTERMEDIATE: '#39b54a', WET: '#00a0dd' };

function fmt(secs) {
  if (secs == null || isNaN(secs)) return '—';
  const m = Math.floor(secs / 60);
  const s = (secs % 60).toFixed(3).padStart(6, '0');
  return `${m}:${s}`;
}
function fmtDelta(d) {
  if (d == null || isNaN(d)) return '—';
  return (d >= 0 ? '+' : '') + d.toFixed(3) + 's';
}

async function fetchAnalysisData() {
  const session = await getLatestSession('Race');
  if (!session) throw new Error('No race session found');
  const [drivers, laps, pitStops, stints] = await Promise.all([
    getDrivers(session.session_key),
    getLaps(session.session_key),
    getPitStops(session.session_key),
    getStints(session.session_key),
  ]);
  return { session, drivers, laps, pitStops, stints };
}

// ── Delta chart data ──────────────────────────────────────────────────────────

function buildDeltaData(laps, pitStops, numA, numB) {
  const lapByKey = {};
  for (const l of laps) lapByKey[`${l.driver_number}-${l.lap_number}`] = l;

  const pitLapsA = new Set(pitStops.filter(p => p.driver_number === numA).map(p => p.lap_number));
  const pitLapsB = new Set(pitStops.filter(p => p.driver_number === numB).map(p => p.lap_number));

  const allLapNums = [...new Set(laps.map(l => l.lap_number))].sort((a, b) => a - b);

  return allLapNums.map(lap => {
    const aPit = pitLapsA.has(lap);
    const bPit = pitLapsB.has(lap);
    // Skip pit laps AND the out-lap that follows each stop — both are unrepresentative of pace
    const aDistorted = aPit || pitLapsA.has(lap - 1);
    const bDistorted = bPit || pitLapsB.has(lap - 1);

    const lapA = lapByKey[`${numA}-${lap}`];
    const lapB = lapByKey[`${numB}-${lap}`];

    let delta = null;
    if (!aDistorted && !bDistorted && lapA?.lap_duration > 0 && lapB?.lap_duration > 0) {
      delta = lapA.lap_duration - lapB.lap_duration;
    }

    return { lap, delta, aPit, bPit };
  });
}

// ── Overtake window summary ───────────────────────────────────────────────────

function findOvertakeWindows(deltaData, threshold = 0.4) {
  // Returns spans of ≥3 consecutive clean laps where one driver was meaningfully faster
  const windows = { a: [], b: [] };
  let runA = null, runB = null;

  for (const { lap, delta } of deltaData) {
    if (delta === null) { runA = null; runB = null; continue; }
    // A faster = delta < -threshold
    if (delta < -threshold) {
      runA = runA ? { ...runA, end: lap, sum: runA.sum + (-delta), n: runA.n + 1 } : { start: lap, end: lap, sum: -delta, n: 1 };
      runB = null;
    } else if (delta > threshold) {
      runB = runB ? { ...runB, end: lap, sum: runB.sum + delta, n: runB.n + 1 } : { start: lap, end: lap, sum: delta, n: 1 };
      runA = null;
    } else {
      if (runA?.n >= 3) windows.a.push(runA);
      if (runB?.n >= 3) windows.b.push(runB);
      runA = null; runB = null;
    }
  }
  if (runA?.n >= 3) windows.a.push(runA);
  if (runB?.n >= 3) windows.b.push(runB);
  return windows;
}

// ── Pit stop decision cards ───────────────────────────────────────────────────

function buildPitCards(pitStops, laps, stints, driverNum, totalLaps) {
  const driverPits = pitStops.filter(p => p.driver_number === driverNum);
  const driverLaps = laps.filter(l => l.driver_number === driverNum && l.lap_duration > 0);
  const driverStints = stints.filter(s => s.driver_number === driverNum);

  const pitLapSet = new Set(driverPits.map(p => p.lap_number));
  const lapByNum = Object.fromEntries(driverLaps.map(l => [l.lap_number, l.lap_duration]));

  return driverPits.map(pit => {
    const N = pit.lap_number;

    // Collect up to 5 clean laps before the stop (skip other pit laps and their out-laps)
    const pre = [];
    for (let i = N - 1; i >= 1 && pre.length < 5; i--) {
      if (!pitLapSet.has(i) && !pitLapSet.has(i - 1) && lapByNum[i]) pre.push(lapByNum[i]);
    }

    // Collect up to 5 clean laps after (skip out-lap N+1, then skip subsequent pit laps)
    const post = [];
    for (let i = N + 2; i <= totalLaps && post.length < 5; i++) {
      if (!pitLapSet.has(i) && lapByNum[i]) post.push(lapByNum[i]);
    }

    const prePace  = pre.length  ? pre.reduce((a, b) => a + b, 0) / pre.length   : null;
    const postPace = post.length ? post.reduce((a, b) => a + b, 0) / post.length : null;

    // Positive paceGain = new tyres faster (desired)
    const paceGain = prePace != null && postPace != null ? prePace - postPace : null;
    const pitDuration = pit.pit_duration ?? null;

    // Break-even: how many laps to recover pit time loss
    const breakevenLaps = paceGain != null && paceGain > 0 && pitDuration
      ? pitDuration / paceGain
      : null;

    const lapsRemaining = totalLaps - N;

    // Net gain vs staying out: pace gain over remaining laps minus pit time lost
    // Positive = pit stop recovered its cost
    const netGain = paceGain != null && pitDuration != null && paceGain > 0
      ? paceGain * lapsRemaining - pitDuration
      : paceGain != null && paceGain <= 0
        ? paceGain * lapsRemaining   // slower on new compound — definitely a loss
        : null;

    const stintBefore = driverStints.find(s => s.lap_end === N - 1 || s.lap_end === N);
    const stintAfter  = driverStints.find(s => s.lap_start === N + 1 || s.lap_start === N);

    let verdict, verdictClass;
    if (netGain == null) {
      verdict = 'Insufficient data'; verdictClass = 'neutral';
    } else if (paceGain != null && paceGain <= 0) {
      verdict = 'Wrong compound — slower after'; verdictClass = 'bad';
    } else if (netGain > 3) {
      verdict = 'Good call'; verdictClass = 'good';
    } else if (netGain > -3) {
      verdict = 'Marginal'; verdictClass = 'neutral';
    } else {
      verdict = 'Too late'; verdictClass = 'bad';
    }

    return { lap: N, pitDuration, prePace, postPace, paceGain, breakevenLaps, lapsRemaining, netGain, compoundIn: stintBefore?.compound, compoundOut: stintAfter?.compound, verdict, verdictClass };
  });
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function DeltaTooltip({ active, payload, label, codeA, codeB }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.value;
  if (d == null) return null;
  const faster = d < 0 ? codeA : codeB;
  return (
    <div className="chart-tooltip">
      <p className="tooltip-lap">Lap {label}</p>
      <p style={{ color: d < 0 ? COLOR_A : COLOR_B }}>
        Δ {fmtDelta(d)} — <strong>{faster}</strong> faster
      </p>
    </div>
  );
}

// ── Pit card ──────────────────────────────────────────────────────────────────

function CompoundBadge({ compound }) {
  if (!compound) return null;
  const c = compound.toUpperCase();
  return (
    <span className="pace-compound" style={{ background: COMPOUND_COLOR[c] ?? '#555', color: ['MEDIUM', 'HARD'].includes(c) ? '#000' : '#fff' }}>
      {COMPOUND_SHORT[c] ?? c}
    </span>
  );
}

function PitCard({ card }) {
  return (
    <div className={`pit-card pit-card--${card.verdictClass}`}>
      <div className="pit-card-header">
        <span className="pit-card-lap">Lap {card.lap}</span>
        <span className="pit-card-compounds">
          <CompoundBadge compound={card.compoundIn} />
          <span className="pit-arrow">→</span>
          <CompoundBadge compound={card.compoundOut} />
        </span>
      </div>
      <table className="pit-card-table">
        <tbody>
          <tr><td>Pit duration</td><td>{card.pitDuration != null ? `${card.pitDuration.toFixed(1)}s` : '—'}</td></tr>
          <tr><td>Pre-stop pace (avg)</td><td>{fmt(card.prePace)}</td></tr>
          <tr><td>Post-stop pace (avg)</td><td>{fmt(card.postPace)}</td></tr>
          <tr>
            <td>Pace gain / lap</td>
            <td className={card.paceGain > 0 ? 'pos' : card.paceGain < 0 ? 'neg' : ''}>
              {card.paceGain != null ? fmtDelta(card.paceGain) : '—'}
            </td>
          </tr>
          <tr><td>Break-even laps</td><td>{card.breakevenLaps != null ? card.breakevenLaps.toFixed(1) : '—'}</td></tr>
          <tr><td>Laps remaining</td><td>{card.lapsRemaining}</td></tr>
          <tr>
            <td>Net pace gain</td>
            <td className={card.netGain > 0 ? 'pos' : card.netGain < 0 ? 'neg' : ''}>
              {card.netGain != null ? fmtDelta(card.netGain) : '—'}
            </td>
          </tr>
        </tbody>
      </table>
      <div className={`pit-verdict pit-verdict--${card.verdictClass}`}>{card.verdict}</div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function PaceAnalysisPanel() {
  const { data, loading, error } = useOpenF1(fetchAnalysisData, []);
  const [driverANum, setDriverANum] = useState(null);
  const [driverBNum, setDriverBNum] = useState(null);

  // Set defaults once data arrives
  useEffect(() => {
    if (!data || driverANum != null) return;
    const nums = data.drivers.map(d => d.driver_number);
    setDriverANum(nums[0] ?? null);
    setDriverBNum(nums[1] ?? null);
  }, [data, driverANum]);

  const derived = useMemo(() => {
    if (!data || driverANum == null || driverBNum == null) return null;
    const { laps, pitStops, stints, drivers, session } = data;

    const totalLaps = stints.reduce((m, s) => Math.max(m, s.lap_end ?? 0), 0);

    const driverA = drivers.find(d => d.driver_number === driverANum);
    const driverB = drivers.find(d => d.driver_number === driverBNum);

    const deltaData = buildDeltaData(laps, pitStops, driverANum, driverBNum);
    const windows = findOvertakeWindows(deltaData);
    const pitCardsA = buildPitCards(pitStops, laps, stints, driverANum, totalLaps);
    const pitCardsB = buildPitCards(pitStops, laps, stints, driverBNum, totalLaps);

    const pitLapsA = new Set(pitStops.filter(p => p.driver_number === driverANum).map(p => p.lap_number));
    const pitLapsB = new Set(pitStops.filter(p => p.driver_number === driverBNum).map(p => p.lap_number));

    const subtitle = session
      ? `${session.location ?? ''} · ${session.year ?? ''} · Round ${session.round_number ?? '?'}`
      : undefined;

    return { driverA, driverB, deltaData, windows, pitCardsA, pitCardsB, pitLapsA, pitLapsB, totalLaps, subtitle };
  }, [data, driverANum, driverBNum]);

  const driverList = data?.drivers ?? [];

  const subtitle = derived?.subtitle ?? (data?.session
    ? `${data.session.location ?? ''} · ${data.session.year ?? ''}`
    : undefined);

  return (
    <DashboardPanel title="Pace Analysis" subtitle={subtitle}>
      {loading && <LoadingSpinner />}
      {error && <ErrorMessage message={error} />}

      {!loading && !error && data && (
        <>
          {/* Driver selectors */}
          <div className="pace-selectors">
            <label className="pace-selector-label" style={{ '--sel-color': COLOR_A }}>
              Driver A
              <select
                value={driverANum ?? ''}
                onChange={e => setDriverANum(Number(e.target.value))}
                className="pace-select"
                style={{ borderColor: COLOR_A }}
              >
                {driverList.map(d => (
                  <option key={d.driver_number} value={d.driver_number}>
                    {d.name_acronym ?? d.driver_number}
                  </option>
                ))}
              </select>
            </label>

            <span className="pace-vs">vs</span>

            <label className="pace-selector-label" style={{ '--sel-color': COLOR_B }}>
              Driver B
              <select
                value={driverBNum ?? ''}
                onChange={e => setDriverBNum(Number(e.target.value))}
                className="pace-select"
                style={{ borderColor: COLOR_B }}
              >
                {driverList.map(d => (
                  <option key={d.driver_number} value={d.driver_number}>
                    {d.name_acronym ?? d.driver_number}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {derived && (
            <>
              {/* Legend */}
              <div className="pace-legend">
                <span style={{ color: COLOR_A }}>▌ {derived.driverA?.name_acronym} faster</span>
                <span style={{ color: COLOR_B }}>▌ {derived.driverB?.name_acronym} faster</span>
                <span className="pace-legend-note">Pit &amp; out-laps excluded from delta</span>
              </div>

              {/* Delta bar chart */}
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={derived.deltaData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }} barCategoryGap="10%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" vertical={false} />
                  <XAxis dataKey="lap" tick={{ fill: '#888', fontSize: 11 }}
                    label={{ value: 'Lap', position: 'insideBottomRight', offset: -8, fill: '#555', fontSize: 11 }} />
                  <YAxis tickFormatter={v => fmtDelta(v)} tick={{ fill: '#888', fontSize: 10 }} width={58}
                    label={{ value: 'Δ A − B', angle: -90, position: 'insideLeft', fill: '#555', fontSize: 11 }} />
                  <Tooltip content={<DeltaTooltip codeA={derived.driverA?.name_acronym} codeB={derived.driverB?.name_acronym} />} />
                  <ReferenceLine y={0} stroke="#333" strokeWidth={1.5} />
                  {[...derived.pitLapsA].map(lap => (
                    <ReferenceLine key={`pa-${lap}`} x={lap} stroke={COLOR_A} strokeDasharray="4 3" strokeWidth={1.5}
                      label={{ value: 'P', position: 'top', fill: COLOR_A, fontSize: 9 }} />
                  ))}
                  {[...derived.pitLapsB].map(lap => (
                    <ReferenceLine key={`pb-${lap}`} x={lap} stroke={COLOR_B} strokeDasharray="4 3" strokeWidth={1.5}
                      label={{ value: 'P', position: 'insideTopRight', fill: COLOR_B, fontSize: 9 }} />
                  ))}
                  <Bar dataKey="delta" maxBarSize={14} isAnimationActive={false}>
                    {derived.deltaData.map((d, i) => (
                      <Cell key={i} fill={d.delta == null ? 'transparent' : d.delta < 0 ? COLOR_A : COLOR_B} fillOpacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              {/* Overtake windows */}
              {(derived.windows.a.length > 0 || derived.windows.b.length > 0) && (
                <div className="pace-windows">
                  <span className="pace-windows-label">Pace windows (&gt;0.4s/lap for 3+ laps):</span>
                  {derived.windows.a.map((w, i) => (
                    <span key={`wa-${i}`} className="pace-window-chip" style={{ borderColor: COLOR_A, color: COLOR_A }}>
                      {derived.driverA?.name_acronym} faster laps {w.start}–{w.end}
                      &nbsp;(avg {(w.sum / w.n).toFixed(2)}s/lap · {w.n} laps →&nbsp;
                      closes 1s gap in {(1 / (w.sum / w.n)).toFixed(1)} laps)
                    </span>
                  ))}
                  {derived.windows.b.map((w, i) => (
                    <span key={`wb-${i}`} className="pace-window-chip" style={{ borderColor: COLOR_B, color: COLOR_B }}>
                      {derived.driverB?.name_acronym} faster laps {w.start}–{w.end}
                      &nbsp;(avg {(w.sum / w.n).toFixed(2)}s/lap · {w.n} laps →&nbsp;
                      closes 1s gap in {(1 / (w.sum / w.n)).toFixed(1)} laps)
                    </span>
                  ))}
                </div>
              )}

              {/* Pit decision cards */}
              <div className="pit-section">
                <h3 className="pit-section-title">Pit Stop Analysis</h3>
                <p className="pit-section-note">
                  Net gain = pace gain/lap × laps remaining − pit time. Excludes track-position cost (gap to car behind at pit entry).
                </p>
                <div className="pit-columns">
                  <div className="pit-column">
                    <div className="pit-column-header" style={{ color: COLOR_A }}>
                      {derived.driverA?.name_acronym}
                    </div>
                    {derived.pitCardsA.length === 0
                      ? <p className="pit-none">No pit stops recorded</p>
                      : derived.pitCardsA.map((c, i) => <PitCard key={i} card={c} />)}
                  </div>
                  <div className="pit-column">
                    <div className="pit-column-header" style={{ color: COLOR_B }}>
                      {derived.driverB?.name_acronym}
                    </div>
                    {derived.pitCardsB.length === 0
                      ? <p className="pit-none">No pit stops recorded</p>
                      : derived.pitCardsB.map((c, i) => <PitCard key={i} card={c} />)}
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </DashboardPanel>
  );
}
