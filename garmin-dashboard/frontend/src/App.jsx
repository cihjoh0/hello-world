import { useState } from "react";
import "./App.css";
import Panel from "./components/dashboard/Panel";
import StatsBar from "./components/charts/StatsBar";
import WeeklyMileage from "./components/charts/WeeklyMileage";
import PaceTrend from "./components/charts/PaceTrend";
import HrZones from "./components/charts/HrZones";
import PaceVsHr from "./components/charts/PaceVsHr";
import RecentActivities from "./components/charts/RecentActivities";

const WEEKS_OPTIONS = [12, 26, 52];
const HR_DAYS_OPTIONS = [30, 90, 180];
const PACE_MODES = [
  { key: "pace", label: "Pace" },
  { key: "both", label: "Pace + HR" },
  { key: "hr", label: "HR only" },
];

export default function App() {
  const [weeks, setWeeks] = useState(26);
  const [hrDays, setHrDays] = useState(90);
  const [paceMode, setPaceMode] = useState("pace");

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-inner">
          <span className="logo-icon">&#9873;</span>
          <h1 className="app-title">Running Dashboard</h1>
          <span className="app-subtitle">Powered by Garmin Connect</span>
        </div>
      </header>

      <main className="app-main">
        <div className="dashboard">

          {/* Stats bar */}
          <Panel title="Overview" subtitle="all time">
            <StatsBar />
          </Panel>

          {/* Weekly mileage */}
          <Panel
            title="Weekly Mileage"
            subtitle={
              <span className="header-controls">
                {WEEKS_OPTIONS.map((w) => (
                  <button
                    key={w}
                    className={`toggle-btn ${weeks === w ? "active" : ""}`}
                    onClick={() => setWeeks(w)}
                  >
                    {w}w
                  </button>
                ))}
              </span>
            }
          >
            <WeeklyMileage weeks={weeks} />
          </Panel>

          {/* Two-column row */}
          <div className="two-col">

            {/* Pace trend */}
            <Panel
              title="Pace Trend"
              subtitle={
                <span className="header-controls">
                  {PACE_MODES.map((m) => (
                    <button
                      key={m.key}
                      className={`toggle-btn ${paceMode === m.key ? "active" : ""}`}
                      onClick={() => setPaceMode(m.key)}
                    >
                      {m.label}
                    </button>
                  ))}
                </span>
              }
            >
              <PaceTrend mode={paceMode} />
            </Panel>

            {/* HR Zones */}
            <Panel
              title="HR Zone Distribution"
              subtitle={
                <span className="header-controls">
                  {HR_DAYS_OPTIONS.map((d) => (
                    <button
                      key={d}
                      className={`toggle-btn ${hrDays === d ? "active" : ""}`}
                      onClick={() => setHrDays(d)}
                    >
                      {d}d
                    </button>
                  ))}
                </span>
              }
            >
              <HrZones days={hrDays} />
            </Panel>
          </div>

          {/* Pace vs HR scatter */}
          <Panel title="Aerobic Efficiency" subtitle="pace vs heart rate — all runs with HR data">
            <PaceVsHr />
          </Panel>

          {/* Recent activities */}
          <Panel title="Recent Activities" subtitle="last 15 runs">
            <RecentActivities limit={15} />
          </Panel>

        </div>
      </main>
    </div>
  );
}
