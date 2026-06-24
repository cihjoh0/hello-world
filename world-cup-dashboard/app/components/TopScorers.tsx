"use client";

import { useEffect, useState } from "react";
import { Scorer } from "@/lib/types";

export default function TopScorers() {
  const [scorers, setScorers] = useState<Scorer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/scorers")
      .then((r) => r.json())
      .then(({ scorers }) => setScorers(scorers))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-10 bg-white/5 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 overflow-hidden">
      <div className="bg-white/5 px-4 py-2.5">
        <h3 className="text-xs font-semibold text-white">🥇 Golden Boot Race</h3>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-t border-white/5">
            <th className="px-3 py-2 text-left text-gray-500 font-medium w-6">#</th>
            <th className="px-2 py-2 text-left text-gray-500 font-medium">Player</th>
            <th className="px-2 py-2 text-center text-gray-500 font-medium">Team</th>
            <th className="px-2 py-2 text-center text-yellow-400 font-medium">G</th>
            <th className="px-2 py-2 text-center text-gray-500 font-medium">A</th>
            <th className="px-2 py-2 text-center text-gray-500 font-medium">P</th>
            <th className="px-2 py-2 text-center text-gray-500 font-medium">MP</th>
          </tr>
        </thead>
        <tbody>
          {scorers.map((s, idx) => (
            <tr key={s.player.id} className="border-t border-white/5 hover:bg-white/[0.03]">
              <td className="px-3 py-2.5 text-gray-500">{idx + 1}</td>
              <td className="px-2 py-2.5">
                <div className="font-semibold text-white">{s.player.name}</div>
                <div className="text-[10px] text-gray-500">{s.player.position}</div>
              </td>
              <td className="px-2 py-2.5 text-center text-gray-300">
                {s.team.crest} {s.team.shortName}
              </td>
              <td className="px-2 py-2.5 text-center font-bold text-yellow-400">{s.goals}</td>
              <td className="px-2 py-2.5 text-center text-gray-400">{s.assists}</td>
              <td className="px-2 py-2.5 text-center text-gray-500">{s.penalties}</td>
              <td className="px-2 py-2.5 text-center text-gray-500">{s.playedMatches}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-4 py-2 border-t border-white/5">
        <p className="text-[10px] text-gray-600">G = Goals · A = Assists · P = Penalties · MP = Matches Played</p>
      </div>
    </div>
  );
}
