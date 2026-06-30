import { useState, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import {
  resolveSession, getDrivers, getLaps,
  getStints, getPitStops, getPositions,
} from '../../api/openf1';

// ── Constants ──────────────────────────────────────────────────────────────────

const COMPOUND_COLOR = {
  SOFT: '#e8002d', MEDIUM: '#ffd700', HARD: '#d9d9d9',
  INTERMEDIATE: '#39b54a', WET: '#00a0dd', UNKNOWN: '#555',
};

function fmtLap(s) {
  if (s == null) return '—';
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toFixed(3).padStart(6, '0')}`;
}

function fmtGap(s) {
  if (s == null || s === 0) return 'WINNER';
  return `+${s.toFixed(3)}s`;
}

// ── Data hook ─────────────────────────────────────────────────────────────────

function useStoryData(sessionType, sessionKey = null) {
  const [state, setState] = useState({ loading: true, error: null, data: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, data: null });
    (async () => {
      try {
        const session = await resolveSession(sessionType, sessionKey);
        if (!session) throw new Error('No session found');
        const key = session.session_key;

        const [drivers, laps, stints, pitStops, positions] = await Promise.all([
          getDrivers(key),
          getLaps(key),
          getStints(key),
          getPitStops(key),
          getPositions(key),
        ]);

        if (!session) throw new Error(`No ${sessionType.toLowerCase()} session found`);
        if (cancelled) return;

        // Build driver map: number → driver object
        const driverMap = {};
        drivers.forEach(d => { driverMap[d.driver_number] = d; });

        // Final positions: last position entry per driver, sorted ascending
        const lastPos = {};
        positions.forEach(p => {
          if (!lastPos[p.driver_number] || p.date > lastPos[p.driver_number].date) {
            lastPos[p.driver_number] = p;
          }
        });
        const result = Object.values(lastPos)
          .sort((a, b) => a.position - b.position)
          .map(p => ({ ...driverMap[p.driver_number], position: p.position }));

        // Winner total time for gap calculation
        const cumTime = {};
        laps.forEach(l => {
          if (!l.lap_duration) return;
          cumTime[l.driver_number] = (cumTime[l.driver_number] ?? 0) + l.lap_duration;
        });
        const winnerTime = cumTime[result[0]?.driver_number] ?? null;
        result.forEach(r => {
          r.gap_s = r.driver_number === result[0]?.driver_number
            ? 0
            : (cumTime[r.driver_number] ?? null) - winnerTime;
        });

        // Fastest lap
        let fastestLap = null;
        laps.forEach(l => {
          if (!l.lap_duration) return;
          if (!fastestLap || l.lap_duration < fastestLap.lap_duration) {
            fastestLap = { ...l, driver: driverMap[l.driver_number] };
          }
        });

        // Top 5 fastest laps per driver (best lap only)
        const bestLap = {};
        laps.forEach(l => {
          if (!l.lap_duration) return;
          if (!bestLap[l.driver_number] || l.lap_duration < bestLap[l.driver_number].lap_duration) {
            bestLap[l.driver_number] = l;
          }
        });
        const top5Fast = Object.values(bestLap)
          .sort((a, b) => a.lap_duration - b.lap_duration)
          .slice(0, 5)
          .map(l => ({ ...l, driver: driverMap[l.driver_number] }));

        // Total laps
        const totalLaps = Math.max(...laps.map(l => l.lap_number ?? 0), 0);

        // Pit stops sorted by pit time ascending
        const pitsSorted = [...pitStops]
          .filter(p => p.pit_duration > 0)
          .sort((a, b) => a.pit_duration - b.pit_duration)
          .slice(0, 10)
          .map(p => ({ ...p, driver: driverMap[p.driver_number] }));

        // Starting grid positions: earliest position entry per driver
        const startPos = {};
        positions.forEach(p => {
          if (!startPos[p.driver_number] || p.date < startPos[p.driver_number].date) {
            startPos[p.driver_number] = p;
          }
        });

        setState({
          loading: false,
          error: null,
          data: {
            session,
            result: result.slice(0, 10),
            stints,
            driverMap,
            fastestLap,
            top5Fast,
            totalLaps,
            pitsSorted,
            startPos,
            allPitStops: pitStops,
          },
        });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: e.message, data: null });
      }
    })();
    return () => { cancelled = true; };
  }, [sessionType, sessionKey]);

  return state;
}

// ── Story card shell ──────────────────────────────────────────────────────────

function CardShell({ cardRef, title, session, children }) {
  const loc = [session?.location, session?.country_name].filter(Boolean).join(', ');
  return (
    <div ref={cardRef} className="story-card">
      <div className="story-header">
        <div className="story-header-bar" />
        <div className="story-header-text">
          <span className="story-event">{session?.session_name ?? 'Race'}</span>
          <span className="story-loc">{loc}</span>
        </div>
        <div className="story-title-block">
          <span className="story-card-title">{title}</span>
        </div>
      </div>
      <div className="story-body">{children}</div>
      <div className="story-footer">
        <span className="story-brand">F1 Analytics · openf1.org</span>
      </div>
    </div>
  );
}

// ── Download helper ────────────────────────────────────────────────────────────

async function downloadCard(ref, filename) {
  const canvas = await html2canvas(ref.current, {
    scale: 2,
    backgroundColor: '#0d0d14',
    useCORS: true,
    logging: false,
  });
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

// ── Card 1: Podium ────────────────────────────────────────────────────────────

function PodiumCard({ session, result, label = 'Race' }) {
  const cardRef = useRef();
  const top3 = [result[1], result[0], result[2]]; // P2 left, P1 center, P3 right
  const heights = [200, 260, 160];

  return (
    <div className="story-wrapper">
      <CardShell cardRef={cardRef} title={`${label.toUpperCase()} RESULT`} session={session}>
        <div className="story-podium">
          {top3.map((driver, i) => {
            if (!driver) return <div key={i} className="story-podium-col" />;
            const teamColor = driver.team_colour ? `#${driver.team_colour}` : '#e8002d';
            const pos = [2, 1, 3][i];
            return (
              <div key={i} className="story-podium-col">
                <div className="story-podium-info">
                  <span className="story-podium-driver">{driver.name_acronym ?? '???'}</span>
                  <span className="story-podium-team" style={{ color: teamColor }}>
                    {driver.team_name ?? ''}
                  </span>
                  <span className="story-podium-gap">{fmtGap(driver.gap_s)}</span>
                </div>
                <div
                  className="story-podium-block"
                  style={{ height: heights[i], background: teamColor + '33', borderTop: `3px solid ${teamColor}` }}
                >
                  <span className="story-podium-pos">P{pos}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="story-result-list">
          {result.slice(3, 8).map(d => {
            const teamColor = d?.team_colour ? `#${d.team_colour}` : '#555';
            return (
              <div key={d.driver_number} className="story-result-row">
                <span className="story-result-pos">P{d.position}</span>
                <span className="story-result-driver" style={{ color: teamColor }}>
                  {d.name_acronym}
                </span>
                <span className="story-result-gap">{fmtGap(d.gap_s)}</span>
              </div>
            );
          })}
        </div>
      </CardShell>
      <button className="story-dl-btn" onClick={() => downloadCard(cardRef, `f1-${label.toLowerCase()}-result.png`)}>
        Save to Photos
      </button>
    </div>
  );
}

// ── Card 2: Tire Strategy ─────────────────────────────────────────────────────

function TireStrategyCard({ session, stints, driverMap, totalLaps, label = 'Race' }) {
  const cardRef = useRef();

  // Top 10 drivers, sorted by driver number (proxy for finishing position)
  const drivers = Object.values(driverMap)
    .sort((a, b) => a.driver_number - b.driver_number)
    .slice(0, 10);

  const driverStints = (driverNum) =>
    stints.filter(s => s.driver_number === driverNum && s.compound !== 'UNKNOWN');

  return (
    <div className="story-wrapper">
      <CardShell cardRef={cardRef} title={`${label.toUpperCase()} STRATEGY`} session={session}>
        <div className="story-strategy">
          {drivers.map(d => {
            const ds = driverStints(d.driver_number);
            if (!ds.length) return null;
            return (
              <div key={d.driver_number} className="story-strategy-row">
                <span className="story-strategy-driver">{d.name_acronym}</span>
                <div className="story-strategy-track">
                  {ds.map((s, i) => {
                    const start = ((s.lap_start - 1) / totalLaps) * 100;
                    const end   = ((s.lap_end ?? totalLaps) / totalLaps) * 100;
                    const width = end - start;
                    const color = COMPOUND_COLOR[s.compound] ?? '#555';
                    return (
                      <div
                        key={i}
                        className="story-strategy-stint"
                        style={{ left: `${start}%`, width: `${width}%`, background: color }}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div className="story-strategy-axis">
            {[0, 25, 50, 75, 100].map(pct => (
              <span key={pct} style={{ left: `${pct}%` }}>
                {Math.round((pct / 100) * totalLaps)}
              </span>
            ))}
          </div>
        </div>
        <div className="story-compound-legend">
          {Object.entries(COMPOUND_COLOR).slice(0, 5).map(([c, col]) => (
            <span key={c} className="story-legend-item">
              <span className="story-legend-dot" style={{ background: col }} />
              {c[0] + c.slice(1).toLowerCase()}
            </span>
          ))}
        </div>
      </CardShell>
      <button className="story-dl-btn" onClick={() => downloadCard(cardRef, 'f1-tire-strategy.png')}>
        Save to Photos
      </button>
    </div>
  );
}

// ── Card 3: Fastest Lap ───────────────────────────────────────────────────────

function FastestLapCard({ session, fastestLap, top5Fast, label = 'Race' }) {
  const cardRef = useRef();
  if (!fastestLap) return null;

  const maxTime = top5Fast[top5Fast.length - 1]?.lap_duration ?? 1;
  const minTime = top5Fast[0]?.lap_duration ?? 1;
  const range = maxTime - minTime || 1;

  return (
    <div className="story-wrapper">
      <CardShell cardRef={cardRef} title="FASTEST LAP" session={session}>
        <div className="story-fastest-hero">
          <span className="story-fastest-time">{fmtLap(fastestLap.lap_duration)}</span>
          <span className="story-fastest-driver">
            {fastestLap.driver?.name_acronym ?? '?'}
          </span>
          <span className="story-fastest-meta">
            Lap {fastestLap.lap_number} ·{' '}
            {fastestLap.driver?.team_name ?? ''}
          </span>
        </div>
        <div className="story-fast-bars">
          <p className="story-fast-label">Top 5 fastest laps</p>
          {top5Fast.map((l, i) => {
            const pct = 30 + ((l.lap_duration - minTime) / range) * 70;
            const teamColor = l.driver?.team_colour ? `#${l.driver.team_colour}` : '#e8002d';
            return (
              <div key={l.driver_number} className="story-fast-row">
                <span className="story-fast-pos">P{i + 1}</span>
                <span className="story-fast-name">{l.driver?.name_acronym ?? '?'}</span>
                <div className="story-fast-bar-track">
                  <div
                    className="story-fast-bar"
                    style={{ width: `${pct}%`, background: teamColor }}
                  />
                </div>
                <span className="story-fast-t">{fmtLap(l.lap_duration)}</span>
              </div>
            );
          })}
        </div>
      </CardShell>
      <button className="story-dl-btn" onClick={() => downloadCard(cardRef, 'f1-fastest-lap.png')}>
        Save to Photos
      </button>
    </div>
  );
}

// ── Card 4: Pit Stops ─────────────────────────────────────────────────────────

function PitStopsCard({ session, pitsSorted }) {
  const cardRef = useRef();
  if (!pitsSorted.length) return null;

  const maxDur = Math.max(...pitsSorted.map(p => p.pit_duration));
  const minDur = pitsSorted[0]?.pit_duration ?? 1;
  const range = maxDur - minDur || 1;

  return (
    <div className="story-wrapper">
      <CardShell cardRef={cardRef} title="PIT STOPS" session={session}>
        <div className="story-pit-hero">
          <span className="story-pit-best-label">Fastest stop</span>
          <span className="story-pit-best-time">{pitsSorted[0]?.pit_duration?.toFixed(3)}s</span>
          <span className="story-pit-best-driver">
            {pitsSorted[0]?.driver?.name_acronym ?? '?'} · Lap {pitsSorted[0]?.lap_number}
          </span>
        </div>
        <div className="story-pit-bars">
          {pitsSorted.map((p, i) => {
            const pct = 20 + ((p.pit_duration - minDur) / range) * 80;
            const teamColor = p.driver?.team_colour ? `#${p.driver.team_colour}` : '#555';
            return (
              <div key={i} className="story-pit-row">
                <span className="story-pit-driver">{p.driver?.name_acronym ?? '?'}</span>
                <div className="story-pit-bar-track">
                  <div
                    className="story-pit-bar"
                    style={{ width: `${pct}%`, background: i === 0 ? '#39b54a' : teamColor }}
                  />
                </div>
                <span className="story-pit-dur">{p.pit_duration?.toFixed(1)}s</span>
              </div>
            );
          })}
        </div>
      </CardShell>
      <button className="story-dl-btn" onClick={() => downloadCard(cardRef, 'f1-pit-stops.png')}>
        Save to Photos
      </button>
    </div>
  );
}

// ── Storyline generator ───────────────────────────────────────────────────────

function generateStorylines(data, label) {
  const { session, result, fastestLap, pitsSorted, startPos, allPitStops, driverMap } = data;
  const loc = session?.location ?? '';
  const tag = `#${loc.replace(/\s+/g, '')}GP`;
  const lines = [];

  // 1. Podium / race result
  const [p1, p2, p3] = result;
  if (p1) {
    lines.push({
      icon: '🏁',
      headline: `${p1.name_acronym} wins the ${loc} ${label}`,
      text: `🏁 ${label.toUpperCase()} RESULT | ${loc} Grand Prix\n\nP1 ${p1.name_acronym} (${p1.team_name ?? ''})\nP2 ${p2?.name_acronym ?? '?'}${p2?.gap_s != null ? ` +${p2.gap_s.toFixed(3)}s` : ''}\nP3 ${p3?.name_acronym ?? '?'}${p3?.gap_s != null ? ` +${p3.gap_s.toFixed(3)}s` : ''}\n\n#F1 ${tag}`,
    });
  }

  // 2. Biggest position gainer
  const movers = result
    .map(r => {
      const start = startPos[r.driver_number]?.position ?? r.position;
      return { ...r, startPos: start, gained: start - r.position };
    })
    .sort((a, b) => b.gained - a.gained);
  const gainer = movers[0];
  if (gainer?.gained >= 3) {
    lines.push({
      icon: '📈',
      headline: `${gainer.name_acronym} gains ${gainer.gained} places`,
      text: `📈 BIGGEST MOVER | ${loc} ${label}\n\n${gainer.name_acronym} started P${gainer.startPos} and finished P${gainer.position} — ${gainer.gained} positions gained on race day! 🚀\n\n#F1 ${tag}`,
    });
  }

  // 3. Fastest lap
  if (fastestLap) {
    lines.push({
      icon: '⚡',
      headline: `${fastestLap.driver?.name_acronym} sets fastest lap`,
      text: `⚡ FASTEST LAP | ${loc} ${label}\n\n${fastestLap.driver?.name_acronym ?? '?'} (${fastestLap.driver?.team_name ?? ''}) clocked ${fmtLap(fastestLap.lap_duration)} on Lap ${fastestLap.lap_number}.\n\n#F1 #FastestLap ${tag}`,
    });
  }

  // 4. Fastest pit stop
  const best = pitsSorted[0];
  if (best) {
    lines.push({
      icon: '🛑',
      headline: `${best.driver?.name_acronym} — fastest stop ${best.pit_duration?.toFixed(3)}s`,
      text: `🛑 FASTEST PIT STOP | ${loc} ${label}\n\n${best.driver?.team_name ?? ''} executed a ${best.pit_duration?.toFixed(3)}s stop for ${best.driver?.name_acronym ?? '?'} on Lap ${best.lap_number}.\n\n#F1 #PitStop ${tag}`,
    });
  }

  // 5. Strategy split (1-stop vs 2-stop)
  const stopCount = {};
  (allPitStops ?? []).forEach(p => {
    stopCount[p.driver_number] = (stopCount[p.driver_number] ?? 0) + 1;
  });
  const oneStop = result.filter(r => (stopCount[r.driver_number] ?? 0) === 1);
  const twoStop = result.filter(r => (stopCount[r.driver_number] ?? 0) === 2);
  if (oneStop.length > 0 && twoStop.length > 0) {
    const best1 = oneStop[0];
    const best2 = twoStop[0];
    lines.push({
      icon: '🔧',
      headline: `Strategy battle: 1-stop vs 2-stop`,
      text: `🔧 STRATEGY | ${loc} ${label}\n\n${oneStop.length} drivers went 1-stop, ${twoStop.length} went 2-stop.\n\nBest 1-stopper: ${best1?.name_acronym} P${best1?.position}\nBest 2-stopper: ${best2?.name_acronym} P${best2?.position}\n\n#F1 #Strategy ${tag}`,
    });
  }

  return lines;
}

// ── Social posts UI ───────────────────────────────────────────────────────────

function SocialPostsSection({ data, label }) {
  const [copied, setCopied] = useState(null);
  const storylines = generateStorylines(data, label);

  const copy = (text, idx) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(idx);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  if (!storylines.length) return (
    <p style={{ color: '#555', textAlign: 'center', padding: '1rem' }}>
      Not enough data to generate storylines for this session.
    </p>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {storylines.map((line, i) => (
        <div key={i} style={{
          background: '#0f0f1a',
          border: '1px solid #1e1e2e',
          borderRadius: 8,
          padding: '12px 14px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 16 }}>{line.icon}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#e0e0e8', flex: 1 }}>{line.headline}</span>
            <button
              onClick={() => copy(line.text, i)}
              style={{
                background: copied === i ? '#39b54a' : '#1e1e2e',
                color: copied === i ? '#0d0d14' : '#aaa',
                border: `1px solid ${copied === i ? '#39b54a' : '#2a2a3e'}`,
                borderRadius: 4,
                padding: '3px 10px',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                flexShrink: 0,
                transition: 'all 0.15s',
              }}
            >
              {copied === i ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <pre style={{
            margin: 0,
            fontFamily: 'inherit',
            fontSize: 12,
            color: '#666',
            whiteSpace: 'pre-wrap',
            lineHeight: 1.6,
            borderTop: '1px solid #1a1a2a',
            paddingTop: 8,
          }}>
            {line.text}
          </pre>
        </div>
      ))}
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export default function StoryExport({ sessionType = 'Race', sessionKey = null, onClose }) {
  const { loading, error, data } = useStoryData(sessionType, sessionKey);
  const [tab, setTab] = useState('posts');
  const isSprint = sessionType === 'Sprint';
  const label = isSprint ? 'Sprint' : 'Race';

  return (
    <div className="story-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="story-modal">
        <div className="story-modal-header">
          <span>Share {label} · {data?.session?.location ?? ''}</span>
          <button className="story-close" onClick={onClose}>✕</button>
        </div>

        {loading && (
          <div className="story-loading">Loading {label.toLowerCase()} data…</div>
        )}

        {error && (
          <div className="story-error">Could not load data: {error}</div>
        )}

        {data && (
          <>
            <div style={{ display: 'flex', borderBottom: '1px solid #1e1e2e', marginBottom: 16 }}>
              {['posts', 'cards'].map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    background: 'none',
                    border: 'none',
                    borderBottom: `2px solid ${tab === t ? '#e8002d' : 'transparent'}`,
                    color: tab === t ? '#fff' : '#555',
                    padding: '10px 20px',
                    fontSize: 12,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    cursor: 'pointer',
                  }}
                >
                  {t === 'posts' ? '✍ Social Posts' : '📸 Story Cards'}
                </button>
              ))}
            </div>

            {tab === 'posts' && (
              <div className="story-scroll">
                <SocialPostsSection data={data} label={label} />
              </div>
            )}

            {tab === 'cards' && (
              <div className="story-scroll">
                <PodiumCard session={data.session} result={data.result} label={label} />
                <TireStrategyCard
                  session={data.session}
                  stints={data.stints}
                  driverMap={data.driverMap}
                  totalLaps={data.totalLaps}
                  label={label}
                />
                <FastestLapCard
                  session={data.session}
                  fastestLap={data.fastestLap}
                  top5Fast={data.top5Fast}
                  label={label}
                />
                {!isSprint && <PitStopsCard session={data.session} pitsSorted={data.pitsSorted} />}
              </div>
            )}
          </>
        )}

        <p className="story-hint">
          {tab === 'posts'
            ? 'Click Copy on any post, then paste into Twitter/X, Instagram or wherever.'
            : 'Tap "Save to Photos" on each card, then share from your Photos app to Instagram Stories.'}
        </p>
      </div>
    </div>
  );
}
