import LapTimeChart from '../charts/LapTimeChart';
import TireStrategyChart from '../charts/TireStrategyChart';

export default function Dashboard() {
  return (
    <div className="dashboard">
      <LapTimeChart />
      <TireStrategyChart />
      {/* Future panels: LivePositions, etc. */}
    </div>
  );
}
