import { lines } from "@/components/finance/card-art/canvas";
import type { Motif } from "@/components/finance/card-art/canvas";

export const Orbit: Motif = ({ id }) => (
  <g>
    <defs>
      <radialGradient id={id}>
        <stop
          className="[stop-color:var(--card-face-accent,currentColor)]"
          offset="0"
          stopOpacity="0.55"
        />
        <stop
          className="[stop-color:var(--card-face-accent,currentColor)]"
          offset="1"
          stopOpacity="0"
        />
      </radialGradient>
    </defs>
    <circle cx="200" cy="101" fill={`url(#${id})`} r="110" />
    <g className="stroke-current" fill="none" opacity="0.14">
      {lines(10, (index) => (
        <circle cx="200" cy="101" key={index} r={18 + index * 16} />
      ))}
    </g>
  </g>
);
