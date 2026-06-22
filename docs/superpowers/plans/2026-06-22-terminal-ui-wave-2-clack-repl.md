# Terminal UI — Wave 2, Slice 2 (clack REPL + action menu) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the two interactive *menus* — the root REPL menu (`lyse` with no subcommand) and the post-audit action menu — onto `@clack/prompts` `select`, via a new `wizardSelect` added to the existing `src/ui/wizard.ts` wrapper, with no behavior change in non-interactive/CI contexts.

**Architecture:** Add one function, `wizardSelect`, to the Wave-2-slice-1 wizard wrapper (same non-TTY-safe contract: bypass clack and return the caller's default when `!isInteractive()`). Repoint `menu/repl.ts`'s `promptForAction` and `menu/action-menu.ts`'s `showActionMenu` at it. The old `prompts`-based `choice()` helper stays for its other consumer (`mcp-setup.ts`) this slice.

**Tech Stack:** TypeScript (strict), Node ≥22, vitest, `@clack/prompts` (already a dep since slice 1), `src/ui/wizard.ts`. Package manager: **pnpm**.

## Global Constraints

- Node `>=22`; ESM — relative imports end in `.js`; strict TS (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`); `import type` for type-only imports.
- No comments unless WHY non-obvious. Deterministic output. English. Conventional Commits.
- User-facing change → Changeset; never hand-edit the package version.
- **Interactive prompts must never run when `!isInteractive()`** (LYSE_YES=1 / LYSE_NO_PROMPT=1 / CI / non-TTY) — `wizardSelect` returns the caller's default in that case, calling no clack function. Reuse `isInteractive()` from `src/menu/prompts.ts`.
- Behavior preserved: `promptForAction()` still returns a `ReplActionId` (default/first = the current `initial: 0` = `"audit"` equivalent — see Task 2); `showActionMenu()` still returns `"exit"` when non-interactive and the same choices otherwise. Existing menu tests assert the non-interactive paths and must stay green unmodified.
- Scope: REPL + action-menu only. `mcp-setup.ts` (the other `choice()` caller) and the 3 consent prompts are out of scope for this slice.
- Paths relative to `packages/core/`.

## File Structure

- **Modify** `src/ui/wizard.ts` — add `wizardSelect<T extends string>(message, options, defaultValue?)`.
- **Modify** `tests/ui/wizard.test.ts` — add non-interactive bypass + default-selection cases for `wizardSelect`.
- **Modify** `src/menu/repl.ts` — `promptForAction` uses `wizardSelect`.
- **Modify** `src/menu/action-menu.ts` — `showActionMenu` uses `wizardSelect`.
- **Create** `.changeset/terminal-ui-wave-2-clack-repl.md`.

---

### Task 1: add `wizardSelect` to the wizard wrapper

**Files:**
- Modify: `src/ui/wizard.ts`
- Modify: `tests/ui/wizard.test.ts`
- Create: `.changeset/terminal-ui-wave-2-clack-repl.md`

**Interfaces:**
- Consumes: `@clack/prompts` `select`, `isCancel`; existing `isInteractive` import.
- Produces: `function wizardSelect<T extends string>(message: string, options: { value: T; label: string; hint?: string }[], defaultValue?: T): Promise<T>` — returns `defaultValue ?? options[0].value` when non-interactive or on cancel.

- [ ] **Step 1: Write the failing test**

Append to `tests/ui/wizard.test.ts` (new `describe` block):
```ts
import { wizardSelect } from "../../src/ui/wizard.js";

describe("ui/wizard wizardSelect non-interactive contract", () => {
  const opts = [
    { value: "a" as const, label: "Alpha" },
    { value: "b" as const, label: "Bravo" },
  ];

  it("returns the explicit default without prompting when non-interactive", async () => {
    await expect(wizardSelect("Pick", opts, "b")).resolves.toBe("b");
  });

  it("falls back to the first option when no default is given", async () => {
    await expect(wizardSelect("Pick", opts)).resolves.toBe("a");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `packages/core/`:
```bash
pnpm exec vitest run tests/ui/wizard.test.ts
```
Expected: FAIL — `wizardSelect` is not exported.

- [ ] **Step 3: Implement `wizardSelect`**

In `src/ui/wizard.ts`, add `select` to the clack import:
```ts
import { intro, outro, note, log, confirm, spinner, isCancel, cancel } from "@clack/prompts";
```
becomes:
```ts
import { intro, outro, note, log, confirm, select, spinner, isCancel, cancel } from "@clack/prompts";
```
Then append this exported function:
```ts
export async function wizardSelect<T extends string>(
  message: string,
  options: { value: T; label: string; hint?: string }[],
  defaultValue?: T,
): Promise<T> {
  const fallback = defaultValue ?? options[0]?.value;
  if (fallback === undefined) {
    throw new Error("wizardSelect requires at least one option");
  }
  if (!isInteractive()) return fallback;
  const answer = await select({
    message,
    options: options.map((o) => (o.hint === undefined ? { value: o.value, label: o.label } : { value: o.value, label: o.label, hint: o.hint })),
    initialValue: fallback,
  });
  if (isCancel(answer)) {
    cancel("Aborted.");
    return fallback;
  }
  return answer as T;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
pnpm exec vitest run tests/ui/wizard.test.ts
```
Expected: PASS (the slice-1 cases + the 2 new ones).

- [ ] **Step 5: Add the changeset**

Create `.changeset/terminal-ui-wave-2-clack-repl.md`:
```markdown
---
"@lyse-labs/lyse": minor
---

Terminal UI: the interactive `lyse` menu and the post-audit action menu now render with @clack/prompts. Non-interactive/CI behavior is unchanged.
```

- [ ] **Step 6: Typecheck + commit**

```bash
pnpm typecheck
```
Expected: clean. Then:
```bash
git add src/ui/wizard.ts tests/ui/wizard.test.ts .changeset/terminal-ui-wave-2-clack-repl.md
git commit -m "feat(ui): add wizardSelect to the clack wizard wrapper"
```

---

### Task 2: migrate the REPL + action menus to `wizardSelect`

**Files:**
- Modify: `src/menu/repl.ts`
- Modify: `src/menu/action-menu.ts`
- Test: `tests/menu/repl.test.ts`, `tests/menu/action-menu.test.ts`, `tests/cli.menu.test.ts` (stay green unmodified)

**Interfaces:**
- Consumes: `wizardSelect` from `../ui/wizard.js`.
- Produces: no signature change — `promptForAction(): Promise<ReplActionId>`, `showActionMenu(ctx): Promise<MenuChoice>`.

- [ ] **Step 1: Baseline the menu tests (regression anchor)**

Run from `packages/core/`:
```bash
pnpm exec vitest run tests/menu/repl.test.ts tests/menu/action-menu.test.ts tests/cli.menu.test.ts
```
Expected: PASS. Record counts — these must end green unmodified.

- [ ] **Step 2: Migrate `promptForAction` in `src/menu/repl.ts`**

Replace the import line:
```ts
import prompts from "prompts";
import { isInteractive } from "./prompts.js";
```
with:
```ts
import { isInteractive } from "./prompts.js";
import { wizardSelect } from "../ui/wizard.js";
```
Then replace `promptForAction`:
```ts
export async function promptForAction(): Promise<ReplActionId> {
  const r = await prompts({
    type: "select",
    name: "v",
    message: "What now?",
    choices: REPL_ACTIONS.map((a) => ({ title: a.title, description: a.description, value: a.id })),
    initial: 0,
  });
  if (r.v === undefined) return "exit";
  return r.v as ReplActionId;
}
```
with:
```ts
export async function promptForAction(): Promise<ReplActionId> {
  const first = REPL_ACTIONS[0]?.id ?? "exit";
  return wizardSelect(
    "What now?",
    REPL_ACTIONS.map((a) => ({ value: a.id, label: a.title, hint: a.description })),
    first,
  );
}
```
Note: the old code returned `"exit"` on cancel (`r.v === undefined`); `wizardSelect` returns the default (`first`, = `"audit"`) on cancel. To preserve the cancel→exit behavior, pass `"exit"` as the default instead:
```ts
export async function promptForAction(): Promise<ReplActionId> {
  return wizardSelect(
    "What now?",
    REPL_ACTIONS.map((a) => ({ value: a.id, label: a.title, hint: a.description })),
    "exit",
  );
}
```
Use this second form — it keeps cancel→`"exit"` (Ctrl-C quits the menu, matching today). `isInteractive` stays imported (used by `runRepl`).

- [ ] **Step 3: Migrate `showActionMenu` in `src/menu/action-menu.ts`**

Replace:
```ts
import { choice, isInteractive } from "./prompts.js";
```
with:
```ts
import { isInteractive } from "./prompts.js";
import { wizardSelect } from "../ui/wizard.js";
```
Then replace the final return:
```ts
  return await choice("What now?", choices, ctx.autoFixableCount > 0 ? "fix" : "exit");
```
with:
```ts
  return await wizardSelect(
    "What now?",
    choices.map((c) => ({ value: c.value, label: c.title })),
    ctx.autoFixableCount > 0 ? "fix" : "exit",
  );
```
(The local `choices` array keeps its `{ title, value }` shape; only the call adapts `title`→`label`. `showActionMenu` already early-returns `"exit"` when `!isInteractive()` at the top, so the wizardSelect call is only reached interactively — but its own guard keeps it safe regardless.)

- [ ] **Step 4: Run the menu tests — green unmodified**

Run:
```bash
pnpm exec vitest run tests/menu/repl.test.ts tests/menu/action-menu.test.ts tests/cli.menu.test.ts
```
Expected: PASS, same counts as Step 1. Do not edit tests; if one fails, fix the source. Non-interactive is the tested path (`wizardSelect` returns the default), so they should pass unchanged.

- [ ] **Step 5: Full suite + typecheck**

```bash
pnpm typecheck && pnpm test
```
Expected: clean + green.

- [ ] **Step 6: Commit**

```bash
git add src/menu/repl.ts src/menu/action-menu.ts
git commit -m "feat(cli): REPL + action menus use the clack wizardSelect"
```

---

## Self-Review

**1. Spec coverage:** `wizardSelect` added (Task 1); REPL `promptForAction` migrated (Task 2 Step 2); action-menu `showActionMenu` migrated (Task 2 Step 3); non-interactive contract preserved (wizardSelect guard + menu tests green); changeset (Task 1 Step 5). ✅

**2. Placeholder scan:** No TBD/TODO; complete code in every step; commands have expected results. ✅

**3. Type consistency:** `wizardSelect<T extends string>(message, options: {value,label,hint?}[], defaultValue?)` is identical between Task 1 (definition) and both call sites (Task 2). `ReplActionId` and `MenuChoice` are string unions, satisfying `T extends string`. clack `select` returns `value | symbol`; `isCancel` narrows before the `as T` return. ✅

## Out of scope (later)

The 3 consent prompts (telemetry/llm/email) — privacy-sensitive, separate slice. `mcp-setup.ts`'s `choice()` call. Removing the `prompts` dependency (still used by `mcp-setup`, `feedback`, the consents, and `menu/prompts.ts`). `--format=table`/`--format=tsv`; `resolveUiOpts()`; `LYSE_NO_BANNER`.
