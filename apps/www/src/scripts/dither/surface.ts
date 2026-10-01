const MAX_PIXEL_RATIO = 2;

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

export interface Tones {
  fg: number;
  bg: number;
  line: number;
  shadow: number;
}

/** Reads the tones a canvas paints with from its CSS custom properties. */
export const readPalette = (
  el: Element,
  names: readonly string[]
): number[] => {
  const style = getComputedStyle(el);
  return names.map((name) => pack(style.getPropertyValue(name).trim()));
};

export const readTones = (el: Element): Tones => {
  const [fg = 0, bg = 0, line = 0, shadow = 0] = readPalette(el, [
    "--tone-fg",
    "--tone-bg",
    "--tone-line",
    "--tone-shadow",
  ]);
  return { bg, fg, line, shadow };
};

/** A low-res pixel buffer scaled by whole device pixels so cells stay crisp. */
export class Surface {
  readonly canvas: HTMLCanvasElement;
  cols = 0;
  rows = 0;
  cell: number;
  /** CSS pixels covered by one cell after rounding to device pixels. */
  unit = 1;
  pixels = new Uint32Array(0);
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly buffer = document.createElement("canvas");
  private readonly bctx: CanvasRenderingContext2D | null;
  private image: ImageData | null = null;
  private device = 1;

  constructor(canvas: HTMLCanvasElement, cell: number) {
    this.canvas = canvas;
    this.cell = cell;
    this.ctx = canvas.getContext("2d");
    this.bctx = this.buffer.getContext("2d");
  }

  resize(cell = this.cell): boolean {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (!(width && height && this.bctx)) {
      return false;
    }
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    const device = Math.max(1, Math.round(cell * ratio));
    const backingWidth = Math.round(width * ratio);
    const backingHeight = Math.round(height * ratio);
    if (this.canvas.width !== backingWidth) {
      this.canvas.width = backingWidth;
    }
    if (this.canvas.height !== backingHeight) {
      this.canvas.height = backingHeight;
    }
    const cols = Math.ceil(backingWidth / device);
    const rows = Math.ceil(backingHeight / device);
    if (!this.image || cols !== this.cols || rows !== this.rows) {
      this.buffer.width = cols;
      this.buffer.height = rows;
      this.image = this.bctx.createImageData(cols, rows);
      this.pixels = new Uint32Array(this.image.data.buffer);
    }
    this.cols = cols;
    this.rows = rows;
    this.cell = cell;
    this.device = device;
    this.unit = device / ratio;
    return true;
  }

  present(): void {
    if (!(this.ctx && this.bctx && this.image)) {
      return;
    }
    this.bctx.putImageData(this.image, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(
      this.buffer,
      0,
      0,
      this.cols * this.device,
      this.rows * this.device
    );
  }
}
