import { ACCENT_FILL } from "@/components/finance/card-art/canvas";
import type { Motif } from "@/components/finance/card-art/canvas";

export const Wordmark: Motif = ({ art }) => (
  <g
    className="fill-current font-bold"
    fontSize="54"
    opacity="0.16"
    textAnchor="end"
  >
    {(art.monogram ?? "").split("\n").map((line, index) => (
      <text key={line} letterSpacing="-2" x="306" y={96 + index * 48}>
        {line}
      </text>
    ))}
  </g>
);

// The co-brand's name as the card's headline, set large from the left edge
// in the accent (ShopMore).
export const WordmarkLeft: Motif = ({ art }) => (
  <g className={`${ACCENT_FILL} font-bold`} fontSize="62" opacity="0.32">
    {(art.monogram ?? "").split("\n").map((line, index) => (
      <text key={line} letterSpacing="-2" x="12" y={92 + index * 56}>
        {line}
      </text>
    ))}
  </g>
);
