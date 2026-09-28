// Stage 5 endpoint — Escalation & Summary Agent.
//
// Turns a DeviationResult into a plain-language summary for the caregiver/provider (if
// flagged) or calm, plan-grounded reassurance (if not). This stage NEVER makes the
// escalate/no-escalate decision itself — that's entirely Stage 4's (lib/deviation.ts)
// output, passed in unchanged. This stage only describes it. It also never diagnoses: the
// prompt below explicitly forbids naming a condition or medical verdict, only describing the
// match between what was reported and what the patient's own plan said to watch for.
//
// Supporting context comes from lib/rag.ts's curated KB first, lib/exa.ts's domain-locked
// search only as a fallback when the KB has no match — see the comments in those files for
// why that ordering matters. References are supporting color, never the basis for the
// escalate decision.
import { NextRequest, NextResponse } from "next/server";
import { chatCompletion, extractJsonBlock, isAnyChatProviderConfigured } from "@/lib/llm";
import { queryKnowledgeBase } from "@/lib/rag";
import { searchTrustedSources } from "@/lib/exa";
import { persistCheckinServer, persistEscalationServer } from "@/lib/planStore";
import { requirePatientRole } from "@/lib/roleGuard";
import { clientIpFromHeaders, rateLimit, rateLimitKey, rateLimitRejection } from "@/lib/rateLimit";
import type {
  CheckinInput,
  DeviationResult,
  DischargeData,
  EscalationReference,
  EscalationSummary,
} from "@/lib/types";

const DISCLAIMER =
  "This is not a diagnosis. Homeward compares what you reported against your own doctor's instructions — it does not replace medical judgment. If you're ever unsure, contact your provider, or emergency services for anything urgent.";

/**
 * A check-in with no meaningful signal (see lib/checkinValidation.ts) gets a fixed,
 * deterministic message — deliberately NOT routed through the LLM. Letting a model see a
 * mostly-null check-in and asking it to "give calm reassurance" is exactly how the original
 * bug reads as safe: an empty form should never produce reassurance-shaped text, generated
 * or templated. This is the one Stage 5 branch closer in spirit to Layer A than to Layer B.
 */
function insufficientDataSummary(checkin: CheckinInput): { headline: string; details: string } {
  return {
    headline: `Day ${checkin.dayNumber} check-in: not enough information to assess today.`,
    details:
      "This check-in didn't include enough detail to compare against your plan — no temperature, pain level, wound description, or photo, and none of the always-checked symptoms were marked. Please go back and fill in at least one of those before we can tell you how today looks.",
  };
}

async function gatherReferences(query: string): Promise<EscalationReference[]> {
  const kbMatches = await queryKnowledgeBase(query, 2);
  if (kbMatches.length > 0) {
    return kbMatches.map((m) => ({ title: m.doc.title, source: m.doc.source }));
  }
  const exaResults = await searchTrustedSources(query, 2);
  if (exaResults) {
    return exaResults.map((r) => ({
      title: r.title,
      source: (() => {
        try {
          return new URL(r.url).hostname;
        } catch {
          return "web";
        }
      })(),
      url: r.url,
    }));
  }
  return [];
}

function templatedSummary(
  checkin: CheckinInput,
  discharge: DischargeData,
  deviation: DeviationResult,
): { headline: string; details: string } {
  if (deviation.escalate) {
    const flagLines = deviation.allFlags.map((f) =>
      f.source === "layer_a"
        ? `- ${f.message} (always-escalate safety rule)`
        : `- ${f.message}${f.matchedAgainst ? ` — matches your plan's note: "${f.matchedAgainst}"` : ""}`,
    );
    return {
      headline: `Day ${checkin.dayNumber} check-in: something you reported matches a signal worth a human review.`,
      details: `Diagnosis on file: ${discharge.procedureType || discharge.diagnosis || "not specified"}.\n${flagLines.join("\n")}\nRecommend contacting your provider or clinic to review this.`,
    };
  }
  return {
    headline: `Day ${checkin.dayNumber} check-in: nothing you reported matches a warning sign from your plan.`,
    details: `Pain level ${checkin.painLevel ?? "not reported"}${checkin.painLevel != null ? "/10" : ""}, medication taken: ${checkin.medicationTaken}${checkin.activityRestrictionFollowed != null ? `, activity restriction followed: ${checkin.activityRestrictionFollowed}` : ""}. This is within what your plan expects at this stage — keep going with your medication schedule and wound care checklist.`,
  };
}

async function llmSummary(
  checkin: CheckinInput,
  discharge: DischargeData,
  deviation: DeviationResult,
): Promise<{ headline: string; details: string } | null> {
  const system = `You write a short, plain-language recovery check-in summary for a patient's
caregiver. You NEVER diagnose, name a medical condition, or say things like "you have an
infection" — you only describe the match (or lack of match) between what was reported and the
patient's own discharge plan. Keep it factual and calm. Respond with strict JSON only:
{"headline": string, "details": string}`;

  const user = `Diagnosis/procedure: ${discharge.diagnosis} (${discharge.procedureType})
Day since discharge: ${checkin.dayNumber}
Escalate: ${deviation.escalate}
Flags:
${deviation.allFlags.map((f) => `- [${f.source}] ${f.message}${f.matchedAgainst ? ` (matched: ${f.matchedAgainst})` : ""}`).join("\n") || "none"}
Check-in details: pain ${checkin.painLevel != null ? `${checkin.painLevel}/10` : "not reported"}, temperature ${checkin.temperatureC ?? "not reported"}, medication taken: ${checkin.medicationTaken}${checkin.activityRestrictionFollowed != null ? `, activity restriction followed: ${checkin.activityRestrictionFollowed}` : ""}, wound notes: ${checkin.woundDescription || "none"}, other notes: ${checkin.notes || "none"}

Write a 2-4 sentence headline+details summary. If escalate is true, recommend contacting the
provider/clinic and reference which specific signal(s) matched. If escalate is false, give
calm reassurance grounded in the plan, not generic optimism.`;

  const result = await chatCompletion(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { temperature: 0.3, jsonMode: true },
  );

  const parsed = JSON.parse(extractJsonBlock(result.text)) as {
    headline?: string;
    details?: string;
  };
  if (!parsed.headline || !parsed.details) return null;
  return { headline: parsed.headline, details: parsed.details };
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { checkin, discharge, deviation, recoveryCode, role } = body as {
    checkin: CheckinInput;
    discharge: DischargeData;
    deviation: DeviationResult;
    recoveryCode?: string;
    role?: unknown;
  };

  if (!checkin || !discharge || !deviation) {
    return NextResponse.json({ error: "Missing checkin, discharge, or deviation." }, { status: 400 });
  }

  // Keyed by IP+code when a recoveryCode was sent, IP alone otherwise (recoveryCode is
  // optional on this route — see the type above) — see lib/rateLimit.ts for the limitation.
  const limit = rateLimit(rateLimitKey(clientIpFromHeaders(req.headers), recoveryCode));
  if (!limit.allowed) {
    const rejection = rateLimitRejection(limit.retryAfterSeconds);
    return NextResponse.json(rejection.body, { status: rejection.status, headers: rejection.headers });
  }

  // This route is where a check-in actually gets persisted (persistCheckinServer /
  // persistEscalationServer below) — reject the whole request up front rather than only
  // gating the persistence block, so there's no partial-success case where a summary is
  // returned but silently not saved.
  const roleRejection = requirePatientRole(role);
  if (roleRejection) return roleRejection;

  let summary: EscalationSummary;

  if (deviation.insufficientData) {
    // Deliberately skips the LLM and RAG/Exa lookups entirely — there's no real signal to
    // ground either of those in, and asking a model to comment on an empty check-in is the
    // exact failure mode this branch exists to prevent. See insufficientDataSummary().
    const summaryText = insufficientDataSummary(checkin);
    summary = {
      patientId: checkin.patientId,
      dayNumber: checkin.dayNumber,
      escalate: false,
      insufficientData: true,
      headline: summaryText.headline,
      details: summaryText.details,
      flags: [],
      disclaimer: DISCLAIMER,
      generatedAt: new Date().toISOString(),
      generatedBy: "template",
      references: [],
    };
  } else {
    let summaryText: { headline: string; details: string } | null = null;
    let generatedBy: "llm" | "template" = "template";
    if (isAnyChatProviderConfigured()) {
      try {
        summaryText = await llmSummary(checkin, discharge, deviation);
        if (summaryText) generatedBy = "llm";
      } catch {
        summaryText = null;
      }
    }
    if (!summaryText) {
      summaryText = templatedSummary(checkin, discharge, deviation);
    }

    const query = deviation.escalate
      ? `${discharge.procedureType} ${deviation.allFlags.map((f) => f.message).join(" ")}`
      : `${discharge.procedureType} recovery day ${checkin.dayNumber}`;
    const references = await gatherReferences(query);

    summary = {
      patientId: checkin.patientId,
      dayNumber: checkin.dayNumber,
      escalate: deviation.escalate,
      insufficientData: false,
      headline: summaryText.headline,
      details: summaryText.details,
      flags: deviation.allFlags,
      disclaimer: DISCLAIMER,
      generatedAt: new Date().toISOString(),
      generatedBy,
      references,
    };
  }

  if (recoveryCode) {
    await persistCheckinServer(recoveryCode, checkin, deviation);
    if (deviation.escalate) {
      await persistEscalationServer(recoveryCode, summary);
    }
  }

  return NextResponse.json({ summary });
}
