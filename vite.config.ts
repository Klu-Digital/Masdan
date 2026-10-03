import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    ignorePatterns: [
      "node_modules/**",
      "**/node_modules/**",
      "apps/demo/dist/**",
      "apps/web/dist/**",
      "apps/web/.tanstack/**",
      "apps/web/src/routeTree.gen.ts",
      "apps/www/dist/**",
      "apps/www/.astro/**",
      "apps/server/dist/**",
      "apps/workers/dist/**",
      "packages/db/dist/**",
      "packages/db/src/migrations/**",
      "packages/observability/dist/**",
    ],
    semi: true,
    singleQuote: false,
    sortPackageJson: true,
  },
  lint: {
    ignorePatterns: [
      "node_modules/**",
      "**/node_modules/**",
      "apps/demo/dist/**",
      "apps/web/dist/**",
      "apps/web/.tanstack/**",
      "apps/web/src/routeTree.gen.ts",
      "apps/www/dist/**",
      "apps/www/.astro/**",
      "apps/server/dist/**",
      "apps/workers/dist/**",
      "packages/db/dist/**",
      "packages/db/src/migrations/**",
      "packages/observability/dist/**",
    ],
    options: {
      typeAware: false,
      typeCheck: false,
    },
  },
  staged: {
    "*.{js,ts,jsx,tsx,vue,svelte,json,jsonc,css,md}": "vp check --fix",
  },
  test: {
    projects: [
      {
        test: {
          environment: "node",
          exclude: ["**/*.db.test.ts", "**/node_modules/**"],
          // Enumerated rather than "apps/*": the web app's tests need jsdom and
          // belong to the "web" project below, not this node one.
          include: [
            "apps/{demo,server,workers,www}/src/**/*.test.ts",
            "packages/*/src/**/*.test.ts",
            "scripts/**/*.test.ts",
          ],
          name: "unit",
          setupFiles: ["./packages/testing/src/setup/env.ts"],
        },
      },
      {
        test: {
          environment: "node",
          globalSetup: [
            "./packages/testing/src/setup/global-postgres.ts",
            "./packages/testing/src/setup/global-redis.ts",
          ],
          hookTimeout: 120_000,
          include: ["{apps,packages}/*/src/**/*.db.test.ts"],
          name: "db",
          setupFiles: ["./packages/testing/src/setup/db.ts"],
          testTimeout: 30_000,
        },
      },
      {
        extends: "./apps/web/vite.config.ts",
        root: "./apps/web",
        test: {
          // "/" is the deployed value, so the tests exercise the same
          // same-origin resolution path production does.
          env: { VITE_SERVER_URL: "/" },
          environment: "jsdom",
          include: ["src/**/*.test.{ts,tsx}"],
          name: "web",
          setupFiles: ["./src/test/setup.ts"],
        },
      },
    ],
  },
});
