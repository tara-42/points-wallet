import { defineConfig } from "vitest/config";

// Separate from vite.config.ts so tests don't load the Cloudflare and React Router plugins.
export default defineConfig({
  test: {
    include: ["app/**/*.test.ts"],
  },
});
