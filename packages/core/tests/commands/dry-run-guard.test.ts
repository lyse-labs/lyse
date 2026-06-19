import { describe, it, expect } from "vitest";
import { resolveDryRun } from "../../src/commands/dry-run-guard.js";

describe("resolveDryRun — Guard 6 (non-TTY → dry-run)", () => {
  it("defaults to dry-run in a non-TTY context when no flag is given", () => {
    expect(resolveDryRun({ flagPresent: false, flagValue: false, isTTY: false })).toBe(true);
  });

  it("writes (no dry-run) in an interactive TTY when no flag is given", () => {
    expect(resolveDryRun({ flagPresent: false, flagValue: false, isTTY: true })).toBe(false);
  });

  it("honors an explicit --dry-run even in a TTY", () => {
    expect(resolveDryRun({ flagPresent: true, flagValue: true, isTTY: true })).toBe(true);
  });

  it("honors an explicit --no-dry-run even in a non-TTY (CI opt-in to write)", () => {
    expect(resolveDryRun({ flagPresent: true, flagValue: false, isTTY: false })).toBe(false);
  });
});
