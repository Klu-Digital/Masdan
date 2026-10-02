import { file } from "@masdan/db/schema/index";
import type * as StorageModule from "@masdan/storage";
import { getSessionFor, getTestDb, signUpTestUser } from "@masdan/testing";
import { call, ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { Context } from "../context";
import { appRouter } from "../routers/index";

/** Await a call and hand back whatever it threw, for assertions on the error shape. */
const caught = async (p: Promise<unknown>): Promise<unknown> => {
  try {
    return await p;
  } catch (error) {
    return error;
  }
};

const bucket = vi.hoisted(() => ({
  objects: new Map<
    string,
    { size: number; contentType: string; etag: string }
  >(),
}));

vi.mock("@masdan/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof StorageModule>();
  return {
    ...actual,
    storage: {
      bucket: "test-bucket",
      deleteObject: ({ key }: { key: string }) => {
        bucket.objects.delete(key);
      },
      headObject: ({ key }: { key: string }) => bucket.objects.get(key) ?? null,
      isConfigured: () => true,
      maxUploadBytes: 26_214_400,
      presignDownload: ({ key }: { key: string }) =>
        `https://bucket.test/${key}?download`,
      presignUpload: ({ key }: { key: string }) =>
        `https://bucket.test/${key}?upload`,
      putObject: async () => {},
    },
  };
});

/** Simulates the client's direct PUT actually landing in the bucket. */
const putIntoBucket = (key: string, size = 1234, contentType = "image/png") => {
  bucket.objects.set(key, { contentType, etag: "abc123", size });
};

const contextFor = async (headers: Headers): Promise<Context> =>
  ({
    auth: null,
    db: getTestDb(),
    log: undefined,
    session: await getSessionFor(headers),
  }) as unknown as Context;

const upload = {
  contentType: "image/png",
  name: "photo.png",
  size: 1234,
} as const;

beforeEach(() => {
  bucket.objects.clear();
});

describe("storage.createUpload", () => {
  it("inserts a pending row scoped to the caller's organization and returns an upload URL", async () => {
    const { user, headers } = await signUpTestUser();
    const context = await contextFor(headers);

    const result = await call(appRouter.files.createUpload, upload, {
      context,
    });

    const [row] = await getTestDb()
      .select()
      .from(file)
      .where(eq(file.id, result.fileId));

    expect(row).toMatchObject({
      bucket: "test-bucket",
      contentType: "image/png",
      name: "photo.png",
      organizationId: context.session?.session.activeOrganizationId,
      size: null,
      status: "pending",
      userId: user.id,
    });
    expect(row?.key).toBe(result.key);
    expect(result.uploadUrl).toContain(result.key);
  });

  it("stores the sanitized filename, not the raw client input", async () => {
    const { headers } = await signUpTestUser();
    const context = await contextFor(headers);

    const { fileId, key } = await call(
      appRouter.files.createUpload,
      { ...upload, name: "../../etc/passwd.png" },
      { context }
    );

    const [row] = await getTestDb()
      .select()
      .from(file)
      .where(eq(file.id, fileId));

    // The name is echoed back in the download's Content-Disposition, so it must
    // not carry the traversal attempt, and it must match the key's last segment.
    expect(row?.name).toBe("passwd.png");
    expect(key.endsWith("/passwd.png")).toBe(true);
  });

  it("scopes the object key under the caller's organization", async () => {
    const { headers } = await signUpTestUser();
    const context = await contextFor(headers);

    const result = await call(appRouter.files.createUpload, upload, {
      context,
    });

    expect(
      result.key.startsWith(
        `org/${context.session?.session.activeOrganizationId}/`
      )
    ).toBe(true);
  });

  it("rejects a size over STORAGE_MAX_UPLOAD_BYTES", async () => {
    const { headers } = await signUpTestUser();
    const context = await contextFor(headers);

    const error = await caught(
      call(
        appRouter.files.createUpload,
        { ...upload, size: 1_000_000_000 },
        { context }
      )
    );

    expect(error).toBeInstanceOf(ORPCError);
  });

  it("rejects a content type outside the allowlist", async () => {
    const { headers } = await signUpTestUser();
    const context = await contextFor(headers);

    const error = await caught(
      call(
        appRouter.files.createUpload,
        { ...upload, contentType: "application/x-msdownload" as never },
        { context }
      )
    );

    expect(error).toBeInstanceOf(ORPCError);
  });
});

describe("storage.confirmUpload", () => {
  it("flips the row to ready using the size and checksum the bucket reports", async () => {
    const { headers } = await signUpTestUser();
    const context = await contextFor(headers);

    const { fileId, key } = await call(appRouter.files.createUpload, upload, {
      context,
    });
    // The bucket's numbers win over the client's declared 1234.
    putIntoBucket(key, 4096);

    const confirmed = await call(
      appRouter.files.confirmUpload,
      { fileId },
      { context }
    );

    expect(confirmed).toMatchObject({
      checksum: "abc123",
      size: 4096,
      status: "ready",
    });
  });

  it("marks the row failed and throws when the object never landed", async () => {
    const { headers } = await signUpTestUser();
    const context = await contextFor(headers);

    const { fileId } = await call(appRouter.files.createUpload, upload, {
      context,
    });

    const error = await caught(
      call(appRouter.files.confirmUpload, { fileId }, { context })
    );

    expect(error).toBeInstanceOf(ORPCError);
    expect((error as ORPCError<string, unknown>).code).toBe("NOT_FOUND");

    const [row] = await getTestDb()
      .select()
      .from(file)
      .where(eq(file.id, fileId));
    expect(row?.status).toBe("failed");
  });
});

describe("storage.getDownloadUrl", () => {
  it("returns a presigned URL for a ready file", async () => {
    const { headers } = await signUpTestUser();
    const context = await contextFor(headers);

    const { fileId, key } = await call(appRouter.files.createUpload, upload, {
      context,
    });
    putIntoBucket(key);
    await call(appRouter.files.confirmUpload, { fileId }, { context });

    const { downloadUrl } = await call(
      appRouter.files.getDownloadUrl,
      { fileId },
      { context }
    );

    expect(downloadUrl).toContain(key);
  });

  it("refuses a file that has not been confirmed", async () => {
    const { headers } = await signUpTestUser();
    const context = await contextFor(headers);

    const { fileId } = await call(appRouter.files.createUpload, upload, {
      context,
    });

    const error = await caught(
      call(appRouter.files.getDownloadUrl, { fileId }, { context })
    );

    expect((error as ORPCError<string, unknown>).code).toBe("CONFLICT");
  });
});

describe("tenant isolation", () => {
  it("hides another organization's file from listFiles", async () => {
    const ownerUser = await signUpTestUser();
    const owner = await contextFor(ownerUser.headers);
    const strangerUser = await signUpTestUser();
    const stranger = await contextFor(strangerUser.headers);

    await call(appRouter.files.createUpload, upload, { context: owner });

    expect(
      await call(appRouter.files.listFiles, undefined, { context: owner })
    ).toHaveLength(1);
    expect(
      await call(appRouter.files.listFiles, undefined, { context: stranger })
    ).toHaveLength(0);
  });

  it.each([
    [
      "getDownloadUrl",
      (fileId: string, context: Context) =>
        call(appRouter.files.getDownloadUrl, { fileId }, { context }),
    ],
    [
      "confirmUpload",
      (fileId: string, context: Context) =>
        call(appRouter.files.confirmUpload, { fileId }, { context }),
    ],
    [
      "deleteFile",
      (fileId: string, context: Context) =>
        call(appRouter.files.deleteFile, { fileId }, { context }),
    ],
  ])(
    "returns NOT_FOUND from %s for another organization's fileId",
    async (_name, run) => {
      const ownerUser = await signUpTestUser();
      const owner = await contextFor(ownerUser.headers);
      const strangerUser = await signUpTestUser();
      const stranger = await contextFor(strangerUser.headers);

      const { fileId, key } = await call(appRouter.files.createUpload, upload, {
        context: owner,
      });
      putIntoBucket(key);

      const error = await caught(run(fileId, stranger));

      expect(error).toBeInstanceOf(ORPCError);
      expect((error as ORPCError<string, unknown>).code).toBe("NOT_FOUND");
    }
  );

  it("leaves the owner's row untouched after a stranger's failed delete", async () => {
    const ownerUser = await signUpTestUser();
    const owner = await contextFor(ownerUser.headers);
    const strangerUser = await signUpTestUser();
    const stranger = await contextFor(strangerUser.headers);

    const { fileId, key } = await call(appRouter.files.createUpload, upload, {
      context: owner,
    });
    putIntoBucket(key);

    await call(
      appRouter.files.deleteFile,
      { fileId },
      { context: stranger }
    ).catch(() => {});

    const [row] = await getTestDb()
      .select()
      .from(file)
      .where(eq(file.id, fileId));
    expect(row).toBeDefined();
    expect(bucket.objects.has(key)).toBe(true);
  });
});

describe("storage.deleteFile", () => {
  it("removes both the row and the object", async () => {
    const { headers } = await signUpTestUser();
    const context = await contextFor(headers);

    const { fileId, key } = await call(appRouter.files.createUpload, upload, {
      context,
    });
    putIntoBucket(key);

    await call(appRouter.files.deleteFile, { fileId }, { context });

    const rows = await getTestDb()
      .select()
      .from(file)
      .where(eq(file.id, fileId));
    expect(rows).toHaveLength(0);
    expect(bucket.objects.has(key)).toBe(false);
  });
});
