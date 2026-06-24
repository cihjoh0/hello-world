import { useEffect, useState } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { fetchWeekly } from "../../api/garmin";
import LoadingSpinner from "../ui/LoadingSpinner";
import ErrorMessage from "../ui/ErrorMessage";

const ACCENT = "#00b4d8";
const AVG_COLOR = "#f97316";

function shortWeek(w) {
  // "2024-W03" → "W3"
  const parts = w.split("-W");
  return `W${parseInt(parts[1], 10)}`;
}

function addRollingAvg(data, window = 4) {
  return data.map((d, i) => {
    const slice = data.slice(Math.max(0, i - window + 1), i + 1);
    const avg = slice.reduce((s, r) => s + r.distance_km, 0) / slice.length;
    return { ...d, rolling_avg: Math.round(avg * 10) / 10 };
  });
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="chart-tooltip">
      <p className="tooltip-label">{label}</p>
      <p style={{ color: ACCENT, margin: "2px 0" }}>{d?.distance_km} km &mdash; {d?.runs} run{d?.runs !== 1 ? "s" : ""}</p>
      <p style={{ color: AVG_COLOR, margin: "2px 0" }}>4-wk avg: {d?.rolling_avg} km</p>
    </div>
  );
}

export default function WeeklyMileage({ weeks = 26 }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchWeekly(weeks)
      .then((rows) => setData(addRollingAvg(rows)))
      .catch((e) => setError(e.message));
  }, [weeks]);

  if (error) return <ErrorMessage message={error} />;
  if (!data) return <LoadingSpinner />;

  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#1e1e2e" vertical={false} />
        <XAxis
          dataKey="week"
          tickFormatter={shortWeek}
          tick={{ fontSize: 10, fill: "#555" }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#555" }}
          axisLine={false}
          tickLine={false}
          unit=" km"
          width={48}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="distance_km" fill={ACCENT} fillOpacity={0.75} radius={[3, 3, 0, 0]} name="Distance" />
        <Line
          dataKey="rolling_avg"
          stroke={AVG_COLOR}
          strokeWidth={2}
          dot={false}
          name="4-wk avg"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
