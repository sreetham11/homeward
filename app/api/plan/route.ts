// Stage 2 endpoint — structured DischargeData -> day-by-day RecoveryPlan.
// Also mints the recovery code that links patient + caregiver (see lib/planStore.ts) and
// persists the plan server-side when Supabase is configured. The client persists the same
// plan to localStorage regardless (see components/RecoveryTracer.tsx), so the plan survives
// a zero-Supabase demo too.
import { NextRequest, NextResponse } from "next/server";
import { isValidEmail } from "@/lib/email";
import { buildRecoveryPlan } from "@/lib/planBuilder";
import { fetchPlanServer, generateRecoveryCode, persistPlanServer } from "@/lib/planStore";
import { clientIpFromHeaders, rateLimit, rateLimitKey, rateLimitRejection } from "@/lib/rateLimit";
import type { DischargeData } from "@/lib/types";

// Cross-device caregiver join: only works when Supabase is configured (server has somewhere
// to look the code up). In the zero-Supabase/localStorage demo, a caregiver on a different
// device has no way to reach this data — same-device tabs instead read localStorage directly
// via lib/planStore.ts's client-side helpers, which don't go through this endpoint at all.
//
// This is the main brute-force surface for recovery codes (repeatedly guessing ?code=XXXXXXXX
// to find a valid plan), so it's rate-limited by IP+code — see lib/rateLimit.ts for the
// in-memory/per-instance limitation.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "Missing ?code=" }, { status: 400 });
  }

  const limit = rateLimit(rateLimitKey(clientIpFromHeaders(req.headers), code));
  if (!limit.allowed) {
    const rejection = rateLimitRejection(limit.retryAfterSeconds);
    return NextResponse.json(rejection.body, { status: rejection.status, headers: rejection.headers });
  }

  const plan = await fetchPlanServer(code);
  if (!plan) {
    return NextResponse.json(
      { error: "Not found. If Supabase isn't configured, this recovery code only works within the same browser." },
      { status: 404 },
    );
  }
  return NextResponse.json({ plan });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { discharge, patientId, caregiverEmail } = body as {
    discharge: DischargeData;
    patientId?: string;
    caregiverEmail?: string | null;
  };

  if (!discharge) {
    return NextResponse.json({ error: "Missing discharge data." }, { status: 400 });
  }

  // Genuinely optional — but a direct POST can bypass OnboardingFlow.tsx's client-side check,
  // so the format is re-validated here too (same "enforced server-side regardless of what the
  // client collects" reasoning as lib/checkinValidation.ts).
  const trimmedEmail = caregiverEmail?.trim() || "";
  if (trimmedEmail && !isValidEmail(trimmedEmail)) {
    return NextResponse.json({ error: "Caregiver email doesn't look valid." }, { status: 400 });
  }

  const resolvedPatientId = patientId || `patient-${Date.now()}`;
  const plan = await buildRecoveryPlan(resolvedPatientId, discharge, trimmedEmail || null);
  const recoveryCode = generateRecoveryCode();

  await persistPlanServer(recoveryCode, plan);

  return NextResponse.json({ recoveryCode, plan });
}
