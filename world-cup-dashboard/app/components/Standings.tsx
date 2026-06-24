import { StandingGroup } from "@/lib/types";

interface Props {
  groups: StandingGroup[];
}

export default function Standings({ groups }: Props) {
  if (!groups.length) return null;

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.group} className="rounded-xl border border-white/10 overflow-hidden">
          <div className="bg-white/5 px-4 py-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-white">{group.group}</span>
            <div className="hidden sm:flex gap-4 text-xs text-gray-500">
              <span>P</span><span>W</span><span>D</span><span>L</span><span>GD</span><span>Pts</span>
            </div>
          </div>
          <table className="w-full text-xs">
            <tbody>
              {group.table.map((row, idx) => (
                <tr
                  key={row.team.id}
                  className={`border-t border-white/5 ${idx < 2 ? "text-white" : "text-gray-400"}`}
                >
                  <td className="px-3 py-2 w-6 text-gray-500">{row.position}</td>
                  <td className="px-2 py-2">
                    <span className="mr-1">{row.team.crest}</span>
                    <span className="font-medium">{row.team.shortName || row.team.name}</span>
                  </td>
                  <td className="hidden sm:table-cell px-2 py-2 text-center text-gray-400">{row.playedGames}</td>
                  <td className="hidden sm:table-cell px-2 py-2 text-center text-gray-400">{row.won}</td>
                  <td className="hidden sm:table-cell px-2 py-2 text-center text-gray-400">{row.draw}</td>
                  <td className="hidden sm:table-cell px-2 py-2 text-center text-gray-400">{row.lost}</td>
                  <td className="hidden sm:table-cell px-2 py-2 text-center text-gray-400">
                    {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
                  </td>
                  <td className="px-3 py-2 text-right font-bold">{row.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
