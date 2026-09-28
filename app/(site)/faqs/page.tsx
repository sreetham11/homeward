import type { Metadata } from "next";
import { PageHero } from "@/components/marketing/PageHero";
import { Faq } from "@/components/marketing/Faq";
import { GetStartedCta } from "@/components/marketing/GetStartedCta";

export const metadata: Metadata = {
  title: "FAQs — Homeward",
};

export default function FaqsPage() {
  return (
    <>
      <PageHero eyebrow="FAQs" title="Questions, answered" subtitle="The things people ask most about how Homeward works." />

      <section className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
        <Faq />
      </section>

      <GetStartedCta />
    </>
  );
}
