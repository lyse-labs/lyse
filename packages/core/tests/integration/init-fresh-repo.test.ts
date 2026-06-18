/**
 * Integration test: runInit on a fresh temp repo.
 *
 * Spawns a real temp directory, initialises git, writes a package.json
 * with React, then runs runInit({cwd, yes: true, skipNodeCheck: true})
 * and asserts the full filesystem outcome.
 *
 * Layer 4 (LLM augmentation) is mocked out to keep these integration tests
 * focused on filesystem outcomes, not LLM network calls.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../src/llm/connectors/index.js", () => ({
  resolveConnector: vi.fn().mockResolvedValue({
    id: "direct-api-key",
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    hasMarginalCost: true,
    augmentFindings: () => Promise.resolve({ findings: [], tokensConsumed: { input: 0, output: 0 }, usdSpent: 0, modelUsed: "mock", llmQuality: "higher" }),
    estimateCost: () => ({ usd: 0, tokensIn: 0, tokensOut: 0 }),
    ping: () => Promise.resolve({ ok: true }),
  }),
}));
vi.mock("../../src/llm/augmenter.js", () => ({
  Layer4Augmenter: vi.fn().mockImplementation(function () { return ({
    run: vi.fn().mockResolvedValue({ findings: [], cacheHit: false, droppedHallucinations: 0, usdSpent: 0, modelUsed: "mock", llmQuality: "higher" }),
  }); }),
}));
vi.mock("../../src/llm/sampler.js", () => ({
  sampleForAudit: vi.fn().mockResolvedValue({ files: [], totalBytes: 0 }),
  sampleRepoForLlm: vi.fn().mockResolvedValue({ packageJson: {}, directoryTree: "", files: [], totalBytes: 0 }),
  containsSecretPattern: vi.fn().mockReturnValue(false),
}));
vi.mock("../../src/util/git.js", () => ({
  gitHeadSha: vi.fn().mockResolvedValue("no-git"),
  modifiedFilesWithHashes: vi.fn().mockResolvedValue([]),
}));
import { execSync } from "node:child_process";
import { gitCommitAll } from "../_helpers/git.js";
import {
  mkdtempSync,
  writeFileSync,
  existsSync,
  readFileSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runInit } from "../../src/commands/init.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "lyse-int-init-"));
  execSync(
    "git init && git config user.email t@t.com && git config user.name t",
    { cwd: dir, shell: "/bin/sh" },
  );
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({
      name: "test-app",
      version: "1.0.0",
      dependencies: { react: "^18.0.0" },
    }),
  );
  writeFileSync(
    join(dir, "App.tsx"),
    'export const App = () => <div style={{background:"#3B82F6"}}>hello</div>;',
  );
  gitCommitAll(dir, "init");
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("init-fresh-repo integration", () => {
  it(".lyse.yaml is created after runInit", async () => {
    await runInit({ cwd: dir, yes: true, skipNodeCheck: true });
    expect(existsSync(join(dir, ".lyse.yaml"))).toBe(true);
  });

  it(".lyse/history.ndjson is created with at least one audit event", async () => {
    await runInit({ cwd: dir, yes: true, skipNodeCheck: true });
    const histPath = join(dir, ".lyse/history.ndjson");
    expect(existsSync(histPath)).toBe(true);
    const lines = readFileSync(histPath, "utf8").trim().split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    // init writes init_step_completed events (detection, audit, fix, mcp-setup)
    // interleaved with the actual audit event — see commands/init.ts. Don't assume order.
    const auditEvt = lines
      .map((l) => JSON.parse(l))
      .find((e) => e.event_type === "audit");
    expect(auditEvt).toBeDefined();
    expect(typeof auditEvt.score).toBe("number");
  });

  it(".gitignore is updated to contain .lyse/", async () => {
    await runInit({ cwd: dir, yes: true, skipNodeCheck: true });
    const gitignore = readFileSync(join(dir, ".gitignore"), "utf8");
    expect(gitignore).toContain(".lyse/");
  });

  it("appends .lyse/ to an existing .gitignore without clobbering it", async () => {
    writeFileSync(join(dir, ".gitignore"), "node_modules/\n.env\n");
    await runInit({ cwd: dir, yes: true, skipNodeCheck: true });
    const gitignore = readFileSync(join(dir, ".gitignore"), "utf8");
    expect(gitignore).toContain("node_modules/");
    expect(gitignore).toContain(".env");
    expect(gitignore).toContain(".lyse/");
  });

  it("does not overwrite an existing .lyse.yaml", async () => {
    const customYaml = "# My custom config\ndesignSystem:\n  componentsModule: \"@org/ds\"\n";
    writeFileSync(join(dir, ".lyse.yaml"), customYaml);
    await runInit({ cwd: dir, yes: true, skipNodeCheck: true });
    const yaml = readFileSync(join(dir, ".lyse.yaml"), "utf8");
    expect(yaml).toContain("@org/ds");
  });
});

// ---------------------------------------------------------------------------
// Regression: Critical #2 — runInit chains through runMcpSetup
//
// Before the fix, init.ts had stubs that printed "→ MCP setup coming in next task"
// instead of calling the real function. This test asserts the real file is
// created, which would FAIL with the stub.
// ---------------------------------------------------------------------------

describe("runInit chains through mcp-setup (Critical #2 regression)", () => {
  let ciDir: string;

  beforeEach(() => {
    ciDir = mkdtempSync(join(tmpdir(), "lyse-int-init-mcp-"));
    execSync(
      "git init && git config user.email t@t.com && git config user.name t",
      { cwd: ciDir, shell: "/bin/sh" },
    );
    // .cursor directory — triggers the MCP setup branch
    mkdirSync(join(ciDir, ".cursor"), { recursive: true });
    writeFileSync(
      join(ciDir, "package.json"),
      JSON.stringify({
        name: "test-app",
        version: "1.0.0",
        dependencies: { react: "^18.0.0" },
      }),
    );
    gitCommitAll(ciDir, "init");
  });
  afterEach(() => {
    rmSync(ciDir, { recursive: true, force: true });
  });

  it("creates .cursor/mcp.json when .cursor/ directory is present", async () => {
    await runInit({ cwd: ciDir, yes: true, skipNodeCheck: true });
    const mcpPath = join(ciDir, ".cursor/mcp.json");
    expect(existsSync(mcpPath)).toBe(true);
    const cfg = JSON.parse(readFileSync(mcpPath, "utf8"));
    expect(cfg.mcpServers).toBeDefined();
    expect(cfg.mcpServers.lyse).toBeDefined();
  });
});
