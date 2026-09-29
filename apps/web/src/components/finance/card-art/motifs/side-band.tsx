import {
  ACCENT_FILL,
  H,
  PALETTE_FILL,
  lines,
  slots,
} from "@/components/finance/card-art/canvas";
import type { Motif } from "@/components/finance/card-art/canvas";

export const SideBand: Motif = ({ art }) => {
  const count = slots(art);
  return (
    <g>
      <rect className={ACCENT_FILL} height={H} width="68" x="252" />
      {lines(6, (index) => (
        <rect
          className={PALETTE_FILL[index % count]}
          height={H}
          key={`v${index}`}
          opacity="0.6"
          width={index % 2 ? 2 : 5}
          x={258 + index * 10}
        />
      ))}
      {lines(9, (index) => (
        <rect
          className={PALETTE_FILL[(index + 1) % count]}
          height={index % 2 ? 2 : 5}
          key={`h${index}`}
          opacity="0.5"
          width="68"
          x="252"
          y={10 + index * 22}
        />
      ))}
    </g>
  );
};
