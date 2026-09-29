import { ACCENT_STROKE } from "@/components/finance/card-art/canvas";
import type { Motif } from "@/components/finance/card-art/canvas";

// One great circle: its top edge rising from below (horizon), or its left
// edge entering from the right (planet).
const Arc = ({ top }: { top: boolean }) => {
  const circle = top
    ? { cx: 160, cy: 420, r: 390 }
    : { cx: 470, cy: 101, r: 240 };
  return (
    <g fill="none">
      <circle className="fill-current" opacity="0.06" {...circle} />
      <circle
        className={ACCENT_STROKE}
        opacity="0.25"
        strokeWidth="10"
        {...circle}
      />
      <circle
        className={ACCENT_STROKE}
        opacity="0.85"
        strokeWidth="1.4"
        {...circle}
      />
    </g>
  );
};

export const Horizon: Motif = () => <Arc top />;

export const Planet: Motif = () => <Arc top={false} />;
