import type { Motif } from "@/components/finance/card-art/canvas";

export const Silk: Motif = () => (
  <g className="fill-current">
    <path
      d="M-10 40 C 90 0, 170 150, 330 50 L330 100 C 170 200, 90 60, -10 100Z"
      opacity="0.12"
    />
    <path
      d="M-10 120 C 110 70, 180 200, 330 120 L330 150 C 180 230, 110 110, -10 160Z"
      opacity="0.09"
    />
    <path
      d="M-10 0 C 80 -20, 200 60, 330 0 L330 20 C 200 90, 80 10, -10 30Z"
      opacity="0.07"
    />
  </g>
);
