import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../src/util/git.js", () => ({
  gitHeadSha: vi.fn().mockResolvedValue("no-git"),
  modifiedFilesWithHashes: vi.fn().mockResolvedValue([]),
}));

import { gitInit, gitCommitAll } from "../_helpers/git.js";
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runInit } from "../../src/commands/init.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "lyse-init-"));
  gitInit(dir);
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({
      name: "test",
      version: "1.0.0",
      dependencies: { react: "^18.0.0" },
    }),
  );
  writeFileSync(join(dir, "Sample.tsx"), 'export const S = () => <div>x</div>;');
  gitCommitAll(dir, "init");
});


describe("runInit with --yes", () => {
  it("creates .lyse.yaml", async () => {
    await runInit({ cwd: dir, yes: true, skipNodeCheck: true });
    expect(existsSync(join(dir, ".lyse.yaml"))).toBe(true);
  });

  it("adds .lyse/ to .gitignore", async () => {
    await runInit({ cwd: dir, yes: true, skipNodeCheck: true });
    const gitignore = readFileSync(join(dir, ".gitignore"), "utf8");
    expect(gitignore).toContain(".lyse/");
  });

  it("appends audit event to history", async () => {
    await runInit({ cwd: dir, yes: true, skipNodeCheck: true });
    expect(existsSync(join(dir, ".lyse/history.ndjson"))).toBe(true);
  });

  it("respects existing .lyse.yaml (does not overwrite)", async () => {
    writeFileSync(
      join(dir, ".lyse.yaml"),
      '# Custom config\ndesignSystem:\n  componentsModule: "@org/custom"\n',
    );
    await runInit({ cwd: dir, yes: true, skipNodeCheck: true });
    const yaml = readFileSync(join(dir, ".lyse.yaml"), "utf8");
    expect(yaml).toContain("@org/custom");
  });
});

// Scaffold + token-migration extras moved off `lyse fix` onto `lyse init`
// (`--scaffold` / `--migrate-tokens`) — covered by init-scaffold.test.ts and
// init-migrate-tokens.test.ts. `lyse init` no longer auto-applies codemods;
// code fixes go through `lyse handoff` (the coding agent).

describe("runInit --scaffold writes AI-readiness files", () => {
  let sDir: string;

  beforeEach(() => {
    sDir = mkdtempSync(join(tmpdir(), "lyse-init-scaffold-"));
    gitInit(sDir);
    writeFileSync(join(sDir, "package.json"), JSON.stringify({ name: "@acme/ui", version: "1.0.0" }));
    gitCommitAll(sDir, "init");
  });

  it("generates llms.txt only when --scaffold is passed", async () => {
    await runInit({ cwd: sDir, yes: true, skipNodeCheck: true });
    expect(existsSync(join(sDir, "llms.txt"))).toBe(false);

    await runInit({ cwd: sDir, yes: true, skipNodeCheck: true, scaffold: true });
    expect(existsSync(join(sDir, "llms.txt"))).toBe(true);
    expect(readFileSync(join(sDir, "llms.txt"), "utf8")).toContain("# ui");
  });
});

describe("runInit --migrate-tokens converts legacy token JSON to DTCG", () => {
  let mDir: string;

  beforeEach(() => {
    mDir = mkdtempSync(join(tmpdir(), "lyse-init-migrate-"));
    gitInit(mDir);
    writeFileSync(join(mDir, "package.json"), JSON.stringify({ name: "@acme/ui", version: "1.0.0" }));
  });

  it("migrates { value, type } → { $value, $type } only with the flag", async () => {
    const legacy = JSON.stringify({ color: { primary: { value: "#2563eb", type: "color" } } }, null, 2);
    writeFileSync(join(mDir, "tokens.json"), legacy);
    gitCommitAll(mDir, "fixtures");

    await runInit({ cwd: mDir, yes: true, skipNodeCheck: true });
    expect(readFileSync(join(mDir, "tokens.json"), "utf8")).toBe(legacy);

    await runInit({ cwd: mDir, yes: true, skipNodeCheck: true, migrateTokens: true });
    const out = JSON.parse(readFileSync(join(mDir, "tokens.json"), "utf8"));
    expect(out.color.primary).toEqual({ $value: "#2563eb", $type: "color" });
  });

  it("skips a file that would produce non-conformant DTCG (unitless dimension)", async () => {
    const before = JSON.stringify({ space: { sm: { value: 8, type: "spacing" } } }, null, 2);
    writeFileSync(join(mDir, "tokens.json"), before);
    gitCommitAll(mDir, "fixtures");

    await runInit({ cwd: mDir, yes: true, skipNodeCheck: true, migrateTokens: true });
    expect(readFileSync(join(mDir, "tokens.json"), "utf8")).toBe(before);
  });
});
