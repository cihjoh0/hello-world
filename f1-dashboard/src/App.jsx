import { useState, useEffect } from 'react';
import Dashboard from './components/dashboard/Dashboard';
import StoryExport from './components/stories/StoryExport';
import { getSessions } from './api/openf1';
import './App.css';

export default function App() {
  const [sessionType, setSessionType] = useState('Race');
  const [showStories, setShowStories] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [selectedSessionKey, setSelectedSessionKey] = useState(null);

  useEffect(() => {
    setSessions([]);
    setSelectedSessionKey(null);
    const year = new Date().getFullYear();
    getSessions(year, sessionType).then(data => {
      setSessions(data);
      if (data.length > 0) setSelectedSessionKey(data[data.length - 1].session_key);
    });
  }, [sessionType]);

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
        <Dashboard sessionType={sessionType} sessionKey={selectedSessionKey} />
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
