import type { Motif } from "@/components/finance/card-art/canvas";

export const Globe: Motif = () => (
  <g className="stroke-current" fill="none" opacity="0.16" strokeWidth="0.8">
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
