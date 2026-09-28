"use client";

import { useState } from "react";
import { Reveal } from "./Reveal";

const FAQS = [
  {
    q: "Does Homeward diagnose me?",
    a: "No. Homeward extracts and tracks your discharge instructions and flags anything that looks off — your own doctor's instructions are always the source of truth. Anything concerning routes to a human (your caregiver or provider), never a verdict from the app.",
  },
  {
    q: "Is my data private?",
    a: "This is a hackathon prototype. Recovery codes are a shared secret, not a medical-grade credential, and it isn't intended for real patient data as-is. When cross-device sync isn't configured, your plan stays in your own browser on your own device.",
  },
  {
    q: "What if I don't have my discharge document handy?",
    a: "You can fill in the details manually on the Get Started page — diagnosis, medications, wound care, and the warning signs your doctor mentioned — and Homeward will build the plan from those.",
  },
  {
    q: "How does my caregiver get linked to my recovery?",
    a: "When your plan is created, Homeward generates a short recovery code. Share that code with your caregiver and they enter it on the Get Started page — no email, password, or account needed. That code is what links their view to yours.",
  },
  {
    q: "What happens during a daily check-in?",
    a: "You answer a few quick questions and can add an optional wound photo. That check-in is compared against fixed safety rules and your personalized plan. If something needs attention, it's flagged; if it's calm, that's logged as reassurance.",
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="card lift">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full cursor-pointer list-none items-center justify-between gap-4 text-left text-sm font-semibold text-homeward-ink"
      >
        {q}
        <span
          className="shrink-0 text-homeward-primary transition-transform duration-[250ms] ease-out"
          style={{ transform: open ? "rotate(45deg)" : "rotate(0deg)" }}
        >
          <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M10 4v12M4 10h12" />
          </svg>
        </span>
      </button>
      {/* grid-rows trick: animates 0fr -> 1fr for a smooth height transition
          without measuring scrollHeight in JS. */}
      <div className="accordion-panel" data-open={open}>
        <div>
          <p className="pt-3 text-sm leading-relaxed text-homeward-muted">{a}</p>
        </div>
      </div>
    </div>
  );
}

export function Faq() {
  return (
    <div className="space-y-4">
      {FAQS.map((item, i) => (
        <Reveal key={item.q} delay={i * 70}>
          <FaqItem q={item.q} a={item.a} />
        </Reveal>
      ))}
    </div>
  );
}
