import { motion, parallax, wake } from "./loop";
import type { Actor } from "./loop";
import { BAYER8 } from "./matrix";
import { readPalette, Surface } from "./surface";

interface Aim {
  x: number;
  y: number;
}

/**
 * Returns a tone index plus a density: `2.6` is tone 2 at 60% ink, and 0 is
 * paper. `u` and `v` run 0 to 1 across the canvas; `aspect` is width / height.
 * `lift` is how far the canvas sits below the viewport's centre, in viewport
 * heights clamped to [-1, 1], so a scene can move its layers at their own depth.
 */
export type Scene = (
  u: number,
  v: number,
  t: number,
  aspect: number,
  aim: Aim,
  lift: number
) => number;

interface ArtOptions {
  scene: Scene;
  cell: number;
  /** Element whose pointer position the scene can lean toward. */
  pointer?: HTMLElement;
}

const TONES = [
  "--tone-bg",
  "--tone-1",
  "--tone-2",
  "--tone-3",
  "--tone-4",
  "--tone-5",
  "--tone-6",
];
const DURATION_MS = 1300;
const START_LINE = 0.88;
const STILL_T = 8;
const EASE = 0.08;

export const artActor = (
  canvas: HTMLCanvasElement,
  { scene, cell, pointer }: ArtOptions
): Actor => {
  const surface = new Surface(canvas, cell);
  let palette = readPalette(canvas, TONES);
  let started = 0;
  let done = false;
  const aim = { tx: 0, ty: 0, x: 0, y: 0 };

  pointer?.addEventListener(
    "pointermove",
    (event) => {
      const rect = canvas.getBoundingClientRect();
      aim.tx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      aim.ty = ((event.clientY - rect.top) / rect.height) * 2 - 1;
      wake();
    },
    { passive: true }
  );
  pointer?.addEventListener("pointerleave", () => {
    aim.tx = 0;
    aim.ty = 0;
  });

  const draw = (t: number, progress: number): void => {
    const { cols, rows, pixels } = surface;
    const bg = palette[0] ?? 0;
    const aspect = cols / rows;
    const sweep = 1.45 * progress - 0.45;
    const lean = {
      x: Math.max(-1, Math.min(1, aim.x)),
      y: Math.max(-1, Math.min(1, aim.y)),
    };
    const lift = Math.max(
      -1,
      Math.min(1, parallax(canvas) / window.innerHeight)
    );
    for (let y = 0; y < rows; y += 1) {
      const v = (y + 0.5) / rows;
      const order = (y & 7) << 3;
      let index = y * cols;
      for (let x = 0; x < cols; x += 1) {
        const threshold = BAYER8[order + (x & 7)] ?? 1;
        let color = bg;
        if (
          progress >= 1 ||
          threshold * 0.55 + (x / cols + v) * 0.225 <= sweep
        ) {
          const code = scene((x + 0.5) / cols, v, t, aspect, lean, lift);
          const tone = Math.floor(code);
          if (tone > 0 && code - tone > threshold) {
            color = palette[tone] ?? bg;
          }
        }
        pixels[index] = color;
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
        if (actor.dirty) {
          draw(STILL_T, 1);
          actor.dirty = false;
        }
        return false;
      }
      if (!(started || done)) {
        if (
          canvas.getBoundingClientRect().top >
          window.innerHeight * START_LINE
        ) {
          if (actor.dirty) {
            draw(0, 0);
            actor.dirty = false;
          }
          return true;
        }
        started = now;
      }
      const progress = done ? 1 : Math.min(1, (now - started) / DURATION_MS);
      done = progress >= 1;
      aim.x += (aim.tx - aim.x) * EASE;
      aim.y += (aim.ty - aim.y) * EASE;
      draw(now / 1000, progress);
      actor.dirty = false;
      return true;
    },
    // A dissolve paused off-screen would greet the reader half-drawn.
    leave() {
      if (started) {
        done = true;
      }
    },
    resize() {
      surface.resize();
    },
    retone() {
      palette = readPalette(canvas, TONES);
    },
    visible: false,
  };
  return actor;
};
