import { NextResponse } from "next/server";
import { getMatches, getStandings } from "@/lib/football-api";

export async function GET() {
  const [matches, standings] = await Promise.all([getMatches(), getStandings()]);
  return NextResponse.json({ matches, standings });
}
