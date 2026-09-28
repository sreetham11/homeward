import type { DischargeData } from "@/lib/types";
import { hasLimitedWarningSignData } from "@/lib/dischargeDataQuality";

/** Caregiver-facing notice for when this patient's discharge data is too sparse to fully trust
 * — see lib/dischargeDataQuality.ts for the condition. Renders nothing otherwise. */
export function DataQualityNotice({ discharge }: { discharge: DischargeData }) {
  if (!hasLimitedWarningSignData(discharge)) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <p className="font-medium">Limited warning-sign data was captured from this discharge summary.</p>
      <p className="mt-1 text-xs leading-relaxed">
        Homeward's daily comparisons rely on the warning signs extracted here, and there may not
        be enough to catch everything this patient's plan actually says to watch for. Please
        check the original discharge paperwork directly.
      </p>
    </div>
  );
}
