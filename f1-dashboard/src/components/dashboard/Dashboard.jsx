import LapTimeChart from '../charts/LapTimeChart';
import TireStrategyChart from '../charts/TireStrategyChart';
import PaceAnalysisPanel from '../charts/PaceAnalysisPanel';
import PitWindowPanel from '../charts/PitWindowPanel';
import FastF1Panel from '../charts/FastF1Panel';
import QualifyingTelemetryPanel from '../charts/QualifyingTelemetryPanel';
import RaceGapChart from '../charts/RaceGapChart';

export default function Dashboard({ sessionType = 'Race', sessionKey = null }) {
  return (
    <div className="dashboard">
      <RaceGapChart sessionType={sessionType} sessionKey={sessionKey} />
      <LapTimeChart sessionType={sessionType} sessionKey={sessionKey} />
      <TireStrategyChart sessionType={sessionType} sessionKey={sessionKey} />
      <PaceAnalysisPanel sessionType={sessionType} sessionKey={sessionKey} />
      <PitWindowPanel sessionType={sessionType} sessionKey={sessionKey} />
      <QualifyingTelemetryPanel sessionType={sessionType} sessionKey={sessionKey} />
      <FastF1Panel sessionType={sessionType} />
    </div>
  );
}
