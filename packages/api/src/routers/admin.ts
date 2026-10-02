import { aiPlatformRouter } from "../ai/ai.platform";
import { featureFlagsPlatformRouter } from "../feature-flags/feature-flags.platform";
import { filesPlatformRouter } from "../files/files.platform";
import { jobsPlatformRouter } from "../jobs/jobs.platform";
import { organizationsPlatformRouter } from "../organizations/organizations.platform";
import { overviewPlatformRouter } from "../overview/overview.platform";
import { sessionsPlatformRouter } from "../sessions/sessions.platform";
import { systemPlatformRouter } from "../system/system.platform";
import { usersPlatformRouter } from "../users/users.platform";

// The cross-tenant surface: procedures here ignore `organizationId`.
export const adminRouter = {
  ai: aiPlatformRouter,
  featureFlags: featureFlagsPlatformRouter,
  files: filesPlatformRouter,
  jobs: jobsPlatformRouter,
  organizations: organizationsPlatformRouter,
  overview: overviewPlatformRouter,
  sessions: sessionsPlatformRouter,
  system: systemPlatformRouter,
  users: usersPlatformRouter,
};
