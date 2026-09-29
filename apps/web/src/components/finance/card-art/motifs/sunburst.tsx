import { ACCENT_FILL, lines } from "@/components/finance/card-art/canvas";
import type { Motif } from "@/components/finance/card-art/canvas";

export const Sunburst: Motif = () => (
  <g>
    <g className="fill-current" opacity="0.1">
      {lines(14, (index) => {
        const from = (index / 14) * Math.PI - Math.PI;
        const to = from + Math.PI / 28;
        const r = 360;
        return (
          <polygon
            key={index}
            points={`160,220 ${160 + r * Math.cos(from)},${220 + r * Math.sin(from)} ${160 + r * Math.cos(to)},${220 + r * Math.sin(to)}`}
          />
        );
      })}
    </g>
    <path
      className={ACCENT_FILL}
      d="M-10 188 C 90 178, 230 178, 330 188 L330 210 L-10 210Z"
      opacity="0.85"
    />
  </g>
);
