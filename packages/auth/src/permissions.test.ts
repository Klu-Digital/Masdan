import { describe, expect, it } from "vite-plus/test";

import {
  APP_ROLES,
  hasPermission,
  isAppRole,
  isPlatformAdmin,
  roles,
  statement,
} from "./permissions";

describe("statement", () => {
  it("keeps better-auth's own resources so the plugin's endpoints stay gated", () => {
    // Dropping these (by not spreading `defaultStatements`) silently strips
    // owners of the ability to invite members or delete their organization.
    for (const resource of ["organization", "member", "invitation"] as const) {
      expect(statement[resource].length).toBeGreaterThan(0);
    }
  });
});

const canRule = (
  role: string,
  action: "create" | "read" | "update" | "delete"
): boolean => hasPermission({ permissions: { rule: [action] }, role });

const canSchedule = (
  role: string,
  action: "create" | "read" | "update" | "stop"
): boolean =>
  hasPermission({ permissions: { recurringTransaction: [action] }, role });

describe("roles", () => {
  it("defines the two names better-auth writes into member.role on its own", () => {
    expect(APP_ROLES).toContain("owner");
    expect(APP_ROLES).toContain("member");
  });

  it("lets an owner manage the organization but not a plain member", () => {
    expect(
      hasPermission({
        permissions: { organization: ["delete"] },
        role: "owner",
      })
    ).toBe(true);
    expect(
      hasPermission({
        permissions: { organization: ["delete"] },
        role: "member",
      })
    ).toBe(false);
  });

  it("grades category access across the household roles", () => {
    expect(
      hasPermission({
        permissions: { category: ["archive"] },
        role: "owner",
      })
    ).toBe(true);
    expect(
      hasPermission({
        permissions: { category: ["update"] },
        role: "member",
      })
    ).toBe(true);
    expect(
      hasPermission({
        permissions: { category: ["archive"] },
        role: "member",
      })
    ).toBe(false);
    expect(
      hasPermission({
        permissions: { category: ["read"] },
        role: "viewer",
      })
    ).toBe(true);
    expect(
      hasPermission({
        permissions: { category: ["create"] },
        role: "viewer",
      })
    ).toBe(false);
  });

  it("grades transaction access across the household roles", () => {
    expect(
      hasPermission({
        permissions: { transaction: ["archive"] },
        role: "owner",
      })
    ).toBe(true);
    expect(
      hasPermission({
        permissions: { transaction: ["update"] },
        role: "member",
      })
    ).toBe(true);
    expect(
      hasPermission({
        permissions: { transaction: ["archive"] },
        role: "member",
      })
    ).toBe(false);
    expect(
      hasPermission({
        permissions: { transaction: ["read"] },
        role: "viewer",
      })
    ).toBe(true);
    expect(
      hasPermission({
        permissions: { transaction: ["create"] },
        role: "viewer",
      })
    ).toBe(false);
  });

  it("grades categorization rule access across the household roles", () => {
    expect(canRule("owner", "delete")).toBe(true);
    expect(canRule("admin", "delete")).toBe(true);
    expect(canRule("member", "update")).toBe(true);
    expect(canRule("member", "delete")).toBe(false);
    expect(canRule("viewer", "read")).toBe(true);
    expect(canRule("viewer", "create")).toBe(false);
  });

  it("grades recurring schedule access across the household roles", () => {
    expect(canSchedule("owner", "stop")).toBe(true);
    expect(canSchedule("admin", "stop")).toBe(true);
    expect(canSchedule("member", "update")).toBe(true);
    expect(canSchedule("member", "stop")).toBe(false);
    expect(canSchedule("viewer", "read")).toBe(true);
    expect(canSchedule("viewer", "create")).toBe(false);
  });

  it("grades file access across the ladder", () => {
    expect(
      hasPermission({ permissions: { file: ["read"] }, role: "viewer" })
    ).toBe(true);
    expect(
      hasPermission({ permissions: { file: ["create"] }, role: "viewer" })
    ).toBe(false);

    expect(
      hasPermission({ permissions: { file: ["delete"] }, role: "member" })
    ).toBe(true);
    // A member may delete their own files; reaching someone else's needs `:any`.
    expect(
      hasPermission({ permissions: { file: ["delete:any"] }, role: "member" })
    ).toBe(false);
    expect(
      hasPermission({ permissions: { file: ["delete:any"] }, role: "admin" })
    ).toBe(true);
  });
});

describe("hasPermission", () => {
  it("ANDs every action listed for a resource", () => {
    expect(
      hasPermission({
        permissions: { file: ["read", "create"] },
        role: "member",
      })
    ).toBe(true);
    expect(
      hasPermission({
        permissions: { file: ["read", "create"] },
        role: "viewer",
      })
    ).toBe(false);
  });

  it("unions grants across a comma-separated role list", () => {
    // better-auth stores multiple roles this way; `parseRoles` joins them.
    expect(
      hasPermission({
        permissions: { file: ["delete:any"] },
        role: "viewer,admin",
      })
    ).toBe(true);
  });

  it("denies an unknown role rather than throwing", () => {
    expect(isAppRole("auditor")).toBe(false);
    expect(
      hasPermission({ permissions: { file: ["read"] }, role: "auditor" })
    ).toBe(false);
    // ...including when it sits alongside a real one.
    expect(
      hasPermission({ permissions: { file: ["read"] }, role: "auditor,viewer" })
    ).toBe(true);
  });

  it("fails closed on an empty request, even for an owner", () => {
    // `authorize` needs at least one resource to match, so
    // `requirePermission({})` denies — a check emptied out by a refactor locks
    // the route rather than opening it.
    expect(
      Object.keys(roles).some((role) =>
        hasPermission({ permissions: {}, role })
      )
    ).toBe(false);
    expect(hasPermission({ permissions: { file: [] }, role: "owner" })).toBe(
      false
    );
  });

  it("denies a resource the role has no statement for at all", () => {
    expect(
      hasPermission({ permissions: { team: ["create"] }, role: "viewer" })
    ).toBe(false);
  });
});

describe("isPlatformAdmin", () => {
  it("recognizes the global admin role on user.role", () => {
    expect(isPlatformAdmin("admin")).toBe(true);
  });

  it("unions across better-auth's comma-separated role storage", () => {
    expect(isPlatformAdmin("member,admin")).toBe(true);
    expect(isPlatformAdmin("admin,member")).toBe(true);
  });

  it("treats missing or empty role as not a platform admin", () => {
    expect(isPlatformAdmin(null)).toBe(false);
    expect(isPlatformAdmin()).toBe(false);
    expect(isPlatformAdmin("")).toBe(false);
  });

  it("does not fuzzy-match a role name that merely contains admin", () => {
    expect(isPlatformAdmin("administrator")).toBe(false);
  });
});
