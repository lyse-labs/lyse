import { describe, it, expect } from "vitest";
import { containsLikelySecret } from "../secret-scan.js";

describe("containsLikelySecret", () => {
  it("flags high-confidence secret shapes", () => {
    expect(containsLikelySecret("-----BEGIN RSA PRIVATE KEY-----")).toBe(true);
    expect(containsLikelySecret('const k = "AKIA0000000000000000";')).toBe(true);
    expect(containsLikelySecret("OPENAI=sk-abcdefghijklmnopqrstuvwxyz0123")).toBe(true);
    expect(containsLikelySecret("ghp_0123456789012345678901234567890123456789")).toBe(true);
    expect(containsLikelySecret("xoxb-0123456789-abcdEFGH")).toBe(true);
    expect(containsLikelySecret(`api_key: "s3cr3tValue0123456789"`)).toBe(true);
    expect(containsLikelySecret(`password = 'hunter2hunter2hunter2'`)).toBe(true);
  });

  it("does not flag ordinary design-system source", () => {
    expect(containsLikelySecret("const color = '#ff0000';")).toBe(false);
    expect(containsLikelySecret("export const Button = () => null;")).toBe(false);
    expect(containsLikelySecret("const token = theme.colors.primary;")).toBe(false);
    expect(containsLikelySecret("margin: 16px;")).toBe(false);
    // short quoted value after `key:` is below the 16-char threshold
    expect(containsLikelySecret(`api_key: "short"`)).toBe(false);
  });
});
