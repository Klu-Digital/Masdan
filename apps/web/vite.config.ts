import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite-plus";
import type { Plugin } from "vite-plus";

const require = createRequire(import.meta.url);
const EMOJIBASE_FILES = ["data", "messages"] as const;

// frimousse defaults to jsDelivr, which the production CSP blocks.
const emojibaseData = (): Plugin => {
  const read = (file: string) =>
    readFileSync(require.resolve(`emojibase-data/en/${file}.json`), "utf-8");
  return {
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
        res.end(read(match.groups.file));
      });
    },
    generateBundle() {
      for (const file of EMOJIBASE_FILES) {
        this.emitFile({
          fileName: `emojibase-data/en/${file}.json`,
          source: read(file),
          type: "asset",
        });
      }
    },
    name: "emojibase-data",
  };
};

const mode = process.env.NODE_ENV ?? "development";
const fileEnv = loadEnv(mode, process.cwd(), "");
const port =
  Number(process.env.WEB_PORT ?? process.env.PORT ?? fileEnv.WEB_PORT) || 2600;
// Must match the port apps/server binds; both come from SERVER_PORT.
const serverPort =
  Number(process.env.SERVER_PORT ?? fileEnv.SERVER_PORT) || 1900;
const apiTarget = `http://localhost:${serverPort}`;

export default defineConfig({
  plugins: [
    tailwindcss(),
    tanstackRouter({
      autoCodeSplitting: true,
      target: "react",
    }),
    react(),
    emojibaseData(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    port,
    // Same-origin like production, so CORS and cookie bugs show up in dev.
    proxy: {
      "/api/auth": { target: apiTarget },
      "/feeds": { target: apiTarget },
      "/rpc": { target: apiTarget },
    },
  },
});
