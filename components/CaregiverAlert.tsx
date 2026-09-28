import type { EscalationSummary } from "@/lib/types";
import { Badge, type BadgeTone } from "./Badge";

export function CaregiverAlert({ summary }: { summary: EscalationSummary }) {
  // Three distinct states, not two: flagged (red), calm-and-verified (green), and
  // insufficient data (amber) — an empty check-in must never render with the same "all
  // clear" styling as a genuinely calm one.
  const tone: BadgeTone = summary.escalate ? "danger" : summary.insufficientData ? "warning" : "success";
  const borderClass = summary.escalate
    ? "border-l-homeward-danger"
    : summary.insufficientData
      ? "border-l-homeward-warn"
      : "border-l-emerald-500";
  const statusLabel = summary.escalate
    ? "Escalated"
    : summary.insufficientData
      ? "Needs more detail"
      : "On track";

  return (
    <div className={`card border-l-4 ${borderClass}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <h4 className="text-sm font-semibold text-homeward-ink">{summary.headline}</h4>
          <Badge tone={tone}>{statusLabel}</Badge>
        </div>
        <span className="text-xs text-homeward-muted">
          {new Date(summary.generatedAt).toLocaleString()}
        </span>
      </div>
      <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-homeward-ink">
        {summary.details}
      </p>

      {summary.flags.length > 0 && (
        <ul className="mt-4 space-y-2">
          {summary.flags.map((flag, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-homeward-muted">
              <Badge tone={flag.source === "layer_a" ? "danger" : "warning"} dot={false} className="shrink-0">
                {flag.source === "layer_a" ? "safety rule" : "plan match"}
              </Badge>
              <span className="pt-0.5">{flag.message}</span>
            </li>
          ))}
        </ul>
      )}

      {summary.references.length > 0 && (
        <div className="mt-4 border-t border-homeward-border pt-3">
          <p className="eyebrow">Related guidance</p>
          <ul className="mt-1.5 space-y-0.5">
            {summary.references.map((ref, i) => (
              <li key={i} className="text-xs text-homeward-muted">
                {ref.url ? (
                  <a
                    href={ref.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-homeward-primary underline underline-offset-2"
                  >
                    {ref.title}
                  </a>
                ) : (
                  ref.title
                )}{" "}
                — {ref.source}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="disclaimer mt-4">{summary.disclaimer}</p>
    </div>
  );
}
