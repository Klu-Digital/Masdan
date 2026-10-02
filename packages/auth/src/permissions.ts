import type { Role, Statements } from "better-auth/plugins/access";
import { createAccessControl } from "better-auth/plugins/access";
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";

// Dependency-free: the web client imports this too.
export const statement = {
  ...defaultStatements,
  // `:any` means "act on rows you do not own".
  attachment: ["create", "read", "delete", "delete:any"],
  // The bill calendar. `confirm` covers marking an occurrence paid and undoing
  // it; subscribing to the feed only needs `read`.
  bill: ["read", "confirm"],
  // Monthly category budgets. `update` sets an amount; removing one is
  // permanent, so it is graded like archive.
  budget: ["read", "update", "delete"],
  category: ["create", "read", "update", "archive", "restore"],
  financialAccount: ["create", "read", "update", "archive", "restore"],
  // Recurring schedules. `update` covers edit, pause and resume; stopping is
  // permanent, so it is graded like archive.
  recurringTransaction: ["create", "read", "update", "stop"],
  // Credit-card statement and payment reminders. `dismiss` covers undoing one;
  // a dismissal is household-wide, not per viewer.
  reminder: ["read", "dismiss"],
  // Categorization rules; deleting one is permanent, so it is graded like archive.
  rule: ["create", "read", "update", "delete"],
  // Savings goals. `update` covers edit, complete and reopen.
  savingsGoal: ["create", "read", "update", "archive", "restore"],
  tag: ["create", "read", "update", "archive", "restore"],
  transaction: ["create", "read", "update", "archive", "restore"],
} as const;

export type Statement = typeof statement;

export const ac = createAccessControl(statement);

// better-auth writes `owner` and `member` into `member.role` itself.
export const roles = {
  admin: ac.newRole({
    ...adminAc.statements,
    attachment: ["create", "read", "delete", "delete:any"],
    bill: ["read", "confirm"],
    budget: ["read", "update", "delete"],
    category: ["create", "read", "update", "archive", "restore"],
    financialAccount: ["create", "read", "update", "archive", "restore"],
    recurringTransaction: ["create", "read", "update", "stop"],
    reminder: ["read", "dismiss"],
    rule: ["create", "read", "update", "delete"],
    savingsGoal: ["create", "read", "update", "archive", "restore"],
    tag: ["create", "read", "update", "archive", "restore"],
    transaction: ["create", "read", "update", "archive", "restore"],
  }),
  member: ac.newRole({
    ...memberAc.statements,
    attachment: ["create", "read", "delete"],
    bill: ["read", "confirm"],
    budget: ["read", "update"],
    category: ["create", "read", "update"],
    financialAccount: ["create", "read", "update"],
    recurringTransaction: ["create", "read", "update"],
    reminder: ["read", "dismiss"],
    rule: ["create", "read", "update"],
    savingsGoal: ["create", "read", "update"],
    tag: ["create", "read", "update"],
    transaction: ["create", "read", "update"],
  }),
  owner: ac.newRole({
    ...ownerAc.statements,
    attachment: ["create", "read", "delete", "delete:any"],
    bill: ["read", "confirm"],
    budget: ["read", "update", "delete"],
    category: ["create", "read", "update", "archive", "restore"],
    financialAccount: ["create", "read", "update", "archive", "restore"],
    recurringTransaction: ["create", "read", "update", "stop"],
    reminder: ["read", "dismiss"],
    rule: ["create", "read", "update", "delete"],
    savingsGoal: ["create", "read", "update", "archive", "restore"],
    tag: ["create", "read", "update", "archive", "restore"],
    transaction: ["create", "read", "update", "archive", "restore"],
  }),
  viewer: ac.newRole({
    ...memberAc.statements,
    attachment: ["read"],
    bill: ["read"],
    budget: ["read"],
    category: ["read"],
    financialAccount: ["read"],
    recurringTransaction: ["read"],
    reminder: ["read"],
    rule: ["read"],
    savingsGoal: ["read"],
    tag: ["read"],
    transaction: ["read"],
  }),
};

export type AppRole = keyof typeof roles;

export const APP_ROLES = Object.keys(roles) as AppRole[];

export const isAppRole = (value: string): value is AppRole =>
  Object.hasOwn(roles, value);

/** A request to check, e.g. `{ attachment: ["delete"] }` or `{ member: ["create", "delete"] }`. */
export type PermissionRequest = {
  [K in keyof Statement]?: readonly Statement[K][number][];
};

type AnyRole = Role<Statements, Statement>;

// Split exactly as better-auth does, never trimmed: its owner check misses
// `"member, owner"`, so trimming here would read an owner it never granted.
const rolesOf = (role: string): string[] => role.split(",");

/** Shared by server and client. Comma-separated roles are unioned. */
export const hasPermission = (input: {
  role: string;
  permissions: PermissionRequest;
}): boolean =>
  rolesOf(input.role)
    .filter(isAppRole)
    .some(
      (name) => (roles[name] as AnyRole).authorize(input.permissions).success
    );

// `user.role` from the `admin()` plugin, unrelated to `roles.admin`.
const PLATFORM_ADMIN_ROLE = "admin";

export const isPlatformAdmin = (role?: string | null): boolean =>
  rolesOf(role ?? "").includes(PLATFORM_ADMIN_ROLE);
