import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cli = join(__dirname, "../dist/cli.js");

describe("cli version", () => {
  it("prints version info", () => {
    const out = execSync(`node ${cli} version`, { encoding: "utf8" });
    expect(out).toContain("lyse");
    expect(out).toContain("rules ");
    expect(out).toContain("schema-versions:");
  });
});
