const bayer = (size: number): Float32Array => {
  let matrix = [0];
  for (let n = 1; n < size; n *= 2) {
    const next: number[] = Array.from({ length: n * n * 4 }, () => 0);
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) {
        const v = (matrix[y * n + x] ?? 0) * 4;
        next[y * 2 * n + x] = v;
        next[y * 2 * n + x + n] = v + 2;
        next[(y + n) * 2 * n + x] = v + 3;
        next[(y + n) * 2 * n + x + n] = v + 1;
      }
    }
    matrix = next;
  }
  return Float32Array.from(matrix, (v) => (v + 0.5) / (size * size));
};

export const BAYER8 = bayer(8);

const SIZE = 256;
const perm = new Uint8Array(SIZE * 2);
const lattice = new Float32Array(SIZE);

let seed = 0x9e_37_79_b9;
const random = (): number => {
  seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
  return seed / 4_294_967_296;
};

const order = Array.from({ length: SIZE }, (_, i) => i);
for (let i = SIZE - 1; i > 0; i -= 1) {
  const j = Math.floor(random() * (i + 1));
  const swap = order[i] ?? 0;
  order[i] = order[j] ?? 0;
  order[j] = swap;
}
for (let i = 0; i < SIZE * 2; i += 1) {
  perm[i] = order[i % SIZE] ?? 0;
}
for (let i = 0; i < SIZE; i += 1) {
  lattice[i] = random();
}

const at = (x: number, y: number): number =>
  lattice[perm[(perm[x] ?? 0) + y] ?? 0] ?? 0;

/** Smooth value noise in [0, 1], seeded so every visit draws the same field. */
export const noise = (x: number, y: number): number => {
  const fx = Math.floor(x);
  const fy = Math.floor(y);
  const tx = x - fx;
  const ty = y - fy;
  const u = tx * tx * (3 - 2 * tx);
  const v = ty * ty * (3 - 2 * ty);
  const x0 = fx & 255;
  const y0 = fy & 255;
  const x1 = (x0 + 1) & 255;
  const y1 = (y0 + 1) & 255;
  const top = at(x0, y0) + (at(x1, y0) - at(x0, y0)) * u;
  const bottom = at(x0, y1) + (at(x1, y1) - at(x0, y1)) * u;
  return top + (bottom - top) * v;
};

/** Bottom to top: spend bands, densest first, so the stack reads as one chart. */
const BANDS = [
  { amp: 0.17, ink: 0.88, scale: 0.0045, seed: 73 },
  { amp: 0.12, ink: 0.58, scale: 0.0062, seed: 37 },
  { amp: 0.1, ink: 0.36, scale: 0.0055, seed: 11 },
  { amp: 0.08, ink: 0.18, scale: 0.0075, seed: 101 },
] as const;

/** Pixels the data scrolls per second. */
const SPEED = 10;
/** Budget line and "today" marker, as fractions of the height and width. */
const BUDGET = 0.52;
const MARKER = 0.62;
const RULES = 8;
const EDGE = 3;

const rise = (band: (typeof BANDS)[number], xs: number): number =>
  band.amp * (0.25 + 1.5 * noise(xs * band.scale, band.seed));

const stack = (xs: number): number =>
  BANDS.reduce((sum, band) => sum + rise(band, xs), 0);

/** Ink density of a stacked spend chart scrolling past a dashed budget line and a "today" marker. */
export const ledgerChart = (
  x: number,
  y: number,
  t: number,
  w: number,
  h: number
): number => {
  const mx = w * MARKER;
  const my = h - stack(mx + t * SPEED) * h;
  const dot = Math.hypot(x - mx, y - my);
  if (dot < 4) {
    return 0.97;
  }
  if (dot < 10) {
    return 0;
  }

  const xs = x + t * SPEED;
  const up = (h - y) / h;
  let top = 0;
  for (const [i, band] of BANDS.entries()) {
    top += rise(band, xs);
    if (up < top) {
      const below = (top - up) * h;
      if (below < EDGE) {
        return Math.min(0.97, band.ink + (i === BANDS.length - 1 ? 0.8 : 0.3));
      }
      return band.ink;
    }
  }

  if (Math.abs(x - mx) < 1.5 && y < my && y % 10 < 5) {
    return 0.55;
  }
  if (Math.abs(up - BUDGET) * h < 1.5 && x % 14 < 8) {
    return 0.9;
  }
  if ((h - y) % (h / RULES) < 2.5) {
    return 0.26;
  }
  return 0.02 + 0.06 * (y / h) ** 2;
};

export interface Shadow {
  bottom: number;
  left: number;
  radius: number;
  right: number;
  top: number;
}

/** Shade in [0, 1] inside a rounded box, ramping up from its edge over `soft` pixels. */
export const shadeAt = (
  px: number,
  py: number,
  shadows: readonly Shadow[],
  soft: number
): number => {
  let shade = 0;
  for (const { bottom, left, radius, right, top } of shadows) {
    const hx = (right - left) / 2;
    const hy = (bottom - top) / 2;
    const r = Math.min(radius, hx, hy);
    const qx = Math.abs(px - (left + hx)) - (hx - r);
    const qy = Math.abs(py - (top + hy)) - (hy - r);
    const inset =
      r -
      Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) -
      Math.min(Math.max(qx, qy), 0);
    if (inset > 0) {
      shade = Math.max(shade, Math.min(1, inset / soft));
    }
  }
  return shade;
};
