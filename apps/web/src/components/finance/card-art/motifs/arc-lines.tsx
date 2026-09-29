import { ACCENT_STROKE, lines } from "@/components/finance/card-art/canvas";
import type { Motif } from "@/components/finance/card-art/canvas";

export const ArcLines: Motif = () => (
  <g className={ACCENT_STROKE} fill="none" strokeWidth="0.7">
    {lines(18, (index) => (
      <path
        d={`M -20 ${170 + index * 3} Q 150 ${40 + index * 7}, 340 ${60 + index * 9}`}
        key={index}
        opacity={0.15 + (index % 4) * 0.12}
      />
    ))}
  </g>
);
