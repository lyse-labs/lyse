import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { walkTokenizationCommits } from "./walk.js";
import { confirmCandidate } from "./confirm.js";
import { loadPinnedTokens, makePinnedResolveTokenValue } from "./pinned-tokens.js";

function git(args: string[], cwd: string): void {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

// Parent: `.x {\n  color: #3b82f6;\n}\n` -> Child: `.x {\n  color: ${childValue};\n}\n` in a.scss.
//
// NOTE (fixture adjustments vs. the brief): the brief's original fixture wrote
// the rule as a single physical line (`.x { color: #3b82f6; }`) and used a bare
// SCSS variable ref (`$brand`) for the confirm/reject-value/reject-alias cases.
// Neither form is what walk.ts actually detects, verified directly against
// walk.ts before writing this file:
//   1. walk.ts's CSS_DECL_RE (`/^([A-Za-z-]+)\s*:\s*(.+)$/`) requires the
//      trimmed diff line to START with the property name. A single-line rule
//      (`.x { color: #3b82f6; }`) trims to a line starting with `.x {`, which
//      never matches -- exactly matching the multi-line shape every existing
//      fixture in walk.test.ts/confirm.test.ts uses (selector and declaration
//      on separate lines), so this fixture now does the same.
//   2. walk.ts's TOKEN_REF_RE only recognizes `var(--name)` or a DOTTED
//      identifier (`a.b`) as an added ref -- a bare `$name` has no dot and does
//      not match (verified: `TOKEN_REF_RE.exec("$brand;")` is null). Per the
//      brief's own instruction to adjust the declaration form (not the
//      assertions) when the fixture doesn't surface a candidate, the three
//      cases that need a resolvable-via-snapshot ref use `var(--brand)`
//      instead -- a form walk.ts does detect -- with the pinned snapshot
//      supplied as a `.css` file (`--brand: <value>;`) instead of a `.scss`
//      file. This still exercises the exact same
//      `loadPinnedTokens`/`makePinnedResolveTokenValue` pair under test (only
//      the CSS half of the parser instead of the SCSS half), and preserves the
//      four load-bearing outcomes unweakened. The drop-on-JS-ref case is
//      unaffected in form: `theme.colors.brand` is a dotted identifier and IS
//      detected by TOKEN_REF_RE, matching the brief exactly.
function twoCommitRepo(childValue: string, parentLiteral = "#3b82f6"): string {
  const dir = mkdtempSync(join(tmpdir(), "lyse-gold-e2e-"));
  git(["init", "-q"], dir);
  git(["config", "user.email", "t@t.t"], dir);
  git(["config", "user.name", "t"], dir);
  git(["config", "commit.gpgsign", "false"], dir);
  writeFileSync(join(dir, "a.scss"), `.x {\n  color: ${parentLiteral};\n}\n`);
  git(["add", "."], dir);
  git(["commit", "-q", "-m", "before"], dir);
  writeFileSync(join(dir, "a.scss"), `.x {\n  color: ${childValue};\n}\n`);
  git(["add", "."], dir);
  git(["commit", "-q", "-m", "tokenize"], dir);
  return dir;
}

function pins(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "lyse-e2e-pins-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

async function confirmFirst(repoDir: string, resolver: ReturnType<typeof makePinnedResolveTokenValue>) {
  const candidates = await walkTokenizationCommits(repoDir, "e2e");
  expect(candidates.length).toBeGreaterThan(0);
  for (const c of candidates) {
    const label = await confirmCandidate(repoDir, c, resolver);
    if (label !== null) return label;
  }
  return null;
}

describe("external-token resolution end-to-end", () => {
  it("confirms a label when the snapshot value equals the removed literal", async () => {
    const repo = twoCommitRepo("var(--brand)");
    const resolver = makePinnedResolveTokenValue(
      repo,
      loadPinnedTokens(pins({ "t.css": "--brand: #3b82f6;" }), ["t.css"]),
    );
    expect(await confirmFirst(repo, resolver)).not.toBeNull();
  });

  it("rejects when the snapshot value differs (value-changed rename is not drift)", async () => {
    const repo = twoCommitRepo("var(--brand)");
    const resolver = makePinnedResolveTokenValue(
      repo,
      loadPinnedTokens(pins({ "t.css": "--brand: #ff0000;" }), ["t.css"]),
    );
    expect(await confirmFirst(repo, resolver)).toBeNull();
  });

  it("rejects when the token is an alias (no literal colour in the snapshot)", async () => {
    const repo = twoCommitRepo("var(--brand)");
    const resolver = makePinnedResolveTokenValue(
      repo,
      loadPinnedTokens(pins({ "t.css": "--brand: var(--other);" }), ["t.css"]),
    );
    expect(await confirmFirst(repo, resolver)).toBeNull();
  });

  it("confirms a JS member ref when a JSON snapshot value equals the removed literal", async () => {
    const repo = twoCommitRepo("base.orange400");
    const resolver = makePinnedResolveTokenValue(
      repo,
      loadPinnedTokens(pins({ "t.json": JSON.stringify({ "base.orange400": "#3b82f6" }) }), ["t.json"]),
    );
    expect(await confirmFirst(repo, resolver)).not.toBeNull();
  });

  it("confirms a JS member ref whose OKLCH snapshot value equals the removed hex (canvas-kit path)", async () => {
    const repo = twoCommitRepo("base.orange400", "#fd7e00");
    const resolver = makePinnedResolveTokenValue(
      repo,
      loadPinnedTokens(
        pins({ "t.json": JSON.stringify({ "base.orange400": "oklch(0.7261 0.1852 52.58 / 1)" }) }),
        ["t.json"],
      ),
    );
    expect(await confirmFirst(repo, resolver)).not.toBeNull();
  });

  it("rejects a JS member ref whose OKLCH snapshot differs from the removed hex", async () => {
    const repo = twoCommitRepo("base.orange400", "#3b82f6");
    const resolver = makePinnedResolveTokenValue(
      repo,
      loadPinnedTokens(
        pins({ "t.json": JSON.stringify({ "base.orange400": "oklch(0.7261 0.1852 52.58 / 1)" }) }),
        ["t.json"],
      ),
    );
    expect(await confirmFirst(repo, resolver)).toBeNull();
  });

  it("drops an unresolved JS member ref (no snapshot entry) — fail-closed", async () => {
    const repo = twoCommitRepo("theme.colors.brand");
    const resolver = makePinnedResolveTokenValue(repo, new Map());
    expect(await confirmFirst(repo, resolver)).toBeNull();
  });
});
