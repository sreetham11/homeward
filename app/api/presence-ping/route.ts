// "I'm okay" presence-ping endpoint — thin wrapper. Records a timestamp only; deliberately
// does NOT accept or store anything resembling CheckinInput, and never calls lib/deviation.ts
// (no Layer A, no Layer B, no LLM call). This is the whole point of the feature: it proves the
// patient is present on a busy day without pretending a full check-in happened. See
// components/PresencePingButton.tsx and lib/silenceCheck.ts for how this timestamp is used.
import { NextRequest, NextResponse } from "next/server";
import { persistPresencePingServer } from "@/lib/planStore";
import { requirePatientRole } from "@/lib/roleGuard";
import { clientIpFromHeaders, rateLimit, rateLimitKey, rateLimitRejection } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { recoveryCode, role } = body as { recoveryCode?: string; role?: unknown };

  if (!recoveryCode) {
    return NextResponse.json({ error: "Missing recoveryCode." }, { status: 400 });
  }

  const limit = rateLimit(rateLimitKey(clientIpFromHeaders(req.headers), recoveryCode));
  if (!limit.allowed) {
    const rejection = rateLimitRejection(limit.retryAfterSeconds);
    return NextResponse.json(rejection.body, { status: rejection.status, headers: rejection.headers });
  }

  const roleRejection = requirePatientRole(role);
  if (roleRejection) return roleRejection;

  const pingedAt = new Date().toISOString();
  await persistPresencePingServer(recoveryCode, pingedAt);

  return NextResponse.json({ pingedAt });
}
