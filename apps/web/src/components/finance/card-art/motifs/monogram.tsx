import type { Motif } from "@/components/finance/card-art/canvas";

export const Monogram: Motif = ({ art }) => (
  <text
    className="fill-current font-extrabold"
    fontSize="210"
    letterSpacing="-14"
    opacity="0.08"
    x="-10"
    y="196"
  >
    {art.monogram}
  </text>
);
