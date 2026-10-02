import type React from "react";

import {
  ACCENT_FILL,
  ACCENT_STROKE,
  H,
  W,
  lines,
  random,
} from "@/components/finance/card-art/canvas";
import type {
  CardArt,
  CardPatternName,
} from "@/components/finance/card-art/canvas";
import { MOTIFS } from "@/components/finance/card-art/motifs";

const tile = (
  id: string,
  size: [number, number],
  body: React.ReactNode,
  rotate = 0
) => (
  <>
    <defs>
      <pattern
        height={size[1]}
        id={id}
        patternTransform={rotate ? `rotate(${rotate})` : undefined}
        patternUnits="userSpaceOnUse"
        width={size[0]}
      >
        {body}
      </pattern>
    </defs>
    <rect fill={`url(#${id})`} height={H} width={W} />
  </>
);

// oxlint-disable-next-line complexity
export const CardPattern = ({
  id,
  name,
}: {
  id: string;
  name: CardPatternName;
}): React.ReactElement | null => {
  switch (name) {
    case "brushed": {
      return tile(
        id,
        [W, 3],
        <rect className="fill-current" height="1" opacity="0.07" width={W} />
      );
    }
    case "fine-lines": {
      return tile(
        id,
        [5, 5],
        <line
          className="stroke-current"
          opacity="0.14"
          strokeWidth="0.6"
          x1="0"
          x2="0"
          y1="0"
          y2="5"
        />,
        32
      );
    }
    case "pinstripes": {
      return tile(
        id,
        [9, 9],
        <line
          className={ACCENT_STROKE}
          opacity="0.45"
          strokeWidth="0.5"
          x1="0"
          x2="0"
          y1="0"
          y2="9"
        />,
        -38
      );
    }
    case "diagonal-lines": {
      return tile(
        id,
        [14, 14],
        <rect className="fill-current" height="14" opacity="0.07" width="4" />,
        45
      );
    }
    case "dot-matrix": {
      return tile(
        id,
        [7, 7],
        <circle
          className="fill-current"
          cx="3.5"
          cy="3.5"
          opacity="0.2"
          r="0.9"
        />
      );
    }
    case "halftone": {
      return (
        <g className="fill-current">
          {lines(22, (column) =>
            lines(15, (row) => {
              const x = column * 15 + (row % 2) * 7.5;
              const y = row * 14;
              const wave = Math.sin(x / 45 + y / 60) * 0.5 + 0.5;
              return (
                <circle
                  cx={x}
                  cy={y}
                  key={`${column}-${row}`}
                  opacity="0.16"
                  r={0.4 + wave * 2.6 * (1 - x / W)}
                />
              );
            })
          )}
        </g>
      );
    }
    case "pixels": {
      const roll = random(7);
      return (
        <g className={ACCENT_FILL}>
          {lines(12, (column) =>
            lines(9, (row) => {
              const x = 150 + column * 14;
              const y = row * 14;
              const keep =
                roll() < 1 - (row / 9) * 0.8 - (1 - column / 12) * 0.3;
              return keep ? (
                <rect
                  height="10"
                  key={`${column}-${row}`}
                  opacity={0.25 + roll() * 0.6}
                  width="10"
                  x={x}
                  y={y}
                />
              ) : null;
            })
          )}
        </g>
      );
    }
    case "scallops": {
      return tile(
        id,
        [16, 8],
        <path
          className="stroke-current"
          d="M0 8a8 8 0 0 1 16 0M-8 0a8 8 0 0 1 16 0M8 0a8 8 0 0 1 16 0"
          fill="none"
          opacity="0.16"
          strokeWidth="0.6"
        />
      );
    }
    case "hexagons": {
      return tile(
        id,
        [24, 41.57],
        <path
          className="stroke-current"
          d="M12 0l12 6.93v13.86L12 27.71 0 20.79V6.93Zm0 27.71v13.86"
          fill="none"
          opacity="0.14"
          strokeWidth="0.7"
        />
      );
    }
    case "topographic": {
      return (
        <g
          className="stroke-current"
          fill="none"
          opacity="0.2"
          strokeWidth="0.8"
        >
          {lines(11, (index) => {
            const y = index * 20 - 10;
            return (
              <path
                d={`M-20 ${y + 30} C 60 ${y - 10}, 130 ${y + 70}, 200 ${y + 25} S 300 ${y - 5}, 340 ${y + 40}`}
                key={index}
              />
            );
          })}
        </g>
      );
    }
    case "angular-panels": {
      return (
        <g className="fill-current">
          <polygon opacity="0.07" points="170,0 320,0 320,202 105,202" />
          <polygon opacity="0.08" points="235,0 320,0 320,125" />
          <polygon opacity="0.06" points="0,135 95,202 0,202" />
        </g>
      );
    }
    case "rounded-panels": {
      // Lit from their rounded top-left corners; the accent tints them (BDO).
      const glow = "[stop-color:var(--card-face-accent,currentColor)]";
      return (
        <>
          <defs>
            <linearGradient id={`${id}-a`} x1="0" x2="0.6" y1="0" y2="1">
              <stop className={glow} offset="0" stopOpacity="0.32" />
              <stop className={glow} offset="1" stopOpacity="0.04" />
            </linearGradient>
            <linearGradient id={`${id}-b`} x1="0" x2="1" y1="0" y2="0.8">
              <stop className={glow} offset="0" stopOpacity="0.3" />
              <stop className={glow} offset="0.6" stopOpacity="0.06" />
            </linearGradient>
          </defs>
          <rect
            className="fill-current"
            height="230"
            opacity="0.07"
            width="200"
            x="146"
            y="-10"
          />
          <rect
            fill={`url(#${id}-a)`}
            height="200"
            rx="16"
            width="212"
            x="-30"
            y="34"
          />
          <rect
            className="fill-current"
            height="12"
            opacity="0.1"
            rx="6"
            width="176"
            x="-30"
            y="80"
          />
          <rect
            fill={`url(#${id}-b)`}
            height="140"
            rx="16"
            width="250"
            x="104"
            y="94"
          />
        </>
      );
    }
    case "crossed-light": {
      return (
        <>
          <defs>
            {[
              { x1: -70, x2: 132, y1: 202, y2: 0 },
              { x1: 0, x2: 50, y1: 0, y2: 290 },
            ].map((axis, index) => (
              <linearGradient
                gradientUnits="userSpaceOnUse"
                id={`${id}-${index}`}
                key={index}
                {...axis}
              >
                <stop
                  className="[stop-color:currentColor]"
                  offset="0.4"
                  stopOpacity="0"
                />
                <stop
                  className="[stop-color:currentColor]"
                  offset="0.5"
                  stopOpacity="0.95"
                />
                <stop
                  className="[stop-color:currentColor]"
                  offset="0.52"
                  stopOpacity="0"
                />
              </linearGradient>
            ))}
          </defs>
          <rect fill={`url(#${id}-0)`} height={H} width={W} />
          <rect fill={`url(#${id}-1)`} height={H} width={W} />
        </>
      );
    }
    case "color-blocks": {
      return (
        <g>
          <circle
            className={ACCENT_FILL}
            cx="262"
            cy="26"
            opacity="0.9"
            r="72"
          />
          <rect
            className="fill-current"
            height="92"
            opacity="0.12"
            transform="rotate(18 230 150)"
            width="92"
            x="184"
            y="104"
          />
          <polygon
            className={ACCENT_FILL}
            opacity="0.45"
            points="-10,202 70,118 150,202"
          />
        </g>
      );
    }
    default: {
      return null;
    }
  }
};

/** The quiet default: offset rings fading out from the top-right corner. */
export const Rings = ({ id }: { id: string }): React.ReactElement => (
  <g fill="none" strokeWidth="1">
    <defs>
      <radialGradient cx="100%" cy="0%" id={id} r="100%">
        <stop
          className="[stop-color:currentColor]"
          offset="0"
          stopOpacity="0.75"
        />
        <stop
          className="[stop-color:currentColor]"
          offset="1"
          stopOpacity="0"
        />
      </radialGradient>
    </defs>
    {[
      [264, 12, 80],
      [256, 24, 102],
      [246, 36, 124],
      [236, 48, 146],
    ].map(([cx, cy, r]) => (
      <circle
        cx={cx}
        cy={cy}
        key={r}
        r={r}
        stroke={`url(#${id})`}
        strokeWidth="1.3"
      />
    ))}
  </g>
);

/** The card's one focal element, drawn from the motif registry. */
export const CardMotif = ({
  art,
  id,
}: {
  art: CardArt;
  id: string;
}): React.ReactElement | null => {
  if (!art.motif) {
    return null;
  }
  const Draw = MOTIFS[art.motif];
  return <Draw art={art} id={id} />;
};
