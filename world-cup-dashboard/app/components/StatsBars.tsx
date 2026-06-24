import { MatchStats, StatPair } from "@/lib/types";

interface Props {
  stats: MatchStats;
  homeName: string;
  awayName: string;
}

interface Row {
  label: string;
  values: StatPair;
  format?: "percent" | "decimal" | "number";
  higherIsBetter?: boolean;
}

function StatRow({ label, values, format = "number", homeColor = "bg-blue-500", awayColor = "bg-red-500" }: Row & { homeColor?: string; awayColor?: string }) {
  const total = values.home + values.away;
  const homePct = total === 0 ? 50 : Math.round((values.home / total) * 100);
  const awayPct = 100 - homePct;

  const fmt = (v: number) => {
    if (format === "percent") return `${v}%`;
    if (format === "decimal") return v.toFixed(2);
    return v.toString();
  };

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-white font-medium">
        <span>{fmt(values.home)}</span>
        <span className="text-gray-400 text-[10px]">{label}</span>
        <span>{fmt(values.away)}</span>
      </div>
      <div className="flex h-1.5 rounded-full overflow-hidden gap-px">
        <div className={`${homeColor} rounded-l-full transition-all`} style={{ width: `${homePct}%` }} />
        <div className={`${awayColor} rounded-r-full transition-all`} style={{ width: `${awayPct}%` }} />
      </div>
    </div>
  );
}

export default function StatsBars({ stats, homeName, awayName }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between text-[11px] font-semibold">
        <span className="text-blue-400">{homeName}</span>
        <span className="text-red-400">{awayName}</span>
      </div>

      <div className="space-y-3">
        <StatRow label="Possession" values={stats.possession} format="percent" homeColor="bg-blue-500" awayColor="bg-red-500" />
        <StatRow label="xG" values={stats.xG} format="decimal" homeColor="bg-blue-500" awayColor="bg-red-500" />
        <StatRow label="Shots" values={stats.shots} homeColor="bg-blue-500" awayColor="bg-red-500" />
        <StatRow label="On Target" values={stats.shotsOnTarget} homeColor="bg-blue-500" awayColor="bg-red-500" />
        <StatRow label="Big Chances" values={stats.bigChances} homeColor="bg-blue-500" awayColor="bg-red-500" />
        <StatRow label="Corners" values={stats.corners} homeColor="bg-blue-500" awayColor="bg-red-500" />
        <StatRow label="Passes" values={stats.passes} homeColor="bg-blue-500" awayColor="bg-red-500" />
        <StatRow label="Pass Accuracy" values={stats.passAccuracy} format="percent" homeColor="bg-blue-500" awayColor="bg-red-500" />
        <StatRow label="Tackles" values={stats.tackles} homeColor="bg-blue-500" awayColor="bg-red-500" />
        <StatRow label="Fouls" values={stats.fouls} homeColor="bg-blue-500" awayColor="bg-red-500" />
        <StatRow label="Yellow Cards" values={stats.yellowCards} homeColor="bg-yellow-500" awayColor="bg-yellow-500" />
        <StatRow label="Saves" values={stats.saves} homeColor="bg-blue-500" awayColor="bg-red-500" />
      </div>
    </div>
  );
}
