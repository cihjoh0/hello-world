import Dashboard from './components/dashboard/Dashboard';
import './App.css';

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-inner">
          <span className="logo-flag">&#127937;</span>
          <h1 className="app-title">F1 Analytics</h1>
          <span className="app-subtitle">OpenF1 · Live Data</span>
        </div>
      </header>
      <main className="app-main">
        <Dashboard />
      </main>
    </div>
  );
}
