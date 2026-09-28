import type { Role, Statements } from "better-auth/plugins/access";
import { createAccessControl } from "better-auth/plugins/access";
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";

/**
 * Spreading `defaultStatements` keeps better-auth's own endpoints gated. Keep
 * this file dependency-free: the web and native clients import it too.
 */
export const statement = {
  ...defaultStatements,
  // The bill calendar. `confirm` covers marking an occurrence paid and undoing
  // it; subscribing to the feed only needs `read`.
  bill: ["read", "confirm"],
  // Monthly category budgets. `update` sets an amount; removing one is
  // permanent, so it is graded like archive.
  budget: ["read", "update", "delete"],
  category: ["create", "read", "update", "archive", "restore"],
  // Example resource, wired up in `@masdan/api`'s storage router. `:any` is the
  // convention for "act on rows you do not own".
  file: ["create", "read", "delete", "delete:any"],
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

/**
 * Each role is a subset of `statement`, checked at compile time. `owner` and
 * `member` must exist — better-auth writes those two names into `member.role`
 * itself.
 */
export const roles = {
  admin: ac.newRole({
    ...adminAc.statements,
    bill: ["read", "confirm"],
    budget: ["read", "update", "delete"],
    category: ["create", "read", "update", "archive", "restore"],
    file: ["create", "read", "delete", "delete:any"],
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
    bill: ["read", "confirm"],
    budget: ["read", "update"],
    category: ["create", "read", "update"],
    file: ["create", "read", "delete"],
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
    bill: ["read", "confirm"],
    budget: ["read", "update", "delete"],
    category: ["create", "read", "update", "archive", "restore"],
    file: ["create", "read", "delete", "delete:any"],
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
    bill: ["read"],
    budget: ["read"],
    category: ["read"],
    file: ["read"],
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

/** A request to check, e.g. `{ file: ["delete"] }` or `{ member: ["create", "delete"] }`. */
export type PermissionRequest = {
  [K in keyof Statement]?: readonly Statement[K][number][];
};

type AnyRole = Role<Statements, Statement>;

/**
 * Pure set math, used unchanged to enforce on the server and to render on the
 * client. `role` is the raw `member.role`; better-auth comma-separates
 * multiples and grants are unioned.
 */
export const hasPermission = (input: {
  role: string;
  permissions: PermissionRequest;
}): boolean =>
  input.role
    .split(",")
    .map((name) => name.trim())
    .filter(isAppRole)
    .some(
      (name) => (roles[name] as AnyRole).authorize(input.permissions).success
    );

/**
 * The global back-office role from better-auth's `admin()` plugin, stored on
 * `user.role` — unrelated to `roles.admin` above, which is an organization
 * membership role that happens to share the name.
 */
export const PLATFORM_ADMIN_ROLE = "admin";

export const isPlatformAdmin = (role: string | null | undefined): boolean =>
  (role ?? "")
    .split(",")
    .map((name) => name.trim())
    .includes(PLATFORM_ADMIN_ROLE);
