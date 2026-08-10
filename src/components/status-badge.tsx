import { REVIEW_STATUS_META } from "@/lib/review-status";
import type { ReviewStatus } from "@/lib/db/types";

export function StatusBadge({ status }: { status: ReviewStatus }) {
  const meta = REVIEW_STATUS_META[status];

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{
        backgroundColor: `color-mix(in srgb, var(${meta.colorVar}) 16%, transparent)`,
        color: `var(${meta.colorVar})`,
      }}
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: `var(${meta.colorVar})` }}
      />
      {meta.label}
    </span>
  );
}
