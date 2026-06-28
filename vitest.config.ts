import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    globals: false,
    passWithNoTests: true,
    testTimeout: 15_000,
  },
});
