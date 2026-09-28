import {
  H,
  PALETTE_FILL,
  W,
  random,
  slots,
} from "@masdan/ui/components/card-art/canvas";
import type { Motif } from "@masdan/ui/components/card-art/canvas";
import type React from "react";

// A city skyline along the bottom: coloured blocks with a palette, else outline.
export const Skyline: Motif = ({ art }) => {
  const roll = random(5);
  const filled = (art.palette?.length ?? 0) > 0;
  const count = slots(art);
  const blocks: React.ReactNode[] = [];
  let x = filled ? 110 : 0;
  let index = 0;
  while (x < W) {
    const width = 10 + roll() * (filled ? 22 : 14);
    const height = (filled ? 30 : 20) + roll() * (filled ? 50 : 34);
    blocks.push(
      <rect
        className={filled ? PALETTE_FILL[index % count] : "stroke-current"}
        fill={filled ? undefined : "none"}
        height={height}
        key={index}
        opacity={filled ? 0.7 : 0.35}
        strokeWidth="0.6"
        width={width}
        x={x}
        y={H - height}
      />
    );
    x += width + (filled ? 1 : 2);
    index += 1;
  }
  return <g>{blocks}</g>;
};
