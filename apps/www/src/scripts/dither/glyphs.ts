import { BAYER4 } from "./matrix";
import { readTones, Surface } from "./surface";

const CELL = 2.5;

type Shape = (u: number, v: number) => number;

const inside = (
  u: number,
  v: number,
  l: number,
  t: number,
  r: number,
  b: number
): boolean => u >= l && u <= r && v >= t && v <= b;

const SHAPES: Record<string, Shape> = {
  accounts: (u, v) => {
    if (!inside(u, v, 0.06, 0.2, 0.94, 0.8)) {
      return 0;
    }
    if (inside(u, v, 0.16, 0.36, 0.34, 0.52)) {
      return 0;
    }
    return 0.2 + 0.75 * (1 - (u + v) / 2);
  },
  assistance: (u, v) => {
    const du = Math.abs(u - 0.5) * 2;
    const dv = Math.abs(v - 0.5) * 2;
    const star = 1 - (Math.sqrt(du) + Math.sqrt(dv));
    return star > 0 ? 0.35 + star * 1.6 : 0;
  },
  ledger: (u, v) => {
    const line = Math.floor(v * 7);
    const lengths = [0.92, 0.7, 0.84, 0.55, 0.78, 0.62, 0.88];
    if (line % 2 === 1 || u < 0.04 || u > (lengths[line] ?? 0)) {
      return 0;
    }
    return u < 0.2 ? 1 : 0.55 - u * 0.3;
  },
  planning: (u, v) => {
    const cu = u * 4;
    const cv = v * 4;
    if (cu % 1 < 0.22 || cv % 1 < 0.22) {
      return 0;
    }
    return Math.floor(cu) === 2 && Math.floor(cv) === 1 ? 1 : 0.22;
  },
  reports: (u, v) => {
    const bar = Math.floor(u * 4);
    const heights = [0.35, 0.55, 0.45, 0.9];
    if (u * 4 - bar < 0.25) {
      return 0;
    }
    const top = 1 - (heights[bar] ?? 0);
    return v >= top ? 0.25 + 0.75 * (1 - (v - top) / (1 - top)) : 0;
  },
  selfhost: (u, v) => {
    const unit = Math.floor(v * 3);
    const local = v * 3 - unit;
    if (local < 0.18 || u < 0.06 || u > 0.94) {
      return 0;
    }
    if (inside(u, local, 0.74, 0.42, 0.84, 0.72)) {
      return 0;
    }
    return 0.3 + 0.2 * unit;
  },
};

/** Paints one small, static dithered glyph from its named shape. */
export const paintGlyph = (canvas: HTMLCanvasElement): void => {
  const shape = SHAPES[canvas.dataset.glyph ?? ""];
  const surface = new Surface(canvas, CELL);
  if (!(shape && surface.resize())) {
    return;
  }
  const { fg, bg } = readTones(canvas);
  const { cols, rows, pixels } = surface;
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const d = shape((x + 0.5) / cols, (y + 0.5) / rows);
      pixels[y * cols + x] =
        d > (BAYER4[((y & 3) << 2) + (x & 3)] ?? 1) ? fg : bg;
    }
  }
  surface.present();
};
