import { Fragment } from "react";

interface StepIndicatorProps {
  steps: string[];
  currentIndex: number;
}

export function StepIndicator({ steps, currentIndex }: StepIndicatorProps) {
  return (
    <ol className="flex w-full items-start">
      {steps.map((label, i) => {
        const isDone = i < currentIndex;
        const isCurrent = i === currentIndex;
        return (
          <Fragment key={label}>
            {/* Connector segment: a flex-grow sibling living only in the gap between two
                circles, never underneath one — not an absolutely-positioned full-width line. */}
            {i > 0 && (
              <li
                aria-hidden="true"
                className={`mt-4 h-px flex-1 ${isDone || isCurrent ? "bg-homeward-primary" : "bg-homeward-border"}`}
              />
            )}
            <li className="flex shrink-0 flex-col items-center gap-2">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ring-2 ring-offset-2 ring-offset-homeward-bg ${
                  isDone
                    ? "bg-homeward-primary text-white ring-homeward-primary"
                    : isCurrent
                      ? "bg-homeward-card text-homeward-primary ring-homeward-primary"
                      : "bg-homeward-card text-homeward-muted ring-homeward-border"
                }`}
              >
                {isDone ? "✓" : i + 1}
              </div>
              <span
                className={`px-1 text-center text-xs font-medium ${
                  isCurrent || isDone ? "text-homeward-ink" : "text-homeward-muted"
                }`}
              >
                {label}
              </span>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}
