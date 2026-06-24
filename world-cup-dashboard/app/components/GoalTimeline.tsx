import { GoalEvent, CardEvent } from "@/lib/types";

interface Props {
  goals: GoalEvent[];
  cards: CardEvent[];
  homeName: string;
  awayName: string;
}

type Event =
  | (GoalEvent & { kind: "goal" })
  | (CardEvent & { kind: "card" });

const goalIcon = (type: GoalEvent["type"]) => {
  if (type === "PENALTY") return "⚽ P";
  if (type === "OWN_GOAL") return "⚽ OG";
  return "⚽";
};

const cardIcon = (type: CardEvent["type"]) => {
  if (type === "RED") return "🟥";
  if (type === "YELLOW_RED") return "🟨🟥";
  return "🟨";
};

export default function GoalTimeline({ goals, cards, homeName, awayName }: Props) {
  const events: Event[] = [
    ...goals.map((g) => ({ ...g, kind: "goal" as const })),
    ...cards.map((c) => ({ ...c, kind: "card" as const })),
  ].sort((a, b) => a.minute - b.minute);

  if (!events.length) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Timeline</p>
      {events.map((event, i) => {
        const isHome = event.team === "home";
        return (
          <div
            key={i}
            className={`flex items-center gap-2 text-xs ${isHome ? "flex-row" : "flex-row-reverse"}`}
          >
            <span className="text-gray-500 w-6 text-center tabular-nums text-[10px]">
              {event.minute}&apos;
            </span>
            <div
              className={`flex items-center gap-1.5 flex-1 rounded-md px-2 py-1 ${
                isHome ? "bg-blue-500/10 text-blue-200" : "bg-red-500/10 text-red-200"
              }`}
            >
              <span>
                {event.kind === "goal"
                  ? goalIcon((event as GoalEvent).type)
                  : cardIcon((event as CardEvent).type)}
              </span>
              <span className="font-medium truncate">
                {event.kind === "goal"
                  ? (event as GoalEvent).scorer
                  : (event as CardEvent).player}
              </span>
              {event.kind === "goal" && (event as GoalEvent).assist && (
                <span className="text-[10px] text-gray-400 ml-auto shrink-0">
                  🅰 {(event as GoalEvent).assist}
                </span>
              )}
            </div>
            <span className={`text-[10px] w-10 truncate ${isHome ? "text-left text-blue-400" : "text-right text-red-400"}`}>
              {isHome ? homeName : awayName}
            </span>
          </div>
        );
      })}
    </div>
  );
}
