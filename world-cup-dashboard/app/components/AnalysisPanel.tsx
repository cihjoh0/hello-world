"use client";

import { useEffect, useRef, useState } from "react";
import { Match } from "@/lib/types";

interface Props {
  match: Match | null;
}

export default function AnalysisPanel({ match }: Props) {
  const [analysis, setAnalysis] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const prevMatchId = useRef<number | null>(null);

  useEffect(() => {
    if (!match || match.id === prevMatchId.current) return;
    prevMatchId.current = match.id;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setAnalysis("");
    setError("");
    setLoading(true);

    (async () => {
      try {
        const res = await fetch("/api/analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ match }),
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
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [match]);

  if (!match) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8 text-gray-500">
        <div className="text-4xl mb-4">⚽</div>
        <p className="text-lg font-medium text-gray-400">Select a match</p>
        <p className="text-sm mt-1">Click any fixture to get AI-powered analysis</p>
      </div>
    );
  }

  const { homeTeam, awayTeam, score, status } = match;
  const hasScore = score.fullTime.home !== null;

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-white/10 pb-4 mb-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-yellow-400 font-semibold uppercase tracking-wider">
            AI Analysis
          </span>
          {loading && (
            <span className="text-xs text-gray-500 animate-pulse">Generating...</span>
          )}
        </div>
        <h2 className="text-lg font-bold text-white mt-1">
          {homeTeam.name}{" "}
          {hasScore
            ? `${score.fullTime.home} – ${score.fullTime.away}`
            : "vs"}{" "}
          {awayTeam.name}
        </h2>
        <p className="text-xs text-gray-400 mt-0.5">
          {match.group ?? match.stage.replace(/_/g, " ")} ·{" "}
          {status === "FINISHED"
            ? "Full time"
            : status === "IN_PLAY" || status === "LIVE"
            ? "In progress"
            : "Upcoming"}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {error ? (
          <div className="text-red-400 text-sm bg-red-500/10 rounded-lg p-3">{error}</div>
        ) : loading && !analysis ? (
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="h-3 bg-white/5 rounded animate-pulse"
                style={{ width: `${70 + Math.random() * 30}%` }}
              />
            ))}
          </div>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none">
            <FormattedAnalysis text={analysis} />
            {loading && (
              <span className="inline-block w-1.5 h-4 bg-yellow-400 animate-pulse ml-0.5 align-middle" />
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
        if (line.startsWith("**") && line.endsWith("**"))
          return <p key={i} className="font-semibold text-white">{line.slice(2, -2)}</p>;
        if (line.match(/^\d+\.\s+\*\*(.+?)\*\*/)) {
          const match = line.match(/^(\d+)\.\s+\*\*(.+?)\*\*(.*)$/);
          if (match)
            return (
              <p key={i}>
                <span className="text-yellow-400 font-semibold">{match[2]}</span>
                <span>{match[3]}</span>
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
