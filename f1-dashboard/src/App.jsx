import { useState, useEffect } from 'react';
import Dashboard from './components/dashboard/Dashboard';
import StoryExport from './components/stories/StoryExport';
import { getSessions } from './api/openf1';
import './App.css';

const CURRENT_YEAR = new Date().getFullYear();
const AVAILABLE_YEARS = Array.from(
  { length: CURRENT_YEAR - 2022 },
  (_, i) => CURRENT_YEAR - i
);

export default function App() {
  const [sessionType, setSessionType] = useState('Race');
  const [year, setYear] = useState(CURRENT_YEAR);
  const [showStories, setShowStories] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [selectedSessionKey, setSelectedSessionKey] = useState(null);

  useEffect(() => {
    setSessions([]);
    setSelectedSessionKey(null);
    getSessions(year, sessionType).then(data => {
      setSessions(data);
      if (data.length > 0) setSelectedSessionKey(data[data.length - 1].session_key);
    });
  }, [year, sessionType]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-inner">
          <span className="logo-flag">&#127937;</span>
          <h1 className="app-title">F1 Analytics</h1>
          <span className="app-subtitle">OpenF1 · Live Data</span>
          <div className="session-type-toggle">
            <button
              className={`stt-btn ${sessionType === 'Race' ? 'active' : ''}`}
              onClick={() => setSessionType('Race')}
            >
              Race
            </button>
            <button
              className={`stt-btn ${sessionType === 'Sprint' ? 'active' : ''}`}
              onClick={() => setSessionType('Sprint')}
            >
              Sprint
            </button>
          </div>
          <select
            className="race-select"
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            style={{ maxWidth: 80 }}
          >
            {AVAILABLE_YEARS.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          {sessions.length > 0 && (
            <select
              className="race-select"
              value={selectedSessionKey ?? ''}
              onChange={e => setSelectedSessionKey(Number(e.target.value))}
            >
              {sessions.map(s => (
                <option key={s.session_key} value={s.session_key}>
                  {s.location ?? s.circuit_short_name ?? 'Unknown'}
                </option>
              ))}
            </select>
          )}
          <button className="stories-btn" onClick={() => setShowStories(true)}>
            Share Stories
          </button>
        </div>
      </header>
      <main className="app-main">
        <Dashboard sessionType={sessionType} sessionKey={selectedSessionKey} year={year} />
      </main>
      {showStories && (
        <StoryExport
          sessionType={sessionType}
          sessionKey={selectedSessionKey}
          onClose={() => setShowStories(false)}
        />
      )}
    </div>
  );
}
