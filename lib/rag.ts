// Knowledge base retrieval — CURATED KB FIRST, DOMAIN-LOCKED SEARCH ONLY AS FALLBACK.
//
// This ordering is the explicit answer to "why isn't your retrieval source just uncontrolled
// web search": queryKnowledgeBase() below always tries the small, curated, auditable document
// set in lib/kb/documents.ts (5-10 real patient-education-style documents, see that file for
// sourcing) first. lib/exa.ts is ONLY ever called by the caller (see escalate/route.ts) when
// this function returns no relevant match — and even then it's locked to a domain whitelist,
// never open web search. Do not reorder this without updating that comment in lib/exa.ts too.
//
// Retrieval strategy depends on what's configured:
// - Supabase + Gemini both configured: real pgvector cosine-similarity search via the
//   match_kb_documents() RPC (see supabase/schema.sql), embedding the query with Gemini.
// - Anything less than that: keyword-overlap search over the same in-memory document list
//   (lib/kb/documents.ts) — degraded relevance ranking, but the same curated-first,
//   no-open-web-search guarantee, and it works with zero configuration.

import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { KB_DOCUMENTS } from "./kb/documents";
import type { KbDocument, KbMatch } from "./types";

// text-embedding-004 (the older, 768-dim model originally targeted here) is not available
// on this API version/key — confirmed via a live ListModels call, which only returned
// gemini-embedding-001/-2/-2-preview as embedContent-capable. gemini-embedding-001 returns
// 3072-dim vectors by default; the @google/generative-ai SDK version pinned here doesn't
// expose the newer outputDimensionality truncation param, so schema.sql's vector column is
// sized to match 3072 exactly rather than silently mismatching.
const EMBEDDING_MODEL = "gemini-embedding-001";

function isSupabaseConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

function isGeminiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

export function isVectorSearchAvailable(): boolean {
  return isSupabaseConfigured() && isGeminiConfigured();
}

function supabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  );
}

async function embedText(text: string): Promise<number[] | null> {
  if (!isGeminiConfigured()) return null;
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);
    const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
    const result = await model.embedContent(text);
    return result.embedding.values;
  } catch (err) {
    console.error("embedText failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

// --- Offline fallback: keyword overlap over the same curated document set ---

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "at", "is", "are", "was",
  "for", "with", "your", "you", "this", "that", "not", "no", "as", "if", "day", "days",
]);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 3 && !STOPWORDS.has(t));
}

function keywordSearch(query: string, topK: number): KbMatch[] {
  const queryTokens = new Set(tokens(query));
  if (queryTokens.size === 0) return [];

  const scored = KB_DOCUMENTS.map((doc) => {
    const docTokens = new Set([
      ...tokens(doc.title),
      ...tokens(doc.content),
      ...doc.condition.flatMap((c) => tokens(c)),
    ]);
    const shared = [...queryTokens].filter((t) => docTokens.has(t));
    return { doc, score: shared.length };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => ({ doc: s.doc, score: s.score, method: "keyword" as const }));
}

// --- Primary: pgvector search via Supabase ---

async function vectorSearch(query: string, topK: number): Promise<KbMatch[] | null> {
  const embedding = await embedText(query);
  if (!embedding) return null;

  try {
    const supabase = supabaseClient();
    const { data, error } = await supabase.rpc("match_kb_documents", {
      query_embedding: embedding,
      match_count: topK,
    });
    if (error || !data) throw error ?? new Error("no data returned");

    return (data as (KbDocument & { similarity: number })[]).map((row) => ({
      doc: {
        id: row.id,
        title: row.title,
        source: row.source,
        condition: row.condition,
        content: row.content,
      },
      score: row.similarity,
      method: "vector" as const,
    }));
  } catch (err) {
    console.error("vectorSearch failed, falling back to keyword search:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Curated KB lookup — always the first retrieval step in the pipeline. Returns [] rather
 * than throwing when nothing relevant is found; callers (see escalate/route.ts) should treat
 * an empty result as the signal to fall through to lib/exa.ts's domain-restricted search.
 */
export async function queryKnowledgeBase(query: string, topK = 3): Promise<KbMatch[]> {
  if (isVectorSearchAvailable()) {
    const vectorMatches = await vectorSearch(query, topK);
    if (vectorMatches) return vectorMatches;
  }
  return keywordSearch(query, topK);
}

/**
 * Runtime health check for the /api/status debug endpoint — unlike isVectorSearchAvailable()
 * (which only checks that env vars are present), this actually exercises the embed + RPC call
 * so the "rag" status pill can't claim "vector" while silently falling back to keyword search
 * underneath (e.g. schema not applied, RPC error, embedding model rejected).
 */
export async function checkVectorSearchHealth(): Promise<boolean> {
  if (!isVectorSearchAvailable()) return false;
  const result = await vectorSearch("post-operative wound care warning signs", 1);
  return result !== null;
}
