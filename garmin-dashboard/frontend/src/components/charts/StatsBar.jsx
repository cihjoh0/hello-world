import { useEffect, useState } from "react";
import { fetchStats } from "../../api/garmin";
import LoadingSpinner from "../ui/LoadingSpinner";
import ErrorMessage from "../ui/ErrorMessage";

function StatCell({ label, value, sub }) {
  return (
    <div className="stat-cell">
      <span className="stat-value">{value ?? "—"}</span>
      <span className="stat-label">{label}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}

export default function StatsBar() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchStats()
      .then(setStats)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorMessage message={error} />;
  if (!stats) return <LoadingSpinner />;

  return (
    <div className="stats-bar">
      <StatCell label="Total Runs" value={stats.total_runs} />
      <StatCell label="Total Distance" value={`${stats.total_km} km`} />
      <StatCell label="Total Time" value={`${stats.total_hours} hrs`} />
      <StatCell label="This Month" value={`${stats.this_month_km} km`} sub={`${stats.this_month_runs} runs`} />
      <StatCell label="Best Pace" value={stats.fastest_pace ? `${stats.fastest_pace} /km` : "—"} />
      <StatCell label="Longest Run" value={stats.longest_km ? `${stats.longest_km} km` : "—"} />
      <StatCell label="VO₂ Max" value={stats.best_vo2max ?? "—"} sub="best recorded" />
      <StatCell label="Avg HR" value={stats.avg_hr ? `${stats.avg_hr} bpm` : "—"} />
    </div>
  );
}
