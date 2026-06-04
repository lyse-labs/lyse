import { describe, expect, it } from "vitest";
import { computeRepoBucket } from "../repo-bucket.js";

describe("repo_bucket HMAC", () => {
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
});
