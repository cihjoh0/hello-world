import { useMemo, useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { useOpenF1 } from '../../hooks/useOpenF1';
import { resolveSession, getMeetingSessions, getDrivers, getLaps, getStints } from '../../api/openf1';
import DashboardPanel from '../dashboard/DashboardPanel';
import LoadingSpinner from '../ui/LoadingSpinner';
import ErrorMessage from '../ui/ErrorMessage';

const TABS = ['Session Pace', 'Race Pace (FP2)', 'Degradation'];
const MAX_LAP_S = 180;   // exclude installation/red-flag laps
const LONG_RUN_MIN = 6;  // minimum lap count for a race-sim stint
const SKIP_LAPS = 1;     // skip first lap of each stint (out-lap)

const COMPOUND_COLOR = {
  SOFT: '#e8002d', MEDIUM: '#ffd700', HARD: '#f0f0f0',
  INTERMEDIATE: '#39b54a', WET: '#00a0dd',
};

const SESSION_PALETTE = ['#888', '#00a0dd', '#39b54a', '#e8002d'];

function sessionLabel(s) {
  const name = s.session_name ?? s.session_type ?? '';
  if (/practice.?1/i.test(name)) return 'FP1';
  if (/practice.?2/i.test(name)) return 'FP2';
  if (/practice.?3/i.test(name)) return 'FP3';
  if (/sprint.shootout|sprint.qualifying/i.test(name)) return 'SQ';
  if (/qualifying/i.test(name)) return 'Q';
  return name.split(' ').map(w => w[0]).join('');
}

function fmtTime(s) {
  if (s == null) return '—';
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(3).padStart(6, '0');
  return m > 0 ? `${m}:${sec}` : sec;
}

async function fetchData(sessionType, sessionKey) {
  const refSession = await resolveSession(sessionType, sessionKey);
  if (!refSession) throw new Error('Session not found');

  const allSessions = await getMeetingSessions(refSession.meeting_key);
  const fp = allSessions
    .filter(s => /practice/i.test(s.session_type))
    .sort((a, b) => a.session_key - b.session_key);
  const quali = allSessions.find(s => /qualifying/i.test(s.session_type) && !/sprint/i.test(s.session_name));

  const targets = [...fp, ...(quali ? [quali] : [])];
  if (!targets.length) throw new Error('No practice or qualifying data for this weekend');

  const drivers = await getDrivers(refSession.session_key);
  const [lapsResults, fp2Stints] = await Promise.all([
    Promise.all(targets.map(s => getLaps(s.session_key))),
    fp[1] ? getStints(fp[1].session_key) : Promise.resolve([]),
  ]);

  const lapsBySession = Object.fromEntries(targets.map((s, i) => [s.session_key, lapsResults[i]]));

  return { refSession, fp, quali, targets, drivers, lapsBySession, fp2Stints };
}

export default function WeekendPacePanel({ sessionType = 'Race', sessionKey = null }) {
  const { data, loading, error } = useOpenF1(
    () => fetchData(sessionType, sessionKey),
    [sessionType, sessionKey]
  );
  const [tab, setTab] = useState(0);

  // ── Tab 1: best lap per driver per session ──────────────────────────────
  const sessionPace = useMemo(() => {
    if (!data) return null;
    const { targets, drivers, lapsBySession } = data;
    const driverMap = Object.fromEntries(drivers.map(d => [d.driver_number, d]));

    const bestLaps = {};
    for (const session of targets) {
      for (const { driver_number: num, lap_duration: dur } of (lapsBySession[session.session_key] ?? [])) {
        if (!num || !dur || dur <= 0 || dur > MAX_LAP_S) continue;
        if (!bestLaps[num]) bestLaps[num] = {};
        const cur = bestLaps[num][session.session_key];
        if (!cur || dur < cur) bestLaps[num][session.session_key] = dur;
      }
    }

    // Sort drivers by their best time across any session
    const overallBest = num => Math.min(...targets.map(s => bestLaps[num]?.[s.session_key] ?? Infinity));
    const driverNums = Object.keys(bestLaps).map(Number).sort((a, b) => overallBest(a) - overallBest(b));

    // Gap to fastest in each session
    const sessionFastest = Object.fromEntries(targets.map(s => {
      const times = driverNums.map(n => bestLaps[n]?.[s.session_key]).filter(t => t != null);
      return [s.session_key, times.length ? Math.min(...times) : null];
    }));

    const chartData = driverNums.map(num => {
      const row = { code: driverMap[num]?.name_acronym ?? `#${num}` };
      for (const s of targets) {
        const t = bestLaps[num]?.[s.session_key];
        const fastest = sessionFastest[s.session_key];
        row[`s${s.session_key}`] = (t != null && fastest != null) ? +(t - fastest).toFixed(3) : null;
      }
      return row;
    });

    return { chartData, targets, sessionFastest, bestLaps, driverNums, driverMap };
  }, [data]);

  // ── Tab 2: FP2 long-run average pace ────────────────────────────────────
  const racePace = useMemo(() => {
    if (!data?.fp[1]) return null;
    const { fp, drivers, lapsBySession, fp2Stints } = data;
    const driverMap = Object.fromEntries(drivers.map(d => [d.driver_number, d]));
    const fp2Key = fp[1].session_key;

    const lapMap = {};
    for (const { driver_number: num, lap_number: ln, lap_duration: dur } of (lapsBySession[fp2Key] ?? [])) {
      if (!num || !ln || !dur || dur <= 0 || dur > MAX_LAP_S) continue;
      if (!lapMap[num]) lapMap[num] = {};
      lapMap[num][ln] = dur;
    }

    const longRuns = (fp2Stints ?? [])
      .filter(s => s.lap_end && s.lap_start && (s.lap_end - s.lap_start + 1) >= LONG_RUN_MIN)
      .map(s => {
        const { driver_number: num, lap_start: ls, lap_end: le } = s;
        const compound = s.compound?.toUpperCase() ?? 'UNKNOWN';
        const stintLaps = [];
        for (let ln = ls + SKIP_LAPS; ln <= le; ln++) {
          const t = lapMap[num]?.[ln];
          if (t) stintLaps.push(t);
        }
        if (stintLaps.length < LONG_RUN_MIN - SKIP_LAPS) return null;
        const avg = stintLaps.reduce((a, t) => a + t, 0) / stintLaps.length;
        return { num, compound, lapCount: le - ls + 1, avg };
      })
      .filter(Boolean);

    if (!longRuns.length) return { empty: true };

    // Best long-run per driver
    const byDriver = {};
    for (const run of longRuns) {
      const cur = byDriver[run.num];
      if (!cur || run.lapCount > cur.lapCount || (run.lapCount === cur.lapCount && run.avg < cur.avg))
        byDriver[run.num] = run;
    }

    const fastest = Math.min(...Object.values(byDriver).map(r => r.avg));
    const chartData = Object.values(byDriver)
      .sort((a, b) => a.avg - b.avg)
      .map(r => ({
        code: driverMap[r.num]?.name_acronym ?? `#${r.num}`,
        gap: +(r.avg - fastest).toFixed(3),
        compound: r.compound,
        lapCount: r.lapCount,
        avgTime: r.avg,
        color: driverMap[r.num]?.team_colour ? `#${driverMap[r.num].team_colour}` : '#888',
      }));

    return { chartData, fastest };
  }, [data]);

  // ── Tab 3: lap time vs tyre age (longest FP2 stint per driver) ──────────
  const degradation = useMemo(() => {
    if (!data?.fp[1]) return null;
    const { fp, drivers, lapsBySession, fp2Stints } = data;
    const driverMap = Object.fromEntries(drivers.map(d => [d.driver_number, d]));
    const fp2Key = fp[1].session_key;

    const lapMap = {};
    for (const { driver_number: num, lap_number: ln, lap_duration: dur } of (lapsBySession[fp2Key] ?? [])) {
      if (!num || !ln || !dur || dur <= 0 || dur > MAX_LAP_S) continue;
      if (!lapMap[num]) lapMap[num] = {};
      lapMap[num][ln] = dur;
    }

    const stintData = (fp2Stints ?? [])
      .filter(s => s.lap_end && s.lap_start && (s.lap_end - s.lap_start + 1) >= LONG_RUN_MIN)
      .map(s => {
        const { driver_number: num, lap_start: ls, lap_end: le } = s;
        const compound = s.compound?.toUpperCase() ?? 'UNKNOWN';
        const lapTimes = [];
        for (let ln = ls + SKIP_LAPS; ln <= le; ln++) {
          const t = lapMap[num]?.[ln];
          if (t != null) lapTimes.push({ age: ln - ls - SKIP_LAPS, time: t });
        }
        return { num, compound, lapStart: ls, lapEnd: le, lapTimes };
      })
      .filter(s => s.lapTimes.length >= LONG_RUN_MIN - SKIP_LAPS);

    // Longest stint per driver
    const byDriver = {};
    for (const s of stintData) {
      const len = s.lapEnd - s.lapStart;
      if (!byDriver[s.num] || len > (byDriver[s.num].lapEnd - byDriver[s.num].lapStart))
        byDriver[s.num] = s;
    }

    if (!Object.keys(byDriver).length) return { empty: true };

    const maxAge = Math.max(...Object.values(byDriver).flatMap(s => s.lapTimes.map(l => l.age)));
    const chartData = Array.from({ length: maxAge + 1 }, (_, age) => {
      const row = { age };
      for (const [num, s] of Object.entries(byDriver)) {
        const pt = s.lapTimes.find(l => l.age === age);
        if (pt) row[`d${num}`] = pt.time;
      }
      return row;
    });

    const drivers_ = Object.values(byDriver).map(s => ({
      num: s.num,
      compound: s.compound,
      code: driverMap[s.num]?.name_acronym ?? `#${s.num}`,
      color: driverMap[s.num]?.team_colour ? `#${driverMap[s.num].team_colour}` : '#888',
    }));

    return { chartData, drivers: drivers_ };
  }, [data]);

  const subtitle = data?.refSession
    ? `${data.refSession.location ?? ''} · ${data.refSession.year ?? ''} · Round ${data.refSession.round_number ?? '?'}`
    : undefined;

  return (
    <DashboardPanel title="Weekend Analysis" subtitle={subtitle}>
      {loading && <LoadingSpinner />}
      {error   && <ErrorMessage message={error} />}
      {!loading && !error && data && (
        <>
          {/* Tab bar */}
          <div className="f1-tabs">
            {TABS.map((t, i) => (
              <button key={t} className={`f1-tab-btn ${tab === i ? 'active' : ''}`} onClick={() => setTab(i)}>
                {t}
              </button>
            ))}
          </div>

          {/* ── Tab 0: Session Pace ─────────────────────────────── */}
          {tab === 0 && sessionPace && (
            <>
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                {sessionPace.targets.map((s, i) => (
                  <span key={s.session_key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: SESSION_PALETTE[i] ?? '#888', display: 'inline-block' }} />
                    <span style={{ color: SESSION_PALETTE[i] ?? '#888', fontWeight: 700 }}>{sessionLabel(s)}</span>
                    <span style={{ color: '#444' }}>fastest {fmtTime(sessionPace.sessionFastest[s.session_key])}</span>
                  </span>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={sessionPace.chartData} margin={{ top: 4, right: 12, left: 0, bottom: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                  <XAxis dataKey="code" tick={{ fill: '#888', fontSize: 9 }} interval={0} angle={-45} textAnchor="end" />
                  <YAxis tick={{ fill: '#888', fontSize: 10 }} width={46}
                    tickFormatter={v => `+${v.toFixed(1)}s`} />
                  <Tooltip
                    contentStyle={{ background: '#13131f', border: '1px solid #2a2a3e', fontSize: 11 }}
                    formatter={(v, name) => v == null ? ['—', name] : [`+${v.toFixed(3)} s`, name]}
                  />
                  <ReferenceLine y={0} stroke="#444" strokeDasharray="3 2"
                    label={{ value: 'Fastest', position: 'insideTopRight', fill: '#555', fontSize: 9 }} />
                  {sessionPace.targets.map((s, i) => (
                    <Line key={s.session_key} dataKey={`s${s.session_key}`}
                      name={sessionLabel(s)} stroke={SESSION_PALETTE[i] ?? '#888'}
                      strokeWidth={1.5} dot={false} connectNulls={false} isAnimationActive={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
              <p className="f1-footnote" style={{ marginTop: '0.5rem' }}>
                Gap to that session's fastest lap. A line moving downward = driver/team finding pace.
                Drivers sorted left-to-right by their overall best time.
              </p>
            </>
          )}

          {/* ── Tab 1: FP2 Race Pace ────────────────────────────── */}
          {tab === 1 && (
            racePace?.empty
              ? <p className="f1-hint" style={{ padding: '2rem', textAlign: 'center' }}>No long-run data found in FP2 for this weekend.</p>
              : !racePace
              ? <p className="f1-hint" style={{ padding: '2rem', textAlign: 'center' }}>FP2 not available for this weekend.</p>
              : <>
                  <p style={{ fontSize: 11, color: '#555', margin: '0 0 0.5rem' }}>
                    Average pace over stints of {LONG_RUN_MIN}+ laps (first lap excluded). Fastest reference: {fmtTime(racePace.fastest)}
                  </p>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={racePace.chartData} margin={{ top: 4, right: 12, left: 0, bottom: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                      <XAxis dataKey="code" tick={{ fill: '#888', fontSize: 9 }} interval={0} angle={-45} textAnchor="end" />
                      <YAxis tick={{ fill: '#888', fontSize: 10 }} width={46}
                        tickFormatter={v => `+${v.toFixed(1)}s`} />
                      <Tooltip
                        contentStyle={{ background: '#13131f', border: '1px solid #2a2a3e', fontSize: 11 }}
                        formatter={(v, name, { payload }) => [
                          `+${v.toFixed(3)} s avg  (${payload.lapCount} laps, ${payload.compound})`,
                          'Race Pace',
                        ]}
                        labelFormatter={label => `${label} — avg ${fmtTime(racePace.chartData.find(r => r.code === label)?.avgTime)}`}
                      />
                      <Bar dataKey="gap" name="Race Pace Gap" maxBarSize={22} isAnimationActive={false}>
                        {racePace.chartData.map((entry, i) => (
                          <Cell key={i} fill={COMPOUND_COLOR[entry.compound] ?? entry.color} fillOpacity={0.8} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                    {Object.entries(COMPOUND_COLOR).map(([c, col]) => (
                      <span key={c} style={{ fontSize: 9, color: col, display: 'flex', alignItems: 'center', gap: 3 }}>
                        <span style={{ width: 8, height: 8, background: col, borderRadius: 2, display: 'inline-block', opacity: 0.85 }} />
                        {c[0] + c.slice(1).toLowerCase()}
                      </span>
                    ))}
                  </div>
                  <p className="f1-footnote" style={{ marginTop: '0.4rem' }}>
                    Bar colour = compound used. Gap to fastest long-run average — strong predictor of Sunday race pace.
                  </p>
                </>
          )}

          {/* ── Tab 2: Degradation ─────────────────────────────── */}
          {tab === 2 && (
            degradation?.empty
              ? <p className="f1-hint" style={{ padding: '2rem', textAlign: 'center' }}>No degradation data found in FP2 for this weekend.</p>
              : !degradation
              ? <p className="f1-hint" style={{ padding: '2rem', textAlign: 'center' }}>FP2 not available for this weekend.</p>
              : <>
                  <div className="qt-driver-list" style={{ marginBottom: '0.5rem' }}>
                    {degradation.drivers.map(({ num, code, color, compound }) => (
                      <span key={num} style={{ display: 'flex', alignItems: 'center', gap: 5,
                        background: '#0d0d14', border: '1px solid #2a2a3e', borderRadius: 6,
                        padding: '4px 10px', fontSize: 11 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                        <span style={{ color, fontWeight: 700 }}>{code}</span>
                        <span style={{ color: COMPOUND_COLOR[compound] ?? '#888', fontSize: 9, fontWeight: 700 }}>
                          {compound[0]}
                        </span>
                      </span>
                    ))}
                  </div>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={degradation.chartData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                      <XAxis dataKey="age" tick={{ fill: '#888', fontSize: 10 }}
                        label={{ value: 'Tyre age (laps)', position: 'insideBottomRight', offset: -8, fill: '#555', fontSize: 10 }} />
                      <YAxis tick={{ fill: '#888', fontSize: 10 }} width={52}
                        tickFormatter={fmtTime}
                        domain={['auto', 'auto']} />
                      <Tooltip
                        contentStyle={{ background: '#13131f', border: '1px solid #2a2a3e', fontSize: 11 }}
                        formatter={(v, name) => v == null ? ['—', name] : [fmtTime(v), name]}
                        labelFormatter={age => `Tyre age: ${age} laps`}
                      />
                      {degradation.drivers.map(({ num, code, color }) => (
                        <Line key={num} dataKey={`d${num}`} name={code}
                          stroke={color} strokeWidth={1.5} dot={false}
                          connectNulls={false} isAnimationActive={false} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                  <p className="f1-footnote" style={{ marginTop: '0.5rem' }}>
                    Lap time vs tyre age for the longest FP2 stint per driver (first lap excluded).
                    Steeper upward slope = higher degradation. Compound initial: {degradation.drivers.map(d => `${d.code} ${d.compound[0]}`).join(' · ')}.
                  </p>
                </>
          )}
        </>
      )}
    </DashboardPanel>
  );
}
