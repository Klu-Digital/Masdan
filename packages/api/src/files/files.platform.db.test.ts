import { file, user } from "@masdan/db/schema/index";
import type * as StorageModule from "@masdan/storage";
import { getSessionFor, getTestDb, signUpTestUser } from "@masdan/testing";
import { call } from "@orpc/server";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vite-plus/test";

import type { Context } from "../context";
import { appRouter } from "../routers/index";

/** Only the network-touching `storage` object is faked — see `storage.db.test.ts`
 * for the same pattern applied to the org-scoped router. */
const deletedKeys = vi.hoisted(() => ({ keys: [] as string[] }));

vi.mock("@masdan/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof StorageModule>();
  return {
    ...actual,
    isStorageConfigured: () => true,
    // Not `...actual.storage`: `bucket` is a getter that throws when
    // unconfigured, and spreading evaluates it.
    storage: {
      bucket: "test-bucket",
      deleteObject: ({ key }: { key: string }) => {
        deletedKeys.keys.push(key);
      },
    },
  };
});

const contextFor = async (headers: Headers): Promise<Context> =>
  ({
    auth: null,
    db: getTestDb(),
    log: undefined,
    session: await getSessionFor(headers),
  }) as unknown as Context;

const grantPlatformAdmin = async (userId: string) => {
  await getTestDb()
    .update(user)
    .set({ role: "admin" })
    .where(eq(user.id, userId));
};

const insertReadyFile = (options: {
  name: string;
  organizationId: string;
  userId: string;
}) =>
  getTestDb()
    .insert(file)
    .values({
      bucket: "test-bucket",
      contentType: "image/png",
      key: `${options.organizationId}/${options.name}`,
      name: options.name,
      organizationId: options.organizationId,
      size: 1024,
      status: "ready",
      userId: options.userId,
    })
    .returning();

describe("admin.files", () => {
  it("lists files across organizations — the tenant boundary every other router enforces", async () => {
    const admin = await signUpTestUser();
    await grantPlatformAdmin(admin.user.id);
    const adminContext = await contextFor(admin.headers);

    const orgA = await signUpTestUser();
    const orgB = await signUpTestUser();
    const sessionA = await getSessionFor(orgA.headers);
    const sessionB = await getSessionFor(orgB.headers);
    const organizationIdA = sessionA?.session.activeOrganizationId;
    const organizationIdB = sessionB?.session.activeOrganizationId;
    if (!(organizationIdA && organizationIdB)) {
      throw new Error("test users are missing an active organization");
    }

    await insertReadyFile({
      name: "a.png",
      organizationId: organizationIdA,
      userId: orgA.user.id,
    });
    await insertReadyFile({
      name: "b.png",
      organizationId: organizationIdB,
      userId: orgB.user.id,
    });

    const listed = await call(
      appRouter.admin.files.list,
      {},
      { context: adminContext }
    );

    const names = listed.map((row) => row.name);
    expect(names).toContain("a.png");
    expect(names).toContain("b.png");
  });

  it("deletes the row and the underlying object", async () => {
    const admin = await signUpTestUser();
    await grantPlatformAdmin(admin.user.id);
    const adminContext = await contextFor(admin.headers);

    const owner = await signUpTestUser();
    const ownerSession = await getSessionFor(owner.headers);
    const organizationId = ownerSession?.session.activeOrganizationId;
    if (!organizationId) {
      throw new Error("test user is missing an active organization");
    }

    const [inserted] = await insertReadyFile({
      name: "delete-me.png",
      organizationId,
      userId: owner.user.id,
    });
    if (!inserted) {
      throw new Error("fixture insert failed");
    }

    const result = await call(
      appRouter.admin.files.deleteFile,
      { fileId: inserted.id },
      { context: adminContext }
    );

    expect(result.fileId).toBe(inserted.id);
    expect(deletedKeys.keys).toContain(inserted.key);

    const [remaining] = await getTestDb()
      .select()
      .from(file)
      .where(eq(file.id, inserted.id));
    expect(remaining).toBeUndefined();
  });
});
