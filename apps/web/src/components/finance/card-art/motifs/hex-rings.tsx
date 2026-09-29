import { ACCENT_STROKE, lines } from "@/components/finance/card-art/canvas";
import type { Motif } from "@/components/finance/card-art/canvas";

export const HexRings: Motif = () => (
  <g className={ACCENT_STROKE} fill="none" strokeWidth="1">
    {lines(9, (index) => {
      const r = 14 + index * 12;
      const points = lines(6, (corner) => {
        const angle = (corner / 6) * Math.PI * 2 + Math.PI / 6;
        return `${170 + r * Math.cos(angle)},${101 + r * Math.sin(angle)}`;
      }).join(" ");
      return (
        <polygon key={index} opacity={0.7 - index * 0.06} points={points} />
      );
    })}
  </g>
);
