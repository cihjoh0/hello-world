"use client";

import { useEffect, useRef, useState } from "react";
import { Match, MatchStats } from "@/lib/types";
import StatsBars from "./StatsBars";
import GoalTimeline from "./GoalTimeline";

interface Props {
  match: Match | null;
}

type PanelTab = "stats" | "analysis";

export default function AnalysisPanel({ match }: Props) {
  const [stats, setStats] = useState<MatchStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [analysis, setAnalysis] = useState("");
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<PanelTab>("stats");
  const abortRef = useRef<AbortController | null>(null);
  const prevMatchId = useRef<number | null>(null);

  useEffect(() => {
    if (!match || match.id === prevMatchId.current) return;
    prevMatchId.current = match.id;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStats(null);
    setAnalysis("");
    setError("");

    const hasScore =
      match.status === "FINISHED" ||
      match.status === "IN_PLAY" ||
      match.status === "LIVE" ||
      match.status === "PAUSED";

    // Fetch stats if the match has data
    if (hasScore) {
      setStatsLoading(true);
      setTab("stats");
      fetch(`/api/stats/${match.id}`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => setStats(data))
        .catch(() => {})
        .finally(() => setStatsLoading(false));
    } else {
      setTab("analysis");
    }

    // Fetch analysis (streams)
    setAnalysisLoading(true);
    (async () => {
      try {
        const statsForPrompt = hasScore
          ? await fetch(`/api/stats/${match.id}`).then((r) =>
              r.ok ? r.json() : null
            )
          : null;

        const res = await fetch("/api/analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ match, stats: statsForPrompt }),
          signal: controller.signal,
        });

        if (!res.ok) throw new Error("Analysis failed");

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          setAnalysis((prev) => prev + decoder.decode(value));
        }
      } catch (e: unknown) {
        if (e instanceof Error && e.name !== "AbortError") {
          setError("Could not load analysis. Check your ANTHROPIC_API_KEY.");
        }
      } finally {
        setAnalysisLoading(false);
      }
    })();

    return () => controller.abort();
  }, [match]);

  if (!match) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8 text-gray-500">
        <div className="text-4xl mb-4">⚽</div>
        <p className="text-lg font-medium text-gray-400">Select a match</p>
        <p className="text-sm mt-1">Click any fixture to get stats and AI analysis</p>
      </div>
    );
  }

  const { homeTeam, awayTeam, score, status } = match;
  const hasScore = score.fullTime.home !== null;
  const statusLabel =
    status === "FINISHED"
      ? "Full time"
      : status === "IN_PLAY" || status === "LIVE"
      ? "In progress"
      : status === "PAUSED"
      ? "Half time"
      : "Upcoming";

  return (
    <div className="flex flex-col h-full">
      {/* Match header */}
      <div className="border-b border-white/10 pb-3 mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-yellow-400 font-semibold uppercase tracking-wider">
            {match.group ?? match.stage.replace(/_/g, " ")}
          </span>
          <span className="text-xs text-gray-500">{statusLabel}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <p className="text-sm font-bold text-white">{homeTeam.name}</p>
            <p className="text-lg">{homeTeam.crest}</p>
          </div>
          <div className="text-center">
            {hasScore ? (
              <p className="text-2xl font-bold text-white tabular-nums">
                {score.fullTime.home} – {score.fullTime.away}
              </p>
            ) : (
              <p className="text-sm text-gray-500 font-semibold">vs</p>
            )}
            {hasScore && score.halfTime.home !== null && (
              <p className="text-[10px] text-gray-500 mt-0.5">
                HT {score.halfTime.home}–{score.halfTime.away}
              </p>
            )}
          </div>
          <div className="flex-1 text-right">
            <p className="text-sm font-bold text-white">{awayTeam.name}</p>
            <p className="text-lg">{awayTeam.crest}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white/5 rounded-lg p-1 mb-4">
        {(["stats", "analysis"] as PanelTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium capitalize transition-all ${
              tab === t ? "bg-white text-black" : "text-gray-400 hover:text-white"
            }`}
          >
            {t === "stats" ? "📊 Stats" : "🤖 Analysis"}
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "stats" ? (
          <div className="space-y-5">
            {statsLoading ? (
              <div className="space-y-2">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="h-5 bg-white/5 rounded animate-pulse" style={{ width: `${60 + Math.random() * 40}%` }} />
                ))}
              </div>
            ) : stats ? (
              <>
                <GoalTimeline
                  goals={stats.goals}
                  cards={stats.cards}
                  homeName={homeTeam.shortName || homeTeam.name}
                  awayName={awayTeam.shortName || awayTeam.name}
                />
                {(stats.goals.length > 0 || stats.cards.length > 0) && (
                  <div className="border-t border-white/10 pt-4" />
                )}
                <StatsBars
                  stats={stats}
                  homeName={homeTeam.shortName || homeTeam.name}
                  awayName={awayTeam.shortName || awayTeam.name}
                />
              </>
            ) : (
              <div className="text-center text-gray-500 py-8">
                <p className="text-sm">No stats available yet</p>
                <p className="text-xs mt-1">Stats appear for live and finished matches</p>
              </div>
            )}
          </div>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none">
            {error ? (
              <div className="text-red-400 text-sm bg-red-500/10 rounded-lg p-3">{error}</div>
            ) : analysisLoading && !analysis ? (
              <div className="space-y-3">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-3 bg-white/5 rounded animate-pulse" style={{ width: `${70 + Math.random() * 30}%` }} />
                ))}
              </div>
            ) : (
              <>
                <FormattedAnalysis text={analysis} />
                {analysisLoading && (
                  <span className="inline-block w-1.5 h-4 bg-yellow-400 animate-pulse ml-0.5 align-middle" />
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function FormattedAnalysis({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-2 text-sm text-gray-300 leading-relaxed">
      {lines.map((line, i) => {
        if (line.startsWith("## "))
          return <h3 key={i} className="text-base font-bold text-white mt-4 mb-1">{line.slice(3)}</h3>;
        if (line.startsWith("### "))
          return <h4 key={i} className="text-sm font-semibold text-yellow-400 mt-3 mb-1">{line.slice(4)}</h4>;
        if (line.match(/^\d+\.\s+\*\*(.+?)\*\*/)) {
          const m = line.match(/^(\d+)\.\s+\*\*(.+?)\*\*(.*)$/);
          if (m) return (
            <p key={i}>
              <span className="text-yellow-400 font-semibold">{m[2]}</span>
              <span dangerouslySetInnerHTML={{ __html: m[3].replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>') }} />
            </p>
          );
        }
        if (line.startsWith("- "))
          return <p key={i} className="pl-3 border-l border-white/10">{line.slice(2)}</p>;
        if (line.trim() === "") return <div key={i} className="h-1" />;
        return (
          <p key={i} dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>') }} />
        );
      })}
    </div>
  );
}
