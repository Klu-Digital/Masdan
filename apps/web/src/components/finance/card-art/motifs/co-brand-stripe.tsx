import { ACCENT_FILL } from "@/components/finance/card-art/canvas";
import type { Motif } from "@/components/finance/card-art/canvas";

export const CoBrandStripe: Motif = () => (
  <g className={ACCENT_FILL}>
    <polygon opacity="0.9" points="170,202 190,202 320,72 320,50" />
    <polygon opacity="0.9" points="198,202 206,202 320,90 320,82" />
  </g>
);
