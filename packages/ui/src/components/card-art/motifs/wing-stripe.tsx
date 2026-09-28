import { ACCENT_FILL } from "@masdan/ui/components/card-art/canvas";
import type { Motif } from "@masdan/ui/components/card-art/canvas";

export const WingStripe: Motif = () => (
  <g className={ACCENT_FILL}>
    <polygon opacity="0.85" points="150,202 195,202 320,78 320,30" />
    <polygon opacity="0.55" points="212,202 220,202 320,104 320,94" />
  </g>
);
