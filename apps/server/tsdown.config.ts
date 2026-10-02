import { scanPostMigrationFiles } from "@masdan/db/dev-scripts/post-migrate/discover";
import { defineConfig } from "tsdown";

const POST_MIGRATIONS_ID = "virtual:post-migration-scripts";

// Bundles the post-migration scripts, since the runtime image can't discover them.
const postMigrationScripts = {
  async load(id: string) {
    if (id !== `\0${POST_MIGRATIONS_ID}`) {
      return null;
    }
    const files = await scanPostMigrationFiles();
    const imports = files.map(
      (file, i) => `import s${i} from ${JSON.stringify(file.path)};`
    );
    const entries = files.map(
      (file, i) =>
        `{ name: ${JSON.stringify(file.name)}, path: ${JSON.stringify(file.path)}, checksum: ${JSON.stringify(file.checksum)}, definition: s${i} }`
    );
    return `${imports.join("\n")}\nexport default [${entries.join(", ")}];`;
  },
  name: "masdan:post-migration-scripts",
  resolveId(id: string) {
    return id === POST_MIGRATIONS_ID ? `\0${POST_MIGRATIONS_ID}` : null;
  },
};

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
    start: "./src/start.ts",
  },
  format: "esm",
  outDir: "./dist",
  plugins: [postMigrationScripts],
});
