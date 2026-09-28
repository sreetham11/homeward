import Link from "next/link";
import { Reveal } from "./Reveal";

interface GetStartedCtaProps {
  heading?: string;
  subtitle?: string;
}

// Forest-green call-to-action band, reused at the end of the homepage and the
// audience pages. Always routes to the dedicated /get-started intake page.
export function GetStartedCta({
  heading = "Ready to build your recovery plan?",
  subtitle = "It takes a discharge summary and a couple of minutes — no account required.",
}: GetStartedCtaProps) {
  return (
    <section className="bg-homeward-bg py-20">
      <Reveal className="mx-auto max-w-3xl px-4 sm:px-6">
        <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-homeward-forestDeep via-homeward-forest to-homeward-sage px-8 py-14 text-center shadow-sm">
          <h2 className="text-3xl font-semibold text-white">{heading}</h2>
          <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-white/85">{subtitle}</p>
          <Link
            href="/get-started"
            className="mt-7 inline-flex items-center justify-center gap-1.5 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-homeward-primaryDark shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            Get Started →
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
