import type { Metadata } from "next";
import { PageHero } from "@/components/marketing/PageHero";
import { Safety } from "@/components/marketing/Safety";
import { GetStartedCta } from "@/components/marketing/GetStartedCta";
import { Reveal } from "@/components/marketing/Reveal";

export const metadata: Metadata = {
  title: "How It Works — Homeward",
};

const STEPS = [
  {
    number: "1",
    title: "Upload your discharge summary",
    body: "Paste your discharge summary or upload a photo of the sheet. Homeward reads it and extracts your medications, wound care instructions, follow-up appointment, and the warning signs your doctor wrote down — automatically, so nothing important gets lost in the paperwork.",
    aside: "No discharge document handy? You can fill the details in manually instead.",
  },
  {
    number: "2",
    title: "Review the extracted plan",
    body: "You confirm what was pulled out — diagnosis, dates, medications, and warning signs — and correct anything that needs a second look. Homeward then turns it into a structured, day-by-day recovery plan with medication reminders and a wound-care checklist for each day.",
    aside: "Your doctor's instructions stay the source of truth — Homeward only organizes them.",
  },
  {
    number: "3",
    title: "Check in each day",
    body: "Each day you answer a few quick questions — temperature, pain, bleeding, how the wound looks — and can add an optional wound photo. Homeward compares your check-in against fixed safety rules and your own plan, and flags anything worth a human looking at for your caregiver or provider.",
    aside: "A calm check-in is reassurance; a concerning one routes to a person, never a verdict.",
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <PageHero
        eyebrow="How it works"
        title="From discharge paperwork to a plan you can follow"
        subtitle="Three steps, no accounts, and a recovery code that links a patient and their caregiver."
      />

      <section className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
        <div className="space-y-6">
          {STEPS.map((step, i) => (
            <Reveal key={step.number} delay={i * 100}>
              <div className="card lift">
                <div className="flex items-start gap-5">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-homeward-primary text-lg font-semibold text-white shadow-sm">
                    {step.number}
                  </span>
                  <div>
                    <h2 className="text-xl font-semibold text-homeward-ink">{step.title}</h2>
                    <p className="mt-2 text-sm leading-relaxed text-homeward-muted">{step.body}</p>
                    <p className="mt-4 rounded-lg bg-homeward-mint/60 px-3 py-2 text-xs leading-relaxed text-homeward-primaryDark">
                      {step.aside}
                    </p>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <Safety />
      <GetStartedCta />
    </>
  );
}
