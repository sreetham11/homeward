// Stage 4 endpoint — compare a check-in against the fixed universal red flags (Layer A) and
// this specific patient's own discharge plan (Layer B). Thin wrapper: all logic, and the
// safety-critical "Layer A always wins" combination rule, live in lib/deviation.ts — see
// lib/deviation.test.ts for the tests proving that.
import { NextRequest, NextResponse } from "next/server";
import { evaluateDeviation } from "@/lib/deviation";
import type { CheckinInput, DischargeData } from "@/lib/types";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { checkin, discharge, woundVisionDescription, previousCheckin } = body as {
    checkin: CheckinInput;
    discharge: DischargeData;
    woundVisionDescription?: string;
    previousCheckin?: CheckinInput | null;
  };

  if (!checkin || !discharge) {
    return NextResponse.json({ error: "Missing checkin or discharge." }, { status: 400 });
  }

  const deviation = await evaluateDeviation(
    checkin,
    discharge,
    woundVisionDescription,
    previousCheckin ?? null,
  );
  return NextResponse.json({ deviation });
}
