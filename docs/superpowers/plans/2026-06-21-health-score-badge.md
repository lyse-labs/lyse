# Health Score badge — Implementation Plan

> REQUIRED SUB-SKILL: superpowers:executing-plans. TDD.

**Goal:** `lyse badge` — emit a shields.io Health Score badge (static + auto-updating endpoint JSON) from the local audit. Local-first; highest-leverage adoption lever.

**Architecture:** Pure `share/badge.ts` (`buildBadge`) + `commands/badge.ts` (`runBadge`, mirrors `share.ts`) + CLI `badge` subcommand. Docs + dogfood README badge.

## Global Constraints
- Strict TS. Deterministic output. Local-first (no hosting / egress).
- Grade bands (`reliability/grade.ts`): A≥80, B≥60, C≥40, Fail<40.
- shields colors: A→brightgreen, B→green, C→yellow, Fail→red, N/A→lightgrey.
- `--write` is the only thing that touches disk; atomic temp+rename.

---

### Task 1: `buildBadge` (pure)

**Files:** Create `packages/core/src/share/badge.ts`, `packages/core/tests/share/badge.test.ts`

**Produces:** `buildBadge({score, grade, repoUrl}): { endpointJson, staticUrl, staticMarkdown, endpointMarkdown }` per spec.

- [ ] **Step 1: failing test**

```typescript
import { describe, it, expect } from "vitest";
import { buildBadge } from "../../src/share/badge.js";

describe("buildBadge", () => {
  it("maps grade B (score 78) → green + '78/100 (B)'", () => {
    const b = buildBadge({ score: 78, grade: "B", repoUrl: "https://github.com/o/r" });
    expect(b.endpointJson).toEqual({ schemaVersion: 1, label: "Lyse", message: "78/100 (B)", color: "green" });
    expect(b.staticUrl).toBe("https://img.shields.io/badge/Lyse-78%2F100_(B)-green");
    expect(b.staticMarkdown).toBe("[![Lyse Health Score](https://img.shields.io/badge/Lyse-78%2F100_(B)-green)](https://github.com/o/r)");
  });
  it("color by grade", () => {
    expect(buildBadge({ score: 92, grade: "A", repoUrl: null }).endpointJson.color).toBe("brightgreen");
    expect(buildBadge({ score: 50, grade: "C", repoUrl: null }).endpointJson.color).toBe("yellow");
    expect(buildBadge({ score: 20, grade: "Fail", repoUrl: null }).endpointJson.color).toBe("red");
    expect(buildBadge({ score: "N/A", grade: "N/A", repoUrl: null }).endpointJson.color).toBe("lightgrey");
  });
  it("N/A message", () => {
    expect(buildBadge({ score: "N/A", grade: "N/A", repoUrl: null }).endpointJson.message).toBe("N/A");
  });
  it("drops link wrapper when no repoUrl", () => {
    expect(buildBadge({ score: 78, grade: "B", repoUrl: null }).staticMarkdown).toBe("![Lyse Health Score](https://img.shields.io/badge/Lyse-78%2F100_(B)-green)");
  });
  it("endpointMarkdown references the raw JSON url via shields endpoint", () => {
    const b = buildBadge({ score: 78, grade: "B", repoUrl: "https://github.com/o/r" });
    expect(b.endpointMarkdown("https://raw.githubusercontent.com/o/r/main/.lyse/badge.json"))
      .toBe("[![Lyse Health Score](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fo%2Fr%2Fmain%2F.lyse%2Fbadge.json)](https://github.com/o/r)");
  });
});
```

- [ ] **Step 2:** run → FAIL (module missing).
- [ ] **Step 3: implement** `share/badge.ts`:

```typescript
export type BadgeGrade = "A" | "B" | "C" | "Fail" | "N/A";
export interface BadgeInput { score: number | "N/A"; grade: BadgeGrade; repoUrl: string | null; }
export interface BadgeEndpointJson { schemaVersion: 1; label: string; message: string; color: string; }
export interface BadgeOutput {
  endpointJson: BadgeEndpointJson;
  staticUrl: string;
  staticMarkdown: string;
  endpointMarkdown: (rawJsonUrl: string) => string;
}

const COLOR: Record<BadgeGrade, string> = {
  A: "brightgreen", B: "green", C: "yellow", Fail: "red", "N/A": "lightgrey",
};
const LABEL = "Lyse";

// shields.io static-badge path encoding: '-'→'--', '_'→'__', ' '→'_', then
// percent-encode the rest (so '/' → %2F). '(' ')' are URL-safe, left as-is.
function shieldsEncode(s: string): string {
  return encodeURIComponent(s.replace(/-/g, "--").replace(/_/g, "__").replace(/ /g, "_"))
    .replace(/%2F/gi, "%2F"); // explicit: slash stays encoded
}

export function buildBadge(input: BadgeInput): BadgeOutput {
  const message = input.score === "N/A" ? "N/A" : `${input.score}/100 (${input.grade})`;
  const color = COLOR[input.grade];
  const endpointJson: BadgeEndpointJson = { schemaVersion: 1, label: LABEL, message, color };
  const staticUrl = `https://img.shields.io/badge/${shieldsEncode(LABEL)}-${shieldsEncode(message)}-${color}`;
  const wrap = (img: string): string =>
    input.repoUrl ? `[${img}](${input.repoUrl})` : img;
  const staticMarkdown = wrap(`![Lyse Health Score](${staticUrl})`);
  const endpointMarkdown = (rawJsonUrl: string): string =>
    wrap(`![Lyse Health Score](https://img.shields.io/endpoint?url=${encodeURIComponent(rawJsonUrl)})`);
  return { endpointJson, staticUrl, staticMarkdown, endpointMarkdown };
}
```

NOTE on encoding: `encodeURIComponent("78--100 (B)"...)` — verify the test's expected `78%2F100_(B)` matches: input message `78/100 (B)` → replace `-`/`_`/` ` → `78/100_(B)` → encodeURIComponent → `78%2F100_(B)` (space already `_`, `(` `)` unescaped, `/`→`%2F`). ✓. Adjust the impl to exactly satisfy the Step-1 assertions; if a char escapes differently, fix the impl (not the test).

- [ ] **Step 4:** run → PASS.
- [ ] **Step 5:** commit `feat(share): buildBadge — shields.io Health Score badge (pure)`.

---

### Task 2: `lyse badge` command + CLI wiring

**Files:** Create `packages/core/src/commands/badge.ts`; modify `packages/core/src/cli.ts`; Create `packages/core/tests/cli.badge.test.ts`

**Consumes:** `buildBadge` (T1), `auditDirectory`, `detectFromGit`.
**Produces:** `runBadge(cwd, { write?, quiet? })`; `lyse badge [--write]`.

- [ ] **Step 1: failing CLI smoke test**

```typescript
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
const CLI = join(__dirname, "..", "dist", "cli.js");
const FIX = join(__dirname, "..", "fixtures", "full-ds");
function run(args: string[]): string {
  return execFileSync("node", [CLI, "badge", FIX, ...args], { encoding: "utf8", env: { ...process.env, LYSE_LLM: "0" } });
}
describe("lyse badge (#adoption)", () => {
  it("prints a shields.io static badge markdown", () => {
    expect(run([])).toContain("https://img.shields.io/badge/Lyse-");
  });
});
```

- [ ] **Step 2:** build + run → FAIL (`badge` unknown command).
- [ ] **Step 3: implement** `commands/badge.ts` mirroring `commands/share.ts`:
  - audit via `auditDirectory(cwd, { progress: spinner })`; `grade = audit.result.grade?.grade ?? "N/A"`; `score = audit.result.finalScore`.
  - `detectFromGit(cwd)` → `repoUrl = github.value ? \`https://github.com/${owner}/${repo}\` : null`; `branch = git.value.defaultBranch ?? "main"`.
  - `const badge = buildBadge({ score, grade, repoUrl })`.
  - Print `badge.staticMarkdown` to **stdout**.
  - If `write`: write `.lyse/badge.json` (atomic temp+rename, `JSON.stringify(endpointJson, null, 2)+"\n"`); if repo known, print `badge.endpointMarkdown(\`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/.lyse/badge.json\`)` + the CI note; else print a note to fill `<owner>/<repo>`.
  - Spinner on stderr; stdout = pasteable only.
  - Register in `cli.ts`: `badge` subcommand, positional `dir`, `--write` boolean; call `runBadge`.

- [ ] **Step 4:** build + run → PASS. Also manually: `node dist/cli.js badge fixtures/full-ds --write` writes `.lyse/badge.json` → inspect → delete.
- [ ] **Step 5:** full suite + tsc green.
- [ ] **Step 6:** commit `feat(cli): lyse badge command (--write endpoint JSON)`.

---

### Task 3: Docs + dogfood README badge + CHANGELOG

**Files:** `docs/guide/cli-reference.md`, `docs/guide/getting-started.md`, `README.md`, `CHANGELOG.md`, and generate Lyse's own `.lyse/badge.json`.

- [ ] **Step 1:** cli-reference — document `lyse badge` + `--write`.
- [ ] **Step 2:** getting-started — add a "Show your score" step with the static snippet.
- [ ] **Step 3:** Generate Lyse's own badge: `node dist/cli.js badge . --write` → commit `.lyse/badge.json`; add the endpoint badge markdown to the top of README.md (dogfood).
- [ ] **Step 4:** CHANGELOG `[Unreleased]` → `### Added`.
- [ ] **Step 5:** `pnpm build` clean; commit `docs: document + dogfood lyse badge`.

## Self-Review
- Coverage: pure builder (T1), command+CLI (T2), docs+dogfood (T3) ✓.
- Placeholders: none. Encoding test pins exact output; impl adjusts to pass.
- Types consistent: `BadgeInput`/`BadgeOutput`/`buildBadge` across T1–T2.
