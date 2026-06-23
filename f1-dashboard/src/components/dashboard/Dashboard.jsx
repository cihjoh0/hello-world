import LapTimeChart from '../charts/LapTimeChart';
import TireStrategyChart from '../charts/TireStrategyChart';
import PaceAnalysisPanel from '../charts/PaceAnalysisPanel';
import PitWindowPanel from '../charts/PitWindowPanel';

export default function Dashboard() {
  return (
    <div className="dashboard">
      <LapTimeChart />
      <TireStrategyChart />
      <PaceAnalysisPanel />
      <PitWindowPanel />
    </div>
  );
}
