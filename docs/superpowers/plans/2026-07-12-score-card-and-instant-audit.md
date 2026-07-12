# Score Card + Instant Audit (react-doctor fit) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the screenshotable score card in the default `lyse audit` terminal view and make the bare `lyse` command run the audit instantly, per the two committed specs (`docs/superpowers/specs/2026-07-12-score-card-wow-design.md`, `2026-07-12-instant-audit-bare-command-design.md`).

**Architecture:** A new self-contained renderer module `reporters/score-card.ts` produces the bordered card (score + grade + delta + six axis bars); `reporters/terminal.ts` composes it in place of its current score line + axis section. The CLI root command delegates to the audit command on a TTY and the standalone REPL menu is deleted. Display/CLI-routing only — the Health Score, scorer, and pipeline are untouched.

**Tech Stack:** TypeScript strict (ESM, `.js` specifiers), citty (CLI), vitest (CI-only here), existing `ui/tokens` + `reporters/terminal-format` helpers, `string-width`.

## Global Constraints

- **No Health Score change.** Same input → same score; nothing in `scorer.ts`, `audit-pipeline.ts`, or rules may change.
- Strict TS: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`. No new dependencies. No comments unless WHY is non-obvious. English artifacts only.
- **vitest cannot run in this environment** (npm registry blocked). Every rendering task MUST be verified by executing the real modules through the tsc sandbox harness (instructions in each task). CI is the final gate.
- Machine formats (json, sarif, tsv, html) and `--format=table` / `--format=eslint` output must be byte-identical to before.
- Conventional Commits; changeset for each user-facing change; CHANGELOG `[Unreleased]` entries.

## File Structure

- Create `packages/core/src/reporters/score-card.ts` — the card renderer (border, score row, gauge, axis rows). One responsibility: `AuditResult` → `string[]` card lines.
- Create `packages/core/tests/reporters/score-card.test.ts` — unit tests (run in CI).
- Modify `packages/core/src/reporters/terminal-format.ts` — export the existing internal string-width helper as `visibleWidth`.
- Modify `packages/core/src/reporters/terminal.ts` — replace `scoreLine` + axis loop with the card; delete now-dead `axisLine`/`scoreLine`/`AXIS_NAME_WIDTH`/`AXIS_SCORE_WIDTH`.
- Modify `packages/core/tests/reporters/terminal.test.ts` + `__snapshots__/terminal.test.ts.snap` — hand-computed, harness-byte-verified.
- Modify `packages/core/src/cli.ts` — bare-command delegation; delete REPL wiring and `--no-menu`/`LYSE_NO_MENU`.
- Delete `packages/core/src/menu/repl.ts` (+ its tests if any). `menu/action-menu.ts` and `menu/prompts.ts` stay.
- Modify `README.md`, `CHANGELOG.md`, `.changeset/*` per task.

---

### Task 1: `renderScoreCard` module

**Files:**
- Create: `packages/core/src/reporters/score-card.ts`
- Modify: `packages/core/src/reporters/terminal-format.ts` (export `visibleWidth`)
- Test: `packages/core/tests/reporters/score-card.test.ts`

**Interfaces:**
- Consumes: `TerminalOpts`, `visiblePad`, `visibleWidth`, `bold`, `dim`, `thresholdColor`, `statusDot`, `bar` (all from `./terminal-format.js`), `statusGlyph` from `../ui/tokens.js`, `AuditResult`/`AxisScore` from `../types.js`.
- Produces: `export function renderScoreCard(result: AuditResult, opts: TerminalOpts, deltaSuffix?: string): string[]` — the full card, one string per line, no trailing newline. Task 2 relies on this exact signature.

- [ ] **Step 1: Export `visibleWidth` from terminal-format**

`visiblePad` (terminal-format.ts:59) already computes an ANSI/link-aware width internally via `string-width`. Extract/export it:

```ts
export function visibleWidth(text: string): number {
  return stringWidth(stripForWidth(text));
}
```

(If the file computes width inline with a strip helper, lift that code into `visibleWidth` and make `visiblePad` call it — do NOT duplicate the strip logic.)

- [ ] **Step 2: Write the failing unit tests**

```ts
// packages/core/tests/reporters/score-card.test.ts
import { describe, it, expect } from "vitest";
import { renderScoreCard } from "../../src/reporters/score-card.js";
import type { AuditResult } from "../../src/types.js";

const result = {
  schemaVersion: 2, rulesVersion: "0.1.0", toolVersion: "0.1.0", scoringVersion: "scoring-v1",
  repoRoot: "/r", timestamp: "2026-05-15T14:23:00.000Z", stack: [], finalScore: 43,
  grade: { grade: "B", autoFailed: false },
  axes: [
    { axis: "tokens", score: 31, findings: 247, opportunities: 358 },
    { axis: "a11y", score: 62, findings: 41, opportunities: 108 },
    { axis: "components", score: 38, findings: 89, opportunities: 143 },
    { axis: "stories", score: 47, findings: 56, opportunities: 105 },
    { axis: "ai-surface", score: 55, findings: 3, opportunities: 8 },
    { axis: "ai-governance", score: "N/A", findings: 0, opportunities: 0 },
  ],
  findings: [],
} as unknown as AuditResult;

const opts = { mode: "default", color: false, unicode: false, width: 80, fileCount: 0, durationMs: 0, cwd: "/tmp" } as const;

describe("renderScoreCard", () => {
  it("renders a closed ascii box of uniform width", () => {
    const lines = renderScoreCard(result, { ...opts });
    expect(lines[0]!.startsWith("+")).toBe(true);
    expect(lines[0]!.endsWith("+")).toBe(true);
    expect(lines.at(-1)!.startsWith("+")).toBe(true);
    const w = lines[0]!.length;
    expect(w).toBeLessThanOrEqual(64);
    for (const l of lines) expect(l.length).toBe(w);
    for (const l of lines.slice(1, -1)) {
      expect(l.startsWith("|")).toBe(true);
      expect(l.endsWith("|")).toBe(true);
    }
  });
  it("renders rounded unicode borders when unicode is on", () => {
    const lines = renderScoreCard(result, { ...opts, unicode: true });
    expect(lines[0]!.startsWith("╭")).toBe(true);
    expect(lines.at(-1)!.startsWith("╰")).toBe(true);
  });
  it("shows grade, score, subtitle, and all six axes", () => {
    const text = renderScoreCard(result, { ...opts }).join("\n");
    expect(text).toContain("B  43/100");
    expect(text).toContain("design system health");
    for (const a of ["tokens", "a11y", "components", "stories", "ai-surface", "ai-governance"]) {
      expect(text).toContain(a);
    }
  });
  it("right-aligns the delta on the score row", () => {
    const lines = renderScoreCard(result, { ...opts }, "▼ 2");
    const scoreRow = lines.find((l) => l.includes("43/100"))!;
    expect(scoreRow).toContain("▼ 2");
    expect(scoreRow.indexOf("▼ 2")).toBeGreaterThan(scoreRow.indexOf("43/100"));
  });
  it("N/A final score renders without a crash and without a filled gauge", () => {
    const text = renderScoreCard({ ...result, finalScore: "N/A", grade: { grade: "N/A", autoFailed: false } } as AuditResult, { ...opts }).join("\n");
    expect(text).toContain("N/A");
    expect(text).not.toContain("#");
  });
  it("marks auto-fail after the grade", () => {
    const text = renderScoreCard({ ...result, finalScore: 0, grade: { grade: "Fail", autoFailed: true } } as AuditResult, { ...opts }).join("\n");
    expect(text).toContain("(auto-fail)");
  });
  it("clamps to narrow terminals without overflow", () => {
    const lines = renderScoreCard(result, { ...opts, width: 50 });
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(50);
  });
});
```

- [ ] **Step 3: Implement `score-card.ts`**

```ts
import type { AuditResult, AxisScore } from "../types.js";
import { statusGlyph } from "../ui/tokens.js";
import {
  bar, bold, dim, statusDot, thresholdColor, visiblePad, visibleWidth,
  type TerminalOpts,
} from "./terminal-format.js";

const OUTER_MAX = 64;
const OUTER_MIN = 44;
const EDGE = 3;

interface Borders { tl: string; tr: string; bl: string; br: string; h: string; v: string }
const UNICODE_BORDERS: Borders = { tl: "╭", tr: "╮", bl: "╰", br: "╯", h: "─", v: "│" };
const ASCII_BORDERS: Borders = { tl: "+", tr: "+", bl: "+", br: "+", h: "-", v: "|" };

function axisRow(a: AxisScore, opts: TerminalOpts, barCells: number): string {
  const gly = statusGlyph(a.score, { color: opts.color, unicode: opts.unicode });
  const name = visiblePad(a.axis, 14);
  const scoreText = visiblePad(a.score === "N/A" ? "—" : String(a.score), 4, "left");
  return `${gly} ${name} ${scoreText}  ${bar(a.score, opts, barCells)}`;
}

export function renderScoreCard(
  result: AuditResult,
  opts: TerminalOpts,
  deltaSuffix?: string,
): string[] {
  const b = opts.unicode ? UNICODE_BORDERS : ASCII_BORDERS;
  const outer = Math.max(OUTER_MIN, Math.min(OUTER_MAX, opts.width));
  const inner = outer - 2;
  const wrap = (s: string) => `${b.v}${visiblePad(` `.repeat(EDGE - 1) + s, inner)}${b.v}`;
  const blank = `${b.v}${" ".repeat(inner)}${b.v}`;

  const score = result.finalScore;
  const grade = result.grade && result.grade.grade !== "N/A" ? `${result.grade.grade}  ` : "";
  const autoFail = result.grade?.autoFailed ? `  ${dim("(auto-fail)", opts)}` : "";
  const head = score === "N/A" ? bold("N/A", opts) : bold(thresholdColor(score, opts)(`${grade}${score}/100`), opts);
  let scoreRow = `${statusDot(score, opts)}  ${head}${autoFail}   ${dim("design system health", opts)}`;
  if (deltaSuffix) {
    const delta = dim(deltaSuffix, opts);
    const room = inner - EDGE - visibleWidth(scoreRow) - visibleWidth(delta) - EDGE;
    if (room >= 1) scoreRow = `${scoreRow}${" ".repeat(room)}${delta}`;
  }

  const gaugeCells = Math.min(40, inner - 2 * EDGE);
  const barCells = Math.min(20, inner - EDGE - 24);

  return [
    `${b.tl}${b.h.repeat(inner)}${b.tr}`,
    blank,
    wrap(scoreRow),
    wrap(bar(score, opts, gaugeCells)),
    blank,
    ...result.axes.map((a) => wrap(axisRow(a, opts, barCells))),
    blank,
    `${b.bl}${b.h.repeat(inner)}${b.br}`,
  ];
}
```

WHY `EDGE`: a fixed 3-column inset keeps the content off the border on both sides at every width. WHY no OSC-8 links inside the card: a miscounted link escape breaks border alignment (spec).

- [ ] **Step 4: Verify by executing the real module (vitest is unavailable here)**

The Wave-1 harness lives at the scratchpad path used by earlier sessions (`term-check/`); rebuild it if absent. Exact procedure:

```bash
S=<scratchpad>/term-check   # reuse; it already stubs ansis/string-width/history
cp packages/core/src/reporters/score-card.ts $S/reporters/
cp packages/core/src/reporters/terminal-format.ts $S/reporters/
cd $S && sed -i 's|from "string-width"|from "../string-width-stub.js"|' reporters/terminal-format.ts
tsc reporters/score-card.ts --module nodenext --moduleResolution nodenext --target es2022 --strict --outDir dist
node card-check.mjs   # write it: import renderScoreCard from dist, run every unit-test case above as eq() checks
```

Every case from Step 2 must PASS. Fix and re-run until green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/reporters/score-card.ts packages/core/src/reporters/terminal-format.ts packages/core/tests/reporters/score-card.test.ts
git commit -m "feat(terminal): renderScoreCard — the screenshotable score card"
```

---

### Task 2: compose the card into `renderTerminal`

**Files:**
- Modify: `packages/core/src/reporters/terminal.ts`
- Modify: `packages/core/tests/reporters/terminal.test.ts`, `packages/core/tests/reporters/__snapshots__/terminal.test.ts.snap`
- Create: `.changeset/score-card-default-view.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `renderScoreCard(result, opts, deltaSuffix?)` from Task 1.
- Produces: the default text view = banner → card → layer-4 banners/nag → Top findings → Next steps → footer.

- [ ] **Step 1: Rewire `renderTerminal`**

In `terminal.ts`: keep the delta computation exactly as is; replace `lines.push(scoreLine(result, opts, deltaSuffix))` with `lines.push(...renderScoreCard(result, opts, deltaSuffix))`; delete the axis loop (`for (const a of result.axes) lines.push(axisLine(a, opts))`) and the now-dead `scoreLine`, `axisLine`, `AXIS_NAME_WIDTH`, `AXIS_SCORE_WIDTH`; the layer-4 banners and the no-token-registry nag stay, now directly after the card block. Import `renderScoreCard`.

- [ ] **Step 2: Update the tests**

In `terminal.test.ts`: the six-axes test, `lyse handoff` tip test, quiet-mode test, and 43/100 assertions still hold. Update the "renders the clean report" test if it asserted bare-axis-line formatting. Add:

```ts
it("renders the score card box in the default view", async () => {
  const out = await renderTerminal(sample, baseOpts);
  expect(out).toContain("+");        // ascii border (unicode:false)
  expect(out).toContain("43/100");
  expect(out.indexOf("+")).toBeLessThan(out.indexOf("tokens"));
});
```

- [ ] **Step 3: Regenerate the snapshot by hand, byte-verified**

Run the harness `run.mjs` (it compares `renderTerminal` output against the repo snapshot). First PRINT the new real output, paste it into `__snapshots__/terminal.test.ts.snap` (escape backticks as `` \` ``), then re-run until it reports `SNAPSHOT MATCH: byte-identical`. Do not hand-type the card into the snapshot.

- [ ] **Step 4: Changeset + CHANGELOG**

`.changeset/score-card-default-view.md` (minor): the default terminal report now opens with a bordered score card (score, grade, delta, six axis bars); machine formats untouched; no score change. Mirror in CHANGELOG `[Unreleased] → Changed`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(terminal): score card is the default audit view"
```

---

### Task 3: bare `lyse` runs the audit; retire the REPL

**Files:**
- Modify: `packages/core/src/cli.ts`
- Delete: `packages/core/src/menu/repl.ts` (+ any `tests/**/repl*` test file)
- Create: `.changeset/instant-audit-bare-command.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: the existing `auditCommand` and citty's `runCommand`.
- Produces: bare `lyse` on a TTY ≡ `lyse audit` of cwd; non-TTY bare prints usage (unchanged).

- [ ] **Step 1: Rewire the root command**

In `cli.ts` `main.run`, replace the menu branch:

```ts
if (!isInteractive()) {
  process.stdout.write((await renderUsage(cmd)) + "\n");
  return;
}
const forwarded: string[] = [];
if (args.yes === true) forwarded.push("--yes");
if (args["no-prompt"] === true) forwarded.push("--no-prompt");
if (args.quiet === true) forwarded.push("--quiet");
if (args["no-color"] === true) forwarded.push("--no-color");
await runCommand(auditCommand, { rawArgs: forwarded });
```

(Verify each forwarded flag exists in `auditCommand.args`; drop any that don't.) Delete the `--no-menu` arg, the `LYSE_NO_MENU` check, the `runRepl(...)` call, the whole `dispatchReplAction` function (cli.ts ~1079-1130), and the `runRepl`/`withExitGuard`/`ReplActionId`/`ReplContext` imports. Import `runCommand` from `citty` if not already imported at top level.

- [ ] **Step 2: Delete the REPL module and its tests**

```bash
git rm packages/core/src/menu/repl.ts
grep -rln "repl" packages/core/tests | xargs -r git rm
grep -rn "runRepl\|dispatchReplAction\|no-menu\|LYSE_NO_MENU" packages/core/src packages/core/tests docs README.md
```

The final grep must return only CHANGELOG/spec/plan mentions. Fix any doc that documents `--no-menu` or the menu (check `docs/` and the CLI reference page).

- [ ] **Step 3: Verify the routing logic compiles standalone**

Type-check the edited region by eye and with `tsc --noEmit` if the dependency-free subset allows; otherwise rely on the final grep + CI. The delegation is thin glue over the tested audit command.

- [ ] **Step 4: Changeset + CHANGELOG**

`.changeset/instant-audit-bare-command.md` (minor): bare `lyse` now runs the audit of the current directory on a TTY (react-doctor-style instant score); the standalone REPL menu and `--no-menu`/`LYSE_NO_MENU` are retired — the post-audit action menu owns interactive follow-ups; non-TTY bare still prints usage. Mirror in CHANGELOG with a migration note.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(cli): bare lyse runs the audit instantly; retire the REPL menu"
```

---

### Task 4: README — the react-doctor arc

**Files:**
- Modify: `README.md`, `CHANGELOG.md`

- [ ] **Step 1: Restructure the top of the README**

Order: hero tagline (unchanged) → agent-era pain paragraph → Quickstart with the bare command → "Calibrate (optional)" for `init`. The pain paragraph (verbatim):

> AI coding agents ship UI fast — and hardcode `#3b82f6` where `color.brand.primary` exists, reinvent `<Button>`, and skip stories. Lyse audits the drift they (and humans) introduce, scores it 0–100, and hands the fixes back to the same agent.

Quickstart becomes:

```bash
npx -y @lyse-labs/lyse@latest
```

with the line: "That's it — no config, no prompts, your Health Score in seconds." Then an "Optional: calibrate" paragraph moving the current `init` copy (detects framework, writes `.lyse.yaml`, wires MCP).

- [ ] **Step 2: CHANGELOG docs line + commit**

```bash
git add README.md CHANGELOG.md && git commit -m "docs(readme): agent-era pain + instant-audit quickstart (react-doctor arc)"
```

---

### Task 5: whole-branch adversarial review

- [ ] **Step 1:** Invoke `requesting-code-review` / the 8-angle find→verify pattern on `git diff origin/main...HEAD` (scope: Tasks 1-4 only).
- [ ] **Step 2:** Fix every CONFIRMED finding; record PLAUSIBLE-but-deferred ones in the plan's Deferred section; commit as `fix(review): apply score-card/instant-audit review findings`.
- [ ] **Step 3:** Push the branch (`git push -u origin claude/lyse-remaining-tasks-ikeixl`).

## Deferred (known, intentional)

- History NDJSON schema still records 4 axes (separate follow-up, logged in Wave-1 review).
- Leaderboard/launch assets: next plan.

## Self-Review

**1. Spec coverage:** card content/borders/width/N-A/auto-fail/delta (Task 1), replaces score line + axes with banners/nag placement (Task 2), machine formats untouched (Global + Task 2 tests), bare-TTY audit + non-TTY usage + REPL/`--no-menu` deletion + README quickstart & pain section (Tasks 3-4), hand-verified snapshot constraint (Tasks 1-2), changesets/CHANGELOG (Tasks 2-4). No gaps found.

**2. Placeholder scan:** no TBD/TODO; every code step carries code; the only "verify by grep" steps name the exact commands and expected outcome.

**3. Type consistency:** `renderScoreCard(result: AuditResult, opts: TerminalOpts, deltaSuffix?: string): string[]` is identical in Task 1 Produces, Task 1 implementation, and Task 2 call site. `visibleWidth(text: string): number` defined Task 1 Step 1, consumed in Task 1 Step 3 only.
