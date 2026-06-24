import { NextResponse } from "next/server";
import { getMatchStats } from "@/lib/football-api";

export async function GET(_req: Request, ctx: RouteContext<"/api/stats/[id]">) {
  const { id } = await ctx.params;
  const stats = await getMatchStats(Number(id));
  if (!stats) return NextResponse.json({ error: "Stats not available" }, { status: 404 });
  return NextResponse.json(stats);
}
