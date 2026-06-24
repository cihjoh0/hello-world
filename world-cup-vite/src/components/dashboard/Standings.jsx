export default function Standings({ standings, filterGroup }) {
  const groups = filterGroup === 'all'
    ? standings
    : standings.filter(g => g.group === filterGroup);

  if (!groups.length) return (
    <div className="empty-state">
      <span className="empty-title">No standings available.</span>
    </div>
  );

  return (
    <div className="standings-body">
      {groups.map(g => (
        <div key={g.group}>
          <p className="standings-group-title">{g.group}</p>
          <table className="standings-table">
            <thead>
              <tr>
                <th className="standings-pos">#</th>
                <th>Team</th>
                <th title="Played">P</th>
                <th title="Won">W</th>
                <th title="Drawn">D</th>
                <th title="Lost">L</th>
                <th title="Goal Difference">GD</th>
                <th title="Points">Pts</th>
              </tr>
            </thead>
            <tbody>
              {g.table.map(row => (
                <tr key={row.team.id} className={row.position <= 2 ? 'standings-qualify' : ''}>
                  <td className="standings-pos">{row.position}</td>
                  <td className="standings-team">
                    <span style={{ marginRight: 6 }}>{row.team.crest}</span>
                    {row.team.shortName}
                  </td>
                  <td>{row.playedGames}</td>
                  <td>{row.won}</td>
                  <td>{row.draw}</td>
                  <td>{row.lost}</td>
                  <td>{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td>
                  <td className="standings-pts">{row.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
