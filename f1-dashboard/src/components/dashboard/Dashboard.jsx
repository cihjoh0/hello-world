import LapTimeChart from '../charts/LapTimeChart';
import TireStrategyChart from '../charts/TireStrategyChart';
import PaceAnalysisPanel from '../charts/PaceAnalysisPanel';
import PitWindowPanel from '../charts/PitWindowPanel';
import FastF1Panel from '../charts/FastF1Panel';

export default function Dashboard({ sessionType = 'Race' }) {
  return (
    <div className="dashboard">
      <LapTimeChart sessionType={sessionType} />
      <TireStrategyChart sessionType={sessionType} />
      <PaceAnalysisPanel sessionType={sessionType} />
      <PitWindowPanel sessionType={sessionType} />
      <FastF1Panel sessionType={sessionType} />
    </div>
  );
}
