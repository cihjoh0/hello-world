import { useState } from 'react';
import Dashboard from './components/dashboard/Dashboard';
import StoryExport from './components/stories/StoryExport';
import './App.css';

export default function App() {
  const [showStories, setShowStories] = useState(false);

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-inner">
          <span className="logo-flag">&#127937;</span>
          <h1 className="app-title">F1 Analytics</h1>
          <span className="app-subtitle">OpenF1 · Live Data</span>
          <button className="stories-btn" onClick={() => setShowStories(true)}>
            Share Stories
          </button>
        </div>
      </header>
      <main className="app-main">
        <Dashboard />
      </main>
      {showStories && <StoryExport onClose={() => setShowStories(false)} />}
    </div>
  );
}
