import { useEffect, useRef } from "react";

import { BAYER8, ledgerChart, shadeAt } from "@/lib/dither";
import type { Shadow } from "@/lib/dither";

const MAX_PIXEL_RATIO = 2;
const CELL = 3;
/** Coarse-to-fine cell sizes played once on arrival. */
const COARSEST = 18;
const RESOLVE = [COARSEST, 12, 8, 5] as const;
const RESOLVE_MS = 900;
const STILL_T = 12;
const LAMP_RADIUS = 120;
const LAMP_STRENGTH = 0.35;
const LAMP_EASE = 0.14;
const SHADOW_X = 8;
const SHADOW_Y = 10;
const SHADOW_SOFT = 8;
const SHADOW_INK = 0.45;

const easeOut = (x: number): number => 1 - (1 - x) ** 3;

let probe: CanvasRenderingContext2D | null = null;

/** Packs any CSS color into the little-endian RGBA word ImageData expects. */
const pack = (color: string): number => {
  probe ??= document
    .createElement("canvas")
    .getContext("2d", { willReadFrequently: true });
  if (!probe) {
    return 0;
  }
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = "transparent";
  probe.fillStyle = color || "transparent";
  probe.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0, a = 0] = probe.getImageData(0, 0, 1, 1).data;
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
};

const readTones = (el: Element) => {
  const style = getComputedStyle(el);
  const tone = (name: string): number =>
    pack(style.getPropertyValue(name).trim());
  return {
    bg: tone("--tone-bg"),
    fg: tone("--tone-fg"),
    shadow: tone("--tone-shadow"),
  };
};

/** Dithered ledgerChart for the auth pages. Elements marked `data-caster` inside the parent cast dithered shadows onto it. */
export const DitherField = () => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const host = canvas?.parentElement;
    const ctx = canvas?.getContext("2d");
    const buffer = document.createElement("canvas");
    const bctx = buffer.getContext("2d");
    if (!(canvas && host && ctx && bctx)) {
      return;
    }

    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    const casters = [...host.querySelectorAll<HTMLElement>("[data-caster]")];
    let radii: number[] = [];
    let tones = readTones(canvas);
    let image: ImageData | null = null;
    let pixels = new Uint32Array(0);
    let row = new Float32Array(0);
    let cols = 0;
    let rows = 0;
    let cell: number = COARSEST;
    let device = 1;
    let unit = 1;
    let started = 0;
    let handle = 0;
    const light = { power: 0, target: 0, tx: 0, ty: 0, x: 0, y: 0 };

    const resize = (next: number): void => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!(width && height)) {
        return;
      }
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      device = Math.max(1, Math.round(next * ratio));
      const backingWidth = Math.round(width * ratio);
      const backingHeight = Math.round(height * ratio);
      if (canvas.width !== backingWidth) {
        canvas.width = backingWidth;
      }
      if (canvas.height !== backingHeight) {
        canvas.height = backingHeight;
      }
      const nextCols = Math.ceil(backingWidth / device);
      const nextRows = Math.ceil(backingHeight / device);
      if (!image || nextCols !== cols || nextRows !== rows) {
        buffer.width = nextCols;
        buffer.height = nextRows;
        image = bctx.createImageData(nextCols, nextRows);
        pixels = new Uint32Array(image.data.buffer);
      }
      cols = nextCols;
      rows = nextRows;
      cell = next;
      unit = device / ratio;
    };

    const readRadii = (): void => {
      radii = casters.map(
        (caster) =>
          Number(
            getComputedStyle(caster).borderTopLeftRadius.replace("px", "")
          ) || 0
      );
    };

    const castShadows = (): Shadow[] => {
      const frame = canvas.getBoundingClientRect();
      return casters.map((caster, i) => {
        const rect = caster.getBoundingClientRect();
        const left = rect.left - frame.left;
        const top = rect.top - frame.top;
        return {
          bottom: top + rect.height + SHADOW_Y,
          left: left + SHADOW_X,
          radius: radii[i] ?? 0,
          right: left + rect.width + SHADOW_X,
          top: top + SHADOW_Y,
        };
      });
    };

    const draw = (t: number, density: number): void => {
      if (!image) {
        return;
      }
      const { bg, fg, shadow: dark } = tones;
      const width = cols * unit;
      const height = rows * unit;
      const lit = light.power > 0.01;
      const reach = LAMP_RADIUS * 2.5;
      const falloff = 1 / (LAMP_RADIUS * LAMP_RADIUS);
      const sample = 2;
      const shadows = castShadows();
      if (row.length !== cols) {
        row = new Float32Array(cols);
      }
      for (let y = 0; y < rows; y += 1) {
        const py = (y + 0.5) * unit;
        if (y % sample === 0) {
          const fy = (y + sample / 2) * unit;
          for (let x = 0; x < cols; x += sample) {
            const value = ledgerChart(
              (x + sample / 2) * unit,
              fy,
              t,
              width,
              height
            );
            row.fill(value * density, x, x + sample);
          }
        }
        const order = (y & 7) << 3;
        const dy = py - light.y;
        const rowLit = lit && Math.abs(dy) < reach;
        const rowShadows = shadows.filter(
          (shadow) => py > shadow.top && py < shadow.bottom
        );
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
          const threshold = BAYER8[order + (x & 7)] ?? 1;
          let color = d > threshold ? fg : bg;
          if (
            rowShadows.length > 0 &&
            shadeAt(px, py, rowShadows, SHADOW_SOFT) * SHADOW_INK > threshold
          ) {
            color = dark;
          }
          pixels[index] = color;
          index += 1;
        }
      }
      bctx.putImageData(image, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(buffer, 0, 0, cols * device, rows * device);
    };

    const tick = (now: number): void => {
      handle = 0;
      if (reduce.matches) {
        if (cell !== CELL) {
          resize(CELL);
        }
        draw(STILL_T, 1);
        return;
      }
      if (!started) {
        started = now;
      }
      const progress = Math.min(1, (now - started) / RESOLVE_MS);
      const step = Math.min(
        RESOLVE.length - 1,
        Math.floor(progress * RESOLVE.length)
      );
      const target = progress >= 1 ? CELL : (RESOLVE[step] ?? CELL);
      if (cell !== target) {
        resize(target);
      }
      light.power += (light.target - light.power) * LAMP_EASE;
      light.x += (light.tx - light.x) * LAMP_EASE;
      light.y += (light.ty - light.y) * LAMP_EASE;
      draw(now / 1000, 0.15 + 0.85 * easeOut(progress));
      handle = requestAnimationFrame(tick);
    };

    const wake = (): void => {
      if (!handle) {
        handle = requestAnimationFrame(tick);
      }
    };

    const onMove = (event: PointerEvent): void => {
      if (reduce.matches) {
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
    };
    const onLeave = (): void => {
      light.target = 0;
    };

    const sizer = new ResizeObserver(() => {
      readRadii();
      resize(reduce.matches ? CELL : cell);
      wake();
    });
    const toner = new MutationObserver(() => {
      tones = readTones(canvas);
      wake();
    });

    readRadii();
    resize(cell);
    sizer.observe(canvas);
    toner.observe(document.documentElement, {
      attributeFilter: ["class"],
      attributes: true,
    });
    host.addEventListener("pointermove", onMove, { passive: true });
    host.addEventListener("pointerleave", onLeave);
    reduce.addEventListener("change", wake);
    wake();

    return () => {
      cancelAnimationFrame(handle);
      sizer.disconnect();
      toner.disconnect();
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      reduce.removeEventListener("change", wake);
    };
  }, []);

  return (
    <canvas
      aria-hidden="true"
      className="absolute inset-0 block size-full [--tone-bg:var(--surface)] [--tone-fg:var(--brand)] [--tone-shadow:var(--muted-foreground)] [image-rendering:pixelated] dark:[--tone-shadow:#000000]"
      ref={ref}
    />
  );
};
