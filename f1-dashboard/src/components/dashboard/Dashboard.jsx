import LapTimeChart from '../charts/LapTimeChart';
import TireStrategyChart from '../charts/TireStrategyChart';
import PaceAnalysisPanel from '../charts/PaceAnalysisPanel';

export default function Dashboard() {
  return (
    <div className="dashboard">
      <LapTimeChart />
      <TireStrategyChart />
      <PaceAnalysisPanel />
    </div>
  );
}
