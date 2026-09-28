import type { Metadata } from "next";
import Link from "next/link";
import { OnboardingFlow } from "@/components/OnboardingFlow";
import { JoinWithCode } from "@/components/marketing/JoinWithCode";

export const metadata: Metadata = {
  title: "Get Started — Homeward",
};

const WHAT_HAPPENS = [
  "Add your discharge summary — paste the text or upload a photo of the sheet.",
  "Review what Homeward extracted, and correct anything that needs a second look.",
  "Get a day-by-day recovery plan and a code to share with your caregiver.",
];

export default function GetStartedPage() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-24 pt-28 sm:px-6 sm:pt-32">
      <div className="mx-auto max-w-2xl text-center">
        <span className="eyebrow">Get started</span>
        <h1 className="mt-3 text-4xl font-semibold text-homeward-ink">Let&apos;s build your recovery plan</h1>
      </div>

      <div className="mt-12 grid gap-10 md:grid-cols-[0.85fr_1.15fr]">
        {/* Left: what happens next + join-with-code path. */}
        <div className="md:sticky md:top-24 md:self-start">
          <h2 className="text-lg font-semibold text-homeward-ink">What happens next</h2>
          <ol className="mt-5 space-y-4">
            {WHAT_HAPPENS.map((line, i) => (
              <li key={i} className="flex items-start gap-3 text-sm leading-relaxed text-homeward-muted">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-homeward-primary text-xs font-semibold text-white">
                  {i + 1}
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ol>

          <div className="mt-8 card bg-homeward-mint/40">
            <h3 className="text-sm font-semibold text-homeward-ink">Already have a recovery code?</h3>
            <p className="mt-1 text-xs leading-relaxed text-homeward-muted">
              Caregivers joining an existing plan can enter the code they were given.
            </p>
            <div className="mt-4">
              <JoinWithCode />
            </div>
          </div>

          <p className="mt-6 text-xs leading-relaxed text-homeward-muted">
            No account required. Not sure how it works?{" "}
            <Link href="/how-it-works" className="text-homeward-primary underline underline-offset-2">
              See the walkthrough
            </Link>
            .
          </p>
        </div>

        {/* Right: the functional discharge-parsing flow. */}
        <div>
          <OnboardingFlow />
        </div>
      </div>
    </section>
  );
}
