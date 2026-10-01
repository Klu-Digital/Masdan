import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
  output: "static",
  server: { port: 2700 },
  vite: { plugins: [tailwindcss()] },
});
