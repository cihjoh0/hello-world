export default function TopScorers({ scorers }) {
  if (!scorers.length) return (
    <div className="empty-state">
      <span className="empty-title">No scorers data yet.</span>
    </div>
  );

  return (
    <div style={{ padding: '12px 20px 16px' }}>
      <table className="scorers-table">
        <thead>
          <tr>
            <th className="scorer-rank">#</th>
            <th>Player</th>
            <th>Team</th>
            <th title="Goals" className="scorer-goals">G</th>
            <th title="Assists" className="scorer-num">A</th>
            <th title="Penalties" className="scorer-num">P</th>
            <th title="Matches" className="scorer-num">MP</th>
          </tr>
        </thead>
        <tbody>
          {scorers.map((s, i) => (
            <tr key={s.player.id}>
              <td className="scorer-rank">
                {i === 0 ? '🥇' : i + 1}
              </td>
              <td>
                <div className="scorer-name">{s.player.name}</div>
                <div className="scorer-pos">{s.player.position}</div>
              </td>
              <td className="scorer-team">
                <span style={{ marginRight: 4 }}>{s.team.crest}</span>
                {s.team.shortName}
              </td>
              <td className="scorer-goals">{s.goals}</td>
              <td className="scorer-num">{s.assists}</td>
              <td className="scorer-num">{s.penalties}</td>
              <td className="scorer-num">{s.playedMatches}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="scorers-legend">G = Goals &nbsp;·&nbsp; A = Assists &nbsp;·&nbsp; P = Penalties &nbsp;·&nbsp; MP = Matches Played</p>
    </div>
  );
}
