# Lyse Terminal Chantier — Clean Report + Agent Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `lyse` into a single, clean, Doctor-React-shaped command — scan → a polished health report → hand the issues off to the user's coding agent to fix (Lyse never fixes code itself).

**Architecture:** Lyse's engine (scanner, rules, score) is untouched — this is a last-mile change. Phase 1 replaces the clack-chrome report with one clean text renderer (no per-line rail), shared by `lyse`/`audit`/`init`; clack is kept ONLY for the scan spinner and the one interactive select. Phase 2 adds the agent handoff: a small in-house agent registry, a prompt-payload builder, a skill installer, and the post-report "Fix with your coding agent" select (copy-prompt + install-skill in v1; spawn the agent CLI in v2).

**Tech Stack:** TypeScript (strict), Node ≥22, vitest, `@clack/prompts` (spinner + select only), `src/ui/tokens.ts` (the picocolors/ansis "highlighter"). Package manager: **pnpm**.

## Locked Decisions — 0 gray zones (the spec)

- **D1 — Fix is agent-only.** The interactive flow never runs Lyse codemods. `lyse fix` stays as an explicit command (CI / power users) but is removed from every menu and from `init`.
- **D2 — One renderer, clean text.** The report is rendered as clean indented text via `ui/tokens` (color + glyphs). NO clack `log.step`/`note`/`intro`/`outro` in the report. clack is used ONLY for (a) the scan spinner (`wizardTask`) and (b) the post-report select (`wizardSelect`).
- **D3 — Shared report.** `lyse`, `lyse audit`, and `lyse init` render the SAME report via `renderTerminal`.
- **D4 — `lyse` is the hero.** Bare `lyse` (no subcommand, TTY) = scan → report → handoff. It replaces the old REPL menu. `init`/`audit`/`fix`/`install` stay as explicit commands. (Phase 2.)
- **D5 — In-house agent registry.** No `agent-install` dependency (it's a pre-1.0 package from a competitor's org). Lyse owns a ~30-line registry of agents (Claude Code, Cursor, Codex, OpenCode) → {binary, detect path, skill install path}. (Phase 2.)
- **D6 — Handoff v1 = copy-prompt + install-skill.** Spawning the agent CLI (`launchAgent`) is v2. (Phase 2.)
- **D7 — Lyse moats unchanged.** Score stays local + deterministic (no server score). Telemetry stays opt-in.
- **D8 — No jargon in the report.** Remove `scoring-vX.Y`, `tier …`, `(= 0 since 0d ago)`, and the 3-line "no token registry" hint (collapse to one dim line).

## Global Constraints

- Node `>=22`; ESM — relative imports end in `.js`; strict TS (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`); `import type` for type-only imports.
- No comments unless WHY non-obvious. Deterministic output. English. Conventional Commits.
- User-facing change → Changeset; never hand-edit the package version.
- Interactive prompts never run when `!isInteractive()` (LYSE_YES=1 / LYSE_NO_PROMPT=1 / CI / non-TTY).
- Init tests (`tests/commands/init.test.ts`, `tests/integration/init-fresh-repo.test.ts`) run `runInit({ yes: true })` and assert filesystem artifacts — they must stay green unmodified.
- Paths relative to `packages/core/`.

---

# PHASE 1 — The clean report (the foundation, build now)

Fully specified below. Phase 2 spec is at the end (its task-by-task plan is authored once Phase 1 lands).

## Phase 1 File Structure

- **Modify** `src/reporters/terminal.ts` — `scoreLine`, `axisLine`, `findingLines`, the token-registry hint, and the header → the clean layout. This file stays the single report renderer.
- **Modify** `src/commands/init.ts` — after the scan, render via `renderTerminal` (the clean report) instead of the clack `wizardStep`/`wizardNote` score+findings lines.
- **Modify** `tests/reporters/terminal.test.ts` — update assertions + snapshot to the clean layout.
- **Create** `.changeset/lyse-clean-report.md`.

---

### Task 1: Polish `terminal.ts` into the clean report

**Files:**
- Modify: `src/reporters/terminal.ts`
- Modify: `tests/reporters/terminal.test.ts`
- Create: `.changeset/lyse-clean-report.md`

**Interfaces:**
- Consumes: existing `terminal-format.ts` helpers (`teal`, `thresholdColor`, `severityColor`, `dim`, `bold`, `bar`, `statusDot`, `visiblePad`, `truncateStart`, `link`), `statusGlyph` from `ui/tokens`.
- Produces: `renderTerminal(result, opts)` — same signature, cleaner output. No new exports.

- [ ] **Step 1: Update the snapshot-bearing test expectations**

In `tests/reporters/terminal.test.ts`, the "contains brand, score, all 4 axes…" test currently asserts substrings. Replace its assertions block with the clean-layout expectations (keep the `sample`/`baseOpts` fixtures as-is):
```ts
  it("renders the clean report: score line, axes, top findings, no jargon", async () => {
    const out = await renderTerminal(sample, baseOpts);
    // score line: "● <grade> <score>/100   design system health"
    expect(out).toContain("43/100");
    expect(out).toContain("design system health");
    // axes present, no "findings" suffix clutter on the axis line
    expect(out).toContain("tokens");
    expect(out).toContain("a11y");
    expect(out).toContain("components");
    expect(out).toContain("stories");
    // findings
    expect(out).toContain("tokens/no-hardcoded-color");
    // jargon removed
    expect(out).not.toContain("scoring-v");
    expect(out).not.toContain("since");
    expect(out).not.toContain("Health Score ·");
  });
```
Keep the existing `toMatchSnapshot()` test (it will be regenerated in Step 4).

- [ ] **Step 2: Run it — expect failure**

```bash
pnpm exec vitest run tests/reporters/terminal.test.ts
```
Expected: FAIL — current output contains `scoring-v` / `Health Score ·` and lacks `43/100` in the clean form.

- [ ] **Step 3: Rewrite the renderer pieces in `terminal.ts`**

(a) Replace `scoreLine`:
```ts
function scoreLine(result: AuditResult, opts: TerminalOpts, deltaSuffix?: string): string {
  const score = result.finalScore;
  const dot = statusDot(score, opts);
  const sub = dim("design system health", opts);
  if (score === "N/A") {
    return `  ${dot}  ${bold("N/A", opts)}   ${sub}`;
  }
  const grade = result.grade && result.grade.grade !== "N/A" ? `${result.grade.grade}  ` : "";
  const head = bold(thresholdColor(score, opts)(`${grade}${score}/100`), opts);
  const delta = deltaSuffix ? `  ${dim(deltaSuffix, opts)}` : "";
  return `  ${dot}  ${head}${delta}   ${sub}`;
}
```
(b) Replace `axisLine` — drop the trailing "N findings" clutter; keep glyph + name + score + bar:
```ts
function axisLine(a: AxisScore, opts: TerminalOpts): string {
  const gly = statusGlyph(a.score, { color: opts.color, unicode: opts.unicode });
  const name = visiblePad(a.axis, AXIS_NAME_WIDTH);
  const scoreText = visiblePad(a.score === "N/A" ? "—" : String(a.score), AXIS_SCORE_WIDTH, "left");
  const barViz = bar(a.score, opts, 20);
  return `  ${gly} ${name}  ${scoreText}  ${barViz}`;
}
```
(c) The token-registry hint: find the block that prints the 3 lines ("No design token registry found…", "Your score reflects…", "Run `lyse init`…") and replace it with a single dim line:
```ts
    lines.push("");
    lines.push(`  ${dim("No token registry detected — run `lyse init` for a calibrated score.", opts)}`);
```
(d) In `scoreLine`'s callers and the delta computation, ensure no `result.scoringVersion` is appended anywhere in the human output (search the file for `scoringVersion` and remove it from rendered strings; it stays in JSON via the json reporter). The delta `deltaSuffix`: keep it ONLY when non-zero — in the delta block, set `deltaSuffix` only `if (delta.score !== 0)` and format as `▲ ${delta.score}` / `▼ ${Math.abs(delta.score)}` (drop the "since Nd ago" text).

- [ ] **Step 4: Regenerate the snapshot + run**

```bash
pnpm exec vitest run tests/reporters/terminal.test.ts -u && pnpm exec vitest run tests/reporters/terminal.test.ts
```
Expected: PASS. Inspect the updated snapshot to confirm: a `● <grade> <score>/100   design system health` score line, clean axis lines, top findings, the one-line hint, no `scoring-v`/`since`.

- [ ] **Step 5: Changeset + typecheck + commit**

Create `.changeset/lyse-clean-report.md`:
```markdown
---
"@lyse-labs/lyse": minor
---

Cleaner `lyse audit` report: a concise score line (`● B 71/100 · design system health`), tidy per-axis bars, and top findings — with scoring-version, delta, and token-registry jargon trimmed out.
```
Then:
```bash
pnpm typecheck && pnpm exec vitest run tests/reporters
git add src/reporters/terminal.ts tests/reporters/terminal.test.ts tests/reporters/__snapshots__ .changeset/lyse-clean-report.md
git commit -m "feat(reporters): clean, jargon-free health report"
```

---

### Task 2: Render the clean report inside `lyse init`

**Files:**
- Modify: `src/commands/init.ts`
- Test: `tests/commands/init.test.ts`, `tests/integration/init-fresh-repo.test.ts` (stay green unmodified)

**Interfaces:**
- Consumes: `renderTerminal` from `../reporters/terminal.js`; `computeTerminalOpts` — if not exported from `cli.ts`, inline the equivalent `TerminalOpts` construction in init (see Step 3).
- Produces: no signature change to `runInit`.

- [ ] **Step 1: Confirm init tests are green at baseline**

```bash
pnpm exec vitest run tests/commands/init.test.ts tests/integration/init-fresh-repo.test.ts
```
Expected: PASS. Record counts.

- [ ] **Step 2: Add the renderer import to `init.ts`**

Add near the top of `src/commands/init.ts`:
```ts
import { renderTerminal } from "../reporters/terminal.js";
```

- [ ] **Step 3: Replace the clack score+findings output with the clean report**

In `runInit`, find the line that prints the score via the wizard (currently `wizardStep(\`Health Score: ${result.finalScore}/100 …\`)`) and the `wizardNote(... "Findings")` / "What do you want to do?" block. Replace the **score + findings presentation** with a single render of the clean report:
```ts
  const reportOpts = {
    mode: "default" as const,
    color: (process.stdout.isTTY ?? false) && !(typeof process.env["NO_COLOR"] === "string" && process.env["NO_COLOR"] !== ""),
    unicode: (process.stdout.isTTY ?? false) && process.platform !== "win32",
    width: Math.min(process.stdout.columns ?? 80, 100),
    outDir: undefined,
    fileCount: pipeline.componentInventory.length === 0 ? 0 : 0,
    durationMs: 0,
    cwd: opt.cwd,
    hasTokenRegistry: !!pipeline.config.designSystem?.componentsModule,
    findingsLimit: 5,
  };
  process.stdout.write((await renderTerminal(result, reportOpts)) + "\n");
```
(`fileCount`/`durationMs` aren't tracked in init's direct `auditDirectory` call; pass `0` — the header's "N files · Xs" is cosmetic here. If `result` exposes a file count, use it.) Keep `wizardIntro("lyse init")` and the final `wizardOutro`. Remove the now-unused `wizardStep`/`wizardNote` calls for score/findings (and their imports if unused).

- [ ] **Step 4: Run init + full reporters tests**

```bash
pnpm exec vitest run tests/commands/init.test.ts tests/integration/init-fresh-repo.test.ts tests/reporters
```
Expected: PASS, same init counts as Step 1 (these run `yes:true`, non-TTY → renderTerminal degrades to plain text; the FS assertions are unaffected). If a test fails, fix the source, not the test.

- [ ] **Step 5: Full suite + typecheck + build + smoke**

```bash
pnpm typecheck && pnpm test && pnpm build
node dist/cli.js audit fixtures/full-ds --format=text --no-color --no-prompt 2>/dev/null | head -14
```
Expected: green; the smoke shows the clean report (score line `● … /100 · design system health`, clean axes, top findings, no jargon).

- [ ] **Step 6: Commit**

```bash
git add src/commands/init.ts
git commit -m "feat(cli): lyse init renders the shared clean report"
```

---

## Phase 1 Self-Review

- D2/D3/D8 (clean shared report, no jargon) → Task 1 + Task 2. ✅
- Init tests stay green (yes:true, non-TTY) → Task 2 Step 4. ✅
- Changeset → Task 1 Step 5. ✅
- No placeholders; complete code; commands have expected output. ✅
- Type consistency: `renderTerminal(result, TerminalOpts)` matches its existing signature; `reportOpts` provides every `TerminalOpts` field. ✅

---

# PHASE 2 — The agent handoff (spec locked; detailed task-plan authored after Phase 1)

Doctor-React-shaped: after the report, hand the issues to the user's coding agent. Lyse never fixes code. This section is the **locked spec** (zero gray zones on design); its bite-sized task plan is written as `2026-06-23-lyse-agent-handoff-phase2.md` once Phase 1 merges.

## Phase 2 File Structure

- **Create** `src/agent/registry.ts` — the agent table. One entry per agent:
  `{ id: "claude-code"|"cursor"|"codex"|"opencode", displayName, binary, detect: () => boolean, skillPath: (root) => string, skillFormat: "skill-md"|"cursor-mdc"|"agents-md" }`.
  Detection = config dir exists (`~/.claude`, `<root>/.cursor`, …) OR `binary` on PATH (reuse `is-command-available` logic).
- **Create** `src/agent/payload.ts` — `buildHandoffPayload(findings, { projectName, topN, maxFilesPerRule, jsonPath })` → a plain-text prompt. Format (locked, mirrors react-doctor): a header line; per rule-group (top N=5, ≤3 files/rule) `N. <SEV> <axis>: <ruleId>\n   <message>\n   <helpUri>\n   - <file>:<line> …`; a footer ("Read each file and fix the root cause — don't suppress. Edit the working tree, don't commit. Re-run `lyse audit` and confirm the score went up. Teach me as you go."). Reuses `Finding` + `ruleMap` meta (`helpUri`, `shortDescription`).
- **Create** `src/agent/skill.ts` — `installLyseSkill(agent, root)` writes the bundled `skills/lyse/SKILL.md` to the agent's `skillPath` (or appends a lyse-managed block to `AGENTS.md` for the `agents-md` format — reuse `init-write-agents-md.ts`'s managed-block logic).
- **Create** `skills/lyse/SKILL.md` — thin dispatcher (frontmatter name/description/version): "After DS changes run `lyse audit`; for a full triage fetch the playbook at `https://getlyse.com/prompts/lyse-agent.md`; per-rule recipes via `lyse explain <rule>`." Copied into the npm package at build (extend `scripts/copy-templates.mjs`).
- **Create** `src/agent/handoff.ts` — `runHandoff({ findings, projectName, root })`: `wizardSelect` "Fix these with your coding agent" with one choice per detected agent (`Hand off N issues to <agent>` → install skill + copy payload to clipboard in v1; spawn in v2), plus "Copy the prompt", "Skip". Remembers last pick.
- **Create** `src/agent/launch.ts` (v2) — `spawn(binary, [...autoFlags, payload], { cwd, stdio: "inherit" })`; clipboard fallback. Auto-flags: claude `--dangerously-skip-permissions`, codex `--yolo`, cursor `--force`.
- **Modify** `src/cli.ts` — bare `lyse` → scan + report + `runHandoff` (replaces the REPL menu); the `audit` post-report block → `runHandoff` (replaces `showActionMenu`/codemod dispatch, per D1); add the `lyse install` command (skill for all detected agents + reuse `init`/`mcp setup`).
- **Modify** `src/commands/init.ts` — after the report, call `runHandoff` in the interactive path (replacing any codemod prompt).

## Phase 2 Locked Decisions

- Handoff v1 ships **copy-prompt + install-skill**; v2 adds **spawn** (`launch.ts`). Same `runHandoff` select, the agent choices just gain the spawn behavior.
- Clipboard: `pbcopy` (darwin) / `clip` (win) / `wl-copy`||`xclip`||`xsel` (linux), via `child_process`; fallback = print the payload between dim rules.
- The hosted playbook (`getlyse.com/prompts/lyse-agent.md` + `/prompts/rules/<ruleId>.md`) is a `lyse-internal` Worker static asset, auto-generated from rule `meta`. Not required for v1 (skill points to `lyse explain <rule>` until the host exists).
- `lyse fix` (codemods) is NOT wired into `runHandoff` (D1). It remains a standalone command.

## Phase 2 — Context bundle handed to the agent (closes the token-map gap)

Verified against Lyse's data (deep search): the agent needs more than the findings for two fix classes (token-mapping, architecture-content). The handoff writes a temp dir `~/.lyse/handoff-<ts>/` (or `--output-dir`) containing:

- **`prompt.txt`** — the payload passed to the agent (CLI arg / clipboard). Per rule-group: `<SEV> <axis>: <ruleId>` · `message` · `helpUri` (from `RuleMeta`, NOT on `Finding` — the payload builder must join it from `ruleMap`) · `suggestion` · ≤3 `file:line`. Footer: "fix the root cause, don't suppress; edit the working tree, don't commit; re-run `lyse audit` and confirm the score rose; run `lyse explain <rule>` for the recipe; teach me as you go."
- **`findings.json`** — ALL findings (the existing `--format=json` payload), so the agent sees beyond top-N.
- **`tokens.json`** — the serialized `TokenMap` (`{ colors: {"#2563eb":["color.action.primary"]}, spacing: {...}, … , source }`). **This is the one bounded engine-adjacent addition** — `TokenMap` is runtime-only today; serialize it here (empty object when no map loaded). Unlocks "replace #hex with the exact token" for values where the inline `suggestion` was absent/ambiguous.
- The agent also reads the repo's **`LYSE.md`** (token names + component inventory + conventions — already written by `init`) and **the source files**, and can re-run **`lyse audit`** / **`lyse explain <rule>`** for ground truth.

Per-class context sufficiency (locked from the audit): a11y guards / doc-presence / MCP-structural / frontmatter → **suggestion alone suffices**. Token-mapping → **needs `tokens.json`**. Architecture-content (component-manifest) → **needs LYSE.md inventory**. The bundle above covers all of them.

## Phase 2 — Exhaustive use-case & edge-case matrix (rien oublié)

Every scenario `runHandoff` / the flow must handle, with the locked behavior:

**Invocation context**
- TTY + ≥1 agent detected → show the handoff select.
- Non-TTY / pipe / `CI` / `--yes` / `LYSE_NO_PROMPT` / `--quiet` → **no handoff**; report (or machine format) + exit code only.
- `--json` / `--score` / `sarif` / `tsv` (machine formats) → no handoff; machine output only.
- The agent's own re-run of `lyse audit` is non-interactive (it inherits CI/non-TTY or we pass nothing interactive) → **no nested handoff prompt** (must not recurse).

**Findings state**
- 0 findings → **no handoff**; clean `✓ no issues` outro.
- Findings present → handoff offered. Huge count (≥40 files on a rule) → payload caps top-N (5) + ≤3 files/rule; `findings.json` carries all; add a "migration-scale, fix a representative sample first" note.

**Agent detection**
- No known agent detected (no `~/.claude`/`.cursor`/… dir, no `claude`/`cursor`/`codex` on PATH) → select offers only **"Copy the prompt"** + **"Skip"**, plus a one-line hint "install Claude Code or Cursor to fix automatically."
- One agent → pre-selected (single Enter).
- Multiple agents → list all; remember the last pick (persist to `~/.lyse/`), pre-select it next run.
- Config dir present but binary not on PATH → can install skill + copy prompt; launch (v2) unavailable → offer copy for that agent.
- Unknown agent on PATH (not in the registry) → not offered (registry-gated, deliberate).

**Token map**
- Loaded + value matches → `suggestion` names the token; `tokens.json` serialized.
- Loaded + value NOT in map → `suggestion` absent; `tokens.json` still serialized (agent decides via the full map + LYSE.md).
- No map (no `.lyse.yaml` / no detectable tokens) → `tokens.json` = `{}`; report shows the one-line "no token registry" hint; token-mapping fixes degrade to agent judgment; other classes unaffected.
- Multiple candidate tokens → `suggestion` lists them; `tokens.json` has the full map.

**Launch (v2) — `launch.ts`**
- Launch succeeds → agent takes the terminal (`stdio: "inherit"`).
- Spawn error → fallback: copy to clipboard, else print `prompt.txt` between dim rules.
- Windows → `.cmd` shim: resolve the real JS entry, `spawn node <entry> [...flags, prompt]`.
- Auto-approve flags: claude `--dangerously-skip-permissions`, codex `--yolo`, cursor `--force`.

**Skill install — `skill.ts`**
- Success → spinner success.
- Failure (permissions / read-only FS) → **best-effort, never blocks the handoff**; warn + continue to copy/launch.
- Re-run / already installed → **idempotent** (overwrite the managed skill file; for `AGENTS.md` format, replace the lyse-managed block — reuse `init-write-agents-md.ts`'s begin/end markers).

**`lyse install` (one-time command)**
- Installs the skill for ALL detected agents + (reuses) `init`'s AGENTS.md/LYSE.md + `mcp setup`.
- No agent detected → tell the user, suggest installing one; still write LYSE.md/AGENTS.md.
- Re-run → idempotent.

**Safety / privacy invariants**
- Lyse **never edits user source** (agent-only; D1). The handoff writes ONLY to its temp dir + the agent's skill path.
- **No source code leaves the machine**: the payload carries `file:line` + messages + suggestions + the user's own tokens — never file contents. The launch hands the prompt to the **local** agent process. Consistent with Lyse's privacy posture.
- The agent is instructed "don't commit, don't open PRs, edit the working tree" — Lyse doesn't commit either.

**Resilience**
- Clipboard unavailable on all platforms → print the prompt (never silently lose it).
- `~/.lyse/handoff-*` temp dir cleanup: leave it (the agent reads `findings.json`/`tokens.json` during its run); prune old ones on the next handoff.

---

## Execution note

Phase 1 is built first (subagent-driven). After it lands and the clean report is visually signed off, the Phase 2 task-plan is authored from the locked spec above and executed the same way.
