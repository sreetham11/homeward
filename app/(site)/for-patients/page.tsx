import type { Metadata } from "next";
import { PageHero } from "@/components/marketing/PageHero";
import { GetStartedCta } from "@/components/marketing/GetStartedCta";
import { Reveal } from "@/components/marketing/Reveal";

export const metadata: Metadata = {
  title: "For Patients — Homeward",
};

function Check() {
  return (
    <svg viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 shrink-0 text-homeward-primary" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.3 3.29 6.8-6.8a1 1 0 0 1 1.4 0Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

const BENEFITS = [
  {
    title: "A daily medication schedule you can trust",
    body: "Your medications, doses, and timing are turned into simple daily reminders — so recovery doesn't depend on remembering a folded sheet of paper.",
  },
  {
    title: "Warning signs in plain language",
    body: "The signs your doctor told you to watch for are kept in their exact wording, and Homeward watches for them with you on every check-in.",
  },
  {
    title: "Know what's normal versus what needs attention",
    body: "Some redness and discomfort is expected. Homeward compares how you're doing against your own plan, so you're not left guessing whether something is a problem.",
  },
  {
    title: "Never lose track of a follow-up",
    body: "Your follow-up appointment is built into the plan and surfaced on the right day.",
  },
];

export default function ForPatientsPage() {
  return (
    <>
      <PageHero
        eyebrow="For patients"
        title="Recovery you can actually follow"
        subtitle="Leaving the hospital comes with a stack of instructions and very little support once you're home. Homeward turns that paperwork into a plan you can follow day by day."
      />

      <section className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
        <Reveal>
          <div className="card">
            <span className="eyebrow">The problem</span>
            <h2 className="mt-3 text-2xl font-semibold text-homeward-ink">
              Discharge instructions are easy to lose track of
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-homeward-muted">
              Discharge summaries are written quickly, in clinical language, at a stressful moment.
              Medications get mixed up, warning signs are forgotten, and by day three it&apos;s hard
              to remember what &quot;normal&quot; is supposed to look like — often with no one to ask.
            </p>
          </div>
        </Reveal>

        <Reveal className="mt-12">
          <span className="eyebrow">What Homeward does for you</span>
          <h2 className="mt-3 text-2xl font-semibold text-homeward-ink">Day-to-day, in your corner</h2>
        </Reveal>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {BENEFITS.map((benefit, i) => (
            <Reveal key={benefit.title} delay={i * 90}>
              <div className="card lift h-full">
                <div className="flex items-start gap-2.5">
                  <Check />
                  <div>
                    <h3 className="text-sm font-semibold text-homeward-ink">{benefit.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-homeward-muted">{benefit.body}</p>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <GetStartedCta
        heading="Ready to build your recovery plan?"
        subtitle="Start with your discharge summary — it only takes a couple of minutes."
      />
    </>
  );
}
