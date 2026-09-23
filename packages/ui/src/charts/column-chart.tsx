"use client";

import { cn } from "@masdan/ui/lib/utils";
import type React from "react";
import { useId, useRef, useState } from "react";

export interface ColumnSeries {
  key: string;
  label: string;
  /** A theme fill class, e.g. `fill-chart-1`; the legend swatch reuses it. */
  fillClassName: string;
  swatchClassName: string;
}

export interface ColumnDatum {
  key: string;
  /** Axis label ("Sep"). */
  label: string;
  /** Readout label ("September 2026"). */
  longLabel: string;
  values: Record<string, number>;
}

const HEIGHT = 168;
const AXIS_WIDTH = 44;
const BOTTOM = 22;
const TOP = 8;
const BAR_MAX = 22;
const BAR_GAP = 2;
const RADIUS = 4;

const niceStep = (max: number, ticks: number): number => {
  if (max <= 0) {
    return 1;
  }
  const raw = max / ticks;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const residual = raw / magnitude;
  let nice = 10;
  if (residual <= 1) {
    nice = 1;
  } else if (residual <= 2) {
    nice = 2;
  } else if (residual <= 2.5) {
    nice = 2.5;
  } else if (residual <= 5) {
    nice = 5;
  }
  return nice * magnitude;
};

/** Square at the baseline, 4px rounded at the data end. */
const barPath = (
  x: number,
  y: number,
  width: number,
  height: number
): string => {
  if (height <= 0) {
    return "";
  }
  const r = Math.min(RADIUS, height, width / 2);
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
};

/**
 * Grouped columns for a handful of periods. The selected period's values are
 * read out above the plot (the legend doubles as the readout), driven by hover,
 * focus, or arrow keys. A visually hidden table carries every value.
 */
export const ColumnChart = ({
  className,
  data,
  defaultIndex,
  formatAxis,
  formatValue,
  readoutExtra,
  series,
  title,
}: {
  className?: string;
  data: ColumnDatum[];
  defaultIndex?: number;
  formatAxis: (value: number) => string;
  formatValue: (value: number) => React.ReactNode;
  readoutExtra?: (datum: ColumnDatum) => React.ReactNode;
  series: ColumnSeries[];
  title: string;
}): React.ReactElement => {
  const id = useId();
  const initial = defaultIndex ?? data.length - 1;
  const [active, setActive] = useState<number>(initial);
  const [hovered, setHovered] = useState<number | null>(null);
  const shown = hovered ?? active;
  const current = data[shown] ?? data.at(-1);

  const max = Math.max(
    0,
    ...data.flatMap((datum) =>
      series.map((item) => datum.values[item.key] ?? 0)
    )
  );
  const step = niceStep(max, 3);
  const top = Math.max(step * Math.ceil(max / step), step);
  const ticks = [0, 1, 2, 3].map((index) => (top / 3) * index);
  const plotHeight = HEIGHT - BOTTOM - TOP;
  const width = 600;
  const plotWidth = width - AXIS_WIDTH;
  const band = plotWidth / Math.max(data.length, 1);
  const barWidth = Math.min(
    BAR_MAX,
    (band * 0.56 - BAR_GAP * (series.length - 1)) / series.length
  );
  const groupWidth = barWidth * series.length + BAR_GAP * (series.length - 1);
  const yOf = (value: number) => TOP + plotHeight - (value / top) * plotHeight;

  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const focusIndex = (index: number) => {
    const next = Math.max(0, Math.min(data.length - 1, index));
    setActive(next);
    buttons.current[next]?.focus();
  };
  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusIndex(index - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      focusIndex(index + 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusIndex(data.length - 1);
    }
  };

  return (
    <figure
      className={cn("flex flex-col gap-4", className)}
      data-slot="column-chart"
    >
      <figcaption
        className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2"
        aria-live="polite"
      >
        <span className="sr-only">{title}. </span>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {series.map((item) => (
            <div className="flex flex-col gap-0.5" key={item.key}>
              <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <span
                  aria-hidden="true"
                  className={cn("size-2 rounded-[2px]", item.swatchClassName)}
                />
                {item.label}
              </span>
              <span className="text-base font-semibold">
                {formatValue(current?.values[item.key] ?? 0)}
              </span>
            </div>
          ))}
          {current && readoutExtra ? readoutExtra(current) : null}
        </div>
        <span className="text-muted-foreground text-xs">
          {current?.longLabel}
        </span>
      </figcaption>

      <div className="relative" onPointerLeave={() => setHovered(null)}>
        <svg
          aria-hidden="true"
          className="h-44 w-full overflow-visible"
          preserveAspectRatio="none"
          viewBox={`0 0 ${width} ${HEIGHT}`}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                className="stroke-chart-grid"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                x1={AXIS_WIDTH}
                x2={width}
                y1={yOf(tick)}
                y2={yOf(tick)}
              />
              <text
                className="fill-muted-foreground text-[10px] tabular-nums"
                dominantBaseline="middle"
                x={0}
                y={yOf(tick)}
              >
                {formatAxis(tick)}
              </text>
            </g>
          ))}
          {data.map((datum, index) => {
            const x0 = AXIS_WIDTH + band * index;
            const start = x0 + (band - groupWidth) / 2;
            const selected = index === shown;
            return (
              <g
                className={cn(
                  "transition-opacity duration-200",
                  !selected && "opacity-45"
                )}
                key={datum.key}
                onClick={() => setActive(index)}
                onPointerEnter={() => setHovered(index)}
              >
                {/* The hit target is the whole band, not the painted bar. */}
                <rect
                  className="fill-transparent"
                  height={HEIGHT}
                  width={band}
                  x={x0}
                  y={0}
                />
                {series.map((item, seriesIndex) => {
                  const value = datum.values[item.key] ?? 0;
                  const y = yOf(value);
                  return (
                    <path
                      className={cn(
                        "animate-grow-y origin-bottom [transform-box:fill-box]",
                        item.fillClassName
                      )}
                      d={barPath(
                        start + seriesIndex * (barWidth + BAR_GAP),
                        y,
                        barWidth,
                        TOP + plotHeight - y
                      )}
                      key={item.key}
                    />
                  );
                })}
                <text
                  className={cn(
                    "text-[10px]",
                    selected
                      ? "fill-foreground font-semibold"
                      : "fill-muted-foreground"
                  )}
                  textAnchor="middle"
                  x={x0 + band / 2}
                  y={HEIGHT - 4}
                >
                  {datum.label}
                </text>
              </g>
            );
          })}
        </svg>
        {/* One real button per period: the hit target is the whole band, and
          keyboard users move between periods with the arrow keys. */}
        <div className="absolute inset-y-0 start-[7.333%] end-0 flex">
          {data.map((datum, index) => (
            <button
              aria-label={datum.longLabel}
              aria-pressed={index === active}
              className="focus-visible:ring-ring/50 flex-1 rounded-md outline-none focus-visible:ring-3"
              key={datum.key}
              onClick={() => setActive(index)}
              onFocus={() => setHovered(index)}
              onBlur={() => setHovered(null)}
              onKeyDown={(event) => onKeyDown(event, index)}
              onPointerEnter={() => setHovered(index)}
              ref={(element) => {
                buttons.current[index] = element;
              }}
              tabIndex={index === active ? 0 : -1}
              type="button"
            />
          ))}
        </div>
      </div>

      <table className="sr-only" id={`${id}-table`}>
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            {series.map((item) => (
              <th key={item.key} scope="col">
                {item.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((datum) => (
            <tr key={datum.key}>
              <th scope="row">{datum.longLabel}</th>
              {series.map((item) => (
                <td key={item.key}>
                  {formatValue(datum.values[item.key] ?? 0)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
};
