import { paletteOf } from "@masdan/ui/lib/palette";
import { cn } from "@masdan/ui/lib/utils";
import type React from "react";

/**
 * A payment card rendered as an object, Wallet-style: the card's colour, its
 * network, the last four digits. Decorative — the numbers beside it are the
 * information, so it is hidden from assistive tech.
 */
export const CardFace = ({
  className,
  lastFour,
  name,
  network,
  tint,
}: {
  className?: string;
  lastFour?: string | null;
  name: string;
  network?: string | null;
  tint?: string | null;
}): React.ReactElement => (
  <div
    aria-hidden="true"
    className={cn(
      "text-on-tint relative flex aspect-[1.586] w-full max-w-80 flex-col justify-between overflow-hidden rounded-[18px] p-4 shadow-lg select-none",
      paletteOf(tint).solid,
      className
    )}
    data-slot="card-face"
  >
    <span className="from-sheen to-shade pointer-events-none absolute inset-0 bg-linear-135 via-transparent" />
    <span className="relative flex items-start justify-between gap-3">
      <span className="truncate text-sm font-semibold">{name}</span>
      {network ? (
        <span className="shrink-0 text-xs font-semibold tracking-wide uppercase opacity-90">
          {network}
        </span>
      ) : null}
    </span>
    <span className="relative text-sm font-medium tracking-[0.18em] tabular-nums opacity-95">
      {lastFour ? `•••• ${lastFour}` : "•••• ••••"}
    </span>
  </div>
);
