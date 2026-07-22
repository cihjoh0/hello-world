import { useEffect, useState } from "react";
import { fetchActivities } from "../../api/garmin";
import LoadingSpinner from "../ui/LoadingSpinner";
import ErrorMessage from "../ui/ErrorMessage";

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

function fmtDuration(s) {
  if (!s) return null;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function ActivityCard({ activity }) {
  const { name, start_time, distance_km, duration_s, pace, avg_hr } = activity;
  const duration = fmtDuration(duration_s);

  return (
    <div className="activity-card">
      <div className="card-avatar">🏃</div>
      <div className="card-info">
        <div className="card-name">{name || "Run"}</div>
        <div className="card-sub">
          <span>📍</span>
          {distance_km ? `${distance_km} km` : "—"}
          {duration && <>&nbsp;·&nbsp;{duration}</>}
          {start_time && <>&nbsp;·&nbsp;{timeAgo(start_time)}</>}
        </div>
      </div>
      <div className="card-badge">
        <div className="badge-value">{pace ?? "—"}</div>
        <div className="badge-label">{avg_hr ? `♥ ${Math.round(avg_hr)}` : "min/km"}</div>
      </div>
    </div>
  );
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
  if (!activities.length) return <p className="no-data">No activities yet.</p>;

  return (
    <div className="activity-cards">
      {activities.map((a) => (
        <ActivityCard key={a.activity_id} activity={a} />
      ))}
    </div>
  );
}
