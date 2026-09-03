import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    environmentMatchGlobs: [
      ["test/**/*.test.tsx", "jsdom"],
    ],
    include: ["test/**/*.test.ts", "test/**/*.test.tsx", "db/ts/test/**/*.test.ts"],
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@nexus/db": path.resolve(__dirname, "./db/ts/src/index.ts"),
    },
  },
});
