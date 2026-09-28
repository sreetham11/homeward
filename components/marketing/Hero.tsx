import Link from "next/link";
import { HomewardIcon } from "@/components/marketing/HomewardIcon";

export function Hero() {
  return (
    <section
      id="top"
      className="relative overflow-hidden bg-gradient-to-br from-homeward-forestDeep via-homeward-forest to-homeward-sage"
    >
      {/* Soft decorative glow blobs. */}
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-homeward-accentLight/10 blur-3xl" />
      {/* Faint print-grain texture across the whole band — an "old medical illustration"
          quality, kept subtle enough to read as paper, not pattern. */}
      <div className="texture-halftone-light pointer-events-none absolute inset-0 opacity-[0.12]" />

      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-32 sm:px-6 md:grid-cols-[1.1fr_0.9fr] md:pb-28 md:pt-36">
        <div>
          <span className="inline-block animate-fade-up rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-white/90 ring-1 ring-inset ring-white/20">
            Aftercare, simplified
          </span>
          <h1 className="mt-5 animate-fade-up text-4xl font-semibold leading-tight text-white [animation-delay:100ms] sm:text-5xl">
            Turn a discharge summary into a day-by-day recovery plan
          </h1>
          <p className="mt-5 max-w-xl animate-fade-up text-base leading-relaxed text-white/85 [animation-delay:200ms] sm:text-lg">
            Daily check-ins for the patient and their caregiver flag anything worth a human
            looking at — never a diagnosis from the app itself.
          </p>
          <div className="mt-8 flex animate-fade-up flex-wrap gap-3 [animation-delay:300ms]">
            <Link
              href="/get-started"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-homeward-primaryDark shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              Get Started →
            </Link>
            <Link
              href="/how-it-works"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/30 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/20"
            >
              See how it works
            </Link>
          </div>
        </div>

        {/* Decorative motif: a hand-drawn-feeling organic mark with a halftone-print
            texture, rather than a stock icon-in-a-circle. Idle motion is a calm but
            clearly perceptible drift + breathing accent ring. */}
        <div className="relative hidden justify-center md:flex">
          <div className="relative h-72 w-72 animate-floaty">
            {/* Irregular blob (not a circle) carrying the grain texture. */}
            <div
              className="texture-halftone-light absolute inset-4 bg-gradient-to-br from-homeward-sage via-homeward-forest to-homeward-forestDeep opacity-95 shadow-2xl"
              style={{ borderRadius: "62% 38% 53% 47% / 56% 44% 56% 44%" }}
            />
            <div
              className="absolute inset-4 opacity-40 mix-blend-overlay"
              style={{
                borderRadius: "62% 38% 53% 47% / 56% 44% 56% 44%",
                backgroundImage:
                  "radial-gradient(circle at 30% 25%, rgba(255,255,255,0.5), transparent 55%)",
              }}
            />
            {/* Warm accent ring — the one place golden-hour amber shows up in the hero. */}
            <div className="absolute -right-2 -top-2 h-20 w-20 animate-pulse-ring rounded-full border-2 border-homeward-accentLight/60" />

            <div className="absolute inset-0 flex items-center justify-center">
              <HomewardIcon className="h-20 w-20 text-white/95" />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom curve into the off-white page. */}
      <div className="h-8 rounded-t-[2rem] bg-homeward-bg" />
    </section>
  );
}
