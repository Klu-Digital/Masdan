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
