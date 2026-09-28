import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite-plus";

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
  ],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    port,
    // Puts `pnpm dev` on a deployed stack's topology — same-origin SPA, a proxy
    // forwarding the API prefixes — so CORS and cookie problems do not wait
    // until staging to show up.
    proxy: {
      "/api/auth": { target: apiTarget },
      "/feeds": { target: apiTarget },
      "/rpc": { target: apiTarget },
    },
  },
});
