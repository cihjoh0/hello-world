import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import { fetchHrZones } from "../../api/garmin";
import LoadingSpinner from "../ui/LoadingSpinner";
import ErrorMessage from "../ui/ErrorMessage";

const ZONE_COLORS = {
  1: "#4ade80",
  2: "#22d3ee",
  3: "#facc15",
  4: "#f97316",
  5: "#f43f5e",
};

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  const hrs = Math.floor(d.minutes / 60);
  const mins = Math.round(d.minutes % 60);
  const formatted = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
  return (
    <div className="chart-tooltip">
      <p className="tooltip-label" style={{ color: ZONE_COLORS[d.zone] }}>{d.name}</p>
      <p style={{ margin: "2px 0" }}>{formatted}</p>
    </div>
  );
}

export default function HrZones({ days = 90 }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchHrZones(days)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [days]);

  if (error) return <ErrorMessage message={error} />;
  if (!data) return <LoadingSpinner />;
  if (!data.length) return <p className="no-data">No HR zone data available.</p>;

  const totalMins = data.reduce((s, z) => s + z.minutes, 0);

  return (
    <div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#1e1e2e" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10, fill: "#555" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#555" }}
            axisLine={false}
            tickLine={false}
            unit=" min"
            width={48}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="minutes" radius={[4, 4, 0, 0]}>
            {data.map((entry) => (
              <Cell key={entry.zone} fill={ZONE_COLORS[entry.zone] || "#888"} fillOpacity={0.8} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="zone-legend">
        {data.map((z) => (
          <span key={z.zone} className="zone-chip" style={{ "--zc": ZONE_COLORS[z.zone] }}>
            {z.name} &mdash; {Math.round((z.minutes / totalMins) * 100)}%
          </span>
        ))}
      </div>
    </div>
  );
}
