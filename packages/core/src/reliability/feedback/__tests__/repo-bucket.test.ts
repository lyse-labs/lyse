import { describe, expect, it } from "vitest";
import { computeRepoBucketFromUrl } from "../../../identity/index.js";

const computeRepoBucket = computeRepoBucketFromUrl;

describe("repo_bucket (feedback path)", () => {
  it("normalizes URL (case, trailing .git)", () => {
    const a = computeRepoBucket("https://github.com/FOO/bar.git", "salt-2026-05-30");
    const b = computeRepoBucket("https://GITHUB.COM/foo/bar", "salt-2026-05-30");
    expect(a).toBe(b);
  });
  it("changes when salt rotates", () => {
    const a = computeRepoBucket("https://github.com/foo/bar.git", "salt-A");
    const b = computeRepoBucket("https://github.com/foo/bar.git", "salt-B");
    expect(a).not.toBe(b);
  });
  it("returns 16-hex prefix", () => {
    expect(computeRepoBucket("https://github.com/foo/bar.git", "s")).toMatch(/^[0-9a-f]{16}$/);
  });

  it("does NOT leak credentials embedded in the remote URL", () => {
    const withToken = computeRepoBucket("https://user:ghp_SECRETTOKEN@github.com/o/r.git", "salt-x");
    const clean = computeRepoBucket("https://github.com/o/r.git", "salt-x");
    expect(withToken).toBe(clean);
  });

  it("uses the canonical identity implementation", () => {
    expect(computeRepoBucket("https://github.com/o/r.git", "salt-x")).toBe(
      computeRepoBucketFromUrl("https://github.com/o/r.git", "salt-x"),
    );
  });
});
