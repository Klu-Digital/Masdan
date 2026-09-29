import { lines } from "@/components/finance/card-art/canvas";
import type { Motif } from "@/components/finance/card-art/canvas";

export const DotField: Motif = ({ id }) => {
  const edge = "M176 -6 C 120 70, 238 128, 150 210";
  return (
    <g>
      <defs>
        <clipPath id={id}>
          <path d={`${edge} L 326 210 L 326 -6 Z`} />
        </clipPath>
      </defs>
      <g className="fill-current" clipPath={`url(#${id})`} opacity="0.3">
        {lines(26, (column) =>
          lines(30, (row) => (
            <circle
              cx={120 + column * 8}
              cy={row * 7}
              key={`${column}-${row}`}
              r="1.3"
            />
          ))
        )}
      </g>
    </g>
  );
};
