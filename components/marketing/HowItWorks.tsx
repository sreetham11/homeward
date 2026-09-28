import Link from "next/link";
import { Reveal } from "./Reveal";

const STEPS = [
  {
    number: "1",
    title: "Upload discharge summary",
    body: "Paste the text or snap a photo — Homeward extracts the key details automatically.",
  },
  {
    number: "2",
    title: "Review extracted plan",
    body: "Confirm the details and get a structured, day-by-day recovery plan.",
  },
  {
    number: "3",
    title: "Daily check-ins",
    body: "Quick daily check-ins flag anything worth a human's eyes.",
  },
];

export function HowItWorks() {
  return (
    <section className="bg-homeward-card py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">How it works</span>
          <h2 className="mt-3 text-3xl font-semibold text-homeward-ink">Three steps from paperwork to a plan</h2>
          <p className="mt-3 text-base leading-relaxed text-homeward-muted">
            No accounts, no setup. A recovery code is all it takes to link a patient and their
            caregiver.
          </p>
        </Reveal>

        <div className="relative mt-14 grid gap-10 md:grid-cols-3">
          {/* Dotted connector behind the step numbers (desktop only). */}
          <div className="pointer-events-none absolute left-0 right-0 top-7 hidden border-t-2 border-dashed border-homeward-sageLight md:block" />

          {STEPS.map((step, i) => (
            <Reveal key={step.number} delay={i * 120} className="relative">
              <div className="flex flex-col items-center text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-homeward-primary bg-homeward-card text-xl font-semibold text-homeward-primary shadow-sm">
                  {step.number}
                </span>
                <h3 className="mt-5 text-lg font-semibold text-homeward-ink">{step.title}</h3>
                <p className="mt-2 max-w-xs text-sm leading-relaxed text-homeward-muted">{step.body}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-12 text-center">
          <Link
            href="/how-it-works"
            className="inline-flex items-center gap-1 text-sm font-semibold text-homeward-primary transition-colors hover:text-homeward-primaryDark"
          >
            See the full walkthrough →
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
