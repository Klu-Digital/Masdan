import { Meter, MeterIndicator, MeterTrack } from "@masdan/ui/components/meter";

import type { LabelledAllocation } from "../net-worth";

const FULL = 100;

/** A share of the asset or liability pool: a small bar beside its percentage. */
export const AllocationMeter = ({
  allocation,
}: {
  allocation: LabelledAllocation;
}) => (
  <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs font-normal tabular-nums">
    {/* The label already says it; a second meter announcement is noise. */}
    <Meter
      aria-hidden="true"
      className="w-10"
      max={FULL}
      value={Math.min(allocation.share * FULL, FULL)}
    >
      <MeterTrack className="h-1">
        <MeterIndicator
          tone={allocation.accountClass === "asset" ? "brand" : "neutral"}
        />
      </MeterTrack>
    </Meter>
    {allocation.label}
  </span>
);
