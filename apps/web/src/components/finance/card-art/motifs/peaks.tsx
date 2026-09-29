import { ACCENT_FILL } from "@/components/finance/card-art/canvas";
import type { Motif } from "@/components/finance/card-art/canvas";

export const Peaks: Motif = () => (
  <g className={ACCENT_FILL}>
    <polygon opacity="0.35" points="130,210 200,90 270,210" />
    <polygon opacity="0.9" points="175,210 250,40 325,210" />
    <polygon opacity="0.6" points="225,210 290,95 355,210" />
    <polygon opacity="0.5" points="205,-10 255,70 305,-10" />
  </g>
);
