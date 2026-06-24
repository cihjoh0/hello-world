import { NextResponse } from "next/server";
import { getTopScorers } from "@/lib/football-api";

export async function GET() {
  const scorers = await getTopScorers();
  return NextResponse.json({ scorers });
}
