import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";
import type { Plugin } from "vite-plus";

const web = (path: string) =>
  fileURLToPath(new URL(`../web/${path}`, import.meta.url));
const local = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// apps/web module → its stand-in. Everything else is the real app.
const OVERRIDES: Record<string, string> = {
  "src/components/shell/app-shell.tsx": "src/overrides/app-shell.tsx",
  "src/components/sign-in-form.tsx": "src/overrides/sign-in-form.tsx",
  "src/components/sign-up-form.tsx": "src/overrides/sign-up-form.tsx",
  "src/index.css": "src/index.css",
  "src/lib/auth-client.ts": "src/overrides/auth-client.ts",
  "src/modules/bills/components/feed-section.tsx": "src/overrides/hidden.tsx",
  "src/modules/chat/components/chat-apps-section.tsx":
    "src/overrides/hidden.tsx",
  "src/modules/exports/components/data-export-section.tsx":
    "src/overrides/hidden.tsx",
  "src/modules/imports/components/new-import-page.tsx":
    "src/overrides/new-import-page.tsx",
  "src/modules/transactions/components/transaction-attachments.tsx":
    "src/overrides/hidden.tsx",
  "src/utils/client.ts": "src/backend/client.ts",
};

// By resolved path, so relative and `@/` imports are both caught.
const demoOverrides = (): Plugin => {
  const targets = new Map(
    Object.entries(OVERRIDES).map(([from, to]) => [web(from), local(to)])
  );
  return {
    enforce: "pre",
    name: "demo-overrides",
    async resolveId(source, importer, options) {
      if (!importer) {
        return null;
      }
      const resolved = await this.resolve(source, importer, {
        ...options,
        skipSelf: true,
      });
      const target = resolved && targets.get(resolved.id.split("?")[0] ?? "");
      // A stand-in may wrap the module it replaces.
      if (!target || target === importer.split("?")[0]) {
        return resolved;
      }
      return target;
    },
  };
};

const webRequire = createRequire(web("package.json"));
const EMOJIBASE_FILES = ["data", "messages"] as const;
const emojibase = (file: string) =>
  readFileSync(webRequire.resolve(`emojibase-data/en/${file}.json`), "utf-8");

// Same-origin emoji data, as in apps/web; `_headers` is Cloudflare's header file.
const staticFiles = (): Plugin => ({
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const match =
        /^\/emojibase-data\/en\/(?<file>data|messages)\.json$/u.exec(
          req.url ?? ""
        );
      if (!match?.groups?.file) {
        next();
        return;
      }
      res.setHeader("Content-Type", "application/json");
      res.end(emojibase(match.groups.file));
    });
  },
  generateBundle() {
    for (const file of EMOJIBASE_FILES) {
      this.emitFile({
        fileName: `emojibase-data/en/${file}.json`,
        source: emojibase(file),
        type: "asset",
      });
    }
    this.emitFile({
      fileName: "_headers",
      source: readFileSync(local("headers.txt"), "utf-8"),
      type: "asset",
    });
  },
  name: "demo-static-files",
});

export default defineConfig({
  plugins: [
    demoOverrides(),
    tailwindcss(),
    tanstackRouter({
      autoCodeSplitting: true,
      generatedRouteTree: web("src/routeTree.gen.ts"),
      routesDirectory: web("src/routes"),
      target: "react",
    }),
    react(),
    staticFiles(),
  ],
  publicDir: web("public"),
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    port: Number(process.env.DEMO_PORT) || 2700,
  },
});
