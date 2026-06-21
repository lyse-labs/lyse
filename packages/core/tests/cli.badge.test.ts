import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const CLI = join(__dirname, "..", "dist", "cli.js");
const FIX = join(__dirname, "..", "fixtures", "full-ds");

function run(args: string[]): string {
  return execFileSync("node", [CLI, "badge", FIX, ...args], {
    encoding: "utf8",
    env: { ...process.env, LYSE_LLM: "0" },
  });
}

describe("lyse badge (adoption)", () => {
  it("prints a shields.io static badge markdown", () => {
    const out = run([]);
    expect(out).toContain("https://img.shields.io/badge/Lyse-");
  });

  it("--write creates .lyse/badge.json with the endpoint schema", () => {
    const badgePath = join(FIX, ".lyse", "badge.json");
    try {
      run(["--write"]);
      expect(existsSync(badgePath)).toBe(true);
      const json = JSON.parse(require("node:fs").readFileSync(badgePath, "utf8"));
      expect(json.schemaVersion).toBe(1);
      expect(json.label).toBe("Lyse");
      expect(typeof json.message).toBe("string");
    } finally {
      rmSync(join(FIX, ".lyse"), { recursive: true, force: true });
    }
  });
});
