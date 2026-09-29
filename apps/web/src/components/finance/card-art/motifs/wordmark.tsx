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
