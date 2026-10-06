// Parses safety car / VSC periods from OpenF1 race_control messages into
// [{ type: 'SC' | 'VSC', start: lapNum, end: lapNum }, ...] for chart overlays.
//
// Matches against BOTH `flag` and `message`: OpenF1 reports these events with
// category "SafetyCar" and text like "SAFETY CAR DEPLOYED" in `message` (flag is
// typically empty for them), while other feeds put "SC DEPLOYED" in `flag`.
// "SC DEPLOYED"/"SC ENDING" are substrings of the VSC phrases, so VSC is handled
// first and the SC branches skip anything virtual.
const has = (text, needles) => needles.some(n => text.includes(n));

export function getSafetyCarPeriods(raceControl, maxLap) {
  const periods = [];
  if (!raceControl?.length) return periods;

  let scStart = null, vscStart = null;
  // Sort by lap, then timestamp: DEPLOYED and ENDING can share a lap.
  const time = rc => (rc.date ? new Date(rc.date).getTime() : 0);
  const sorted = [...raceControl].sort(
    (a, b) => (a.lap_number ?? 0) - (b.lap_number ?? 0) || time(a) - time(b)
  );

  for (const rc of sorted) {
    const lap = rc.lap_number;
    if (!lap) continue;
    const text = `${rc.flag ?? ''} ${rc.message ?? ''}`.toUpperCase();
    const isVirtual = text.includes('VIRTUAL') || text.includes('VSC');

    if (has(text, ['VIRTUAL SAFETY CAR DEPLOYED', 'VSC DEPLOYED'])) {
      vscStart = lap;
    } else if (has(text, ['VIRTUAL SAFETY CAR ENDING', 'VSC ENDING']) && vscStart != null) {
      periods.push({ type: 'VSC', start: vscStart, end: lap });
      vscStart = null;
    } else if (!isVirtual && has(text, ['SAFETY CAR DEPLOYED', 'SC DEPLOYED'])) {
      scStart = lap;
    } else if (!isVirtual && has(text, ['SAFETY CAR IN THIS LAP', 'SAFETY CAR ENDING', 'SC ENDING']) && scStart != null) {
      periods.push({ type: 'SC', start: scStart, end: lap });
      scStart = null;
    }
  }
  // Deployed but never explicitly ended in the messages (e.g. race ended under caution)
  if (scStart  != null && maxLap != null) periods.push({ type: 'SC',  start: scStart,  end: maxLap });
  if (vscStart != null && maxLap != null) periods.push({ type: 'VSC', start: vscStart, end: maxLap });
  return periods;
}
