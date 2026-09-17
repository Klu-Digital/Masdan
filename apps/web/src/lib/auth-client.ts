import { ac, roles } from "@masdan/auth/permissions";
import { env } from "@masdan/env/web";
import { adminClient, organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { getServerUrl } from "@/lib/server-url";

export const authClient = createAuthClient({
  // better-auth derives its route-matching base from this URL's path, so the
  // public auth path must equal the server-side mount (/api/auth everywhere)
  baseURL: new URL("/api/auth", getServerUrl(env.VITE_SERVER_URL)).toString(),
  // Same `ac` and `roles` the server enforces with. Rendering decisions only.
  plugins: [adminClient(), organizationClient({ ac, roles })],
});
