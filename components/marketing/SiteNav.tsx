"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HomewardIcon } from "@/components/marketing/HomewardIcon";

const NAV_LINKS = [
  { href: "/how-it-works", label: "How It Works" },
  { href: "/for-patients", label: "For Patients" },
  { href: "/for-caregivers", label: "For Caregivers" },
  { href: "/faqs", label: "FAQs" },
];

function HomewardMark() {
  return (
    <Link href="/" className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-homeward-primary text-white shadow-sm">
        <HomewardIcon className="h-4 w-4" />
      </span>
      <span className="text-lg font-semibold tracking-tight text-homeward-ink">Homeward</span>
    </Link>
  );
}

export function SiteNav() {
  const pathname = usePathname();

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-homeward-border bg-homeward-card/85 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <HomewardMark />

        <div className="hidden items-center gap-7 md:flex">
          {NAV_LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm font-medium transition-colors hover:text-homeward-primary ${
                  active ? "text-homeward-primary" : "text-homeward-muted"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        <Link href="/get-started" className="btn-primary py-2">
          Get Started
        </Link>
      </nav>
    </header>
  );
}
