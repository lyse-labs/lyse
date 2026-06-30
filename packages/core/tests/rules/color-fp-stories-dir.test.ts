/**
 * TDD guard: __stories__ directory FP class for tokens/no-hardcoded-color.
 *
 * Real harvest: twenty uses `src/__stories__/` — 23 FPs.
 * `__stories__` is a canonical convention (same family as `__tests__` / `__mocks__`).
 *
 * Detection approach (Fix B — general):
 *   `__stories__` added to the `LOW_SIGNAL_FILE_RE` alternation in `_skip-context.ts`.
 *   Files under `src/__stories__/` (or any `__stories__/` segment in the path)
 *   are treated as story/test context where hardcoded values are documentation
 *   artefacts, not DS drift.
 *
 * Recall constraints:
 *   - A real hardcoded color in a normal `src/components/Button.tsx` MUST still flag.
 *   - A real hardcoded color in a `src/stories/` (without double-underscore) file is
 *     covered by the existing `stories/` CSS guard in `COLOR_DEF_FILE_RE`; this test
 *     ensures `__stories__` is separately covered.
 */
import { describe, it, expect } from "vitest";
import { isLowSignalValueFile } from "../../src/rules/_skip-context.js";

describe("isLowSignalValueFile — Fix B: __stories__ directory is low-signal", () => {
  // ── FALSE POSITIVES that must be suppressed ──────────────────────────────────

  it("treats src/__stories__/Foo.stories.tsx as low-signal", () => {
    expect(isLowSignalValueFile("src/__stories__/Foo.stories.tsx")).toBe(true);
  });

  it("treats src/__stories__/Foo.tsx as low-signal (non-.stories extension)", () => {
    expect(isLowSignalValueFile("src/__stories__/Foo.tsx")).toBe(true);
  });

  it("treats packages/ui/src/__stories__/Button.stories.ts as low-signal", () => {
    expect(isLowSignalValueFile("packages/ui/src/__stories__/Button.stories.ts")).toBe(true);
  });

  it("treats deeply nested __stories__ path as low-signal", () => {
    expect(
      isLowSignalValueFile("apps/web/src/components/__stories__/Card.stories.tsx"),
    ).toBe(true);
  });

  // ── Existing guards still work ────────────────────────────────────────────────

  it("still treats __tests__/foo.test.ts as low-signal (existing guard)", () => {
    expect(isLowSignalValueFile("src/__tests__/Button.test.ts")).toBe(true);
  });

  it("still treats __mocks__/api.ts as low-signal (existing guard)", () => {
    expect(isLowSignalValueFile("src/__mocks__/api.ts")).toBe(true);
  });

  it("still treats foo.stories.tsx as low-signal (existing .stories extension guard)", () => {
    expect(isLowSignalValueFile("src/components/Button.stories.tsx")).toBe(true);
  });

  // ── RECALL: normal files must NOT be low-signal ───────────────────────────────

  it("does NOT suppress src/components/Button.tsx (normal component)", () => {
    expect(isLowSignalValueFile("src/components/Button.tsx")).toBe(false);
  });

  it("does NOT suppress src/stories/Button.css (bare stories/ without underscores — handled by COLOR_DEF_FILE_RE, not this guard)", () => {
    // isLowSignalValueFile does not cover stories/ (without __), only __stories__
    // The `stories/` CSS guard is in isColorTokenDefFile — tested separately.
    expect(isLowSignalValueFile("src/stories/Button.css")).toBe(false);
  });

  it("does NOT suppress a file that merely contains 'stories' in its name", () => {
    expect(isLowSignalValueFile("src/components/StoriesShowcase.tsx")).toBe(false);
  });
});
