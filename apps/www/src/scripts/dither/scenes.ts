import type { Scene } from "./art";
import { noise } from "./noise";

const TAU = Math.PI * 2;
const BLUE = 1;
const GREEN = 2;
const INK = 3;
const GREY = 4;
const PUPIL = 5;
const GLINT = 6;
const SOLID = 0.999;

const hash = (n: number): number => {
  const s = Math.sin(n * 127.1 + 311.7) * 43_758.5453;
  return s - Math.floor(s);
};

const within = (x: number, from: number, to: number): boolean =>
  x >= from && x <= to;

/** Category shares on the iris ring, in turn order. */
const SEGMENTS: readonly (readonly [number, number])[] = [
  [0.34, BLUE],
  [0.58, GREEN],
  [0.75, INK],
  [0.87, GREY],
  [1, BLUE],
];

const ring = (r: number, turn: number): number => {
  let from = 0;
  for (const [to, tone] of SEGMENTS) {
    if (turn < to) {
      if (turn - from < 0.006 || to - turn < 0.006) {
        return 0;
      }
      return tone + 0.92 - 0.42 * ((r - 0.33) / 0.1);
    }
    from = to;
  }
  return 0;
};

export const iris: Scene = (u, v, t, aspect, aim, lift) => {
  const x = (u - 0.5) * aspect;
  const y = v - 0.5;
  const r = Math.hypot(x, y);
  if (r > 0.49) {
    return 0;
  }
  if (r > 0.45) {
    const angle = Math.atan2(y, x);
    const tick = ((angle / TAU + 1) * 72) % 1 < 0.38;
    const major = Math.round((angle / TAU + 1) * 72) % 6 === 0;
    return tick && (r > 0.465 || major) ? INK + SOLID : 0;
  }
  const ry = y - lift * 0.012;
  const rr = Math.hypot(x, ry);
  if (rr > 0.43) {
    return 0;
  }
  if (rr > 0.33) {
    const turn = ((((Math.atan2(ry, x) - t * 0.06) / TAU) % 1) + 1) % 1;
    return ring(rr, turn);
  }
  const iy = y - lift * 0.03;
  const ir = Math.hypot(x, iy);
  if (ir > 0.31) {
    return 0;
  }
  const angle = Math.atan2(iy, x);
  const px = aim.x * 0.06;
  const py = aim.y * 0.06 + lift * 0.055;
  const pupil = Math.hypot(x - px, y - py);
  const size = 0.115 + 0.008 * Math.sin(t * 0.8);
  if (pupil < size) {
    const glint = Math.hypot(x - px + 0.04, y - py + 0.04) < 0.026;
    return glint ? GLINT + SOLID : PUPIL + SOLID;
  }
  if (ir > 0.19) {
    const fiber = noise(
      Math.cos(angle) * 4 + ir * 9,
      Math.sin(angle) * 4 - t * 0.2
    );
    return (
      BLUE + Math.min(SOLID, 0.12 + 0.75 * fiber * (1.3 - (ir - 0.19) * 4))
    );
  }
  return BLUE + Math.max(0.05, Math.min(SOLID, 0.95 - (pupil - size) * 5));
};

const ROWS_VISIBLE = 11;
const SPEED = 0.022;
/** Rows the ledger scrolls per viewport height the page scrolls. */
const SCROLL_ROWS = 6;

const rowTone = (i: number): number => {
  const kind = hash(i);
  if (kind < 0.22) {
    return GREEN;
  }
  return kind < 0.42 ? BLUE : INK;
};

export const ledger: Scene = (u, v, t, _aspect, _aim, lift) => {
  const position =
    v * ROWS_VISIBLE + t * SPEED * ROWS_VISIBLE - lift * SCROLL_ROWS;
  const i = Math.floor(position);
  const local = position - i;
  const fade = Math.min(1, v / 0.14, (1 - v) / 0.14);
  if (local > 0.94) {
    return GREY + 0.5 * fade;
  }
  const tone = rowTone(i);
  const ink = (base: number, density: number): number =>
    base + Math.min(SOLID, density * fade);
  if (within(local, 0.3, 0.7) && within(u, 0.03, 0.075)) {
    return ink(GREY, 0.7);
  }
  if (within(local, 0.24, 0.76) && within(u, 0.1, 0.14)) {
    return ink(tone, 0.4);
  }
  if (within(local, 0.3, 0.48) && within(u, 0.17, 0.37 + 0.22 * hash(i + 1))) {
    return ink(INK, 0.85);
  }
  if (within(local, 0.56, 0.68)) {
    const tagged = hash(i + 2) > 0.45;
    if (within(u, 0.17, 0.27 + 0.08 * hash(i + 3))) {
      return ink(GREY, 0.7);
    }
    if (tagged && within(u, 0.39, 0.45)) {
      return ink(hash(i + 4) > 0.5 ? BLUE : GREEN, 0.6);
    }
  }
  if (within(local, 0.38, 0.6) && within(u, 0.6, 0.66 + 0.12 * hash(i + 5))) {
    return ink(GREY, 0.55);
  }
  const amount = 0.05 + 0.11 * hash(i + 6);
  if (within(local, 0.34, 0.64) && within(u, 0.96 - amount, 0.96)) {
    return ink(tone, SOLID);
  }
  return 0;
};

const CARD_TONES = [BLUE, INK, GREEN, GREY];
const CARD_TILT = [-6, 4, -3, 7];
/** Height above the paper. Later cards are drawn on top, so they sit highest. */
const CARD_HEIGHT = [0.08, 0.13, 0.18, 0.24];
const CARD_RATIO = 1.586;
/** Light from the upper left: shadow offset per unit of height. */
const CAST = { x: 0.3, y: 0.5 };
const SHADOW_SOFT = 0.03;
const SHADOW_INK = 0.5;

const EDGE = 0.025;

const cardFace = (s: number, q: number, tone: number): number => {
  if (
    s < EDGE ||
    s > 1 - EDGE ||
    q < EDGE * CARD_RATIO ||
    q > 1 - EDGE * CARD_RATIO
  ) {
    return tone + SOLID;
  }
  if (within(s, 0.09, 0.23) && within(q, 0.32, 0.52)) {
    return 0;
  }
  for (const dot of [0.7, 0.75, 0.8, 0.85]) {
    if (Math.hypot((s - dot) * CARD_RATIO, q - 0.2) < 0.022) {
      return 0;
    }
  }
  if (within(s, 0.76, 0.9) && within(q, 0.7, 0.84)) {
    return 0;
  }
  const sheen = Math.abs(s - q * 0.55 - 0.32) < 0.07 ? 0.28 : 0;
  return (
    tone + Math.max(0.08, Math.min(SOLID, 0.9 - 0.5 * ((s + q) / 2) - sheen))
  );
};

/** Signed distance from a point to a tilted rounded card; negative inside. */
const cardDistance = (
  dx: number,
  dy: number,
  theta: number,
  width: number
): { distance: number; s: number; q: number } => {
  const height = width / CARD_RATIO;
  const corner = width * 0.06;
  const lx = dx * Math.cos(theta) + dy * Math.sin(theta);
  const ly = -dx * Math.sin(theta) + dy * Math.cos(theta);
  const qx = Math.abs(lx) - (width / 2 - corner);
  const qy = Math.abs(ly) - (height / 2 - corner);
  const distance =
    Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
    Math.min(Math.max(qx, qy), 0) -
    corner;
  return { distance, q: ly / height + 0.5, s: lx / width + 0.5 };
};

export const cards: Scene = (u, v, t, aspect, aim, lift) => {
  const x = u * aspect;
  const width = Math.min(0.6, aspect * 0.235);
  let shade = 0;
  for (let i = CARD_TONES.length - 1; i >= 0; i -= 1) {
    const height = CARD_HEIGHT[i] ?? 0;
    const cx = aspect * (0.14 + 0.24 * i) + aim.x * height * 0.525;
    const rest = 0.5 + (i % 2 === 0 ? -0.1 : 0.1);
    const cy =
      rest +
      0.03 * Math.sin(t * 0.7 + i * 1.7) +
      (lift * 1.35 + aim.y * 0.45) * height;
    const theta =
      (((CARD_TILT[i] ?? 0) + 1.5 * Math.sin(t * 0.45 + i * 1.3)) * Math.PI) /
      180;
    const card = cardDistance(x - cx, v - cy, theta, width);
    if (card.distance <= 0) {
      return cardFace(card.s, card.q, CARD_TONES[i] ?? INK);
    }
    const shadow = cardDistance(
      x - cx - height * CAST.x,
      v - rest - height * CAST.y,
      theta,
      width
    );
    shade = Math.max(shade, 1 - Math.max(0, shadow.distance) / SHADOW_SOFT);
  }
  return shade > 0 ? GREY + SHADOW_INK * shade : 0;
};
