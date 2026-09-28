import {
  ACCENT_FILL,
  PALETTE_STOP,
  lines,
  slots,
} from "@masdan/ui/components/card-art/canvas";
import type { Motif } from "@masdan/ui/components/card-art/canvas";

// Kept to the card's middle band: printed text sits above and below it, so a
// dark ribbon on a pale card never lands under dark ink.
const SWEEP_CREST = "M-10 92 C 80 60, 170 128, 330 64";
const SWEEP = `${SWEEP_CREST} L330 102 C 170 162, 80 96, -10 126Z`;

// A broad ribbon crossing the card: a palette gradient (Ze-Lo), else the accent.
export const Sweep: Motif = ({ art, id }) => {
  const count = (art.palette?.length ?? 0) > 1 ? slots(art) : 0;
  return (
    <g>
      {count ? (
        <defs>
          <linearGradient id={id} x1="0" x2="1" y1="0.3" y2="0">
            {lines(count, (index) => (
              <stop
                className={PALETTE_STOP[index]}
                key={index}
                offset={index / (count - 1)}
              />
            ))}
          </linearGradient>
        </defs>
      ) : null}
      <path
        className={count ? undefined : ACCENT_FILL}
        d={SWEEP}
        fill={count ? `url(#${id})` : undefined}
        opacity="0.9"
      />
      <g className="stroke-current" fill="none" opacity="0.2" strokeWidth="0.6">
        {lines(4, (index) => (
          <path
            d={`M-10 ${134 + index * 6} C 80 ${104 + index * 6}, 170 ${170 + index * 6}, 330 ${110 + index * 6}`}
            key={index}
          />
        ))}
      </g>
    </g>
  );
};
