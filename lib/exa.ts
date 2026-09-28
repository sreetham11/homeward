// Domain-restricted fallback search — ONLY queried when lib/rag.ts's curated knowledge base
// has no relevant match. This is the explicit fix for "your retrieval source is uncontrolled":
// includeDomains is hard-locked to a trusted whitelist below and is never passed through from
// caller input. Do not call this before queryKnowledgeBase(), and do not widen the whitelist
// to general web search — if a caller needs broader coverage, add a domain to the whitelist
// deliberately rather than removing the restriction.

const TRUSTED_DOMAINS = ["moh.gov.sg", "healthhub.sg", "nhs.uk", "mayoclinic.org"];

export interface ExaResult {
  title: string;
  url: string;
  snippet: string;
}

function isExaConfigured(): boolean {
  return !!process.env.EXA_API_KEY;
}

/**
 * Domain-restricted fallback search. Returns null (not []) when Exa isn't configured or the
 * request fails, so callers can distinguish "no key / error" from "searched, found nothing" —
 * both should degrade gracefully, but a caller may want to log them differently.
 */
export async function searchTrustedSources(
  query: string,
  numResults = 3,
): Promise<ExaResult[] | null> {
  if (!isExaConfigured()) return null;

  try {
    const response = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.EXA_API_KEY as string,
      },
      body: JSON.stringify({
        query,
        numResults,
        includeDomains: TRUSTED_DOMAINS,
        contents: { text: { maxCharacters: 400 } },
      }),
    });

    if (!response.ok) throw new Error(`Exa API returned ${response.status}`);

    const data = (await response.json()) as {
      results?: { title: string; url: string; text?: string }[];
    };

    return (data.results ?? []).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.text ?? "",
    }));
  } catch (err) {
    console.error("searchTrustedSources failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
