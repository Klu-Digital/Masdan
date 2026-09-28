import { ACCENT_STROKE, H, W } from "@masdan/ui/components/card-art/canvas";
import type { Motif } from "@masdan/ui/components/card-art/canvas";

export const Frame: Motif = () => (
  <rect
    className={ACCENT_STROKE}
    fill="none"
    height={H - 16}
    opacity="0.8"
    rx="12"
    strokeWidth="4"
    width={W - 16}
    x="8"
    y="8"
  />
);
