import {
  H,
  PALETTE_FILL,
  W,
  random,
  slots,
} from "@masdan/ui/components/card-art/canvas";
import type { CardArt, Motif } from "@masdan/ui/components/card-art/canvas";
import type React from "react";

type Point = readonly [number, number];

// A low-poly mesh coloured from the palette; `left` keeps it to the left side.
const FacetMesh = ({ art, left }: { art: CardArt; left: boolean }) => {
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

export const Facets: Motif = ({ art }) => <FacetMesh art={art} left={false} />;

export const FacetsLeft: Motif = ({ art }) => <FacetMesh art={art} left />;
