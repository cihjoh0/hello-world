import { useState } from 'react';
import './App.css';
import Dashboard from './components/dashboard/Dashboard';

const GROUPS = ['Group A', 'Group B', 'Group C', 'Group D', 'Group E', 'Group F',
                'Group G', 'Group H', 'Group I', 'Group J', 'Group K', 'Group L'];

export default function App() {
  const [stage, setStage]       = useState('group');
  const [filterGroup, setGroup] = useState('all');

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-inner">
          <span className="logo-flag">🏆</span>
          <h1 className="app-title">World Cup</h1>
          <span className="app-subtitle">2026</span>

          <div className="stage-toggle">
            <button
              className={`st-btn${stage === 'group' ? ' active' : ''}`}
              onClick={() => setStage('group')}
            >
              Groups
            </button>
            <button
              className={`st-btn${stage === 'knockout' ? ' active' : ''}`}
              onClick={() => setStage('knockout')}
            >
              Knockout
            </button>
          </div>

          {stage === 'group' && (
            <select
              className="group-select"
              value={filterGroup}
              onChange={e => setGroup(e.target.value)}
            >
              <option value="all">All Groups</option>
              {GROUPS.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          )}

          <div className="live-badge">
            <span className="live-dot" />
            LIVE
          </div>
        </div>
      </header>

      <main className="app-main">
        {stage === 'group' && <Dashboard filterGroup={filterGroup} />}
        {stage === 'knockout' && (
          <div className="empty-state" style={{ marginTop: 60 }}>
            <div className="empty-icon">🏟️</div>
            <p className="empty-title">Knockout stage</p>
            <p className="empty-sub">Coming once the group stage is complete</p>
          </div>
        )}
      </main>
    </div>
  );
}
