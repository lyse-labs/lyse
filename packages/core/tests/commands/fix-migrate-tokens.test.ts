import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { git, gitInit, gitCommitAll } from "../_helpers/git.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runFix } from "../../src/commands/fix.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "lyse-fix-migrate-"));
  gitInit(dir);
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "@acme/ui", version: "1.0.0" }));
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

function commitAll(): void {
  gitCommitAll(dir, "fixtures");
}

describe("runFix --migrate-tokens", () => {
  it("migrates a legacy { value, type } tokens.json to DTCG and commits it", async () => {
    writeFileSync(
      join(dir, "tokens.json"),
      JSON.stringify({ color: { primary: { value: "#2563eb", type: "color" } } }, null, 2),
    );
    commitAll();

    const r = await runFix({ cwd: dir, migrateTokens: true, autoApprove: true });
    expect(r.migratedTokens).toContain("tokens.json");

    const out = JSON.parse(readFileSync(join(dir, "tokens.json"), "utf8"));
    expect(out.color.primary).toEqual({ $value: "#2563eb", $type: "color" });

    expect(git(dir, ["status", "--porcelain"])).toBe("");
    expect(git(dir, ["log", "--oneline"])).toMatch(/migrate \d+ token file/);
  });

  it("dry-run reports the path but writes nothing", async () => {
    const before = JSON.stringify({ space: { sm: { value: "8px", type: "spacing" } } }, null, 2);
    writeFileSync(join(dir, "tokens.json"), before);
    commitAll();

    const r = await runFix({ cwd: dir, migrateTokens: true, dryRun: true, autoApprove: true });
    expect(r.migratedTokens).toContain("tokens.json");
    expect(readFileSync(join(dir, "tokens.json"), "utf8")).toBe(before);
  });

  it("is idempotent — a second run migrates nothing (already DTCG)", async () => {
    writeFileSync(
      join(dir, "tokens.json"),
      JSON.stringify({ color: { primary: { value: "#2563eb", type: "color" } } }, null, 2),
    );
    commitAll();
    await runFix({ cwd: dir, migrateTokens: true, autoApprove: true });
    const r2 = await runFix({ cwd: dir, migrateTokens: true, autoApprove: true });
    expect(r2.migratedTokens).toHaveLength(0);
  });

  it("skips a file that would produce non-conformant DTCG (unitless dimension) — never writes broken output", async () => {
    const before = JSON.stringify({ space: { sm: { value: 8, type: "spacing" } } }, null, 2);
    writeFileSync(join(dir, "tokens.json"), before);
    commitAll();

    const r = await runFix({ cwd: dir, migrateTokens: true, autoApprove: true });
    expect(r.migratedTokens).toHaveLength(0);
    expect(readFileSync(join(dir, "tokens.json"), "utf8")).toBe(before);
  });

  it("does not migrate when --migrate-tokens is absent", async () => {
    writeFileSync(
      join(dir, "tokens.json"),
      JSON.stringify({ color: { primary: { value: "#000", type: "color" } } }, null, 2),
    );
    commitAll();
    const r = await runFix({ cwd: dir, autoApprove: true });
    expect(r.migratedTokens).toHaveLength(0);
  });
});
