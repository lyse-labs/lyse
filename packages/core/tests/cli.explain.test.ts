import { describe, it, expect } from "vitest";
import { spawnSync, execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cli = join(__dirname, "../dist/cli.js");

describe("cli explain", () => {
  it("prints rule rationale for a known rule (text format default)", () => {
    const out = execSync(`node ${cli} explain tokens/no-hardcoded-color`, { encoding: "utf8" });
    expect(out).toContain("tokens/no-hardcoded-color");
    expect(out).toContain("Rationale");
    expect(out).toContain("Examples");
    expect(out).toContain("Allowlist");
  });

  it("prints markdown format when --format=md", () => {
    const out = execSync(`node ${cli} explain tokens/no-hardcoded-color --format md`, { encoding: "utf8" });
    expect(out).toContain("# `tokens/no-hardcoded-color`");
    expect(out).toContain("✅ Good");
    expect(out).toContain("❌ Bad");
  });

  it("exits 64 for unknown rule and lists available rules", () => {
    const r = spawnSync("node", [cli, "explain", "not-a-real-rule"], { encoding: "utf8" });
    expect(r.status).toBe(64);
    expect(r.stderr).toContain("Unknown rule");
    expect(r.stderr).toContain("tokens/no-hardcoded-color");
  });

  it("supports all 5 MVP rules", { timeout: 30000 }, () => {
    const expected = [
      "tokens/no-hardcoded-color",
      "tokens/no-hardcoded-spacing",
      "components/no-native-shadows",
      "a11y/essentials",
      "stories/coverage",
    ];
    for (const id of expected) {
      const r = spawnSync("node", [cli, "explain", id], { encoding: "utf8" });
      expect(r.status).toBe(0);
    }
  });
});
