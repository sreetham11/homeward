// Stage 1 endpoint — discharge document/photo -> structured DischargeData.
// Thin wrapper: all extraction and validation logic lives in lib/parser.ts. A rejection
// (input that isn't plausibly a real discharge summary — see lib/parser.ts's
// isValidDischargeDocument check) comes back as HTTP 422 rather than 200, so the client's
// existing error-handling path (OnboardingFlow.tsx's handleParse) naturally refuses to advance
// to the review step instead of needing bespoke client-side branching.
import { NextRequest, NextResponse } from "next/server";
import { parseDischargePhoto, parseDischargeText } from "@/lib/parser";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { text, imageBase64, mimeType } = body as {
    text?: string;
    imageBase64?: string;
    mimeType?: string;
  };

  if (imageBase64 && mimeType) {
    const result = await parseDischargePhoto(imageBase64, mimeType);
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 422 });
    return NextResponse.json({ discharge: result.discharge });
  }

  if (typeof text === "string") {
    const result = await parseDischargeText(text);
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 422 });
    return NextResponse.json({ discharge: result.discharge });
  }

  return NextResponse.json(
    { error: "Provide either { text } or { imageBase64, mimeType }." },
    { status: 400 },
  );
}
