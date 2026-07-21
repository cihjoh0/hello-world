// Parses safety car / VSC periods from OpenF1 race_control messages into
// [{ type: 'SC' | 'VSC', start: lapNum, end: lapNum }, ...] for chart overlays.
export function getSafetyCarPeriods(raceControl, maxLap) {
  const periods = [];
  if (!raceControl?.length) return periods;

  let scStart = null, vscStart = null;
  const sorted = [...raceControl].sort((a, b) => (a.lap_number ?? 0) - (b.lap_number ?? 0));
  for (const rc of sorted) {
    const flag = (rc.flag ?? '').toUpperCase();
    const lap = rc.lap_number;
    if (!lap) continue;
    if (flag.includes('VSC DEPLOYED')) { vscStart = lap; }
    else if (flag.includes('VSC ENDING') && vscStart != null) {
      periods.push({ type: 'VSC', start: vscStart, end: lap });
      vscStart = null;
    } else if (flag.includes('SC DEPLOYED')) { scStart = lap; }
    else if (flag.includes('SC ENDING') && scStart != null) {
      periods.push({ type: 'SC', start: scStart, end: lap });
      scStart = null;
    }
  }
  // Deployed but never explicitly ended in the messages (e.g. race ended under caution)
  if (scStart  != null && maxLap != null) periods.push({ type: 'SC',  start: scStart,  end: maxLap });
  if (vscStart != null && maxLap != null) periods.push({ type: 'VSC', start: vscStart, end: maxLap });
  return periods;
}
