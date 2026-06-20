import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const CLI = join(__dirname, "..", "dist", "cli.js");
const FIXTURE = join(__dirname, "..", "fixtures", "full-ds");

function run(args: string[], env: Record<string, string> = {}): string {
  return execFileSync("node", [CLI, "audit", FIXTURE, "--format=json", ...args], {
    encoding: "utf8",
    env: { ...process.env, LYSE_LLM: "0", ...env },
  });
}

function help(): string {
  return execFileSync("node", [CLI, "audit", "--help"], { encoding: "utf8" });
}

describe("lyse audit — LLM consent flags (#115)", () => {
  it("declares --llm and --no-llm flags (not silently ignored typos)", () => {
    const h = help();
    expect(h).toContain("--llm");
    expect(h).toContain("--no-llm");
  });

  it("--no-llm produces the deterministic static floor (byte-identical runs)", () => {
    const a = run(["--no-llm"]);
    const b = run(["--no-llm"]);
    expect(a).toBe(b);
  });

  it("accepts --llm without error (non-TTY → connector resolves to Noop anyway)", () => {
    expect(() => run(["--llm"])).not.toThrow();
  });
});
