// One-time (or re-run-anytime) seed script: embeds lib/kb/documents.ts and upserts into
// Supabase's kb_documents table. Requires GEMINI_API_KEY (for embeddings) and Supabase
// configured with a service-role key (to write past RLS). Run with `npm run seed:kb`.
//
// This is optional — the app works without ever running this script, via the keyword
// fallback in lib/rag.ts. Run it to demo real pgvector similarity search instead.

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });
import { GoogleGenerativeAI } from "@google/generative-ai";
import { KB_DOCUMENTS } from "./documents";

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — nothing to seed against.",
    );
    process.exit(1);
  }
  if (!geminiKey) {
    console.error("Missing GEMINI_API_KEY — required to compute embeddings for kb_documents.");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const genAI = new GoogleGenerativeAI(geminiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" }); // 3072-dim, matches supabase/schema.sql

  for (const doc of KB_DOCUMENTS) {
    const { embedding } = await model.embedContent(`${doc.title}\n\n${doc.content}`);
    const { error } = await supabase.from("kb_documents").upsert({
      id: doc.id,
      title: doc.title,
      source: doc.source,
      condition: doc.condition,
      content: doc.content,
      embedding: embedding.values,
    });
    if (error) {
      console.error(`Failed to upsert ${doc.id}:`, error.message);
    } else {
      console.log(`Seeded: ${doc.id}`);
    }
  }

  console.log(`Done. Seeded ${KB_DOCUMENTS.length} documents.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
