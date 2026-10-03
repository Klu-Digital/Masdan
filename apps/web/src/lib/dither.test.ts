import { describe, expect, it } from "vitest";

import { BAYER8, noise, ledgerChart, shadeAt } from "./dither";

const box = { bottom: 100, left: 0, radius: 0, right: 200, top: 0 };

describe("BAYER8", () => {
  it("holds 64 distinct thresholds strictly inside (0, 1)", () => {
    expect(new Set(BAYER8).size).toBe(64);
    expect(Math.min(...BAYER8)).toBeGreaterThan(0);
    expect(Math.max(...BAYER8)).toBeLessThan(1);
  });
});

describe("noise", () => {
  it("is deterministic and stays in [0, 1]", () => {
    expect(noise(3.7, 9.1)).toBe(noise(3.7, 9.1));
    for (let i = 0; i < 200; i += 1) {
      const value = noise(i * 0.37, i * 0.91);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});

describe("ledgerChart", () => {
  it("stays finite and within ink range across the panel", () => {
    for (let x = 0; x <= 600; x += 40) {
      for (let y = 0; y <= 700; y += 50) {
        const value = ledgerChart(x, y, 12, 600, 700);
        expect(Number.isFinite(value)).toBeTruthy();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it("is inked at the foot and open paper at the top", () => {
    expect(ledgerChart(300, 690, 12, 600, 700)).toBeGreaterThan(0.5);
    expect(ledgerChart(20, 5, 12, 600, 700)).toBeLessThan(0.1);
  });
});

describe("shadeAt", () => {
  it("is zero outside a box and full deep inside it", () => {
    expect(shadeAt(-5, 50, [box], 12)).toBe(0);
    expect(shadeAt(100, 50, [box], 12)).toBe(1);
  });

  it("ramps up from the edge", () => {
    expect(shadeAt(6, 50, [box], 12)).toBeCloseTo(0.5);
  });

  it("clips the corner of a rounded box", () => {
    const rounded = { ...box, radius: 24 };
    expect(shadeAt(1, 1, [box], 12)).toBeGreaterThan(0);
    expect(shadeAt(1, 1, [rounded], 12)).toBe(0);
  });
});
