import { motion, wake } from "./loop";
import type { Actor } from "./loop";
import type { Matrix } from "./matrix";
import { readTones, Surface } from "./surface";

/** Ink density in [0, 1] at a point in CSS pixels, `t` in seconds. */
export type Field = (
  x: number,
  y: number,
  t: number,
  w: number,
  h: number
) => number;

interface FieldOptions {
  field: Field;
  matrix: Matrix;
  cell: number;
  /** Coarse-to-fine cell sizes played once as the band first comes into view. */
  resolve?: readonly number[];
  /** Element whose pointer moves shine a light over the field. */
  lamp?: HTMLElement;
  /** Evaluates the field once per n-by-n block of cells; thresholds stay per cell. */
  sample?: number;
}

const RESOLVE_MS = 1400;
const START_LINE = 0.85;
const STILL_T = 12;
const LAMP_RADIUS = 180;
const LAMP_STRENGTH = 0.6;
const LAMP_EASE = 0.14;

const easeOut = (x: number): number => 1 - (1 - x) ** 3;

export const fieldActor = (
  canvas: HTMLCanvasElement,
  options: FieldOptions
): Actor => {
  const { field, matrix, cell, resolve, lamp, sample = 1 } = options;
  let row = new Float32Array(0);
  const surface = new Surface(canvas, resolve?.[0] ?? cell);
  let tones = readTones(canvas);
  let started = 0;
  const light = { power: 0, target: 0, tx: 0, ty: 0, x: 0, y: 0 };

  if (lamp) {
    lamp.addEventListener(
      "pointermove",
      (event) => {
        if (motion.still) {
          return;
        }
        const rect = canvas.getBoundingClientRect();
        light.tx = event.clientX - rect.left;
        light.ty = event.clientY - rect.top;
        if (light.power < 0.01) {
          light.x = light.tx;
          light.y = light.ty;
        }
        light.target = 1;
        wake();
      },
      { passive: true }
    );
    lamp.addEventListener("pointerleave", () => {
      light.target = 0;
    });
  }

  const draw = (t: number, density: number): void => {
    const { cols, rows, pixels, unit } = surface;
    const { values, mask, shift } = matrix;
    const { fg, bg } = tones;
    const width = cols * unit;
    const height = rows * unit;
    const lit = light.power > 0.01;
    const reach = LAMP_RADIUS * 2.5;
    const falloff = 1 / (LAMP_RADIUS * LAMP_RADIUS);
    if (row.length !== cols) {
      row = new Float32Array(cols);
    }
    const block = sample * unit;
    for (let y = 0; y < rows; y += 1) {
      const py = (y + 0.5) * unit;
      if (y % sample === 0) {
        const fy = (y + sample / 2) * unit;
        for (let x = 0; x < cols; x += sample) {
          const value = field((x + sample / 2) * unit, fy, t, width, height);
          row.fill(value * density, x, x + sample);
        }
      }
      const order = (y & mask) << shift;
      const dy = py - light.y;
      const rowLit = lit && Math.abs(dy) < reach + block;
      let index = y * cols;
      for (let x = 0; x < cols; x += 1) {
        const px = (x + 0.5) * unit;
        let d = row[x] ?? 0;
        if (rowLit) {
          const dx = px - light.x;
          if (Math.abs(dx) < reach) {
            d -=
              light.power *
              LAMP_STRENGTH *
              Math.exp(-(dx * dx + dy * dy) * falloff);
          }
        }
        pixels[index] = d > (values[order + (x & mask)] ?? 1) ? fg : bg;
        index += 1;
      }
    }
    surface.present();
  };

  const actor: Actor = {
    dirty: true,
    el: canvas,
    frame(now) {
      if (motion.still) {
        if (!actor.dirty) {
          return false;
        }
        if (surface.cell !== cell) {
          surface.resize(cell);
        }
        draw(STILL_T, 1);
        actor.dirty = false;
        return false;
      }
      let density = 1;
      if (resolve) {
        const waiting =
          !started &&
          canvas.getBoundingClientRect().top > window.innerHeight * START_LINE;
        if (waiting) {
          if (actor.dirty) {
            draw(now / 1000, 0.15);
            actor.dirty = false;
          }
          return true;
        }
        started ||= now;
        const progress = Math.min(1, (now - started) / RESOLVE_MS);
        const step = Math.min(
          resolve.length - 1,
          Math.floor(progress * resolve.length)
        );
        const target = progress >= 1 ? cell : (resolve[step] ?? cell);
        if (surface.cell !== target) {
          surface.resize(target);
        }
        density = 0.15 + 0.85 * easeOut(progress);
      }
      light.power += (light.target - light.power) * LAMP_EASE;
      light.x += (light.tx - light.x) * LAMP_EASE;
      light.y += (light.ty - light.y) * LAMP_EASE;
      draw(now / 1000, density);
      actor.dirty = false;
      return true;
    },
    resize() {
      surface.resize();
    },
    retone() {
      tones = readTones(canvas);
    },
    visible: false,
  };
  return actor;
};
