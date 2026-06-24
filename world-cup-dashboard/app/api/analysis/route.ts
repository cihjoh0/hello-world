import Anthropic from "@anthropic-ai/sdk";
import { Match } from "@/lib/types";

const client = new Anthropic();

export async function POST(req: Request) {
  const { match }: { match: Match } = await req.json();

  const { homeTeam, awayTeam, score, status, group, stage } = match;
  const isFinished = status === "FINISHED";
  const isLive = status === "IN_PLAY" || status === "PAUSED" || status === "LIVE";

  const scoreStr =
    score.fullTime.home !== null
      ? `${score.fullTime.home} - ${score.fullTime.away}`
      : "not yet started";

  const context = isFinished
    ? `The match has finished. Final score: ${homeTeam.name} ${scoreStr} ${awayTeam.name}.`
    : isLive
    ? `The match is currently live. Current score: ${homeTeam.name} ${scoreStr} ${awayTeam.name}.`
    : `This match is scheduled and hasn't started yet.`;

  const prompt = isFinished || isLive
    ? `You are a football analyst covering the 2026 FIFA World Cup. Analyze this match:

${homeTeam.name} vs ${awayTeam.name}
${group ? `Group: ${group}` : `Stage: ${stage}`}
${context}
Half-time score: ${score.halfTime.home ?? "?"} - ${score.halfTime.away ?? "?"}

Provide a concise but insightful analysis covering:
1. **Match Summary** — What happened and how the game unfolded
2. **Key Moments** — Turning points, goals, and critical phases
3. **Tactical Breakdown** — How each team set up and adapted
4. **Standout Performers** — Players who made the difference
5. **Tournament Impact** — What this result means for the group/tournament

Keep it engaging and analytical, like a professional pundit. Use markdown formatting.`
    : `You are a football analyst covering the 2026 FIFA World Cup. Preview this upcoming match:

${homeTeam.name} vs ${awayTeam.name}
${group ? `Group: ${group}` : `Stage: ${stage}`}

Provide a pre-match preview covering:
1. **Team Form & Strengths** — What each side brings to this fixture
2. **Key Players to Watch** — Who could be decisive
3. **Tactical Battle** — Expected formations and strategic matchups
4. **Prediction** — Your reasoned prediction with a likely scoreline
5. **Tournament Context** — Why this match matters

Keep it engaging and analytical. Use markdown formatting.`;

  const stream = await client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
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
