import type React from "react";

export type CardPatternName =
  | "angular-panels"
  | "brushed"
  | "color-blocks"
  | "diagonal-lines"
  | "dot-matrix"
  | "fine-lines"
  | "halftone"
  | "hexagons"
  | "pinstripes"
  | "pixels"
  | "scallops"
  | "topographic";

export type CardMotifName =
  | "arc-lines"
  | "bolt"
  | "chevron"
  | "chevron-framed"
  | "chevron-stripes"
  | "co-brand-stripe"
  | "contours"
  | "dot-field"
  | "facets"
  | "facets-left"
  | "frame"
  | "globe"
  | "hex-rings"
  | "horizon"
  | "medallion"
  | "monogram"
  | "orbit"
  | "oversized-letter"
  | "peaks"
  | "planet"
  | "radial-dots"
  | "s-ribbon"
  | "side-band"
  | "silk"
  | "skyline"
  | "speed-lines"
  | "sunburst"
  | "sweep"
  | "tiles"
  | "travel-seal"
  | "wave-ribbon"
  | "wing-stripe"
  | "wordmark";

/** A card's field, declared as data: every product composes the same primitives. */
export interface CardArt {
  accent?: string | null;
  angle: number;
  chipTone?: "silver" | "gold" | null;
  /** Text ink: light on dark fields, dark on pale ones. */
  ink: "light" | "dark";
  monogram?: string | null;
  motif?: CardMotifName | null;
  /** Extra colours for multi-colour motifs, in the order the motif uses them. */
  palette?: readonly string[] | null;
  pattern?: CardPatternName | null;
  stops: readonly string[];
}

// The art is drawn on a card-shaped canvas and sliced to fit, so it scales.
export const W = 320;
export const H = 202;
const ACCENT_FILL = "fill-[var(--card-face-accent,currentColor)]";
const ACCENT_STROKE = "stroke-[var(--card-face-accent,currentColor)]";
// Static class names per palette slot: Tailwind can't see computed ones.
const PALETTE_FILL = [
  "fill-[var(--card-face-p0,currentColor)]",
  "fill-[var(--card-face-p1,currentColor)]",
  "fill-[var(--card-face-p2,currentColor)]",
  "fill-[var(--card-face-p3,currentColor)]",
  "fill-[var(--card-face-p4,currentColor)]",
] as const;
const PALETTE_STROKE = [
  "stroke-[var(--card-face-p0,currentColor)]",
  "stroke-[var(--card-face-p1,currentColor)]",
  "stroke-[var(--card-face-p2,currentColor)]",
  "stroke-[var(--card-face-p3,currentColor)]",
  "stroke-[var(--card-face-p4,currentColor)]",
] as const;
const PALETTE_STOP = [
  "[stop-color:var(--card-face-p0,currentColor)]",
  "[stop-color:var(--card-face-p1,currentColor)]",
  "[stop-color:var(--card-face-p2,currentColor)]",
  "[stop-color:var(--card-face-p3,currentColor)]",
  "[stop-color:var(--card-face-p4,currentColor)]",
] as const;
export const PALETTE_SLOTS = PALETTE_FILL.length;

// The 2026 Metrobank chevron: a rounded point aimed right, its lower leg
// swelling into a flourish toward the bottom-left corner.
const CHEVRON =
  "M182 -4 C 205 26, 228 58, 245 80 Q 262 102, 240 120 C 200 150, 150 180, 100 206";
const CHEVRON_INSIDE = `${CHEVRON} L -4 206 L -4 -4 Z`;
const CHEVRON_OUTSIDE = `${CHEVRON} L 324 206 L 324 -4 Z`;
const CHEVRON_FLOURISH =
  "M240 120 C 200 150, 150 180, 100 206 L 126 206 C 170 182, 214 154, 240 120 Z";

const lines = (count: number, draw: (index: number) => React.ReactNode) =>
  Array.from({ length: count }, (_, index) => draw(index));

// Seeded, so a card's facets and skyline are identical on every render.
const random = (seed: number) => {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
};

const slots = (art: CardArt) =>
  Math.max(1, Math.min(art.palette?.length ?? 0, PALETTE_SLOTS));

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

const RadialDots = () => (
  <g className="fill-current">
    {lines(9, (ring) => {
      const radius = 24 + ring * 16;
      const count = Math.round((2 * Math.PI * radius) / 10);
      return lines(count, (dot) => {
        const angle = (dot / count) * 2 * Math.PI + ring * 0.35;
        return (
          <circle
            cx={62 + radius * Math.cos(angle)}
            cy={104 + radius * Math.sin(angle)}
            key={`${ring}-${dot}`}
            opacity={0.5 - ring * 0.045}
            r={Math.max(0.55, 2 - ring * 0.17)}
          />
        );
      });
    })}
  </g>
);

const Chevron = ({ framed, id }: { framed: boolean; id: string }) => (
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

// Bold stacked chevrons aimed right, one per palette colour (Robinsons, Shell).
const ChevronStripes = ({ art }: { art: CardArt }) => {
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

type Point = readonly [number, number];

// A low-poly mesh coloured from the palette; `left` keeps it to the left side.
const Facets = ({ art, left }: { art: CardArt; left: boolean }) => {
  const roll = random(11);
  const columns = 9;
  const rows = 6;
  const grid: Point[][] = Array.from({ length: columns + 1 }, (_, column) =>
    Array.from({ length: rows + 1 }, (__, row): Point => {
      const edge =
        column === 0 || column === columns || row === 0 || row === rows;
      const jitter = edge ? 0 : 22;
      return [
        (column / columns) * (W + 20) - 10 + (roll() - 0.5) * jitter,
        (row / rows) * (H + 20) - 10 + (roll() - 0.5) * jitter,
      ];
    })
  );
  const at = (column: number, row: number): Point =>
    grid[column]?.[row] ?? [0, 0];
  const count = slots(art);
  const triangles: React.ReactNode[] = [];
  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < rows; row += 1) {
      const a = at(column, row);
      const b = at(column + 1, row);
      const c = at(column, row + 1);
      const d = at(column + 1, row + 1);
      for (const [index, shape] of [
        [a, b, c],
        [b, d, c],
      ].entries()) {
        const cx = shape.reduce((sum, [x]) => sum + x, 0) / 3;
        if (left && cx > 120 + roll() * 50) {
          continue;
        }
        triangles.push(
          <polygon
            className={PALETTE_FILL[Math.floor(roll() * count)]}
            key={`${column}-${row}-${index}`}
            opacity={left ? 0.4 + roll() * 0.35 : 0.75 + roll() * 0.25}
            points={shape.map(([x, y]) => `${x},${y}`).join(" ")}
          />
        );
      }
    }
  }
  return <g>{triangles}</g>;
};

// A city skyline along the bottom: coloured blocks with a palette, else outline.
const Skyline = ({ art }: { art: CardArt }) => {
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

// Kept to the card's middle band: printed text sits above and below it, so a
// dark ribbon on a pale card never lands under dark ink.
const SWEEP_CREST = "M-10 92 C 80 60, 170 128, 330 64";
const SWEEP = `${SWEEP_CREST} L330 102 C 170 162, 80 96, -10 126Z`;

// A broad ribbon crossing the card: a palette gradient (Ze-Lo), else the accent.
const Sweep = ({ art, id }: { art: CardArt; id: string }) => {
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

// oxlint-disable-next-line complexity
export const CardMotif = ({
  art,
  id,
}: {
  art: CardArt;
  id: string;
}): React.ReactElement | null => {
  switch (art.motif) {
    case "radial-dots": {
      return <RadialDots />;
    }
    case "monogram": {
      return (
        <text
          className="fill-current font-extrabold"
          fontSize="210"
          letterSpacing="-14"
          opacity="0.08"
          x="-10"
          y="196"
        >
          {art.monogram}
        </text>
      );
    }
    case "wordmark": {
      return (
        <g
          className="fill-current font-bold"
          fontSize="54"
          opacity="0.16"
          textAnchor="end"
        >
          {(art.monogram ?? "").split("\n").map((line, index) => (
            <text key={line} letterSpacing="-2" x="306" y={96 + index * 48}>
              {line}
            </text>
          ))}
        </g>
      );
    }
    case "oversized-letter": {
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
    }
    case "chevron":
    case "chevron-framed": {
      return <Chevron framed={art.motif === "chevron-framed"} id={id} />;
    }
    case "chevron-stripes": {
      return <ChevronStripes art={art} />;
    }
    case "facets":
    case "facets-left": {
      return <Facets art={art} left={art.motif === "facets-left"} />;
    }
    case "skyline": {
      return <Skyline art={art} />;
    }
    case "medallion": {
      return (
        <g fill="none">
          <circle
            className={ACCENT_FILL}
            cx="96"
            cy="104"
            opacity="0.14"
            r="64"
          />
          <circle
            className={ACCENT_STROKE}
            cx="96"
            cy="104"
            opacity="0.5"
            r="64"
            strokeWidth="1.4"
          />
          <circle
            className="stroke-current"
            cx="96"
            cy="104"
            opacity="0.2"
            r="56"
            strokeDasharray="1 3"
          />
          <circle
            className="stroke-current"
            cx="96"
            cy="104"
            opacity="0.16"
            r="46"
          />
        </g>
      );
    }
    case "globe": {
      return (
        <g
          className="stroke-current"
          fill="none"
          opacity="0.16"
          strokeWidth="0.8"
        >
          <circle cx="170" cy="112" r="130" />
          {[40, 80, 115].map((rx) => (
            <ellipse cx="170" cy="112" key={rx} rx={rx} ry="130" />
          ))}
          {[-80, -40, 0, 40, 80].map((dy) => {
            const half = Math.sqrt(130 ** 2 - dy ** 2);
            return (
              <line
                key={dy}
                x1={170 - half}
                x2={170 + half}
                y1={112 + dy}
                y2={112 + dy}
              />
            );
          })}
        </g>
      );
    }
    case "dot-field": {
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
    }
    case "speed-lines": {
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
    }
    case "orbit": {
      return (
        <g>
          <defs>
            <radialGradient id={id}>
              <stop
                className="[stop-color:var(--card-face-accent,currentColor)]"
                offset="0"
                stopOpacity="0.55"
              />
              <stop
                className="[stop-color:var(--card-face-accent,currentColor)]"
                offset="1"
                stopOpacity="0"
              />
            </radialGradient>
          </defs>
          <circle cx="200" cy="101" fill={`url(#${id})`} r="110" />
          <g className="stroke-current" fill="none" opacity="0.14">
            {lines(10, (index) => (
              <circle cx="200" cy="101" key={index} r={18 + index * 16} />
            ))}
          </g>
        </g>
      );
    }
    case "arc-lines": {
      return (
        <g className={ACCENT_STROKE} fill="none" strokeWidth="0.7">
          {lines(18, (index) => (
            <path
              d={`M -20 ${170 + index * 3} Q 150 ${40 + index * 7}, 340 ${60 + index * 9}`}
              key={index}
              opacity={0.15 + (index % 4) * 0.12}
            />
          ))}
        </g>
      );
    }
    case "tiles": {
      return (
        <g className="fill-current">
          <rect
            height="120"
            opacity="0.12"
            rx="20"
            transform="rotate(-10 250 70)"
            width="120"
            x="190"
            y="10"
          />
          <rect
            height="96"
            opacity="0.1"
            rx="16"
            transform="rotate(-10 270 150)"
            width="96"
            x="222"
            y="102"
          />
          <rect
            height="70"
            opacity="0.08"
            rx="14"
            transform="rotate(-10 180 150)"
            width="70"
            x="145"
            y="115"
          />
        </g>
      );
    }
    case "horizon":
    case "planet": {
      const top = art.motif === "horizon";
      const circle = top
        ? { cx: 160, cy: 420, r: 390 }
        : { cx: 470, cy: 101, r: 240 };
      return (
        <g fill="none">
          <circle className="fill-current" opacity="0.06" {...circle} />
          <circle
            className={ACCENT_STROKE}
            opacity="0.25"
            strokeWidth="10"
            {...circle}
          />
          <circle
            className={ACCENT_STROKE}
            opacity="0.85"
            strokeWidth="1.4"
            {...circle}
          />
        </g>
      );
    }
    case "sunburst": {
      return (
        <g>
          <g className="fill-current" opacity="0.1">
            {lines(14, (index) => {
              const from = (index / 14) * Math.PI - Math.PI;
              const to = from + Math.PI / 28;
              const r = 360;
              return (
                <polygon
                  key={index}
                  points={`160,220 ${160 + r * Math.cos(from)},${220 + r * Math.sin(from)} ${160 + r * Math.cos(to)},${220 + r * Math.sin(to)}`}
                />
              );
            })}
          </g>
          <path
            className={ACCENT_FILL}
            d="M-10 188 C 90 178, 230 178, 330 188 L330 210 L-10 210Z"
            opacity="0.85"
          />
        </g>
      );
    }
    case "side-band": {
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
    }
    case "contours": {
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
    }
    case "frame": {
      return (
        <rect
          className={ACCENT_STROKE}
          fill="none"
          height={H - 16}
          opacity="0.8"
          rx="12"
          strokeWidth="4"
          width={W - 16}
          x="8"
          y="8"
        />
      );
    }
    case "peaks": {
      return (
        <g className={ACCENT_FILL}>
          <polygon opacity="0.35" points="130,210 200,90 270,210" />
          <polygon opacity="0.9" points="175,210 250,40 325,210" />
          <polygon opacity="0.6" points="225,210 290,95 355,210" />
          <polygon opacity="0.5" points="205,-10 255,70 305,-10" />
        </g>
      );
    }
    case "hex-rings": {
      return (
        <g className={ACCENT_STROKE} fill="none" strokeWidth="1">
          {lines(9, (index) => {
            const r = 14 + index * 12;
            const points = lines(6, (corner) => {
              const angle = (corner / 6) * Math.PI * 2 + Math.PI / 6;
              return `${170 + r * Math.cos(angle)},${101 + r * Math.sin(angle)}`;
            }).join(" ");
            return (
              <polygon
                key={index}
                opacity={0.7 - index * 0.06}
                points={points}
              />
            );
          })}
        </g>
      );
    }
    case "silk": {
      return (
        <g className="fill-current">
          <path
            d="M-10 40 C 90 0, 170 150, 330 50 L330 100 C 170 200, 90 60, -10 100Z"
            opacity="0.12"
          />
          <path
            d="M-10 120 C 110 70, 180 200, 330 120 L330 150 C 180 230, 110 110, -10 160Z"
            opacity="0.09"
          />
          <path
            d="M-10 0 C 80 -20, 200 60, 330 0 L330 20 C 200 90, 80 10, -10 30Z"
            opacity="0.07"
          />
        </g>
      );
    }
    case "s-ribbon": {
      const d = "M40 -20 C 190 20, 190 100, 95 108 C 10 116, 10 190, 150 226";
      return (
        <g fill="none" strokeLinecap="round">
          <path
            className="stroke-current"
            d={d}
            opacity="0.1"
            strokeWidth="46"
          />
          <path
            className={ACCENT_STROKE}
            d={d}
            opacity="0.45"
            strokeWidth="1.4"
            transform="translate(20 0)"
          />
        </g>
      );
    }
    case "travel-seal": {
      return (
        <g className="stroke-current" fill="none">
          <g opacity="0.3" transform="rotate(-14 256 58)">
            <circle cx="256" cy="58" r="40" strokeWidth="1.2" />
            <circle
              cx="256"
              cy="58"
              r="33"
              strokeDasharray="2 3"
              strokeWidth="1"
            />
            <circle cx="256" cy="58" r="20" strokeWidth="0.8" />
            <path d="M236 58h40M256 38v40" strokeWidth="0.6" />
          </g>
          <circle
            className={ACCENT_STROKE}
            cx="206"
            cy="128"
            opacity="0.35"
            r="26"
            strokeDasharray="1 3"
            strokeWidth="1.2"
          />
        </g>
      );
    }
    case "sweep": {
      return <Sweep art={art} id={id} />;
    }
    case "wave-ribbon": {
      return (
        <g>
          <path
            className="fill-current"
            d="M0 150 C 90 118, 170 196, 320 136 L320 202 L0 202Z"
            opacity="0.08"
          />
          <path
            className={ACCENT_FILL}
            d="M0 176 C 80 146, 170 212, 320 158 L320 202 L0 202Z"
            opacity="0.55"
          />
        </g>
      );
    }
    case "wing-stripe": {
      return (
        <g className={ACCENT_FILL}>
          <polygon opacity="0.85" points="150,202 195,202 320,78 320,30" />
          <polygon opacity="0.55" points="212,202 220,202 320,104 320,94" />
        </g>
      );
    }
    case "bolt": {
      return (
        <path
          className="fill-current"
          d="M168 56 138 106h22l-10 40 34-54h-23l13-36Z"
          opacity="0.9"
        />
      );
    }
    case "co-brand-stripe": {
      return (
        <g className={ACCENT_FILL}>
          <polygon opacity="0.9" points="170,202 190,202 320,72 320,50" />
          <polygon opacity="0.9" points="198,202 206,202 320,90 320,82" />
        </g>
      );
    }
    default: {
      return null;
    }
  }
};
