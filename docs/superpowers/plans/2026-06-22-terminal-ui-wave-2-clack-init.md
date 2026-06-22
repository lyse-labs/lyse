# Terminal UI — Wave 2, Slice 1 (clack `lyse init` wizard) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `lyse init`'s ad-hoc `console.log` + `prompts`-based confirmations with a `@clack/prompts`-backed wizard, sharing one reusable wrapper that later Wave 2 slices (REPL, consent prompts) will reuse — while preserving every behavior and staying safe in non-TTY/CI.

**Architecture:** Add `@clack/prompts`. Create `src/ui/wizard.ts` — a thin, brand-aware, non-TTY-safe wrapper over clack (intro/outro/note/step/confirm/task-spinner) that **bypasses every interactive prompt when `!isInteractive()`** (returns the supplied default) and **degrades decorative output to plain `console.log`** in non-interactive contexts. Rewrite `runInit`'s I/O layer to use the wrapper; the audit/fix/mcp/email logic, file writes, and history events are unchanged.

**Tech Stack:** TypeScript (strict), Node ≥22, vitest, `@clack/prompts` (new), the Wave-1 `src/ui/tokens.ts`. Package manager: **pnpm**.

## Global Constraints

- Node `>=22`; ESM — relative imports end in `.js`; strict TS (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`); `import type` for type-only imports.
- No comments unless the WHY is non-obvious. Deterministic output. English. Conventional Commits.
- Any user-facing change needs a Changeset (`pnpm changeset`); never hand-edit `packages/core/package.json` version.
- **Interactive prompts must never run when `!isInteractive()`** — i.e. when `LYSE_YES=1`, `LYSE_NO_PROMPT=1`, `CI=true|1`, or stdout is not a TTY. In those cases the wizard returns the caller's default and prints plain text. This is the existing `src/menu/prompts.ts` contract — reuse `isInteractive()`, do not re-derive it.
- `runInit` must keep its exact external behavior: writes `.lyse.yaml`, updates `.gitignore`, runs the first audit, writes `LYSE.md`+`AGENTS.md`, appends the same history events, and chains fix/mcp/email under the same conditions. Init tests assert filesystem artifacts (not console output) and all drive `runInit({ yes: true })`.
- All paths relative to `packages/core/`.

## Design decisions (flagged — vetoable at the execution-handoff gate)

1. **Thin reusable wrapper in `src/ui/wizard.ts`** (vs inline clack calls in `init.ts`). Chosen because Wave 2's later slices (REPL menu, the 3 consent prompts) will reuse the same vocabulary, and it keeps clack contained behind one module. If you'd rather inline-only for now, Task 1 collapses into Task 2.
2. **Decorative output degrades to plain `console.log` when non-interactive** (clack's rail/symbols only render in an interactive TTY). Keeps CI logs clean per clig.dev ("no decoration in non-TTY"). The alternative — always use clack primitives — would leak rail glyphs into CI output.
3. **Ctrl-C / cancel maps to the prompt's default-negative** (`wizardConfirm` returns `false` on cancel). For init's first "Proceed?" that aborts cleanly; for the fix/mcp confirms it simply skips that step. No mid-wizard hard-exit.
4. **Scope is `lyse init` ONLY.** `cli.ts`, `menu/repl.ts`, `menu/action-menu.ts`, `mcp-setup.ts`, `feedback.ts` keep using the old `prompts` helper this slice. Migrating them + removing `prompts` is a later slice.

## File Structure

- **Create** `src/ui/wizard.ts` — clack wrapper: `wizardIntro`, `wizardOutro`, `wizardNote`, `wizardStep`, `wizardConfirm`, `wizardTask`. One responsibility: a non-TTY-safe interactive presentation layer.
- **Create** `tests/ui/wizard.test.ts` — verifies the non-interactive bypass contract (no clack call, returns default, plain output) and cancel handling.
- **Modify** `src/commands/init.ts` — swap the I/O layer to the wrapper; logic untouched.
- **Modify** `package.json` — add `@clack/prompts`.
- **Create** `.changeset/terminal-ui-wave-2-clack-init.md`.

---

### Task 1: `@clack/prompts` dependency + `ui/wizard.ts` wrapper

**Files:**
- Modify: `package.json` (add `@clack/prompts`)
- Create: `src/ui/wizard.ts`
- Create: `tests/ui/wizard.test.ts`
- Create: `.changeset/terminal-ui-wave-2-clack-init.md`

**Interfaces:**
- Consumes: `isInteractive` from `../menu/prompts.js`.
- Produces:
  - `function wizardIntro(title: string): void`
  - `function wizardOutro(message: string): void`
  - `function wizardNote(body: string, title?: string): void`
  - `function wizardStep(message: string): void`
  - `function wizardConfirm(message: string, defaultValue?: boolean): Promise<boolean>`
  - `function wizardTask<T>(startLabel: string, stopLabel: string, fn: () => Promise<T>): Promise<T>`

- [ ] **Step 1: Add the dependency**

Run from `packages/core/`:
```bash
pnpm add @clack/prompts
```
Expected: `@clack/prompts` appears under `dependencies` in `package.json`.

- [ ] **Step 2: Write the failing test**

Create `tests/ui/wizard.test.ts`. The contract under test is the non-interactive path (CI sets `process.stdout.isTTY` falsy, so `isInteractive()` is false in vitest):
```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { wizardConfirm, wizardIntro, wizardNote, wizardTask } from "../../src/ui/wizard.js";

afterEach(() => vi.restoreAllMocks());

describe("ui/wizard non-interactive contract", () => {
  it("wizardConfirm returns the default without prompting when non-interactive", async () => {
    // vitest runs with no TTY -> isInteractive() is false
    await expect(wizardConfirm("Proceed?", true)).resolves.toBe(true);
    await expect(wizardConfirm("Proceed?", false)).resolves.toBe(false);
  });

  it("wizardConfirm defaults to true when no default is given", async () => {
    await expect(wizardConfirm("Proceed?")).resolves.toBe(true);
  });

  it("decorative output degrades to plain console.log when non-interactive", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    wizardIntro("lyse init");
    wizardNote("Nuxt 3 · TypeScript", "Stack detected");
    expect(spy).toHaveBeenCalled();
    const printed = spy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(printed).toContain("lyse init");
    expect(printed).toContain("Stack detected");
    expect(printed).toContain("Nuxt 3 · TypeScript");
  });

  it("wizardTask runs the fn and returns its value when non-interactive", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const out = await wizardTask("Scanning…", "Done", async () => 42);
    expect(out).toBe(42);
    expect(spy).toHaveBeenCalledWith("Scanning…");
  });

  it("wizardTask propagates errors", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(
      wizardTask("Scanning…", "Done", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run from `packages/core/`:
```bash
pnpm exec vitest run tests/ui/wizard.test.ts
```
Expected: FAIL — cannot resolve `../../src/ui/wizard.js`.

- [ ] **Step 4: Implement `src/ui/wizard.ts`**

```ts
import { intro, outro, note, log, confirm, spinner, isCancel, cancel } from "@clack/prompts";
import { isInteractive } from "../menu/prompts.js";

export function wizardIntro(title: string): void {
  if (isInteractive()) {
    intro(title);
  } else {
    console.log(`\n${title}\n`);
  }
}

export function wizardOutro(message: string): void {
  if (isInteractive()) {
    outro(message);
  } else {
    console.log(message);
  }
}

export function wizardNote(body: string, title?: string): void {
  if (isInteractive()) {
    if (title === undefined) note(body);
    else note(body, title);
  } else if (title === undefined) {
    console.log(body);
  } else {
    console.log(`${title}\n${body}`);
  }
}

export function wizardStep(message: string): void {
  if (isInteractive()) {
    log.step(message);
  } else {
    console.log(message);
  }
}

export async function wizardConfirm(message: string, defaultValue = true): Promise<boolean> {
  if (!isInteractive()) return defaultValue;
  const answer = await confirm({ message, initialValue: defaultValue });
  if (isCancel(answer)) {
    cancel("Aborted.");
    return false;
  }
  return answer;
}

export async function wizardTask<T>(startLabel: string, stopLabel: string, fn: () => Promise<T>): Promise<T> {
  if (!isInteractive()) {
    console.log(startLabel);
    return fn();
  }
  const s = spinner();
  s.start(startLabel);
  try {
    const out = await fn();
    s.stop(stopLabel);
    return out;
  } catch (err) {
    s.stop(`${stopLabel} — failed`);
    throw err;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:
```bash
pnpm exec vitest run tests/ui/wizard.test.ts
```
Expected: PASS (5 tests).

- [ ] **Step 6: Add the changeset**

Create `.changeset/terminal-ui-wave-2-clack-init.md`:
```markdown
---
"@lyse-labs/lyse": minor
---

Terminal UI: the `lyse init` wizard now uses an interactive @clack/prompts flow (intro/outro, grouped confirmations, task spinners). Non-interactive and CI runs are unchanged — prompts are bypassed and output stays plain text.
```

- [ ] **Step 7: Typecheck + commit**

```bash
pnpm typecheck
```
Expected: no errors. Then:
```bash
git add package.json pnpm-lock.yaml src/ui/wizard.ts tests/ui/wizard.test.ts .changeset/terminal-ui-wave-2-clack-init.md
git commit -m "feat(ui): add @clack/prompts wizard wrapper (non-TTY safe)"
```
(Note: stage `pnpm-lock.yaml` too — the Wave-1 lockfile-omission bug must not repeat.)

---

### Task 2: Migrate `runInit` to the wizard wrapper

**Files:**
- Modify: `src/commands/init.ts`
- Test: `tests/commands/init.test.ts` and `tests/integration/init-fresh-repo.test.ts` (must stay green unmodified)

**Interfaces:**
- Consumes: `wizardIntro`, `wizardOutro`, `wizardNote`, `wizardStep`, `wizardConfirm`, `wizardTask` from `../ui/wizard.js`.
- Produces: no API change — `runInit(opt: InitOptions): Promise<void>` signature is unchanged.

- [ ] **Step 1: Confirm the existing init tests are green before refactor (regression baseline)**

Run from `packages/core/`:
```bash
pnpm exec vitest run tests/commands/init.test.ts tests/integration/init-fresh-repo.test.ts
```
Expected: PASS. Record the count — Task 2 must end with the same tests still green, unmodified.

- [ ] **Step 2: Swap the imports in `init.ts`**

Replace:
```ts
import { confirm } from "../menu/prompts.js";
```
with:
```ts
import { wizardIntro, wizardOutro, wizardNote, wizardStep, wizardConfirm, wizardTask } from "../ui/wizard.js";
```

- [ ] **Step 3: Rewrite the I/O layer of `runInit` (logic unchanged)**

Apply these edits inside `runInit`. Behavior, writes, history events, and control flow are identical — only presentation calls change.

(a) Intro + detection (replaces lines 25–31):
```ts
  console.log("\nWelcome to Lyse.\n");

  // 1. Pre-flight + detection
  const detected = await runPreFlight(opt.cwd, opt.skipNodeCheck ? { skipNodeCheck: true } : undefined);
  console.log(formatDetected(detected));
  console.log("");
  await appendInitStepCompletedEvent(opt.cwd, "detection");
```
becomes:
```ts
  wizardIntro("lyse init");

  // 1. Pre-flight + detection
  const detected = await runPreFlight(opt.cwd, opt.skipNodeCheck ? { skipNodeCheck: true } : undefined);
  wizardNote(formatDetected(detected), "Stack detected");
  await appendInitStepCompletedEvent(opt.cwd, "detection");
```

(b) Confirm (replaces lines 34–40):
```ts
  if (!opt.yes) {
    const ok = await confirm("Proceed with this configuration?", true);
    if (!ok) {
      console.log("Aborted.");
      return;
    }
  }
```
becomes:
```ts
  if (!opt.yes) {
    const ok = await wizardConfirm("Proceed with this configuration?", true);
    if (!ok) {
      wizardOutro("Aborted.");
      return;
    }
  }
```

(c) First audit (replaces lines 49–52):
```ts
  console.log("Running first audit...\n");
  const pipeline = await auditDirectory(opt.cwd, { staticOnly: true });
  const result = pipeline.result;
  await appendInitStepCompletedEvent(opt.cwd, "audit");
```
becomes:
```ts
  const pipeline = await wizardTask("Running first audit…", "Audit complete", () =>
    auditDirectory(opt.cwd, { staticOnly: true }),
  );
  const result = pipeline.result;
  await appendInitStepCompletedEvent(opt.cwd, "audit");
```

(d) Score line (replaces line 75):
```ts
  console.log(`  Health Score: ${result.finalScore}/100\n`);
```
becomes:
```ts
  wizardStep(`Health Score: ${result.finalScore}/100`);
```

(e) Auto-fix confirm (replaces line 85's `confirm` call only):
```ts
      opt.yes || (await confirm(`Apply ${fixableCount} potentially auto-fixable findings (creates a branch)?`, true));
```
becomes:
```ts
      opt.yes || (await wizardConfirm(`Apply ${fixableCount} potentially auto-fixable findings (creates a branch)?`, true));
```

(f) MCP confirm (replaces line 108's `confirm` call only):
```ts
      opt.yes || (await confirm("Wire Lyse into your IDE (MCP)?", true));
```
becomes:
```ts
      opt.yes || (await wizardConfirm("Wire Lyse into your IDE (MCP)?", true));
```

(g) Summary (replaces lines 124–127):
```ts
  console.log("✓ Setup complete. Daily commands:");
  console.log("    lyse audit       → re-check");
  console.log("    lyse fix         → apply new auto-fixes\n");
  console.log("⭐ Star the repo: github.com/lyse-labs/lyse\n");
```
becomes:
```ts
  wizardNote(
    "lyse audit   → re-check\nlyse fix     → apply new auto-fixes\n\n⭐ Star the repo: github.com/lyse-labs/lyse",
    "Setup complete",
  );
  wizardOutro("You're set up.");
```

Leave the `writeAiReadinessSurface` console.logs (lines 144–150), the fix-result `console.log`s (lines 94–100), and the MCP-skip `console.log`s as-is — they print sub-step results and are out of scope for this slice. (The `confirm` import is now fully replaced; verify no remaining `confirm(` call references the old helper.)

- [ ] **Step 4: Run the init tests — must be green unmodified**

Run:
```bash
pnpm exec vitest run tests/commands/init.test.ts tests/integration/init-fresh-repo.test.ts
```
Expected: PASS, same counts as Step 1. These tests use `yes: true` and run non-TTY, so `wizardConfirm` returns defaults and decorative calls print plain text — no clack prompt is invoked. If any test fails, do NOT edit the test; fix `init.ts` so behavior matches. If a failure reveals a genuine spec ambiguity, STOP and report.

- [ ] **Step 5: Full suite + typecheck**

Run from `packages/core/`:
```bash
pnpm typecheck && pnpm test
```
Expected: typecheck clean; full suite green. (Other suites are unaffected — only `init.ts` changed and only its presentation.)

- [ ] **Step 6: Manual interactive smoke (evidence)**

In a real terminal (TTY), from the repo root after `pnpm build` in `packages/core`:
```bash
node packages/core/dist/cli.js init --help >/dev/null 2>&1 || true
```
Then describe (in the report) running `lyse init` in a scratch dir interactively: confirm the clack rail renders (intro "lyse init", a "Stack detected" note, a Y/n confirm, an audit spinner, the "Setup complete" note + outro) and that `LYSE_NO_PROMPT=1 lyse init --yes` in a non-TTY prints plain lines with no rail and no hang. If a real TTY is unavailable in this environment, say so and rely on the non-interactive test coverage from Task 1 + Step 4.

- [ ] **Step 7: Commit**

```bash
git add src/commands/init.ts
git commit -m "feat(cli): lyse init wizard uses @clack/prompts flow"
```

---

## Self-Review

**1. Spec coverage:**
- Add `@clack/prompts` → Task 1. ✅
- Reusable non-TTY-safe wrapper → Task 1 (`ui/wizard.ts`). ✅
- `lyse init` migrated, behavior preserved → Task 2. ✅
- Non-interactive/CI bypass contract → wizard guards on `isInteractive()`; init tests (all `yes:true`, non-TTY) green unmodified → Task 1 Step 2 + Task 2 Step 4. ✅
- Changeset → Task 1 Step 6. ✅
- Scope limited to init (other `prompts` consumers untouched) → Design decision 4. ✅

**2. Placeholder scan:** No TBD/TODO; every code step shows complete code; every command has an expected result. ✅

**3. Type consistency:** Wizard signatures (`wizardConfirm(message, defaultValue?)`, `wizardTask<T>(start, stop, fn)`, `wizardNote(body, title?)`) are identical between Task 1 (definition) and Task 2 (call sites). `confirm` from clack returns `boolean | symbol`; `isCancel` narrows the symbol before the `return answer` (boolean) — type-safe under strict TS. ✅

## Out of scope (later Wave 2 slices)

Migrating `cli.ts` REPL, `menu/repl.ts`, `menu/action-menu.ts`, `mcp-setup.ts`, `feedback.ts`, and the 3 consent prompts to clack; removing the `prompts` dependency; `--format=table`/`--format=tsv`; `resolveUiOpts()` unification; `LYSE_NO_BANNER`.
