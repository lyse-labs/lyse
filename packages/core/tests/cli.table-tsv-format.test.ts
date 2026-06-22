import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const CLI = join(__dirname, "..", "dist", "cli.js");
const FIXTURE = join(__dirname, "..", "fixtures", "full-ds");

function run(format: string): string {
  return execFileSync("node", [CLI, "audit", FIXTURE, `--format=${format}`, "--no-color", "--no-prompt"], {
    encoding: "utf8", env: { ...process.env, CI: "true" },
  });
}

describe("lyse audit --format=tsv|table", () => {
  it("tsv emits tab-separated rows and no ANSI", () => {
    const out = run("tsv");
    const dataLines = out.trimEnd().split("\n").filter((l) => l.includes("\t"));
    expect(dataLines.length).toBeGreaterThan(0);
    // eslint-disable-next-line no-control-regex
    expect(/\x1b\[/.test(out)).toBe(false);
    expect(dataLines[0]!.split("\t").length).toBe(7);
  });

  it("table emits a header and findings", () => {
    const out = run("table");
    expect(out).toContain("SEVERITY");
    expect(out).toContain("MESSAGE");
  });
});
