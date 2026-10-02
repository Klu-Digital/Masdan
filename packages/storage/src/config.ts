import { env } from "@masdan/env/shared-server";

export interface StorageConfig {
  bucket: string;
  region: string;
  credentials: { accessKeyId: string; secretAccessKey: string };
  /** Server -> bucket. `undefined` on real AWS S3, where the SDK derives it from the region. */
  endpoint: string | undefined;
  /** Host baked into presigned URLs handed to clients. Falls back to `endpoint`. */
  publicEndpoint: string | undefined;
  forcePathStyle: boolean;
  maxUploadBytes: number;
}

export const resolveStorageConfig = (): StorageConfig | null => {
  const bucket = env.S3_BUCKET;
  const accessKeyId = env.S3_ACCESS_KEY_ID;
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY;

  if (!bucket || !accessKeyId || !secretAccessKey) {
    return null;
  }

  const endpoint = env.S3_ENDPOINT;

  return {
    bucket,
    credentials: { accessKeyId, secretAccessKey },
    endpoint,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    maxUploadBytes: env.STORAGE_MAX_UPLOAD_BYTES,
    publicEndpoint: env.S3_PUBLIC_ENDPOINT ?? endpoint,
    region: env.S3_REGION,
  };
};

export const isStorageConfigured = (): boolean =>
  resolveStorageConfig() !== null;
