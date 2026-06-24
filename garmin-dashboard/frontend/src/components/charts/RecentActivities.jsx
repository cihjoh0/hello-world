import { useEffect, useState } from "react";
import { fetchActivities } from "../../api/garmin";
import LoadingSpinner from "../ui/LoadingSpinner";
import ErrorMessage from "../ui/ErrorMessage";

function fmtDuration(s) {
  if (!s) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function fmtDate(iso) {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

export default function RecentActivities({ limit = 15 }) {
  const [activities, setActivities] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchActivities(limit)
      .then(setActivities)
      .catch((e) => setError(e.message));
  }, [limit]);

  if (error) return <ErrorMessage message={error} />;
  if (!activities) return <LoadingSpinner />;

  return (
    <div className="table-scroll">
      <table className="activity-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Name</th>
            <th>Distance</th>
            <th>Time</th>
            <th>Pace</th>
            <th>Avg HR</th>
            <th>Elevation</th>
          </tr>
        </thead>
        <tbody>
          {activities.map((a) => (
            <tr key={a.activity_id}>
              <td className="td-date">{fmtDate(a.start_time)}</td>
              <td className="td-name">{a.name || "Run"}</td>
              <td className="td-num">{a.distance_km ?? "—"} km</td>
              <td className="td-num">{fmtDuration(a.duration_s)}</td>
              <td className="td-num td-accent">{a.pace ? `${a.pace} /km` : "—"}</td>
              <td className="td-num">{a.avg_hr ? `${Math.round(a.avg_hr)} bpm` : "—"}</td>
              <td className="td-num">{a.elevation_gain ? `${Math.round(a.elevation_gain)} m` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
