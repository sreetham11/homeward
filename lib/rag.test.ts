import { describe, expect, it } from "vitest";
import { queryKnowledgeBase } from "./rag";
import { KB_DOCUMENTS } from "./kb/documents";

// Exercises the keyword-overlap fallback path (lib/rag.ts's keywordSearch, reached via
// queryKnowledgeBase whenever Supabase/Gemini aren't configured — the default in this test
// environment, and the same zero-key path a real deployment falls back to). Confirms the
// expanded 16-document set is still retrievable after the real-source rebuild: a
// realistic caregiver/patient-style query for every topic should surface that topic's
// document, not get lost among the larger set.
describe("queryKnowledgeBase keyword fallback (expanded KB)", () => {
  it("has exactly the 16 curated documents, each with a real source citation", () => {
    expect(KB_DOCUMENTS).toHaveLength(16);
    for (const doc of KB_DOCUMENTS) {
      expect(doc.source).toMatch(/medlineplus\.gov|healthxchange\.sg|cda\.gov\.sg/i);
    }
  });

  const cases: { id: string; query: string }[] = [
    { id: "surgical-wound-care", query: "how do I care for my surgical incision at home after appendectomy" },
    { id: "wound-signs-to-watch", query: "signs my wound may need medical attention, is this healing normally" },
    { id: "rice-protocol", query: "sprained ankle, RICE rest ice compression elevation" },
    { id: "dengue-home-care", query: "dengue viral fever home care warning signs" },
    { id: "post-op-activity-restrictions", query: "following activity restrictions after a procedure, lifting" },
    { id: "medication-adherence", query: "taking discharge medications antibiotics as prescribed" },
    { id: "when-to-seek-urgent-care", query: "when to seek urgent or emergency care during recovery" },
    { id: "follow-up-importance", query: "why follow-up appointments matter after discharge" },
    { id: "csection-recovery", query: "recovering from a cesarean section c-section incision" },
    { id: "diabetic-foot-wound-care", query: "diabetic foot ulcer wound care blood sugar" },
    { id: "cardiac-procedure-recovery", query: "recovery after angioplasty stent bypass cardiac procedure" },
    { id: "concussion-head-injury-care", query: "concussion minor head injury rest home care" },
    { id: "elderly-fall-care", query: "caring for an elderly patient after a fall" },
    { id: "pneumonia-chest-infection-recovery", query: "chest infection pneumonia recovery at home cough" },
    { id: "joint-replacement-recovery", query: "recovery after hip or knee replacement surgery" },
    { id: "pediatric-day-surgery-recovery", query: "child recovering from tonsillectomy day surgery" },
  ];

  it.each(cases)("surfaces $id for a realistic query", async ({ id, query }) => {
    const matches = await queryKnowledgeBase(query, 3);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every((m) => m.method === "keyword")).toBe(true);
    expect(matches.some((m) => m.doc.id === id)).toBe(true);
  });
});
