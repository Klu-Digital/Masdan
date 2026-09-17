import { expoClient } from "@better-auth/expo/client";
import { ac, roles } from "@masdan/auth/permissions";
import { env } from "@masdan/env/native";
import { adminClient, organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

export const authClient = createAuthClient({
  baseURL: env.EXPO_PUBLIC_SERVER_URL,
  plugins: [
    expoClient({
      scheme: Constants.expoConfig?.scheme as string,
      storage: SecureStore,
      storagePrefix: Constants.expoConfig?.scheme as string,
    }),
    // Same `ac` and `roles` the server enforces with — see apps/web equivalent.
    adminClient(),
    organizationClient({ ac, roles }),
  ],
});
