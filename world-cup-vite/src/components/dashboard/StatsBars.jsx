const ROWS = [
  { key: 'possession',    label: 'Possession',     unit: '%' },
  { key: 'shots',         label: 'Shots'                     },
  { key: 'shotsOnTarget', label: 'Shots on Target'           },
  { key: 'xG',            label: 'xG'                        },
  { key: 'bigChances',    label: 'Big Chances'               },
  { key: 'corners',       label: 'Corners'                   },
  { key: 'passes',        label: 'Passes'                    },
  { key: 'passAccuracy',  label: 'Pass Accuracy',  unit: '%' },
  { key: 'tackles',       label: 'Tackles'                   },
  { key: 'fouls',         label: 'Fouls'                     },
  { key: 'saves',         label: 'Saves'                     },
];

export default function StatsBars({ stats, homeTeam, awayTeam }) {
  return (
    <div className="stats-body">
      <div className="stat-header">
        <span className="stat-header--home">{homeTeam.shortName}</span>
        <span className="stat-header--away">{awayTeam.shortName}</span>
      </div>
      {ROWS.map(({ key, label, unit = '' }) => {
        const pair = stats[key];
        if (!pair) return null;
        const total = pair.home + pair.away || 1;
        const homePct = (pair.home / total) * 100;
        return (
          <div key={key} className="stat-row">
            <div className="stat-row-labels">
              <span className="stat-row-label-val">{pair.home}{unit}</span>
              <span className="stat-row-label-name">{label}</span>
              <span className="stat-row-label-val">{pair.away}{unit}</span>
            </div>
            <div className="stat-bar-track">
              <div className="stat-bar-home" style={{ width: `${homePct}%` }} />
              <div className="stat-bar-away" style={{ width: `${100 - homePct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
