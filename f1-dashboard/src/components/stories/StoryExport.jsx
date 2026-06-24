import { useState, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import {
  getLatestSession, getDrivers, getLaps,
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

function useStoryData() {
  const [state, setState] = useState({ loading: true, error: null, data: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await getLatestSession('Race');
        if (!session) throw new Error('No session found');
        const key = session.session_key;

        const [drivers, laps, stints, pitStops, positions] = await Promise.all([
          getDrivers(key),
          getLaps(key),
          getStints(key),
          getPitStops(key),
          getPositions(key),
        ]);

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
          },
        });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: e.message, data: null });
      }
    })();
    return () => { cancelled = true; };
  }, []);

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

function PodiumCard({ session, result }) {
  const cardRef = useRef();
  const top3 = [result[1], result[0], result[2]]; // P2 left, P1 center, P3 right
  const heights = [200, 260, 160];

  return (
    <div className="story-wrapper">
      <CardShell cardRef={cardRef} title="RACE RESULT" session={session}>
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
      <button className="story-dl-btn" onClick={() => downloadCard(cardRef, 'f1-podium.png')}>
        Save to Photos
      </button>
    </div>
  );
}

// ── Card 2: Tire Strategy ─────────────────────────────────────────────────────

function TireStrategyCard({ session, stints, driverMap, totalLaps }) {
  const cardRef = useRef();

  // Top 10 drivers, sorted by driver number (proxy for finishing position)
  const drivers = Object.values(driverMap)
    .sort((a, b) => a.driver_number - b.driver_number)
    .slice(0, 10);

  const driverStints = (driverNum) =>
    stints.filter(s => s.driver_number === driverNum && s.compound !== 'UNKNOWN');

  return (
    <div className="story-wrapper">
      <CardShell cardRef={cardRef} title="TIRE STRATEGY" session={session}>
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

function FastestLapCard({ session, fastestLap, top5Fast }) {
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

// ── Main modal ────────────────────────────────────────────────────────────────

export default function StoryExport({ onClose }) {
  const { loading, error, data } = useStoryData();

  return (
    <div className="story-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="story-modal">
        <div className="story-modal-header">
          <span>Instagram Stories</span>
          <button className="story-close" onClick={onClose}>✕</button>
        </div>

        {loading && (
          <div className="story-loading">Loading race data…</div>
        )}

        {error && (
          <div className="story-error">Could not load data: {error}</div>
        )}

        {data && (
          <div className="story-scroll">
            <PodiumCard session={data.session} result={data.result} />
            <TireStrategyCard
              session={data.session}
              stints={data.stints}
              driverMap={data.driverMap}
              totalLaps={data.totalLaps}
            />
            <FastestLapCard
              session={data.session}
              fastestLap={data.fastestLap}
              top5Fast={data.top5Fast}
            />
            <PitStopsCard session={data.session} pitsSorted={data.pitsSorted} />
          </div>
        )}

        <p className="story-hint">
          Tap "Save to Photos" on each card, then share from your Photos app to Instagram Stories.
        </p>
      </div>
    </div>
  );
}
