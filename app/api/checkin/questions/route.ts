// Check-in question-set endpoint — thin wrapper. All logic (deterministic per-patient id
// assembly, LLM wording personalization, template fallback) lives in
// lib/checkinQuestions.ts — see that file's header before touching this route.
import { NextRequest, NextResponse } from "next/server";
import { buildQuestionSet } from "@/lib/checkinQuestions";
import type { DayPlan, DischargeData } from "@/lib/types";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { discharge, todayPlan, dayNumber } = body as {
    discharge: DischargeData;
    todayPlan?: DayPlan;
    dayNumber: number;
  };

  if (!discharge || dayNumber == null) {
    return NextResponse.json({ error: "Missing discharge or dayNumber." }, { status: 400 });
  }

  const questions = await buildQuestionSet(discharge, todayPlan, dayNumber);
  return NextResponse.json({ questions });
}
