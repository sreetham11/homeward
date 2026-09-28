import Link from "next/link";
import { HomewardIcon } from "@/components/marketing/HomewardIcon";

const QUICK_LINKS = [
  { href: "/how-it-works", label: "How It Works" },
  { href: "/for-patients", label: "For Patients" },
  { href: "/for-caregivers", label: "For Caregivers" },
  { href: "/faqs", label: "FAQs" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-homeward-border bg-homeward-card">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-[1.3fr_1fr]">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-homeward-primary text-white">
                <HomewardIcon className="h-4 w-4" />
              </span>
              <span className="text-base font-semibold text-homeward-ink">Homeward</span>
            </div>
            <p className="mt-3 text-sm text-homeward-muted">
              A caregiver-in-the-loop aftercare recovery assistant.
            </p>
            <p className="mt-6 max-w-md text-xs leading-relaxed text-homeward-muted">
              Homeward tracks your recovery against your own discharge plan — it never
              diagnoses. Always contact your provider if you&apos;re unsure, or emergency
              services for anything urgent. This is a hackathon prototype and is not intended
              for real patient data.
            </p>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-homeward-muted">
              Quick Links
            </h3>
            <ul className="mt-4 space-y-2.5">
              {QUICK_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-homeward-ink transition-colors hover:text-homeward-primary"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}
