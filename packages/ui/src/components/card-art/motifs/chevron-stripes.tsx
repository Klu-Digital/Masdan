import {
  PALETTE_FILL,
  lines,
  slots,
} from "@masdan/ui/components/card-art/canvas";
import type { Motif } from "@masdan/ui/components/card-art/canvas";

// Bold stacked chevrons aimed right, one per palette colour (Robinsons, Shell).
export const ChevronStripes: Motif = ({ art }) => {
  const count = slots(art);
  const band = Math.min(46, 190 / count);
  return (
    <g>
      {lines(count, (index) => {
        const x = -30 + index * band;
        return (
          <polygon
            className={PALETTE_FILL[index]}
            key={index}
            points={`${x},-4 ${x + band},-4 ${x + band + 90},101 ${x + band},206 ${x},206 ${x + 90},101`}
          />
        );
      })}
    </g>
  );
};
