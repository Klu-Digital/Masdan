import { ACCENT_STROKE } from "@/components/finance/card-art/canvas";
import type { Motif } from "@/components/finance/card-art/canvas";

export const SRibbon: Motif = () => {
  const d = "M40 -20 C 190 20, 190 100, 95 108 C 10 116, 10 190, 150 226";
  return (
    <g fill="none" strokeLinecap="round">
      <path className="stroke-current" d={d} opacity="0.1" strokeWidth="46" />
      <path
        className={ACCENT_STROKE}
        d={d}
        opacity="0.45"
        strokeWidth="1.4"
        transform="translate(20 0)"
      />
    </g>
  );
};
