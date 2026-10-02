import { MAX_AVATAR_LENGTH } from "@masdan/auth/avatar";

/** Twice the largest avatar (`xl`, 64px) so it stays sharp on retina screens. */
const AVATAR_PIXELS = 256;
const QUALITIES = [0.85, 0.7, 0.5] as const;

/** Center-crops a photo to a square WebP data URL small enough for `user.image`. */
export const avatarDataUrl = async (photo: Blob): Promise<string> => {
  const bitmap = await createImageBitmap(photo).catch(() => null);
  if (!bitmap) {
    throw new Error("That file isn’t a photo we can read");
  }
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_PIXELS;
  canvas.height = AVATAR_PIXELS;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Your browser can’t resize photos");
  }
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    AVATAR_PIXELS,
    AVATAR_PIXELS
  );
  bitmap.close();

  for (const quality of QUALITIES) {
    // Safari without WebP encoding falls back to PNG, so the size check still matters.
    const dataUrl = canvas.toDataURL("image/webp", quality);
    if (dataUrl.length <= MAX_AVATAR_LENGTH) {
      return dataUrl;
    }
  }
  const jpeg = canvas.toDataURL("image/jpeg", QUALITIES.at(-1));
  if (jpeg.length <= MAX_AVATAR_LENGTH) {
    return jpeg;
  }
  throw new Error("That photo is too detailed to use. Try another one.");
};
