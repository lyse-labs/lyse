import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll } from "vitest";
import {
  resolveIsolate,
  isolationRefusal,
  createIsolatedTree,
  removeIsolatedTree,
} from "./isolate.js";

describe("resolveIsolate — precedence", () => {
  it("is off by default: handoff edits your working tree, and that is the point", () => {
    expect(resolveIsolate({ flag: undefined, env: {}, config: undefined })).toBe(false);
  });

  it("the flag wins over everything", () => {
    expect(resolveIsolate({ flag: true, env: { LYSE_HANDOFF_ISOLATE: "0" }, config: false })).toBe(true);
    expect(resolveIsolate({ flag: false, env: { LYSE_HANDOFF_ISOLATE: "1" }, config: true })).toBe(false);
  });

  it("then the environment, then config — the order the review flag already uses", () => {
    expect(resolveIsolate({ flag: undefined, env: { LYSE_HANDOFF_ISOLATE: "1" }, config: false })).toBe(true);
    expect(resolveIsolate({ flag: undefined, env: {}, config: true })).toBe(true);
  });

  it("treats any value other than \"1\" as unset rather than as truthy", () => {
    for (const v of ["0", "", "false", "yes"]) {
      expect(resolveIsolate({ flag: undefined, env: { LYSE_HANDOFF_ISOLATE: v }, config: false }), v).toBe(false);
    }
  });
});

describe("isolationRefusal — say no rather than fix the wrong tree", () => {
  it("allows a clean git repository", () => {
    expect(isolationRefusal({ isGitRepo: true, dirtyPaths: [] })).toBeNull();
  });

  it("refuses outside a git repository", () => {
    const why = isolationRefusal({ isGitRepo: false, dirtyPaths: [] });
    expect(why).toContain("git");
  });

  it("refuses on a dirty tree, and names what is uncommitted", () => {
    // An isolated tree is created from HEAD. With uncommitted work in the real
    // tree, the agent would fix a version of the repository the user cannot see
    // and the diff they review would not be the diff they asked for. Refusing is
    // the only honest answer; silently isolating anyway is worse than not
    // isolating at all.
    const why = isolationRefusal({ isGitRepo: true, dirtyPaths: ["src/Button.tsx", "src/Card.tsx"] });
    expect(why).toContain("Button.tsx");
    expect(why).toContain("HEAD");
  });

  it("truncates a long dirty list instead of printing a hundred paths", () => {
    const many = Array.from({ length: 40 }, (_, i) => `src/File${i}.tsx`);
    const why = isolationRefusal({ isGitRepo: true, dirtyPaths: many })!;
    expect(why).toContain("40");
    expect(why.split("\n").length).toBeLessThan(12);
  });
});

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "lyse-isolate-"));
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: root, stdio: "ignore", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" } });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "T");
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "Button.tsx"), "export const Button = () => null;\n");
  git("add", "-A");
  git("commit", "-q", "-m", "init");
  return root;
}

describe("createIsolatedTree / removeIsolatedTree", () => {
  let root: string;
  beforeAll(() => {
    root = makeRepo();
  });

  it("checks out HEAD somewhere else, leaving the real tree untouched", () => {
    const tree = createIsolatedTree(root);
    expect(tree).not.toBeNull();
    expect(existsSync(join(tree!.dir, "src", "Button.tsx"))).toBe(true);
    // The agent's edits land there, not here.
    writeFileSync(join(tree!.dir, "src", "Button.tsx"), "edited by the agent\n");
    expect(existsSync(join(root, "src", "Button.tsx"))).toBe(true);
    removeIsolatedTree(root, tree!.dir);
    expect(existsSync(tree!.dir)).toBe(false);
  });

  it("removal leaves git with no dangling worktree registration", () => {
    const tree = createIsolatedTree(root)!;
    removeIsolatedTree(root, tree.dir);
    const listed = execFileSync("git", ["worktree", "list"], { cwd: root, encoding: "utf8" });
    expect(listed).not.toContain(tree.dir);
  });

  it("removal is safe to call twice — a rollback path must not throw", () => {
    const tree = createIsolatedTree(root)!;
    removeIsolatedTree(root, tree.dir);
    expect(() => removeIsolatedTree(root, tree.dir)).not.toThrow();
  });

  it("returns null rather than throwing when the directory is not a repository", () => {
    const notARepo = mkdtempSync(join(tmpdir(), "lyse-not-repo-"));
    expect(createIsolatedTree(notARepo)).toBeNull();
  });
});
