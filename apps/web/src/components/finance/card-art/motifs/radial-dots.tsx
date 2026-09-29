import { lines } from "@/components/finance/card-art/canvas";
import type { Motif } from "@/components/finance/card-art/canvas";

export const RadialDots: Motif = () => (
  <g className="fill-current">
    {lines(9, (ring) => {
      const radius = 24 + ring * 16;
      const count = Math.round((2 * Math.PI * radius) / 10);
      return lines(count, (dot) => {
        const angle = (dot / count) * 2 * Math.PI + ring * 0.35;
        return (
          <circle
            cx={62 + radius * Math.cos(angle)}
            cy={104 + radius * Math.sin(angle)}
            key={`${ring}-${dot}`}
            opacity={0.5 - ring * 0.045}
            r={Math.max(0.55, 2 - ring * 0.17)}
          />
        );
      });
    })}
  </g>
);
