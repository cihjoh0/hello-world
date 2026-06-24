import { useEffect, useState } from "react";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ZAxis,
} from "recharts";
import { fetchPaceTrend } from "../../api/garmin";
import LoadingSpinner from "../ui/LoadingSpinner";
import ErrorMessage from "../ui/ErrorMessage";

const ACCENT = "#00b4d8";

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
      <p style={{ color: ACCENT, margin: "2px 0" }}>Pace: {floatToPace(d?.pace_float)} /km</p>
      <p style={{ color: "#f43f5e", margin: "2px 0" }}>HR: {Math.round(d?.avg_hr)} bpm</p>
      <p style={{ color: "#666", margin: "2px 0" }}>{d?.distance_km} km</p>
    </div>
  );
}

export default function PaceVsHr() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchPaceTrend(200)
      .then((rows) => setData(rows.filter((r) => r.avg_hr && r.pace_float)))
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorMessage message={error} />;
  if (!data) return <LoadingSpinner />;
  if (!data.length) return <p className="no-data">Need HR data recorded on runs to show this chart.</p>;

  // Color points by recency: older = dim, newer = bright
  const coloredData = data.map((d, i) => ({
    ...d,
    opacity: 0.3 + 0.7 * (i / Math.max(data.length - 1, 1)),
  }));

  return (
    <div>
      <ResponsiveContainer width="100%" height={260}>
        <ScatterChart margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#1e1e2e" />
          <XAxis
            type="number"
            dataKey="avg_hr"
            name="Avg HR"
            unit=" bpm"
            domain={["auto", "auto"]}
            tick={{ fontSize: 10, fill: "#555" }}
            axisLine={false}
            tickLine={false}
            label={{ value: "Avg HR (bpm)", position: "insideBottom", offset: -2, fill: "#444", fontSize: 10 }}
          />
          <YAxis
            type="number"
            dataKey="pace_float"
            name="Pace"
            reversed
            domain={["auto", "auto"]}
            tick={{ fontSize: 10, fill: "#555" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={floatToPace}
            width={44}
            label={{ value: "Pace /km", angle: -90, position: "insideLeft", fill: "#444", fontSize: 10 }}
          />
          <ZAxis range={[30, 30]} />
          <Tooltip content={<CustomTooltip />} />
          <Scatter
            data={coloredData}
            fill={ACCENT}
            fillOpacity={0.7}
            shape={(props) => {
              const { cx, cy, payload } = props;
              return <circle cx={cx} cy={cy} r={4} fill={ACCENT} fillOpacity={payload.opacity} />;
            }}
          />
        </ScatterChart>
      </ResponsiveContainer>
      <p className="chart-note">
        Points fade from dim (older) to bright (recent). Improving aerobic fitness shows as dots drifting left or down over time.
      </p>
    </div>
  );
}
