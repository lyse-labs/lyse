import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // `scripts/**` too: `scripts/oracle-verdict.test.ts` pins "not measured is
    // not a pass" for the real-repo oracle, and it had never executed anywhere.
    // `pnpm test` is `pnpm -r test`, which skips the workspace root, so this
    // config was only ever reachable by running vitest here by hand.
    include: ["tests/**/*.test.ts", "scripts/**/*.test.ts"],
    globals: false,
    passWithNoTests: true,
    testTimeout: 15_000,
  },
});
