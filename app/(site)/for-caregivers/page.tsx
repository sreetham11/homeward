import type { Metadata } from "next";
import { PageHero } from "@/components/marketing/PageHero";
import { GetStartedCta } from "@/components/marketing/GetStartedCta";
import { Reveal } from "@/components/marketing/Reveal";

export const metadata: Metadata = {
  title: "For Caregivers — Homeward",
};

function Check() {
  return (
    <svg viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 shrink-0 text-homeward-accent" fill="currentColor" aria-hidden>
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
    title: "Recovery status at a glance",
    body: "Open the caregiver view to see the day-by-day plan and every check-in so far — what medications are due, how the wound looks, and whether the latest check-in was calm or flagged.",
  },
  {
    title: "Get notified when something needs attention",
    body: "When a check-in trips a fixed safety rule or matches one of the doctor's warning signs, it's surfaced as a clear, plain-language alert — with the reasons it was flagged.",
  },
  {
    title: "Help without guessing",
    body: "You can see the same medication schedule and wound-care checklist the patient does, so you can help manage care with confidence instead of interpreting a discharge sheet.",
  },
];

const LINK_STEPS = [
  "When a plan is created, Homeward generates a short recovery code.",
  "The patient shares that code with you — no email, password, or account needed.",
  "Enter the code on the Get Started page to open the caregiver view of their plan.",
];

export default function ForCaregiversPage() {
  return (
    <>
      <PageHero
        eyebrow="For caregivers"
        title="Stay in the loop, without hovering"
        subtitle="Whether you're down the hall or in another city, Homeward gives you a clear window into how recovery is going — and tells you when something needs a closer look."
      />

      <section className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
        <Reveal>
          <span className="eyebrow">What you can see</span>
          <h2 className="mt-3 text-2xl font-semibold text-homeward-ink">A caregiver view built for peace of mind</h2>
        </Reveal>

        <div className="mt-6 space-y-4">
          {BENEFITS.map((benefit, i) => (
            <Reveal key={benefit.title} delay={i * 90}>
              <div className="card lift">
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

        <Reveal className="mt-12">
          <div className="card bg-homeward-mint/40">
            <span className="eyebrow">How linking works</span>
            <h2 className="mt-3 text-2xl font-semibold text-homeward-ink">Linked by a recovery code</h2>
            <ol className="mt-5 space-y-4">
              {LINK_STEPS.map((step, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-homeward-ink">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-homeward-accent text-xs font-semibold text-white">
                    {i + 1}
                  </span>
                  <span className="leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </Reveal>
      </section>

      <GetStartedCta
        heading="Have a recovery code?"
        subtitle="Enter it on the Get Started page to open your patient's plan — or create a new plan from a discharge summary."
      />
    </>
  );
}
