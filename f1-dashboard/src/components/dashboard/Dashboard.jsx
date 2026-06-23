import LapTimeChart from '../charts/LapTimeChart';

export default function Dashboard() {
  return (
    <div className="dashboard">
      <LapTimeChart />
      {/* Future panels: TireStrategy, LivePositions, etc. */}
    </div>
  );
}
