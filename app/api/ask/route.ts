// "Ask Homeward" endpoint — thin wrapper. All logic (the deterministic symptom-question
// guard, plan/KB grounding, and the LLM/template fallback) lives in lib/askHomeward.ts —
// see that file's header before touching this route or the guard.
import { NextRequest, NextResponse } from "next/server";
import { answerHomewardQuestion } from "@/lib/askHomeward";
import type { AskHomewardTurn, DischargeData } from "@/lib/types";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { discharge, question, history } = body as {
    discharge: DischargeData;
    question: string;
    history?: AskHomewardTurn[];
  };

  if (!discharge || !question || !question.trim()) {
    return NextResponse.json({ error: "Missing discharge or question." }, { status: 400 });
  }

  const response = await answerHomewardQuestion(
    discharge,
    question.trim(),
    Array.isArray(history) ? history : [],
  );
  return NextResponse.json({ response });
}
