import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Separate from vite.config.ts so tests don't load the Cloudflare and React Router plugins.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./app", import.meta.url)) }, // matches tsconfig "@/*"
  },
  test: {
    include: ["app/**/*.test.ts"],
  },
});
