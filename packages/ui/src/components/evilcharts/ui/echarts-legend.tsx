"use client";

import {
  getColorsCount,
  indicatorBackground,
} from "@masdan/ui/components/evilcharts/ui/echarts-chart";
import type { ChartConfig } from "@masdan/ui/components/evilcharts/ui/echarts-chart";
import type { CSSProperties } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Legend overlay (React) — replicates ChartLegendContent + its 7 indicators.
// The legend is HTML inside `[data-chart={id}]`, so it uses the injected
// `--color-*` vars directly. Shared by every ECharts chart.
// ─────────────────────────────────────────────────────────────────────────────

export type LegendVariant =
  | "square"
  | "circle"
  | "circle-outline"
  | "rounded-square"
  | "rounded-square-outline"
  | "vertical-bar"
  | "horizontal-bar";

// The fill arrives as `--legend-fill` (a solid var or a multi-stop gradient), so
// the style object only ever sets a custom property.
const FILL = "[background:var(--legend-fill)]";

// Punches out the centre with a mask-composite so only the "border" shows —
// works with gradients and border-radius, unlike plain border-color.
const OUTLINE = `${FILL} [mask-composite:exclude] [mask:linear-gradient(#fff_0_0)_content-box,linear-gradient(#fff_0_0)]`;

const INDICATOR_CLASS: Record<LegendVariant, string> = {
  circle: `h-2 w-2 shrink-0 rounded-full ${FILL}`,
  "circle-outline": `h-2.5 w-2.5 shrink-0 rounded-full p-[1.5px] ${OUTLINE}`,
  "horizontal-bar": `h-1 w-3 shrink-0 rounded-[2px] ${FILL}`,
  "rounded-square": `h-2 w-2 shrink-0 rounded-[2px] ${FILL}`,
  "rounded-square-outline": `h-2.5 w-2.5 shrink-0 rounded-[3px] p-[1.5px] ${OUTLINE}`,
  square: `h-2 w-2 shrink-0 ${FILL}`,
  "vertical-bar": `h-3 w-1 shrink-0 rounded-[2px] ${FILL}`,
};

export const LegendIndicator = ({
  variant,
  dataKey,
  colorsCount,
}: {
  variant: LegendVariant;
  dataKey: string;
  colorsCount: number;
}) => (
  <div
    className={INDICATOR_CLASS[variant]}
    style={
      {
        "--legend-fill": indicatorBackground(dataKey, colorsCount),
      } as CSSProperties
    }
  />
);

// ─────────────────────────────────────────────────────────────────────────────
// LegendOverlay — the positioned HTML legend row. The chart computes the
// absolute-positioned `style` (it owns the brush/verticalAlign layout math) and
// passes it in; this renders the entries, their indicators, and the
// selection/hover dim. `verticalAlign` is carried on the props for parity with
// the chart's LegendSlot even though positioning arrives fully via `style`.
// ─────────────────────────────────────────────────────────────────────────────

interface LegendOverlayProps {
  seriesKeys: string[];
  config: ChartConfig;
  variant: LegendVariant;
  align: "left" | "center" | "right";
  verticalAlign: "top" | "middle" | "bottom";
  selectedKey: string | null;
  hoveredKey: string | null;
  isClickable: boolean;
  onToggle: (key: string) => void;
  className?: string;
  style?: CSSProperties;
}

const LEGEND_JUSTIFY: Record<LegendOverlayProps["align"], string> = {
  center: "justify-center",
  left: "justify-start",
  right: "justify-end",
};

export const LegendOverlay = ({
  seriesKeys,
  config,
  variant,
  align,
  selectedKey,
  hoveredKey,
  isClickable,
  onToggle,
  className,
  style,
}: LegendOverlayProps) => {
  const legendJustify = LEGEND_JUSTIFY[align];

  return (
    <div
      style={style}
      className={`flex items-center gap-4 select-none ${legendJustify} ${className ?? ""}`}
    >
      {seriesKeys.map((key) => {
        const item = config[key];
        const colorsCount = item ? getColorsCount(item) : 1;
        const isSelected =
          (selectedKey === null || selectedKey === key) &&
          (hoveredKey === null || hoveredKey === key);
        const entryClass = `flex items-center gap-1.5 transition-opacity ${
          isSelected ? "" : "opacity-30"
        }`;
        const indicator = (
          <LegendIndicator
            variant={variant}
            dataKey={key}
            colorsCount={colorsCount}
          />
        );
        // No entrance here — the Recharts legend appears instantly, and a
        // fade-in reads as disconnected from the canvas draw-in.
        if (!isClickable) {
          return (
            <div key={key} className={entryClass}>
              {indicator}
              {item?.label}
            </div>
          );
        }
        return (
          <button
            key={key}
            type="button"
            aria-pressed={selectedKey === key}
            className={`${entryClass} cursor-pointer`}
            onClick={() => onToggle(key)}
          >
            {indicator}
            {item?.label}
          </button>
        );
      })}
    </div>
  );
};
