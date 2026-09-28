import {
  ACCENT_STROKE,
  W,
  lines,
  random,
} from "@masdan/ui/components/card-art/canvas";
import type { Motif } from "@masdan/ui/components/card-art/canvas";

export const SpeedLines: Motif = () => {
  const roll = random(3);
  return (
    <g className={ACCENT_STROKE} strokeLinecap="round">
      {lines(16, (index) => {
        const y = 40 + index * 10 + roll() * 6;
        const start = 110 + roll() * 120;
        return (
          <line
            key={index}
            opacity={0.2 + roll() * 0.4}
            strokeWidth={0.6 + roll() * 1.4}
            x1={start}
            x2={W + 10}
            y1={y + (start - 160) * 0.12}
            y2={y - 14}
          />
        );
      })}
    </g>
  );
};
