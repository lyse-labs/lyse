import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { measureGoldRecall } from "../../../src/reliability/gold/measure-gold-recall.js";
import type { GoldLabel } from "../../../src/reliability/gold/types.js";

const CARD_CSS_PATH = "src/components/Card.css";
const TOKENS_CSS_PATH = "src/tokens.css";

interface Repo {
  dir: string;
  commit: string;
  parent: string;
  branch: string;
}

let repo: Repo;

function run(args: string[]): string {
  return execFileSync("git", args, { cwd: repo.dir }).toString().trim();
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
