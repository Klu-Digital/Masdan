import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";

export default defineConfig({
  extends: [core, react],
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    // The runner's `FILENAME_PATTERN` requires `<timestamp>_<snake_name>.ts`,
    // which `unicorn/filename-case` rejects as non-kebab.
    "packages/db/src/post-migration-scripts/*.ts",
  ],
  // Loaded through oxlint's JS plugin API, still alpha — if an oxlint bump breaks
  // it, dropping this line disables every `shadcn/*` rule below at once.
  jsPlugins: ["@shadcn/lint"],
  overrides: [
    {
      // Routers are transport: shared logic lives in `*.queries.ts` and
      // `*.commands.ts`, so a router importing a router is how cycles start.
      files: ["packages/api/src/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                message:
                  "Only routers/index.ts and routers/admin.ts mount routers. Import the feature's *.queries or *.commands module instead.",
                regex: String.raw`\.router$`,
              },
            ],
          },
        ],
      },
    },
    {
      // The mount points, and tests, which call procedures through a router.
      files: ["packages/api/src/routers/*.ts", "packages/api/src/**/*.test.ts"],
      rules: { "no-restricted-imports": "off" },
    },
    {
      // packages/ui *is* the design system, so its own source may style itself and
      // reach for structural one-offs like `px-[calc(--spacing(3)-1px)]` that no
      // token can express. src/** rather than src/components/**, because
      // `src/lib/segmented-control.ts` is component source in all but location.
      // `no-raw-colors` and `no-inline-styles` stay on: even a primitive should
      // take its colors from the theme.
      files: ["packages/ui/src/**"],
      rules: {
        "shadcn/no-arbitrary-values": "off",
        "shadcn/no-restyle": "off",
        "shadcn/require-static-classes": "off",
      },
    },
  ],
  rules: {
    // Plenty of our loops are deliberately sequential — ordered migrations,
    // retry backoff, cursor walks — where the rule's suggested fix is a bug.
    "no-await-in-loop": "off",
    // Base UI and the calendar take components as props (`render`, `components`),
    // which is exactly what the rule's escape hatch is for.
    "react/no-unstable-nested-components": ["error", { allowAsProps: true }],
    "shadcn/no-arbitrary-values": ["error", { allow: ["layout"] }],
    "shadcn/no-inline-styles": "error",
    "shadcn/no-raw-colors": "error",
    "shadcn/no-restyle": ["error", { allow: ["layout"] }],
    "shadcn/no-unknown-classes": "error",
    "shadcn/require-static-classes": "error",
  },
});
