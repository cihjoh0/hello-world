import LapTimeChart from '../charts/LapTimeChart';
import TireStrategyChart from '../charts/TireStrategyChart';
import PaceAnalysisPanel from '../charts/PaceAnalysisPanel';
import PitWindowPanel from '../charts/PitWindowPanel';
import FastF1Panel from '../charts/FastF1Panel';

export default function Dashboard() {
  return (
    <div className="dashboard">
      <LapTimeChart />
      <TireStrategyChart />
      <PaceAnalysisPanel />
      <PitWindowPanel />
      <FastF1Panel />
    </div>
  );
}
