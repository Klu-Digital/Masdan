// Leaf module: the web bundle imports it.
export const allowedContentTypes = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/svg+xml",
  "application/pdf",
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/json",
  "application/zip",
  "video/mp4",
  "video/webm",
  "audio/mpeg",
  "audio/mp4",
  "audio/webm",
] as const;

export type AllowedContentType = (typeof allowedContentTypes)[number];

export const isAllowedContentType = (
  value: string
): value is AllowedContentType =>
  (allowedContentTypes as readonly string[]).includes(value);
