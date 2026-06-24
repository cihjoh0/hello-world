const STATUS_CFG = {
  FINISHED:  { label: 'FT',   labelCls: 'match-score-label--ft'   },
  LIVE:      { label: 'LIVE', labelCls: 'match-score-label--live' },
  SCHEDULED: { label: null,   labelCls: ''                         },
  TIMED:     { label: null,   labelCls: ''                         },
  POSTPONED: { label: 'PPD',  labelCls: ''                         },
};

function fmtDate(utcDate) {
  return new Date(utcDate).toLocaleString('en-GB', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function MatchCard({ match, selected, onClick }) {
  const { status, homeTeam, awayTeam, score, utcDate, group } = match;
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.SCHEDULED;
  const isFinished = status === 'FINISHED';
  const isLive     = status === 'LIVE';
  const hasScore   = isFinished || isLive;
  const homeScore  = score?.fullTime?.home;
  const awayScore  = score?.fullTime?.away;

  return (
    <button
      className={`match-card${selected ? ' selected' : ''}`}
      onClick={onClick}
    >
      <div className="match-card-meta">
        <span className="match-group">{group ?? ''}</span>
        {isLive
          ? <span className="match-status-live">LIVE</span>
          : cfg.label
            ? <span className="match-kickoff">{cfg.label}</span>
            : <span className="match-kickoff">{fmtDate(utcDate)}</span>
        }
      </div>
      <div className="match-score-row">
        <div className="match-team">
          <div className="match-team-flag">{homeTeam.crest}</div>
          <div className="match-team-name">{homeTeam.shortName}</div>
        </div>
        <div className="match-score">
          <div className="match-score-value">
            {hasScore ? `${homeScore ?? 0} – ${awayScore ?? 0}` : 'vs'}
          </div>
          {hasScore && (
            <div className={`match-score-label ${cfg.labelCls}`}>
              {isLive ? 'LIVE' : 'FT'}
            </div>
          )}
        </div>
        <div className="match-team match-team--away">
          <div className="match-team-flag">{awayTeam.crest}</div>
          <div className="match-team-name">{awayTeam.shortName}</div>
        </div>
      </div>
    </button>
  );
}
