import {
  PALETTE_STROKE,
  lines,
  slots,
} from "@/components/finance/card-art/canvas";
import type { Motif } from "@/components/finance/card-art/canvas";

export const Contours: Motif = ({ art }) => {
  const count = slots(art);
  return (
    <g fill="none" strokeWidth="1.3">
      {lines(9, (index) => {
        const size = 26 + index * 12;
        return (
          <rect
            className={PALETTE_STROKE[index % count]}
            height={size * 1.1}
            key={index}
            opacity="0.85"
            rx={size / 2.4}
            width={size}
            x={70 - size / 2}
            y={104 - (size * 1.1) / 2}
          />
        );
      })}
    </g>
  );
};
