"use client";

import { useEffect, useState } from "react";
import MatchCard from "./components/MatchCard";
import AnalysisPanel from "./components/AnalysisPanel";
import Standings from "./components/Standings";
import TopScorers from "./components/TopScorers";
import { Match, StandingGroup } from "@/lib/types";

type Tab = "fixtures" | "standings" | "scorers";

export default function Dashboard() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [standings, setStandings] = useState<StandingGroup[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [tab, setTab] = useState<Tab>("fixtures");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/matches")
      .then((r) => r.json())
      .then(({ matches, standings }) => {
        setMatches(matches);
        setStandings(standings);
        const live = matches.find(
          (m: Match) => m.status === "IN_PLAY" || m.status === "LIVE"
        );
        if (live) setSelectedMatch(live);
      })
      .finally(() => setLoading(false));
  }, []);

  const liveMatches = matches.filter(
    (m) => m.status === "IN_PLAY" || m.status === "LIVE" || m.status === "PAUSED"
  );
  const finishedMatches = matches.filter((m) => m.status === "FINISHED");
  const upcomingMatches = matches.filter(
    (m) => m.status === "SCHEDULED" || m.status === "TIMED"
  );

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <header className="border-b border-white/10 bg-black/40 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-2xl">⚽</div>
            <div>
              <h1 className="text-lg font-bold leading-none">World Cup 2026</h1>
              <p className="text-xs text-gray-500 mt-0.5">Live Dashboard + AI Analysis</p>
            </div>
          </div>
          {liveMatches.length > 0 && (
            <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-full px-3 py-1">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span className="text-xs text-green-400 font-medium">
                {liveMatches.length} live
              </span>
            </div>
          )}
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
          <div className="space-y-6">
            <div className="flex gap-1 bg-white/5 rounded-lg p-1 w-fit">
              {(["fixtures", "standings", "scorers"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-all ${
                    tab === t
                      ? "bg-white text-black"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-28 bg-white/5 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : tab === "fixtures" ? (
              <div className="space-y-6">
                {liveMatches.length > 0 && (
                  <section>
                    <h2 className="text-xs font-semibold text-green-400 uppercase tracking-wider mb-3">
                      Live Now
                    </h2>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {liveMatches.map((m) => (
                        <MatchCard
                          key={m.id}
                          match={m}
                          onAnalyze={setSelectedMatch}
                          isSelected={selectedMatch?.id === m.id}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {finishedMatches.length > 0 && (
                  <section>
                    <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                      Results
                    </h2>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {finishedMatches.map((m) => (
                        <MatchCard
                          key={m.id}
                          match={m}
                          onAnalyze={setSelectedMatch}
                          isSelected={selectedMatch?.id === m.id}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {upcomingMatches.length > 0 && (
                  <section>
                    <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                      Upcoming
                    </h2>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {upcomingMatches.map((m) => (
                        <MatchCard
                          key={m.id}
                          match={m}
                          onAnalyze={setSelectedMatch}
                          isSelected={selectedMatch?.id === m.id}
                        />
                      ))}
                    </div>
                  </section>
                )}
              </div>
            ) : tab === "standings" ? (
              <Standings groups={standings} />
            ) : (
              <TopScorers />
            )}
          </div>

          <div className="lg:sticky lg:top-[73px] lg:h-[calc(100vh-89px)]">
            <div className="h-full rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <AnalysisPanel match={selectedMatch} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
