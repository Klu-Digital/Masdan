import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  deps: {
    alwaysBundle: [/@masdan\/.*/u],
  },
  // The admin CLIs ride along because the runtime image has no tsx: they are
  // the recovery path for a locked-out production admin.
  entry: {
    "admin/grant": "../../packages/db/src/dev-scripts/grant-admin/cli.ts",
    "admin/reset-password":
      "../../packages/db/src/dev-scripts/reset-password/cli.ts",
    index: "./src/index.ts",
  },
  format: "esm",
  outDir: "./dist",
});
