import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cli = join(__dirname, "../dist/cli.js");
const fixture = join(__dirname, "../fixtures/full-ds");
// `full-ds` (above) has no token registry — its manifest tokens are always
// empty, which would make a "real tokens render" assertion pass vacuously.
// `tokens-ds` carries one real DTCG color token so the assertion is honest.
const fixtureWithTokens = join(__dirname, "../fixtures/tokens-ds");

describe("cli agents-md", () => {
  it("prints AGENTS.md to stdout when no --output", () => {
    const out = execSync(`node ${cli} agents-md ${fixture} --static-only`, { encoding: "utf8" });
    expect(out).toContain("# AGENTS.md");
    expect(out).toContain("Card"); // fixture imports Card from @acme/ui
  });

  it("writes AGENTS.md to --output file", () => {
    // Use the real OS temp dir, not a hardcoded "/tmp": on Windows that resolves
    // to D:\tmp, which need not exist, and the write fails with ENOENT.
    const tmp = join(mkdtempSync(join(tmpdir(), "lyse-agents-md-")), "AGENTS.md");
    execSync(`node ${cli} agents-md ${fixture} --static-only --output ${tmp}`, { encoding: "utf8" });
    expect(existsSync(tmp)).toBe(true);
  });

  it("emits real token ids from the graph, not just a namespace placeholder", () => {
    const out = execSync(`node ${cli} agents ${fixtureWithTokens} --static-only`, { encoding: "utf8" });
    // `tokens-ds` declares exactly one DTCG token — color.brand.primary: #3b82f6
    // (see fixtures/tokens-ds/design.tokens.json) — so both its resolved id and
    // its value must appear verbatim. A namespace-placeholder template (the old
    // static output) could never produce either string.
    expect(out).toContain("`color/brand/primary` → `#3b82f6`");
    expect(out).not.toContain("color/*");
  });
});
