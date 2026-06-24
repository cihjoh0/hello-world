import { useState, useEffect } from 'react';
import { getMatches, getStandings, getTopScorers } from '../../api/football';
import MatchCard from './MatchCard';
import Standings from './Standings';
import TopScorers from './TopScorers';
import AnalysisPanel from './AnalysisPanel';

const LEFT_TABS = ['Fixtures', 'Standings', 'Golden Boot'];

export default function Dashboard({ filterGroup }) {
  const [leftTab, setLeftTab]     = useState('Fixtures');
  const [matches, setMatches]     = useState([]);
  const [standings, setStandings] = useState([]);
  const [scorers, setScorers]     = useState([]);
  const [selected, setSelected]   = useState(null);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    Promise.all([getMatches(), getStandings(), getTopScorers()])
      .then(([m, s, sc]) => {
        setMatches(m);
        setStandings(s);
        setScorers(sc);
        const live     = m.find(x => x.status === 'LIVE');
        const finished = m.find(x => x.status === 'FINISHED');
        setSelected(live ?? finished ?? null);
      })
      .finally(() => setLoading(false));
  }, []);

  const visibleMatches = filterGroup === 'all'
    ? matches
    : matches.filter(m => m.group === filterGroup);

  return (
    <div className="dashboard">
      <div className="dashboard-left">
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">FIFA World Cup 2026</span>
          </div>
          <div className="panel-tabs">
            {LEFT_TABS.map(t => (
              <button
                key={t}
                className={`panel-tab${leftTab === t ? ' active' : ''}`}
                onClick={() => setLeftTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="panel-body">
            {loading && (
              <div className="spinner-wrap"><div className="spinner" /></div>
            )}

            {!loading && leftTab === 'Fixtures' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {visibleMatches.length === 0 && (
                  <div className="empty-state">
                    <span className="empty-title">No matches found.</span>
                  </div>
                )}
                {visibleMatches.map(m => (
                  <MatchCard
                    key={m.id}
                    match={m}
                    selected={selected?.id === m.id}
                    onClick={() => setSelected(m)}
                  />
                ))}
              </div>
            )}

            {!loading && leftTab === 'Standings' && (
              <Standings standings={standings} filterGroup={filterGroup} />
            )}

            {!loading && leftTab === 'Golden Boot' && (
              <TopScorers scorers={scorers} />
            )}
          </div>
        </div>
      </div>

      <div className="dashboard-right">
        <AnalysisPanel match={selected} />
      </div>
    </div>
  );
}
