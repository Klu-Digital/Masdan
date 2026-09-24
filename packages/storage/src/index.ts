import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createError } from "@masdan/observability";

import { resolveStorageConfig } from "./config";
import type { StorageConfig } from "./config";

/** Presigned URLs are short-lived by design; the client uses one immediately. */
const DEFAULT_EXPIRES_IN_SECONDS = 900;

export interface PresignUploadOptions {
  key: string;
  contentType: string;
  contentLength: number;
  expiresIn?: number;
}

export interface PresignDownloadOptions {
  key: string;
  expiresIn?: number;
  /** Original filename, echoed back via Content-Disposition so browsers save it sensibly. */
  downloadFileName?: string;
}

export interface ObjectMetadata {
  size: number;
  contentType: string | undefined;
  etag: string | undefined;
}

const requireConfig = (): StorageConfig => {
  const config = resolveStorageConfig();
  if (!config) {
    throw createError({
      code: "STORAGE_NOT_CONFIGURED",
      fix: "Set the S3_* variables in apps/server/.env, or run `docker compose up -d minio`",
      message: "Object storage is not configured",
      status: 503,
      why: "S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must all be set",
    });
  }
  return config;
};

const isMissingObject = (error: unknown): boolean =>
  error instanceof NotFound ||
  error instanceof NoSuchKey ||
  (typeof error === "object" &&
    error !== null &&
    "$metadata" in error &&
    (error as { $metadata?: { httpStatusCode?: number } }).$metadata
      ?.httpStatusCode === 404);

const buildClient = (
  endpoint: string | undefined,
  config: StorageConfig
): S3Client =>
  new S3Client({
    credentials: config.credentials,
    forcePathStyle: config.forcePathStyle,
    region: config.region,
    ...(endpoint ? { endpoint } : {}),
  });

export const createStorage = () => {
  // Built on first use: `storage` below is a module-scope singleton, so eager
  // construction would make merely importing this package throw wherever
  // storage is unconfigured.
  let commandClient: S3Client | undefined;
  let signingClient: S3Client | undefined;

  /** Talks to the bucket from the server (HeadObject, DeleteObject, PutObject). */
  const getCommandClient = (config: StorageConfig): S3Client => {
    commandClient ??= buildClient(config.endpoint, config);
    return commandClient;
  };

  /**
   * A presigned URL bakes in the host it was signed against, so inside Docker
   * this must be the reachable `S3_PUBLIC_ENDPOINT`.
   */
  const getSigningClient = (config: StorageConfig): S3Client => {
    if (config.publicEndpoint === config.endpoint) {
      return getCommandClient(config);
    }
    signingClient ??= buildClient(config.publicEndpoint, config);
    return signingClient;
  };

  return {
    get bucket(): string {
      return requireConfig().bucket;
    },

    async deleteObject({ key }: { key: string }): Promise<void> {
      const config = requireConfig();
      await getCommandClient(config).send(
        new DeleteObjectCommand({ Bucket: config.bucket, Key: key })
      );
    },

    /** Server-side reads (import jobs). `null` when the object does not exist. */
    async getObject({ key }: { key: string }): Promise<Uint8Array | null> {
      const config = requireConfig();
      try {
        const result = await getCommandClient(config).send(
          new GetObjectCommand({ Bucket: config.bucket, Key: key })
        );
        return result.Body
          ? await result.Body.transformToByteArray()
          : new Uint8Array();
      } catch (error) {
        if (isMissingObject(error)) {
          return null;
        }
        throw error;
      }
    },

    /** `null` when the object does not exist — an expected outcome on confirm, not an error. */
    async headObject({ key }: { key: string }): Promise<ObjectMetadata | null> {
      const config = requireConfig();
      try {
        const result = await getCommandClient(config).send(
          new HeadObjectCommand({ Bucket: config.bucket, Key: key })
        );
        return {
          contentType: result.ContentType,
          etag: result.ETag?.replaceAll('"', ""),
          size: result.ContentLength ?? 0,
        };
      } catch (error) {
        if (isMissingObject(error)) {
          return null;
        }
        throw error;
      }
    },

    isConfigured(): boolean {
      return resolveStorageConfig() !== null;
    },

    get maxUploadBytes(): number {
      return requireConfig().maxUploadBytes;
    },

    presignDownload({
      key,
      expiresIn = DEFAULT_EXPIRES_IN_SECONDS,
      downloadFileName,
    }: PresignDownloadOptions): Promise<string> {
      const config = requireConfig();
      const command = new GetObjectCommand({
        Bucket: config.bucket,
        Key: key,
        ...(downloadFileName
          ? {
              ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(
                downloadFileName
              )}`,
            }
          : {}),
      });

      return getSignedUrl(getSigningClient(config), command, { expiresIn });
    },

    /**
     * Content type and length are signed into the URL, so a client cannot
     * upload a different type or a larger body than the one it declared.
     */
    presignUpload({
      key,
      contentType,
      contentLength,
      expiresIn = DEFAULT_EXPIRES_IN_SECONDS,
    }: PresignUploadOptions): Promise<string> {
      const config = requireConfig();
      const command = new PutObjectCommand({
        Bucket: config.bucket,
        ContentLength: contentLength,
        ContentType: contentType,
        Key: key,
      });

      return getSignedUrl(getSigningClient(config), command, {
        expiresIn,
        signableHeaders: new Set(["content-type", "content-length"]),
      });
    },

    /** Server-side writes (generated PDFs, thumbnails) that never pass through a client. */
    async putObject({
      key,
      body,
      contentType,
    }: {
      key: string;
      body: Uint8Array | string;
      contentType: string;
    }): Promise<void> {
      const config = requireConfig();
      await getCommandClient(config).send(
        new PutObjectCommand({
          Body: body,
          Bucket: config.bucket,
          ContentType: contentType,
          Key: key,
        })
      );
    },
  };
};

export type Storage = ReturnType<typeof createStorage>;

export const storage: Storage = createStorage();

export { isStorageConfigured, resolveStorageConfig } from "./config";
export type { StorageConfig } from "./config";
export { allowedContentTypes, isAllowedContentType } from "./content-types";
export type { AllowedContentType } from "./content-types";
export { buildObjectKey, sanitizeFileName } from "./keys";
export type { BuildObjectKeyOptions } from "./keys";
