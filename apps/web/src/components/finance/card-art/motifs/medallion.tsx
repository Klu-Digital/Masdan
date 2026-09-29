import {
  ACCENT_FILL,
  ACCENT_STROKE,
} from "@/components/finance/card-art/canvas";
import type { Motif } from "@/components/finance/card-art/canvas";

export const Medallion: Motif = () => (
  <g fill="none">
    <circle className={ACCENT_FILL} cx="96" cy="104" opacity="0.14" r="64" />
    <circle
      className={ACCENT_STROKE}
      cx="96"
      cy="104"
      opacity="0.5"
      r="64"
      strokeWidth="1.4"
    />
    <circle
      className="stroke-current"
      cx="96"
      cy="104"
      opacity="0.2"
      r="56"
      strokeDasharray="1 3"
    />
    <circle className="stroke-current" cx="96" cy="104" opacity="0.16" r="46" />
  </g>
);
