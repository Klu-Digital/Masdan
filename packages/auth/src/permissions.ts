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
  category: ["create", "read", "update", "archive", "restore"],
  // Example resource, wired up in `@masdan/api`'s storage router. `:any` is the
  // convention for "act on rows you do not own".
  file: ["create", "read", "delete", "delete:any"],
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
    category: ["create", "read", "update", "archive", "restore"],
    file: ["create", "read", "delete", "delete:any"],
  }),
  member: ac.newRole({
    ...memberAc.statements,
    category: ["create", "read", "update"],
    file: ["create", "read", "delete"],
  }),
  owner: ac.newRole({
    ...ownerAc.statements,
    category: ["create", "read", "update", "archive", "restore"],
    file: ["create", "read", "delete", "delete:any"],
  }),
  viewer: ac.newRole({
    ...memberAc.statements,
    category: ["read"],
    file: ["read"],
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
