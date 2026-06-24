import { useState, useEffect, useRef } from 'react';
import { getMatchStats } from '../../api/football';
import StatsBars from './StatsBars';
import GoalTimeline from './GoalTimeline';
import Spinner from '../ui/Spinner';

const TABS = ['Timeline', 'Stats', 'Analysis'];

export default function AnalysisPanel({ match }) {
  const [tab, setTab]           = useState('Timeline');
  const [stats, setStats]       = useState(null);
  const [loading, setLoading]   = useState(false);
  const [analysis, setAnalysis] = useState('');
  const [analysing, setAnalysing] = useState(false);
  const abortRef = useRef(null);

  useEffect(() => {
    if (!match) { setStats(null); return; }
    setStats(null);
    setAnalysis('');
    setTab('Timeline');
    setLoading(true);
    getMatchStats(match.id).then(s => { setStats(s); setLoading(false); });
  }, [match?.id]);

  async function runAnalysis() {
    if (!match || !stats) return;
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setAnalysis('');
    setAnalysing(true);
    try {
      const res = await fetch('/api/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ match, stats }),
        signal: ctrl.signal,
      });
      if (!res.ok) { setAnalysis('Analysis unavailable — server error.'); return; }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let text = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += dec.decode(value, { stream: true });
        setAnalysis(text);
      }
    } catch (e) {
      if (e.name !== 'AbortError') setAnalysis('Analysis unavailable — make sure the server is running.');
    } finally {
      setAnalysing(false);
    }
  }

  useEffect(() => {
    if (tab === 'Analysis' && match && stats && !analysis && !analysing) {
      runAnalysis();
    }
  }, [tab]);

  const canShow = match?.status === 'FINISHED' || match?.status === 'LIVE';

  if (!match) {
    return (
      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">MATCH DETAILS</span>
        </div>
        <div className="panel-body">
          <div className="empty-state" style={{ height: 200 }}>
            <div className="empty-icon">⚽</div>
            <p className="empty-title">Select a match</p>
            <p className="empty-sub">Click any fixture to see stats and AI analysis</p>
          </div>
        </div>
      </div>
    );
  }

  const { homeTeam, awayTeam, score, status } = match;
  const hs = score?.fullTime?.home;
  const as = score?.fullTime?.away;
  const htH = score?.halfTime?.home;
  const htA = score?.halfTime?.away;

  return (
    <div className="panel">
      <div className="analysis-match-header">
        <div className="analysis-match-context">{match.group ?? match.stage?.replace(/_/g, ' ')}</div>
        <div className="analysis-match-teams">
          <div className="analysis-team">
            <div className="analysis-team-flag">{homeTeam.crest}</div>
            <div className="analysis-team-name">{homeTeam.name}</div>
          </div>
          <div className="analysis-score">
            {canShow
              ? <>
                  <div className="analysis-score-value">{hs ?? 0} – {as ?? 0}</div>
                  {htH != null && <div className="analysis-score-ht">HT {htH}–{htA}</div>}
                </>
              : <div className="analysis-score-value" style={{ fontSize: 18, color: '#444' }}>vs</div>
            }
            <div className="analysis-status">{status === 'LIVE' ? '🟢 LIVE' : status}</div>
          </div>
          <div className="analysis-team analysis-team--away">
            <div className="analysis-team-flag">{awayTeam.crest}</div>
            <div className="analysis-team-name">{awayTeam.name}</div>
          </div>
        </div>
      </div>

      {!canShow ? (
        <div className="panel-body">
          <div className="empty-state" style={{ height: 160 }}>
            <div className="empty-icon">🕐</div>
            <p className="empty-title">Not started yet</p>
            <p className="empty-sub">Stats available once the match kicks off</p>
          </div>
        </div>
      ) : (
        <>
          <div className="panel-tabs">
            {TABS.map(t => (
              <button
                key={t}
                className={`panel-tab${tab === t ? ' active' : ''}`}
                onClick={() => setTab(t)}
              >
                {t === 'Analysis' ? '🤖 Analysis' : t}
              </button>
            ))}
          </div>

          {loading && (
            <div className="spinner-wrap"><div className="spinner" /></div>
          )}

          {!loading && stats && tab === 'Timeline' && (
            <GoalTimeline stats={stats} homeTeam={homeTeam} awayTeam={awayTeam} />
          )}

          {!loading && stats && tab === 'Stats' && (
            <StatsBars stats={stats} homeTeam={homeTeam} awayTeam={awayTeam} />
          )}

          {!loading && stats && tab === 'Analysis' && (
            <div className="analysis-body">
              {analysing && !analysis && (
                <div className="analysis-skeleton">
                  {[80, 60, 95, 50, 75].map((w, i) => (
                    <div key={i} className="analysis-skel-line" style={{ width: `${w}%` }} />
                  ))}
                </div>
              )}
              {analysis && (
                <div className="analysis-text">
                  {analysis.split('\n').filter(Boolean).map((line, i) => (
                    <p key={i}>{line}{analysing && i === analysis.split('\n').filter(Boolean).length - 1 && <span className="analysis-cursor" />}</p>
                  ))}
                </div>
              )}
              {!analysing && !analysis && (
                <div className="empty-state">
                  <p className="empty-title">No analysis yet</p>
                </div>
              )}
              {!analysing && analysis && (
                <button
                  onClick={runAnalysis}
                  style={{ marginTop: 16, background: 'none', border: '1px solid #2a2a3e', borderRadius: 6, padding: '6px 14px', color: '#ffd700', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', cursor: 'pointer' }}
                >
                  Refresh Analysis
                </button>
              )}
            </div>
          )}

          {!loading && !stats && (
            <div className="panel-body">
              <div className="empty-state">
                <p className="empty-title">No stats available</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
