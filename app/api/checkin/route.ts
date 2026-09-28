// Stage 3 endpoint — daily check-in intake.
// Conversational, plain-language intake: normalizes the submitted check-in and, if a wound
// photo was included, runs it through lib/woundVision.ts for an objective description. This
// stage deliberately does NOT run deviation checking (that's Stage 4, app/api/deviation) —
// keeping intake and comparison separate mirrors the two-layer safety design one level up:
// each stage is independently callable and inspectable.
import { NextRequest, NextResponse } from "next/server";
import { describeWoundPhoto } from "@/lib/woundVision";
import { requirePatientRole } from "@/lib/roleGuard";
import { clientIpFromHeaders, rateLimit, rateLimitKey, rateLimitRejection } from "@/lib/rateLimit";
import type { CheckinInput } from "@/lib/types";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const checkin = body.checkin as CheckinInput;
  // Not used for anything but rate-limit keying below — this stage doesn't persist by
  // recoveryCode (see the file header), that happens in app/api/escalate. Optional so a
  // request that omits it still gets IP-only limiting rather than being rejected.
  const recoveryCode = body.recoveryCode as string | undefined;

  if (!checkin) {
    return NextResponse.json({ error: "Missing checkin." }, { status: 400 });
  }

  const limit = rateLimit(rateLimitKey(clientIpFromHeaders(req.headers), recoveryCode));
  if (!limit.allowed) {
    const rejection = rateLimitRejection(limit.retryAfterSeconds);
    return NextResponse.json(rejection.body, { status: rejection.status, headers: rejection.headers });
  }

  const roleRejection = requirePatientRole(body.role);
  if (roleRejection) return roleRejection;

  let woundVisionDescription: string | null = null;
  if (checkin.woundPhotoBase64) {
    const mimeType = checkin.woundPhotoBase64.startsWith("data:image/png") ? "image/png" : "image/jpeg";
    const base64Data = checkin.woundPhotoBase64.replace(/^data:image\/\w+;base64,/, "");
    woundVisionDescription = await describeWoundPhoto(base64Data, mimeType);
  }

  return NextResponse.json({ checkin, woundVisionDescription });
}
