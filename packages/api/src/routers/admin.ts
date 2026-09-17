import { featureFlagsPlatformRouter } from "../feature-flags/feature-flags.platform";
import { filesPlatformRouter } from "../files/files.platform";
import { jobsPlatformRouter } from "../jobs/jobs.platform";
import { organizationsPlatformRouter } from "../organizations/organizations.platform";
import { overviewPlatformRouter } from "../overview/overview.platform";
import { sessionsPlatformRouter } from "../sessions/sessions.platform";
import { systemPlatformRouter } from "../system/system.platform";
import { usersPlatformRouter } from "../users/users.platform";

/**
 * The cross-tenant surface, and the reason every module's platform half is
 * named `*.platform.ts`. Procedures here run on `adminProcedure`, which has no
 * `organizationId` in context, so their queries deliberately ignore the tenant
 * boundary the rest of the API enforces. Adding a role never adds a file here —
 * roles are the matrix in `@masdan/auth`'s permissions. User mutations are absent
 * on purpose: better-auth's `admin()` plugin already enforces those, so the web
 * app calls `authClient.admin.*` directly. `procedures-admin-access.db.test.ts`
 * asserts every entry below is gated.
 */
export const adminRouter = {
  featureFlags: featureFlagsPlatformRouter,
  files: filesPlatformRouter,
  jobs: jobsPlatformRouter,
  organizations: organizationsPlatformRouter,
  overview: overviewPlatformRouter,
  sessions: sessionsPlatformRouter,
  system: systemPlatformRouter,
  users: usersPlatformRouter,
};
