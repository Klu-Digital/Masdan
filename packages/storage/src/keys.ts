/** The key carries a uuidv7 id, so the name only has to be safe and legible. */
const MAX_FILE_NAME_LENGTH = 200;
/** Longest suffix still treated as an extension worth preserving when clamping. */
const MAX_EXTENSION_LENGTH = 11;
const FALLBACK_FILE_NAME = "file";

const clampPreservingExtension = (name: string): string => {
  if (name.length <= MAX_FILE_NAME_LENGTH) {
    return name;
  }

  const dot = name.lastIndexOf(".");
  const extension =
    dot > 0 && name.length - dot <= MAX_EXTENSION_LENGTH ? name.slice(dot) : "";

  return name.slice(0, MAX_FILE_NAME_LENGTH - extension.length) + extension;
};

/**
 * Only the last path segment survives, so `../../etc/passwd` collapses to
 * `passwd` — the key prefix is server-owned and must not be escapable by a
 * caller.
 */
export const sanitizeFileName = (name: string): string => {
  const segments = name.normalize("NFC").split(/[/\\]/u);
  const base = segments.at(-1) ?? "";

  const cleaned = base
    // oxlint-disable-next-line no-control-regex -- stripping control characters is the point
    .replaceAll(/[\u0000-\u001F\u007F]/gu, "")
    .replaceAll(/[^\p{L}\p{N}._ -]/gu, "-")
    .replaceAll(/\s+/gu, " ")
    .replaceAll(/-{2,}/gu, "-")
    // a leading dot hides the file on download; a leading dash reads as a flag
    .replace(/^[.\-\s]+/u, "")
    .trim();

  if (!cleaned) {
    return FALLBACK_FILE_NAME;
  }

  return clampPreservingExtension(cleaned);
};

export interface BuildObjectKeyOptions {
  organizationId: string;
  /** Random per-object segment. Kept a parameter so this function stays pure. */
  objectId: string;
  name: string;
}

/**
 * `org/<organizationId>/<objectId>/<name>`. The `org/` prefix keeps a
 * per-tenant IAM policy expressible later; the random `objectId` keeps the key
 * unguessable. Deliberately not the file row's id: a uuidv7 in a URL would leak
 * a creation timestamp.
 */
export const buildObjectKey = ({
  organizationId,
  objectId,
  name,
}: BuildObjectKeyOptions): string =>
  `org/${organizationId}/${objectId}/${sanitizeFileName(name)}`;
