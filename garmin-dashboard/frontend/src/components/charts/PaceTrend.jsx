import { useEffect, useState } from "react";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Line, ComposedChart, ZAxis,
} from "recharts";
import { fetchPaceTrend } from "../../api/garmin";
import LoadingSpinner from "../ui/LoadingSpinner";
import ErrorMessage from "../ui/ErrorMessage";

const PACE_COLOR = "#00b4d8";
const HR_COLOR = "#f43f5e";

function floatToPace(f) {
  if (!f) return "—";
  const mins = Math.floor(f);
  const secs = Math.round((f - mins) * 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="chart-tooltip">
      <p className="tooltip-label">{d?.date}</p>
      <p style={{ color: PACE_COLOR, margin: "2px 0" }}>Pace: {d?.pace} /km</p>
      {d?.avg_hr && <p style={{ color: HR_COLOR, margin: "2px 0" }}>HR: {Math.round(d.avg_hr)} bpm</p>}
      <p style={{ color: "#666", margin: "2px 0" }}>{d?.distance_km} km</p>
    </div>
  );
}

export default function PaceTrend({ mode = "pace" }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchPaceTrend(150)
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorMessage message={error} />;
  if (!data) return <LoadingSpinner />;

  const showPace = mode !== "hr";
  const showHr = mode !== "pace";

  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#1e1e2e" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: "#555" }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        {showPace && (
          <YAxis
            yAxisId="pace"
            dataKey="pace_float"
            domain={["auto", "auto"]}
            reversed
            tick={{ fontSize: 10, fill: PACE_COLOR }}
            axisLine={false}
            tickLine={false}
            tickFormatter={floatToPace}
            width={44}
          />
        )}
        {showHr && (
          <YAxis
            yAxisId="hr"
            orientation="right"
            dataKey="avg_hr"
            domain={["auto", "auto"]}
            tick={{ fontSize: 10, fill: HR_COLOR }}
            axisLine={false}
            tickLine={false}
            unit=" bpm"
            width={52}
          />
        )}
        <Tooltip content={<CustomTooltip />} />
        {showPace && (
          <Line
            yAxisId="pace"
            dataKey="pace_float"
            stroke={PACE_COLOR}
            strokeWidth={2}
            dot={{ r: 3, fill: PACE_COLOR, fillOpacity: 0.6 }}
            activeDot={{ r: 5 }}
            name="Pace"
          />
        )}
        {showHr && data[0]?.avg_hr && (
          <Line
            yAxisId="hr"
            dataKey="avg_hr"
            stroke={HR_COLOR}
            strokeWidth={2}
            dot={{ r: 3, fill: HR_COLOR, fillOpacity: 0.6 }}
            activeDot={{ r: 5 }}
            name="Avg HR"
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
