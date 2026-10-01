import { motion } from "./loop";
import type { Actor } from "./loop";
import { readTones, Surface } from "./surface";

const CELL = 2.5;
const MONTHS = 48;
const TOP = 0.12;
const BOTTOM = 0.04;
const EASE = 0.18;

/** Sample net worth, normalised: steady saving with a few lean months. */
const SERIES = Array.from({ length: MONTHS + 1 }, (_, i) => {
  const trend = 0.16 + 0.66 * (i / MONTHS) ** 1.3;
  const wobble = 0.03 * Math.sin(i * 0.9) + 0.015 * Math.sin(i * 2.3 + 1);
  const dip =
    i >= 18 && i <= 24 ? 0.06 * Math.sin(((i - 18) / 6) * Math.PI) : 0;
  return trend + wobble - dip;
});

const sample = (position: number): number => {
  const i = Math.min(MONTHS - 1, Math.floor(position));
  const t = position - i;
  const p0 = SERIES[Math.max(0, i - 1)] ?? 0;
  const p1 = SERIES[i] ?? 0;
  const p2 = SERIES[i + 1] ?? 0;
  const p3 = SERIES[Math.min(MONTHS, i + 2)] ?? 0;
  return (
    p1 +
    0.5 *
      t *
      (p2 -
        p0 +
        t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)))
  );
};

/** Atkinson diffusion: spreads 6/8 of each pixel's error to its neighbours. */
const atkinson = (
  levels: Float32Array,
  cols: number,
  rows: number,
  out: Uint32Array,
  fg: number,
  bg: number
): void => {
  const spread = (x: number, y: number, error: number): void => {
    if (x >= 0 && x < cols && y < rows) {
      const index = y * cols + x;
      levels[index] = (levels[index] ?? 0) + error;
    }
  };
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const index = y * cols + x;
      const level = levels[index] ?? 0;
      const ink = level > 0.5;
      out[index] = ink ? fg : bg;
      const error = ((ink ? level - 1 : level) / 8) * Number(level > 0);
      if (error !== 0) {
        spread(x + 1, y, error);
        spread(x + 2, y, error);
        spread(x - 1, y + 1, error);
        spread(x, y + 1, error);
        spread(x + 1, y + 1, error);
        spread(x, y + 2, error);
      }
    }
  }
};

export const netWorthActor = (canvas: HTMLCanvasElement): Actor => {
  const surface = new Surface(canvas, CELL);
  let tones = readTones(canvas);
  let levels = new Float32Array(0);
  let curve = new Float32Array(0);
  let shown = 0;
  let drawn = -1;

  const layout = (): void => {
    const { cols, rows } = surface;
    levels = new Float32Array(cols * rows);
    curve = Float32Array.from({ length: cols }, (_, x) => {
      const value = sample((x / Math.max(1, cols - 1)) * MONTHS);
      return rows * (TOP + (1 - TOP - BOTTOM) * (1 - value));
    });
    drawn = -1;
  };

  const fill = (edge: number): void => {
    const { cols, rows } = surface;
    levels.fill(0);
    for (let x = 0; x < edge; x += 1) {
      const top = curve[x] ?? rows;
      for (let y = Math.ceil(top); y < rows; y += 1) {
        const depth = (y - top) / Math.max(1, rows - top);
        levels[y * cols + x] = 0.74 - 0.6 * depth ** 0.7;
      }
    }
  };

  /** Solid line where revealed; dotted line and gridlines ahead of the edge. */
  const trace = (edge: number): void => {
    const { cols, rows, pixels } = surface;
    const { bg, line } = tones;
    const grid = [0.25, 0.5, 0.75].map((quarter) => Math.round(rows * quarter));
    for (let x = 0; x < cols; x += 1) {
      const y = Math.round(curve[x] ?? 0);
      const prev = Math.round(curve[Math.max(0, x - 1)] ?? y);
      if (x < edge) {
        for (let r = Math.min(y, prev); r <= Math.max(y, prev) + 1; r += 1) {
          pixels[r * cols + x] = line;
        }
        continue;
      }
      if (x % 3 === 0) {
        pixels[y * cols + x] = line;
      }
      if (x % 4 === 0) {
        for (const gy of grid) {
          if (pixels[gy * cols + x] === bg) {
            pixels[gy * cols + x] = line;
          }
        }
      }
    }
  };

  const cursor = (edge: number): void => {
    const { cols, rows, pixels } = surface;
    const { line } = tones;
    for (let y = 0; y < rows; y += 2) {
      pixels[y * cols + edge] = line;
    }
    const cy = Math.round(curve[edge] ?? 0);
    for (let y = Math.max(0, cy - 2); y <= Math.min(rows - 1, cy + 2); y += 1) {
      for (
        let x = Math.max(0, edge - 2);
        x <= Math.min(cols - 1, edge + 2);
        x += 1
      ) {
        pixels[y * cols + x] = line;
      }
    }
  };

  const draw = (progress: number): void => {
    const { cols, rows, pixels } = surface;
    const edge = Math.round(progress * cols);
    fill(edge);
    atkinson(levels, cols, rows, pixels, tones.fg, tones.bg);
    trace(edge);
    if (edge > 0 && edge < cols) {
      cursor(edge);
    }
    surface.present();
    drawn = progress;
  };

  const target = (): number => {
    const rect = canvas.getBoundingClientRect();
    const view = window.innerHeight;
    return Math.min(1, Math.max(0, (view - rect.top) / (view * 0.8)));
  };

  const actor: Actor = {
    dirty: true,
    el: canvas,
    frame() {
      if (motion.still) {
        if (actor.dirty) {
          draw(1);
          actor.dirty = false;
        }
        return false;
      }
      shown += (target() - shown) * EASE;
      if (actor.dirty || Math.abs(shown - drawn) * surface.cols >= 0.5) {
        draw(shown);
        actor.dirty = false;
      }
      return true;
    },
    resize() {
      if (surface.resize()) {
        layout();
      }
    },
    retone() {
      tones = readTones(canvas);
    },
    visible: false,
  };
  return actor;
};
