import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, rmSync, readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(__dirname, "..", "dist", "cli.js");
const FIX = join(__dirname, "..", "fixtures", "full-ds");

describe("lyse audit --format=html (#207)", () => {
  it("prints a self-contained HTML document with the score", () => {
    const out = execFileSync("node", [CLI, "audit", FIX, "--format=html"], {
      encoding: "utf8",
      env: { ...process.env, LYSE_LLM: "0" },
    });
    expect(out.toLowerCase()).toContain("<!doctype html");
    expect(out).toContain("Health Score");
  });

  it("--output writes lyse.html", () => {
    const out = mkdtempSync(join(tmpdir(), "lyse-html-"));
    try {
      execFileSync("node", [CLI, "audit", FIX, "--format=html", "--output", out], {
        encoding: "utf8",
        env: { ...process.env, LYSE_LLM: "0" },
      });
      const f = join(out, "lyse.html");
      expect(existsSync(f)).toBe(true);
      expect(readFileSync(f, "utf8").toLowerCase()).toContain("<!doctype html");
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});
