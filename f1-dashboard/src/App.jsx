import { useState, useEffect, useMemo } from 'react';
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
  // One entry per race weekend (meeting), combining race + sprint keys
  const [rounds, setRounds] = useState([]);
  const [selectedMeetingKey, setSelectedMeetingKey] = useState(null);

  useEffect(() => {
    setRounds([]);
    setSelectedMeetingKey(null);
    const now = Date.now();
    Promise.all([
      getSessions(year, 'Race'),
      getSessions(year, 'Sprint'),
    ]).then(([races, sprints]) => {
      const sprintByMeeting = {};
      for (const s of sprints) sprintByMeeting[s.meeting_key] = s.session_key;

      // Only include meetings whose race has already taken place
      const pastRaces = races
        .filter(r => r.meeting_key && new Date(r.date_start).getTime() <= now)
        .sort((a, b) => new Date(a.date_start) - new Date(b.date_start));

      // Deduplicate by meeting_key (race weekends are identified by meeting, not session)
      const seen = new Set();
      const roundList = [];
      for (const r of pastRaces) {
        if (seen.has(r.meeting_key)) continue;
        seen.add(r.meeting_key);
        roundList.push({
          meetingKey: r.meeting_key,
          location: r.location ?? r.circuit_short_name ?? 'Unknown',
          raceKey: r.session_key,
          sprintKey: sprintByMeeting[r.meeting_key] ?? null,
        });
      }

      setRounds(roundList);
      if (roundList.length > 0) {
        setSelectedMeetingKey(roundList[roundList.length - 1].meetingKey);
      }
    });
  }, [year]);

  const selectedRound = useMemo(
    () => rounds.find(r => r.meetingKey === selectedMeetingKey) ?? null,
    [rounds, selectedMeetingKey]
  );

  // When switching to a non-sprint weekend while in Sprint mode, fall back to Race
  useEffect(() => {
    if (sessionType === 'Sprint' && selectedRound && !selectedRound.sprintKey) {
      setSessionType('Race');
    }
  }, [selectedRound, sessionType]);

  const selectedSessionKey = useMemo(() => {
    if (!selectedRound) return null;
    if (sessionType === 'Sprint') return selectedRound.sprintKey ?? selectedRound.raceKey;
    return selectedRound.raceKey;
  }, [selectedRound, sessionType]);

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
              disabled={!selectedRound?.sprintKey}
              title={selectedRound && !selectedRound.sprintKey ? 'No sprint race this weekend' : undefined}
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
          {rounds.length > 0 && (
            <select
              className="race-select"
              value={selectedMeetingKey ?? ''}
              onChange={e => setSelectedMeetingKey(Number(e.target.value))}
            >
              {rounds.map(r => (
                <option key={r.meetingKey} value={r.meetingKey}>
                  {r.location}{r.sprintKey ? ' ★' : ''}
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
