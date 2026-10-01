import { artActor } from "./art";
import type { Scene } from "./art";
import { fieldActor } from "./field";
import type { Field } from "./field";
import { paintGlyph } from "./glyphs";
import { register } from "./loop";
import { ORDER4, ORDER8 } from "./matrix";
import { netWorthActor } from "./networth";
import { noise } from "./noise";
import { cards, iris, ledger } from "./scenes";

const SCALE = 0.0042;

/** Flowing noise, advected by a slower warp, heavier toward the bottom. */
const drift: Field = (x, y, t, _w, h) => {
  const nx = x * SCALE;
  const ny = y * SCALE;
  const warp = noise(nx * 0.55 + t * 0.045, ny * 0.55 - t * 0.02);
  const flow =
    noise(nx + warp * 1.9 - t * 0.07, ny + warp * 1.3 + t * 0.025) * 0.72 +
    noise(nx * 2.4 + t * 0.1, ny * 2.4 - t * 0.04) * 0.28;
  const ramp = 0.08 + 0.34 * (y / h) ** 1.3;
  const breath = 0.04 * Math.sin(t * 0.6);
  return ramp + (flow - 0.5) * 0.9 + breath;
};

/** Two crossing sine sweeps, like light raking across a halftone. */
const sweep: Field = (x, y, t) => {
  const a = Math.sin(x * 0.016 + y * 0.012 - t * 0.85);
  const b = Math.sin(x * 0.0058 - y * 0.024 + t * 0.5);
  const v = 0.5 + 0.28 * a + 0.22 * b;
  return 0.06 + 0.78 * v * v;
};

/** A rising horizon: dense below, broken up by slow noise above. */
const horizon: Field = (x, y, t, _w, h) => {
  const rise = (y / h) ** 1.7;
  const grain = noise(x * 0.0032 + t * 0.03, y * 0.0055 - t * 0.018);
  return 0.04 + 0.78 * rise + (grain - 0.5) * 0.55;
};

const fields: Record<string, (canvas: HTMLCanvasElement) => void> = {
  closing: (canvas) =>
    register(
      fieldActor(canvas, {
        cell: 3,
        field: horizon,
        matrix: ORDER8,
        resolve: [18, 12, 8, 5],
        sample: 2,
      })
    ),
  hero: (canvas) =>
    register(
      fieldActor(canvas, {
        cell: 3,
        field: drift,
        lamp: canvas.closest<HTMLElement>("[data-lamp]") ?? undefined,
        matrix: ORDER8,
        sample: 2,
      })
    ),
  networth: (canvas) => register(netWorthActor(canvas)),
  sweep: (canvas) =>
    register(
      fieldActor(canvas, {
        cell: 3,
        field: sweep,
        matrix: ORDER4,
        resolve: [16, 11, 7, 5],
      })
    ),
};

for (const canvas of document.querySelectorAll<HTMLCanvasElement>(
  "canvas[data-dither]"
)) {
  fields[canvas.dataset.dither ?? ""]?.(canvas);
}

const scenes: Record<string, Scene> = { cards, iris, ledger };

for (const canvas of document.querySelectorAll<HTMLCanvasElement>(
  "canvas[data-art]"
)) {
  const scene = scenes[canvas.dataset.art ?? ""];
  if (scene) {
    register(
      artActor(canvas, {
        cell: 3,
        pointer: canvas.closest<HTMLElement>("[data-lamp]") ?? undefined,
        scene,
      })
    );
  }
}

const glyphs = [
  ...document.querySelectorAll<HTMLCanvasElement>("canvas[data-glyph]"),
];
const paintGlyphs = (): void => {
  for (const glyph of glyphs) {
    paintGlyph(glyph);
  }
};
paintGlyphs();
document.addEventListener("themechange", paintGlyphs);
