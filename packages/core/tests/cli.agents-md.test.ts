import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cli = join(__dirname, "../dist/cli.js");
const fixture = join(__dirname, "../fixtures/full-ds");

describe("cli agents-md", () => {
  it("prints AGENTS.md to stdout when no --output", () => {
    const out = execSync(`node ${cli} agents-md ${fixture} --static-only`, { encoding: "utf8" });
    expect(out).toContain("# AGENTS.md");
    expect(out).toContain("Card"); // fixture imports Card from @acme/ui
  });

  it("writes AGENTS.md to --output file", () => {
    const tmp = `/tmp/lyse-agents-md-${Date.now()}.md`;
    execSync(`node ${cli} agents-md ${fixture} --static-only --output ${tmp}`, { encoding: "utf8" });
    expect(existsSync(tmp)).toBe(true);
  });
});
