import Link from "next/link";
import { Reveal } from "./Reveal";

function Check({ accent = false }: { accent?: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={`mt-0.5 h-4 w-4 shrink-0 ${accent ? "text-homeward-accent" : "text-homeward-primary"}`}
      fill="currentColor"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.3 3.29 6.8-6.8a1 1 0 0 1 1.4 0Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

const AUDIENCES = [
  {
    href: "/for-patients",
    number: "1",
    title: "For Patients",
    blurb: "Recovery you can actually follow, in plain language.",
    points: [
      "A clear daily medication schedule",
      "Warning signs explained without the jargon",
      "Know what's normal versus what needs attention",
    ],
    cta: "For patients",
  },
  {
    href: "/for-caregivers",
    number: "2",
    title: "For Caregivers",
    blurb: "Stay in the loop without hovering or guessing.",
    points: [
      "See recovery status at a glance",
      "Get notified when something needs attention",
      "One shared code links your view to theirs",
    ],
    cta: "For caregivers",
  },
];

export function BuiltFor() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <Reveal className="mx-auto max-w-2xl text-center">
        <span className="eyebrow">Who it's for</span>
        <h2 className="mt-3 text-3xl font-semibold text-homeward-ink">Built for both sides of recovery</h2>
        <p className="mt-3 text-base leading-relaxed text-homeward-muted">
          Homeward links the person recovering and the person helping them — each with a view
          made for what they actually need to do.
        </p>
      </Reveal>

      <div className="mt-12 grid gap-6 md:grid-cols-2">
        {AUDIENCES.map((audience, i) => {
          // A quiet, meaningful use of the warm accent: the caregiver side of
          // recovery reads in terracotta, the patient side in forest green —
          // "calm clinical + warm human," not a decorative flourish.
          const accent = i === 1;
          return (
            <Reveal key={audience.href} delay={i * 120}>
              <div className="card lift flex h-full flex-col">
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-11 w-11 items-center justify-center rounded-xl text-lg font-semibold text-white shadow-sm ${
                      accent ? "bg-homeward-accent" : "bg-homeward-primary"
                    }`}
                  >
                    {audience.number}
                  </span>
                  <h3 className="text-xl font-semibold text-homeward-ink">{audience.title}</h3>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-homeward-muted">{audience.blurb}</p>
                <ul className="mt-5 space-y-2.5">
                  {audience.points.map((point) => (
                    <li key={point} className="flex items-start gap-2.5 text-sm text-homeward-ink">
                      <Check accent={accent} />
                      {point}
                    </li>
                  ))}
                </ul>
                <Link
                  href={audience.href}
                  className={`mt-6 inline-flex items-center gap-1 text-sm font-semibold transition-colors ${
                    accent
                      ? "text-homeward-accentDark hover:text-homeward-accent"
                      : "text-homeward-primary hover:text-homeward-primaryDark"
                  }`}
                >
                  {audience.cta} →
                </Link>
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
