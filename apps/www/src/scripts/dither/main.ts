import { artActor } from "./art";
import type { Scene } from "./art";
import { fieldActor } from "./field";
import type { Field } from "./field";
import { paintGlyph } from "./glyphs";
import { register } from "./loop";
import { ORDER4, ORDER8 } from "./matrix";
import { netWorthActor } from "./networth";
import { noise } from "./noise";
import { planeActor } from "./plane";
import { cards, iris, ledger } from "./scenes";

const SCALE = 0.0042;

const drift: Field = (x, y, t, _w, h, s) => {
  const back = y + s * 0.45;
  const nx = x * SCALE;
  const ny = back * SCALE;
  const warp = noise(nx * 0.55 + t * 0.045, ny * 0.55 - t * 0.02);
  const flow =
    noise(nx + warp * 1.9 - t * 0.07, ny + warp * 1.3 + t * 0.025) * 0.72 +
    noise(nx * 2.4 + t * 0.1, ny * 2.4 - t * 0.04) * 0.28;
  const ramp = 0.08 + 0.34 * (Math.max(0, back) / h) ** 1.3;
  const breath = 0.04 * Math.sin(t * 0.6);
  return ramp + (flow - 0.5) * 0.9 + breath;
};

/** Two crossing sine sweeps at different depths, like light raking across a halftone. */
const sweep: Field = (x, y, t, _w, _h, s) => {
  const a = Math.sin(x * 0.016 + (y + s * 0.5) * 0.012 - t * 0.85);
  const b = Math.sin(x * 0.0058 - (y + s * 0.2) * 0.024 + t * 0.5);
  const v = 0.5 + 0.28 * a + 0.22 * b;
  return 0.06 + 0.78 * v * v;
};

/** A rising horizon: dense below, broken up by slow noise that lags the page. */
const horizon: Field = (x, y, t, _w, h, s) => {
  const rise = (y / h) ** 1.7;
  const grain = noise(
    x * 0.0032 + t * 0.03,
    (y + s * 0.45) * 0.0055 - t * 0.018
  );
  return 0.04 + 0.78 * rise + (grain - 0.5) * 0.55;
};

interface Ridge {
  /** Top of the range at its lowest crest, as a fraction of the height. */
  base: number;
  /** How far the crests climb above `base`. */
  rise: number;
  /** Sideways pan per pixel of scroll; nearer ranges pan further. */
  depth: number;
  ink: number;
  scale: number;
  seed: number;
}

/** Near to far, so the first range a point falls inside is the one in front. */
const RIDGES: readonly Ridge[] = [
  { base: 0.95, depth: 0.6, ink: 0.74, rise: 0.4, scale: 0.009, seed: 73 },
  { base: 0.78, depth: 0.3, ink: 0.4, rise: 0.45, scale: 0.006, seed: 37 },
  { base: 0.6, depth: 0.12, ink: 0.16, rise: 0.48, scale: 0.004, seed: 11 },
];

/** Ranges of hills that pan sideways as the page scrolls, inked lighter with distance. */
const ridges: Field = (x, y, t, _w, h, s) => {
  for (const ridge of RIDGES) {
    const along = (x - s * ridge.depth + t * 6 * ridge.depth) * ridge.scale;
    const swell =
      noise(along, ridge.seed) * 0.7 + noise(along * 2.3, ridge.seed + 5) * 0.3;
    // Value noise rarely leaves its middle half, which flattens every crest.
    const crest = Math.max(0, Math.min(1, (swell - 0.25) * 2));
    const top = h * (ridge.base - ridge.rise * crest);
    if (y >= top) {
      return ridge.ink + 0.18 * Math.min(1, ((y - top) / h) * 2);
    }
  }
  return 0;
};

/** Panels marked `data-depth` that float over this canvas's field. */
const castersOver = (canvas: HTMLCanvasElement): Element[] => [
  ...(canvas.parentElement?.querySelectorAll("[data-depth]") ?? []),
];

const fields: Record<string, (canvas: HTMLCanvasElement) => void> = {
  closing: (canvas) =>
    register(
      fieldActor(canvas, {
        casters: castersOver(canvas),
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
        casters: castersOver(canvas),
        cell: 3,
        field: drift,
        lamp: canvas.closest<HTMLElement>("[data-lamp]") ?? undefined,
        matrix: ORDER8,
        sample: 2,
      })
    ),
  networth: (canvas) => register(netWorthActor(canvas)),
  ridges: (canvas) =>
    register(
      fieldActor(canvas, {
        cell: 3,
        field: ridges,
        matrix: ORDER8,
        resolve: [16, 11, 7, 5],
      })
    ),
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

// Planes go first so the shadows drawn this frame see where they moved to.
for (const el of document.querySelectorAll<HTMLElement>("[data-depth]")) {
  register(planeActor(el, Number(el.dataset.depth)));
}

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
