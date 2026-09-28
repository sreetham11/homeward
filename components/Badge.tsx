export type BadgeTone = "success" | "warning" | "danger" | "info" | "accent" | "neutral";

const TONE_CLASSES: Record<BadgeTone, string> = {
  success: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  warning: "bg-amber-50 text-amber-800 ring-amber-600/20",
  danger: "bg-red-50 text-homeward-danger ring-red-600/20",
  info: "bg-homeward-mint text-homeward-primaryDark ring-homeward-primary/15",
  // Warm accent tone — not a safety/status signal, only used for identity touches
  // like "which side of the plan is this" (e.g. the caregiver-view badge).
  accent: "bg-homeward-accentLight text-homeward-accentDark ring-homeward-accent/20",
  neutral: "bg-slate-100 text-homeward-muted ring-slate-500/10",
};

const DOT_CLASSES: Record<BadgeTone, string> = {
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-homeward-danger",
  info: "bg-homeward-primary",
  accent: "bg-homeward-accent",
  neutral: "bg-slate-400",
};

interface BadgeProps {
  tone?: BadgeTone;
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}

export function Badge({ tone = "neutral", children, dot = true, className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${TONE_CLASSES[tone]} ${className}`}
    >
      {dot && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT_CLASSES[tone]}`} />}
      {children}
    </span>
  );
}
