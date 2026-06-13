import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    globals: false,
    passWithNoTests: true,
    coverage: { provider: "v8" },
    // 15s buffer absorbs vitest 4 warmup + cli.explain 5-MVP-rules test under serial pnpm scheduling. See CHANGELOG entry for vitest 4 upgrade.
    testTimeout: 15_000,
    setupFiles: ["./tests/setup/no-agent-autodetect.ts"],
  },
});
