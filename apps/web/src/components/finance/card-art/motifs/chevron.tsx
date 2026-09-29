import {
  ACCENT_FILL,
  ACCENT_STROKE,
  lines,
} from "@/components/finance/card-art/canvas";
import type { Motif } from "@/components/finance/card-art/canvas";

// The 2026 Metrobank chevron: a rounded point aimed right, its lower leg
// swelling into a flourish toward the bottom-left corner.
const CHEVRON =
  "M182 -4 C 205 26, 228 58, 245 80 Q 262 102, 240 120 C 200 150, 150 180, 100 206";
const CHEVRON_INSIDE = `${CHEVRON} L -4 206 L -4 -4 Z`;
const CHEVRON_OUTSIDE = `${CHEVRON} L 324 206 L 324 -4 Z`;
const CHEVRON_FLOURISH =
  "M240 120 C 200 150, 150 180, 100 206 L 126 206 C 170 182, 214 154, 240 120 Z";

const ChevronShape = ({ framed, id }: { framed: boolean; id: string }) => (
  <g>
    <defs>
      <clipPath id={id}>
        <path d={framed ? CHEVRON_OUTSIDE : CHEVRON_INSIDE} />
      </clipPath>
    </defs>
    <g
      className={framed ? ACCENT_STROKE : "stroke-current"}
      clipPath={`url(#${id})`}
      fill="none"
      opacity={framed ? 0.22 : 0.1}
      strokeWidth="0.5"
    >
      {framed
        ? lines(40, (index) => (
            <circle cx="340" cy="100" key={index} r={14 + index * 5} />
          ))
        : lines(34, (index) => {
            const y = index * 7 - 20;
            return (
              <path
                d={`M-20 ${y} Q 110 ${y - 34}, 290 ${y + 16}`}
                key={index}
              />
            );
          })}
    </g>
    <path className={ACCENT_FILL} d={CHEVRON_FLOURISH} opacity="0.85" />
    <path
      className={ACCENT_STROKE}
      d={CHEVRON}
      fill="none"
      opacity="0.9"
      strokeWidth="1"
    />
  </g>
);

export const Chevron: Motif = ({ id }) => (
  <ChevronShape framed={false} id={id} />
);

export const ChevronFramed: Motif = ({ id }) => <ChevronShape framed id={id} />;
