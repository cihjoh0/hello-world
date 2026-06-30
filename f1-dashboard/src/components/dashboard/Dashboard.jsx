import LapTimeChart from '../charts/LapTimeChart';
import TireStrategyChart from '../charts/TireStrategyChart';
import PaceAnalysisPanel from '../charts/PaceAnalysisPanel';
import PitWindowPanel from '../charts/PitWindowPanel';
import FastF1Panel from '../charts/FastF1Panel';
import QualifyingTelemetryPanel from '../charts/QualifyingTelemetryPanel';
import RaceGapChart from '../charts/RaceGapChart';
import BattleTracker from '../charts/BattleTracker';
import PositionChart from '../charts/PositionChart';
import WeekendPacePanel from '../charts/WeekendPacePanel';
import WeatherPanel from '../charts/WeatherPanel';
import SeasonStandingsPanel from '../charts/SeasonStandingsPanel';

export default function Dashboard({ sessionType = 'Race', sessionKey = null, year = new Date().getFullYear() }) {
  return (
    <div className="dashboard">
      <WeatherPanel sessionType={sessionType} sessionKey={sessionKey} />
      <WeekendPacePanel sessionType={sessionType} sessionKey={sessionKey} />
      <PositionChart sessionType={sessionType} sessionKey={sessionKey} />
      <RaceGapChart sessionType={sessionType} sessionKey={sessionKey} />
      <BattleTracker sessionType={sessionType} sessionKey={sessionKey} />
      <LapTimeChart sessionType={sessionType} sessionKey={sessionKey} />
      <TireStrategyChart sessionType={sessionType} sessionKey={sessionKey} />
      <PaceAnalysisPanel sessionType={sessionType} sessionKey={sessionKey} />
      <PitWindowPanel sessionType={sessionType} sessionKey={sessionKey} />
      <QualifyingTelemetryPanel sessionType={sessionType} sessionKey={sessionKey} />
      <SeasonStandingsPanel year={year} />
      <FastF1Panel sessionType={sessionType} />
    </div>
  );
}
