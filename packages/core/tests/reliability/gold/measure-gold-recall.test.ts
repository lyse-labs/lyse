import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { measureGoldRecall } from "../../../src/reliability/gold/measure-gold-recall.js";
import { detectFromPackageJson } from "../../../src/detection/from-package-json.js";
import { auditDirectory } from "../../../src/commands/audit-pipeline.js";
import { colorEquals } from "../../../src/reliability/gold/color-eq.js";
import type { GoldLabel } from "../../../src/reliability/gold/types.js";

const CARD_CSS_PATH = "src/components/Card.css";
const TOKENS_CSS_PATH = "src/tokens.css";
const DS_UI_CSS_PATH = "packages/ui/src/components/Card.css";
const DS_LITERAL = "#3b82f6";

interface Repo {
  dir: string;
  commit: string;
  parent: string;
  branch: string;
}

let repo: Repo;
let dsRepo: Repo;

function run(args: string[]): string {
  return execFileSync("git", args, { cwd: repo.dir }).toString().trim();
}

function runInDs(args: string[]): string {
  return execFileSync("git", args, { cwd: dsRepo.dir }).toString().trim();
}

beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), "gold-measure-recall-"));
  const runIn = (args: string[]): string => execFileSync("git", args, { cwd: dir }).toString().trim();

  runIn(["init", "-q"]);
  runIn(["config", "user.email", "t@t"]);
  runIn(["config", "user.name", "t"]);
  runIn(["config", "commit.gpgsign", "false"]);

  // Ensure src/ and src/components/ exist before writing into them.
  mkdirSync(join(dir, "src/components"), { recursive: true });

  writeFileSync(join(dir, TOKENS_CSS_PATH), ":root {\n  --brand: #3b82f6;\n}\n", "utf8");
  writeFileSync(join(dir, CARD_CSS_PATH), ".card {\n  color: #3b82f6;\n}\n", "utf8");
  runIn(["add", "."]);
  runIn(["commit", "-qm", "parent: hardcoded color"]);
  const parent = runIn(["rev-parse", "HEAD"]);

  writeFileSync(join(dir, CARD_CSS_PATH), ".card {\n  color: var(--brand);\n}\n", "utf8");
  runIn(["add", "."]);
  runIn(["commit", "-qm", "child: tokenize color"]);
  const commit = runIn(["rev-parse", "HEAD"]);

  const branch = runIn(["symbolic-ref", "--short", "HEAD"]);

  repo = { dir, commit, parent, branch };
});

afterAll(() => {
  rmSync(repo.dir, { recursive: true, force: true });
});

// Second fixture: a private workspace monorepo whose root package.json
// resolves (via `detectFromPackageJson`'s Branch 3 workspace walk) to a
// `componentsModule.source` starting with "workspace DS export" — the ONLY
// condition that makes `dsSelfMode` true in `audit-pipeline.ts`. Real DS repos
// (primer/css, canvas-kit) are shaped like this; the plain-package fixture
// above is not, so it can never exercise the zoning override at all.
beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), "gold-measure-recall-ds-"));
  const runIn = (args: string[]): string => execFileSync("git", args, { cwd: dir }).toString().trim();

  runIn(["init", "-q"]);
  runIn(["config", "user.email", "t@t"]);
  runIn(["config", "user.name", "t"]);
  runIn(["config", "commit.gpgsign", "false"]);

  mkdirSync(join(dir, "packages/ui/src/components"), { recursive: true });

  // Private + workspaces at root is required for Branch 3 (`detectWorkspaceDsPackage`)
  // to run at all.
  writeFileSync(
    join(dir, "package.json"),
    `${JSON.stringify({ name: "gold-ds-fixture-monorepo", private: true, workspaces: ["packages/*"] }, null, 2)}\n`,
    "utf8",
  );
  // Workspace member name matches `DS_EXPORT_RE` in from-package-json.ts
  // (`@<scope>/ui`) — this is what makes the detected source string start
  // with "workspace DS export".
  writeFileSync(
    join(dir, "packages/ui/package.json"),
    `${JSON.stringify({ name: "@acme/ui", version: "0.0.0" }, null, 2)}\n`,
    "utf8",
  );

  writeFileSync(join(dir, DS_UI_CSS_PATH), `.card {\n  color: ${DS_LITERAL};\n}\n`, "utf8");
  runIn(["add", "."]);
  runIn(["commit", "-qm", "parent: hardcoded color in DS-shaped repo"]);
  const parent = runIn(["rev-parse", "HEAD"]);

  writeFileSync(join(dir, DS_UI_CSS_PATH), ".card {\n  color: var(--brand);\n}\n", "utf8");
  runIn(["add", "."]);
  runIn(["commit", "-qm", "child: tokenize color"]);
  const commit = runIn(["rev-parse", "HEAD"]);

  const branch = runIn(["symbolic-ref", "--short", "HEAD"]);

  dsRepo = { dir, commit, parent, branch };
});

afterAll(() => {
  rmSync(dsRepo.dir, { recursive: true, force: true });
});

function makeLabel(overrides: Partial<GoldLabel> = {}): GoldLabel {
  return {
    repo: "gold-measure-recall-fixture",
    commit: repo.commit,
    parent: repo.parent,
    file: CARD_CSS_PATH,
    line: 2,
    literal: "#3b82f6",
    expectedToken: "var(--brand)",
    axis: "colors",
    ruleId: "tokens/no-hardcoded-color",
    ...overrides,
  };
}

describe("gold/measure-gold-recall measureGoldRecall", () => {
  it("caught: a literal Lyse actually flags on the parent tree contributes to recall", async () => {
    const label = makeLabel();
    const buckets = await measureGoldRecall(repo.dir, [label]);

    expect(buckets).toHaveLength(1);
    const bucket = buckets[0];
    if (bucket === undefined) throw new Error("expected one bucket");
    expect(bucket.ruleId).toBe("tokens/no-hardcoded-color");
    expect(bucket.class).toBe("exact");
    expect(bucket.zone).toBe("app");
    expect(bucket.labels).toBe(1);
    expect(bucket.caught).toBe(1);
    expect(bucket.recall).toBe(1);
    expect(bucket.recallSource).toBe("git-mined");
  });

  it("not caught (honesty): a literal absent from the parent tree does not inflate recall", async () => {
    const caughtLabel = makeLabel();
    const missingLabel = makeLabel({ literal: "#123456", line: 99 });

    const buckets = await measureGoldRecall(repo.dir, [caughtLabel, missingLabel]);

    expect(buckets).toHaveLength(1);
    const bucket = buckets[0];
    if (bucket === undefined) throw new Error("expected one bucket");
    expect(bucket.labels).toBe(2);
    expect(bucket.caught).toBe(1);
    expect(bucket.recall).toBe(0.5);
    expect(bucket.recallSource).toBe("git-mined");
  });

  it("returns [] for an empty label list", async () => {
    expect(await measureGoldRecall(repo.dir, [])).toEqual([]);
  });

  it("restores the working tree (HEAD + branch) and leaves no .lyse.yaml behind", async () => {
    await measureGoldRecall(repo.dir, [makeLabel()]);

    expect(run(["rev-parse", "HEAD"])).toBe(repo.commit);
    expect(run(["symbolic-ref", "--short", "HEAD"])).toBe(repo.branch);
    expect(existsSync(join(repo.dir, ".lyse.yaml"))).toBe(false);
    expect(existsSync(join(repo.dir, ".lyse.yml"))).toBe(false);
  });
});

// Ablation proving `ensureAppZoned`'s `.lyse.yaml` write is load-bearing on a
// real-DS-shaped repo (unlike the plain-package fixture above, where
// `dsSelfMode` is already false with no package.json at all — see review).
describe("gold/measure-gold-recall app-zoning override (dsSelfMode ablation)", () => {
  it("fixture is DS-shaped: detectFromPackageJson reports a workspace DS export", async () => {
    execFileSync("git", ["checkout", "-q", dsRepo.parent], { cwd: dsRepo.dir });
    try {
      const detected = await detectFromPackageJson(dsRepo.dir);
      expect(detected.componentsModule.source.startsWith("workspace DS export")).toBe(true);
    } finally {
      execFileSync("git", ["checkout", "-q", dsRepo.branch], { cwd: dsRepo.dir });
    }
  });

  it("without the override: dsSelfMode=true zones the DS's own code as ds-source, so the rule does NOT flag the literal", async () => {
    execFileSync("git", ["checkout", "-q", dsRepo.parent], { cwd: dsRepo.dir });
    try {
      const pipeline = await auditDirectory(dsRepo.dir, { staticOnly: true });
      const caught = pipeline.result.findings.some(
        (f) =>
          f.ruleId === "tokens/no-hardcoded-color" &&
          f.location.file === DS_UI_CSS_PATH &&
          colorEquals(f.fixGroup?.from ?? "", DS_LITERAL),
      );
      expect(caught).toBe(false);
    } finally {
      execFileSync("git", ["checkout", "-q", dsRepo.branch], { cwd: dsRepo.dir });
    }
  });

  it("with the override: measureGoldRecall forces dsSelfMode=false, so the same literal IS caught", async () => {
    const label: GoldLabel = {
      repo: "gold-ds-fixture-monorepo",
      commit: dsRepo.commit,
      parent: dsRepo.parent,
      file: DS_UI_CSS_PATH,
      line: 2,
      literal: DS_LITERAL,
      expectedToken: "var(--brand)",
      axis: "colors",
      ruleId: "tokens/no-hardcoded-color",
    };

    const buckets = await measureGoldRecall(dsRepo.dir, [label]);

    expect(buckets).toHaveLength(1);
    const bucket = buckets[0];
    if (bucket === undefined) throw new Error("expected one bucket");
    expect(bucket.labels).toBe(1);
    expect(bucket.caught).toBe(1);
    expect(bucket.recall).toBe(1);
    expect(bucket.recallSource).toBe("git-mined");
  });

  it("restores the DS-shaped working tree (HEAD + branch) after the override run", () => {
    expect(runInDs(["rev-parse", "HEAD"])).toBe(dsRepo.commit);
    expect(runInDs(["symbolic-ref", "--short", "HEAD"])).toBe(dsRepo.branch);
    expect(existsSync(join(dsRepo.dir, ".lyse.yaml"))).toBe(false);
  });
});
