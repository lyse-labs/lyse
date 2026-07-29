import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { walk } from "../src/walker.js";

// fast-glob's underlying directory traversal reads sibling directories
// concurrently for performance, so the ORDER of the array it resolves with
// depends on filesystem I/O completion timing — not on anything sort-like.
// That's invisible on tiny fixtures (too little concurrency to race) but
// real on real repos (confirmed on .bench-corpus/paste: same process,
// repeated calls returned the same 1491 files in a different order). A real
// fixture can't reliably force that race in a fast, deterministic unit
// test, so this pins the actual contract instead: mock fast-glob's
// resolution to a deliberately unsorted order and assert `walk()`
// normalizes it.
//
// This lives in its own file, separate from tests/walker.test.ts, because
// `vi.mock` is file-scoped in vitest — sharing a file with that suite's
// real-filesystem exclusion tests would silently swap their real fast-glob
// calls for this mock too.
const { mockMatches } = vi.hoisted(() => ({
  mockMatches: [
    "/repo/packages/zeta/Zeta.tsx",
    "/repo/packages/alpha/Alpha.tsx",
    "/repo/packages/mu/Mu.tsx",
    "/repo/packages/alpha/Beta.tsx",
  ],
}));

vi.mock("fast-glob", () => ({
  // Return a FRESH copy each call: `walk()` sorts in place, so handing back
  // the shared `mockMatches` reference would let the first call's sort
  // mutate the fixture out from under later assertions/tests.
  default: vi.fn(async () => [...mockMatches]),
}));

describe("walk — deterministic ordering", () => {
  it("returns a deterministic (sorted) order regardless of the order fast-glob resolves matches in", async () => {
    const result = await walk("/repo", {});
    expect(result).toEqual([...mockMatches].sort());
    // Guards against a vacuous pass: the mock's order must actually be
    // non-sorted going in, or the assertion above wouldn't prove reordering.
    expect(mockMatches).not.toEqual([...mockMatches].sort());
  });

  it("returns the same SET of files fast-glob returned — sorting must not drop or duplicate entries", async () => {
    const result = await walk("/repo", {});
    expect(new Set(result)).toEqual(new Set(mockMatches));
    expect(result).toHaveLength(mockMatches.length);
  });
});

describe("walk — deterministic ordering (real filesystem)", () => {
  it("is deterministic across repeated calls against a real directory tree", async () => {
    const root = mkdtempSync(join(tmpdir(), "lyse-walker-det-"));
    mkdirSync(join(root, "packages", "zeta"), { recursive: true });
    mkdirSync(join(root, "packages", "alpha"), { recursive: true });
    writeFileSync(join(root, "packages", "zeta", "Zeta.tsx"), "export function Zeta() { return null; }");
    writeFileSync(join(root, "packages", "alpha", "Alpha.tsx"), "export function Alpha() { return null; }");
    writeFileSync(join(root, "packages", "alpha", "Beta.tsx"), "export function Beta() { return null; }");

    const [run1, run2, run3] = await Promise.all([walk(root, {}), walk(root, {}), walk(root, {})]);

    expect(run2).toEqual(run1);
    expect(run3).toEqual(run1);
    expect(run1).toEqual([...run1].sort());
  });
});
