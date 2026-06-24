import Anthropic from "@anthropic-ai/sdk";
import { Match, MatchStats } from "@/lib/types";

const client = new Anthropic();

function buildStatsBlock(stats: MatchStats, homeName: string, awayName: string): string {
  const g = stats.goals
    .map((g) => `  • ${g.minute}' ${g.team === "home" ? homeName : awayName} — ${g.scorer}${g.assist ? ` (assist: ${g.assist})` : ""}${g.type !== "REGULAR" ? ` [${g.type}]` : ""}`)
    .join("\n");

  const c = stats.cards
    .map((c) => `  • ${c.minute}' ${c.team === "home" ? homeName : awayName} — ${c.player} (${c.type})`)
    .join("\n");

  const s = stats.substitutions
    .map((s) => `  • ${s.minute}' ${s.team === "home" ? homeName : awayName} — OFF: ${s.playerOut} / ON: ${s.playerIn}`)
    .join("\n");

  return `
MATCH STATISTICS
                          ${homeName}    ${awayName}
Possession                ${stats.possession.home}%        ${stats.possession.away}%
xG (Expected Goals)       ${stats.xG.home.toFixed(2)}       ${stats.xG.away.toFixed(2)}
Shots                     ${stats.shots.home}           ${stats.shots.away}
Shots on Target           ${stats.shotsOnTarget.home}           ${stats.shotsOnTarget.away}
Big Chances               ${stats.bigChances.home}           ${stats.bigChances.away}
Big Chances Missed        ${stats.bigChancesMissed.home}           ${stats.bigChancesMissed.away}
Corners                   ${stats.corners.home}           ${stats.corners.away}
Passes                    ${stats.passes.home}         ${stats.passes.away}
Pass Accuracy             ${stats.passAccuracy.home}%        ${stats.passAccuracy.away}%
Tackles                   ${stats.tackles.home}          ${stats.tackles.away}
Interceptions             ${stats.interceptions.home}           ${stats.interceptions.away}
Fouls                     ${stats.fouls.home}          ${stats.fouls.away}
Yellow Cards              ${stats.yellowCards.home}           ${stats.yellowCards.away}
Red Cards                 ${stats.redCards.home}           ${stats.redCards.away}
Saves                     ${stats.saves.home}           ${stats.saves.away}

GOAL EVENTS
${g || "  (no goals)"}

BOOKINGS
${c || "  (no cards)"}

SUBSTITUTIONS
${s || "  (none yet)"}`.trim();
}

export async function POST(req: Request) {
  const { match, stats }: { match: Match; stats: MatchStats | null } = await req.json();

  const { homeTeam, awayTeam, score, status, group, stage } = match;
  const isFinished = status === "FINISHED";
  const isLive = status === "IN_PLAY" || status === "PAUSED" || status === "LIVE";

  const scoreStr =
    score.fullTime.home !== null
      ? `${score.fullTime.home}–${score.fullTime.away}`
      : "not yet started";

  const statsBlock = stats
    ? "\n\n" + buildStatsBlock(stats, homeTeam.name, awayTeam.name)
    : "";

  const prompt =
    isFinished || isLive
      ? `You are a data-driven football analyst covering the 2026 FIFA World Cup. Analyze this match using the statistics provided.

${homeTeam.name} vs ${awayTeam.name}
${group ? `Group: ${group}` : `Stage: ${stage.replace(/_/g, " ")}`}
Status: ${isFinished ? "FINISHED" : "LIVE"}
Score: ${homeTeam.name} ${scoreStr} ${awayTeam.name}
Half-time: ${score.halfTime.home ?? "?"}–${score.halfTime.away ?? "?"}
${statsBlock}

Provide a sharp, data-backed analysis covering:

### Match Summary
What happened, how the game unfolded, and any momentum shifts.

### Key Moments
Reference specific goal events, cards, and turning points by minute.

### Tactical Breakdown
Interpret the stats: what do the xG, possession, shots, and pass accuracy tell us about each team's approach? Were there tactical changes?

### Standout Performers
Who drove the key numbers? Reference goals, assists, and defensive stats.

### Tournament Impact
What does this result mean for the group standings and each team's tournament path?

Be precise and reference the actual numbers. Write like a professional pundit who has just studied the data. Use markdown formatting.`
      : `You are a football analyst covering the 2026 FIFA World Cup. Preview this upcoming match.

${homeTeam.name} vs ${awayTeam.name}
${group ? `Group: ${group}` : `Stage: ${stage.replace(/_/g, " ")}`}

Provide a pre-match preview covering:

### Team Strengths & Form
What each side brings to this fixture and their recent tournament form.

### Key Players to Watch
Who could be decisive — name specific players and their likely roles.

### Tactical Battle
Expected formations and the key strategic matchup to watch.

### Prediction
A reasoned prediction with a likely scoreline and brief justification.

### Tournament Context
Why this fixture matters and what's at stake for each team.

Write with confidence and analysis depth. Use markdown formatting.`;

  const stream = await client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 1200,
    messages: [{ role: "user", content: prompt }],
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        if (
          chunk.type === "content_block_delta" &&
          chunk.delta.type === "text_delta"
        ) {
          controller.enqueue(encoder.encode(chunk.delta.text));
        }
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
