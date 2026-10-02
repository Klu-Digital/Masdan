// Dependency-free: the web client imports this too.

/** Avatars are stored inline in `user.image`, which rides along on every session read. */
export const MAX_AVATAR_LENGTH = 128 * 1024;

const AVATAR_DATA_URL =
  /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/u;

// Inline raster only: an external URL would let one member track another's views.
export const isAvatarImage = (value?: unknown): boolean =>
  value === null ||
  value === undefined ||
  value === "" ||
  (typeof value === "string" &&
    value.length <= MAX_AVATAR_LENGTH &&
    AVATAR_DATA_URL.test(value));
