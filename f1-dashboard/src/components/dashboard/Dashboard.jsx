import LapTimeChart from '../charts/LapTimeChart';
import TireStrategyChart from '../charts/TireStrategyChart';
import PaceAnalysisPanel from '../charts/PaceAnalysisPanel';
import PitWindowPanel from '../charts/PitWindowPanel';
import FastF1Panel from '../charts/FastF1Panel';

export default function Dashboard({ sessionType = 'Race', sessionKey = null }) {
  return (
    <div className="dashboard">
      <LapTimeChart sessionType={sessionType} sessionKey={sessionKey} />
      <TireStrategyChart sessionType={sessionType} sessionKey={sessionKey} />
      <PaceAnalysisPanel sessionType={sessionType} sessionKey={sessionKey} />
      <PitWindowPanel sessionType={sessionType} sessionKey={sessionKey} />
      <FastF1Panel sessionType={sessionType} />
    </div>
  );
}
