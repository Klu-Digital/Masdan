import type { Motif } from "@/components/finance/card-art/canvas";

export const Tiles: Motif = () => (
  <g className="fill-current">
    <rect
      height="120"
      opacity="0.12"
      rx="20"
      transform="rotate(-10 250 70)"
      width="120"
      x="190"
      y="10"
    />
    <rect
      height="96"
      opacity="0.1"
      rx="16"
      transform="rotate(-10 270 150)"
      width="96"
      x="222"
      y="102"
    />
    <rect
      height="70"
      opacity="0.08"
      rx="14"
      transform="rotate(-10 180 150)"
      width="70"
      x="145"
      y="115"
    />
  </g>
);
