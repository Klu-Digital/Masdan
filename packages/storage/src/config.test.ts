import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

/**
 * t3-env freezes `env` at module load, so mock the module instead.
 * `resolveStorageConfig` reads it at call time, so mutating that object between
 * tests is enough.
 */
const mockEnv = vi.hoisted(() => ({
  S3_ACCESS_KEY_ID: undefined as string | undefined,
  S3_BUCKET: undefined as string | undefined,
  S3_ENDPOINT: undefined as string | undefined,
  S3_FORCE_PATH_STYLE: false,
  S3_PUBLIC_ENDPOINT: undefined as string | undefined,
  S3_REGION: "auto",
  S3_SECRET_ACCESS_KEY: undefined as string | undefined,
  STORAGE_MAX_UPLOAD_BYTES: 26_214_400,
}));

vi.mock("@k22i/env/server", () => ({ env: mockEnv }));

const { isStorageConfigured, resolveStorageConfig } = await import("./config");

const configureFully = () => {
  mockEnv.S3_BUCKET = "k22i";
  mockEnv.S3_ACCESS_KEY_ID = "minioadmin";
  mockEnv.S3_SECRET_ACCESS_KEY = "minioadmin";
};

beforeEach(() => {
  mockEnv.S3_BUCKET = undefined;
  mockEnv.S3_REGION = "auto";
  mockEnv.S3_ACCESS_KEY_ID = undefined;
  mockEnv.S3_SECRET_ACCESS_KEY = undefined;
  mockEnv.S3_ENDPOINT = undefined;
  mockEnv.S3_PUBLIC_ENDPOINT = undefined;
  mockEnv.S3_FORCE_PATH_STYLE = false;
  mockEnv.STORAGE_MAX_UPLOAD_BYTES = 26_214_400;
});

describe("resolveStorageConfig", () => {
  it("returns null when nothing is configured", () => {
    expect(resolveStorageConfig()).toBeNull();
    expect(isStorageConfigured()).toBe(false);
  });

  it("returns null when the bucket is set but credentials are missing", () => {
    mockEnv.S3_BUCKET = "k22i";

    expect(resolveStorageConfig()).toBeNull();
  });

  it("returns null when only one half of the credential pair is set", () => {
    mockEnv.S3_BUCKET = "k22i";
    mockEnv.S3_ACCESS_KEY_ID = "minioadmin";

    expect(resolveStorageConfig()).toBeNull();
  });

  it("resolves once bucket and both credentials are present", () => {
    configureFully();

    expect(resolveStorageConfig()).toMatchObject({
      bucket: "k22i",
      credentials: { accessKeyId: "minioadmin", secretAccessKey: "minioadmin" },
      forcePathStyle: false,
      maxUploadBytes: 26_214_400,
      region: "auto",
    });
    expect(isStorageConfigured()).toBe(true);
  });

  it("leaves both endpoints undefined for real AWS S3", () => {
    configureFully();
    mockEnv.S3_REGION = "eu-west-1";

    const config = resolveStorageConfig();

    expect(config?.endpoint).toBeUndefined();
    expect(config?.publicEndpoint).toBeUndefined();
  });

  it("defaults the public endpoint to the server endpoint", () => {
    configureFully();
    mockEnv.S3_ENDPOINT = "http://localhost:5300";

    expect(resolveStorageConfig()?.publicEndpoint).toBe(
      "http://localhost:5300"
    );
  });

  it("keeps the public endpoint separate when the two differ, as inside compose", () => {
    configureFully();
    mockEnv.S3_ENDPOINT = "http://minio:9000";
    mockEnv.S3_PUBLIC_ENDPOINT = "http://localhost:5300";

    const config = resolveStorageConfig();

    expect(config?.endpoint).toBe("http://minio:9000");
    expect(config?.publicEndpoint).toBe("http://localhost:5300");
  });

  it("passes through path-style addressing for MinIO", () => {
    configureFully();
    mockEnv.S3_FORCE_PATH_STYLE = true;

    expect(resolveStorageConfig()?.forcePathStyle).toBe(true);
  });
});
