"use client";

import { Match } from "@/lib/types";

interface Props {
  match: Match;
  onAnalyze: (match: Match) => void;
  isSelected: boolean;
}

const statusConfig = {
  FINISHED: { label: "FT", color: "text-gray-400" },
  LIVE: { label: "LIVE", color: "text-green-400 animate-pulse" },
  IN_PLAY: { label: "LIVE", color: "text-green-400 animate-pulse" },
  PAUSED: { label: "HT", color: "text-yellow-400" },
  SCHEDULED: { label: "vs", color: "text-gray-500" },
  TIMED: { label: "vs", color: "text-gray-500" },
};

function formatKickoff(utcDate: string) {
  return new Date(utcDate).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export default function MatchCard({ match, onAnalyze, isSelected }: Props) {
  const { label, color } = statusConfig[match.status] ?? statusConfig.SCHEDULED;
  const finished = match.status === "FINISHED";
  const live = match.status === "IN_PLAY" || match.status === "LIVE" || match.status === "PAUSED";
  const hasScore = match.score.fullTime.home !== null;

  return (
    <div
      className={`rounded-xl border p-4 transition-all cursor-pointer hover:border-yellow-500/60 ${
        isSelected
          ? "border-yellow-500 bg-yellow-500/5"
          : "border-white/10 bg-white/5"
      }`}
      onClick={() => onAnalyze(match)}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-500 font-medium">
          {match.group ?? match.stage.replace(/_/g, " ")}
        </span>
        {live && (
          <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full font-medium">
            LIVE
          </span>
        )}
        {!hasScore && (
          <span className="text-xs text-gray-500">{formatKickoff(match.utcDate)}</span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 text-right">
          <div className="text-sm font-semibold text-white">{match.homeTeam.name}</div>
          <div className="text-xs text-gray-400">{match.homeTeam.crest}</div>
        </div>

        <div className="flex flex-col items-center min-w-[64px]">
          {hasScore ? (
            <>
              <div className="text-xl font-bold text-white tabular-nums">
                {match.score.fullTime.home} – {match.score.fullTime.away}
              </div>
              <div className={`text-xs font-semibold mt-0.5 ${color}`}>{label}</div>
            </>
          ) : (
            <div className={`text-sm font-bold ${color}`}>{label}</div>
          )}
        </div>

        <div className="flex-1 text-left">
          <div className="text-sm font-semibold text-white">{match.awayTeam.name}</div>
          <div className="text-xs text-gray-400">{match.awayTeam.crest}</div>
        </div>
      </div>

      <div className="mt-3 text-center">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAnalyze(match);
          }}
          className="text-xs text-yellow-400/70 hover:text-yellow-400 transition-colors"
        >
          {finished ? "Post-match analysis →" : live ? "Live analysis →" : "Preview →"}
        </button>
      </div>
    </div>
  );
}
