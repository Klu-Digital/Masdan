import { ACCENT_FILL } from "@masdan/ui/components/card-art/canvas";
import type { Motif } from "@masdan/ui/components/card-art/canvas";

export const WaveRibbon: Motif = () => (
  <g>
    <path
      className="fill-current"
      d="M0 150 C 90 118, 170 196, 320 136 L320 202 L0 202Z"
      opacity="0.08"
    />
    <path
      className={ACCENT_FILL}
      d="M0 176 C 80 146, 170 212, 320 158 L320 202 L0 202Z"
      opacity="0.55"
    />
  </g>
);
