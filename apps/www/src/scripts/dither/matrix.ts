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

export const BAYER4 = bayer(4);
export const BAYER8 = bayer(8);

export interface Matrix {
  readonly values: Float32Array;
  readonly mask: number;
  readonly shift: number;
}

export const ORDER4: Matrix = { mask: 3, shift: 2, values: BAYER4 };
export const ORDER8: Matrix = { mask: 7, shift: 3, values: BAYER8 };
