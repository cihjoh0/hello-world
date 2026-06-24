const GOAL_ICON = { REGULAR: '⚽', PENALTY: '🅿️', OWN_GOAL: '⚽' };
const CARD_ICON = { YELLOW: '🟨', RED: '🟥', YELLOW_RED: '🟨🟥' };

function sortedEvents(goals, cards) {
  const g = (goals ?? []).map(e => ({ ...e, _kind: 'goal' }));
  const c = (cards ?? []).map(e => ({ ...e, _kind: 'card' }));
  return [...g, ...c].sort((a, b) => a.minute - b.minute);
}

export default function GoalTimeline({ stats, homeTeam, awayTeam }) {
  const events = sortedEvents(stats.goals, stats.cards);
  if (!events.length) return <p className="empty-state"><span className="empty-title">No events yet.</span></p>;

  return (
    <div className="timeline-body">
      {events.map((ev, i) => {
        const isHome = ev.team === 'home';
        const isGoal = ev._kind === 'goal';
        const icon = isGoal ? GOAL_ICON[ev.type] : CARD_ICON[ev.type];
        const name = isGoal ? ev.scorer : ev.player;
        const assist = isGoal && ev.assist ? ev.assist : null;

        return (
          <div key={i} className={`timeline-event timeline-event--${ev.team}`}>
            <span className="timeline-minute">{ev.minute}'</span>
            <div className={`timeline-pill timeline-pill--${ev.team}`}>
              <span className="timeline-icon">{icon}</span>
              <span className="timeline-name">{name}</span>
              {assist && <span className="timeline-assist">+{assist}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
