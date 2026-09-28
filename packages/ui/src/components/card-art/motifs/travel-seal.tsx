import { ACCENT_STROKE } from "@masdan/ui/components/card-art/canvas";
import type { Motif } from "@masdan/ui/components/card-art/canvas";

export const TravelSeal: Motif = () => (
  <g className="stroke-current" fill="none">
    <g opacity="0.3" transform="rotate(-14 256 58)">
      <circle cx="256" cy="58" r="40" strokeWidth="1.2" />
      <circle cx="256" cy="58" r="33" strokeDasharray="2 3" strokeWidth="1" />
      <circle cx="256" cy="58" r="20" strokeWidth="0.8" />
      <path d="M236 58h40M256 38v40" strokeWidth="0.6" />
    </g>
    <circle
      className={ACCENT_STROKE}
      cx="206"
      cy="128"
      opacity="0.35"
      r="26"
      strokeDasharray="1 3"
      strokeWidth="1.2"
    />
  </g>
);
