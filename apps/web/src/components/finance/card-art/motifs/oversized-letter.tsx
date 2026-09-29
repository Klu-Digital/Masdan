import {
  PALETTE_STOP,
  lines,
  slots,
} from "@/components/finance/card-art/canvas";
import type { Motif } from "@/components/finance/card-art/canvas";

export const OversizedLetter: Motif = ({ art, id }) => {
  const iridescent = (art.palette?.length ?? 0) > 1;
  // A pearl letter on a dark card sits under white text: keep it quieter.
  let opacity = 0.55;
  if (iridescent) {
    opacity = art.ink === "light" ? 0.48 : 0.85;
  }
  return (
    <>
      <defs>
        <linearGradient id={id} x1="0" x2="1" y1="0" y2="1">
          {iridescent ? (
            lines(slots(art), (index) => (
              <stop
                className={PALETTE_STOP[index]}
                key={index}
                offset={index / Math.max(1, slots(art) - 1)}
              />
            ))
          ) : (
            <>
              <stop
                className="[stop-color:var(--card-face-accent,currentColor)]"
                offset="0"
              />
              <stop
                className="[stop-color:currentColor]"
                offset="0.5"
                stopOpacity="0.9"
              />
              <stop
                className="[stop-color:var(--card-face-accent,currentColor)]"
                offset="1"
              />
            </>
          )}
        </linearGradient>
      </defs>
      <text
        className="font-extrabold"
        fill={`url(#${id})`}
        fontSize="240"
        opacity={opacity}
        x="150"
        y="196"
      >
        {art.monogram}
      </text>
    </>
  );
};
