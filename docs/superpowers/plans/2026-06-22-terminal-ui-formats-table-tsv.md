# Terminal UI — Output Formats `--format=table` + `--format=tsv` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two audit output formats on the Azure-CLI model — `tsv` (keyless, tab-separated findings for `grep`/`cut`/`$()`) and `table` (a human-scannable aligned findings table) — without touching scoring or existing formats.

**Architecture:** Extract the deterministic finding sort into `src/reporters/finding-order.ts` (shared, DRY). Add `src/reporters/tsv.ts` (`renderTsv`, pure/machine/no-color) and `src/reporters/table.ts` (`renderTable`, color/width-aware via `TerminalOpts`). Wire both into the `cli.ts` audit format dispatch: `tsv` is a machine format (suppresses spinner + post-audit menu, ignores `--limit`); `table` is a human format (honors color/width/`--limit`).

**Tech Stack:** TypeScript (strict), Node ≥22, vitest, the Wave-1 `reporters/terminal-format.ts` helpers. Package manager: **pnpm**.

## Global Constraints

- Node `>=22`; ESM — relative imports end in `.js`; strict TS (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`); `import type` for type-only imports.
- No comments unless WHY non-obvious. **Deterministic output** (sorted findings, sorted keys). English. Conventional Commits.
- User-facing change → Changeset; never hand-edit the package version.
- Existing formats (`json`, `text`, `eslint`, `legacy`, `sarif`, `html`) and the Health Score are unchanged. `renderJson` output must be byte-identical after the sort extraction (its tests stay green).
- `tsv` is machine output: no color, no header row (Azure model — keyless), tab/newline-sanitized fields, full finding set (ignores `--limit`), spinner + post-audit menu suppressed.
- `table` is human output: aligned columns, honors `NO_COLOR`/`--no-color`/width and `--limit`.
- Paths relative to `packages/core/`.

## Finding shape (from `src/types.ts`)

`Finding = { ruleId: string; axis: string; severity: "error"|"warning"|"info"; location: { file: string; line: number; column: number }; message: string; suggestion?: string; confidence?: "high"|"medium"|"low" }`.

## File Structure

- **Create** `src/reporters/finding-order.ts` — `SEVERITY_ORDER`, `sortFindings(a,b)`.
- **Modify** `src/reporters/json.ts` — import the two from `finding-order.ts` (remove the local copies).
- **Create** `src/reporters/tsv.ts` — `renderTsv(result)`.
- **Create** `src/reporters/table.ts` — `renderTable(result, opts)`.
- **Create** `tests/reporters/tsv.test.ts`, `tests/reporters/table.test.ts`.
- **Modify** `src/cli.ts` — dispatch + machine-format flags + limit default + `--format` description.
- **Create** `.changeset/terminal-ui-formats-table-tsv.md`.

---

### Task 1: extract finding sort + `renderTsv`

**Files:**
- Create: `src/reporters/finding-order.ts`
- Modify: `src/reporters/json.ts`
- Create: `src/reporters/tsv.ts`
- Create: `tests/reporters/tsv.test.ts`
- Create: `.changeset/terminal-ui-formats-table-tsv.md`

**Interfaces:**
- Produces: `SEVERITY_ORDER`, `sortFindings(a: Finding, b: Finding): number` (in `finding-order.ts`); `renderTsv(result: AuditResult): string` (in `tsv.ts`).

- [ ] **Step 1: Extract the sort into `finding-order.ts`**

Create `src/reporters/finding-order.ts`:
```ts
import type { Finding } from "../types.js";

export const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 } as const;

export function sortFindings(a: Finding, b: Finding): number {
  if (a.severity !== b.severity) return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
  if (a.location.file !== b.location.file) return a.location.file < b.location.file ? -1 : 1;
  if (a.location.line !== b.location.line) return a.location.line - b.location.line;
  if (a.location.column !== b.location.column) return a.location.column - b.location.column;
  return a.ruleId < b.ruleId ? -1 : 1;
}
```

- [ ] **Step 2: Repoint `json.ts` at the shared sort**

In `src/reporters/json.ts`, replace the top:
```ts
import type { AuditResult, Finding } from "../types.js";

const SCHEMA_URL =
  "https://github.com/lyse-labs/lyse/raw/main/schemas/v1/lyse-result.json";

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 } as const;

function sortFindings(a: Finding, b: Finding): number {
  if (a.severity !== b.severity) return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
  if (a.location.file !== b.location.file) return a.location.file < b.location.file ? -1 : 1;
  if (a.location.line !== b.location.line) return a.location.line - b.location.line;
  if (a.location.column !== b.location.column) return a.location.column - b.location.column;
  return a.ruleId < b.ruleId ? -1 : 1;
}
```
with:
```ts
import type { AuditResult } from "../types.js";
import { sortFindings } from "./finding-order.js";

const SCHEMA_URL =
  "https://github.com/lyse-labs/lyse/raw/main/schemas/v1/lyse-result.json";
```
(The rest of `json.ts` is unchanged; `Finding` is no longer referenced there, so it's dropped from the import.)

- [ ] **Step 3: Write the failing tsv test**

Create `tests/reporters/tsv.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { renderTsv } from "../../src/reporters/tsv.js";
import type { AuditResult } from "../../src/types.js";

const base: AuditResult = {
  schemaVersion: 2, rulesVersion: "0.1.0", toolVersion: "0.1.0", scoringVersion: "scoring-v1",
  repoRoot: "/r", timestamp: "", stack: [], finalScore: 50, axes: [],
  findings: [
    { ruleId: "tokens/b", axis: "tokens", severity: "warning",
      location: { file: "src/B.tsx", line: 2, column: 1 }, message: "msg\twith\ttabs" },
    { ruleId: "tokens/a", axis: "tokens", severity: "error",
      location: { file: "src/A.tsx", line: 9, column: 3 }, message: "first" },
  ],
};

describe("renderTsv", () => {
  it("emits one tab-separated line per finding, error before warning, no header", () => {
    const out = renderTsv(base);
    const lines = out.trimEnd().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("error\ttokens/a\ttokens\tsrc/A.tsx\t9\t3\tfirst");
    expect(lines[0]!.split("\t")).toHaveLength(7);
  });

  it("sanitizes tabs/newlines in the message so columns stay parseable", () => {
    const warnLine = renderTsv(base).trimEnd().split("\n")[1]!;
    expect(warnLine).toBe("warning\ttokens/b\ttokens\tsrc/B.tsx\t2\t1\tmsg with tabs");
  });

  it("ends with a trailing newline when there are findings, empty string when none", () => {
    expect(renderTsv(base).endsWith("\n")).toBe(true);
    expect(renderTsv({ ...base, findings: [] })).toBe("");
  });
});
```

- [ ] **Step 4: Run it — expect failure**

```bash
pnpm exec vitest run tests/reporters/tsv.test.ts
```
Expected: FAIL — `../../src/reporters/tsv.js` unresolved.

- [ ] **Step 5: Implement `tsv.ts`**

Create `src/reporters/tsv.ts`:
```ts
import type { AuditResult } from "../types.js";
import { sortFindings } from "./finding-order.js";

const clean = (s: string): string => s.replace(/[\t\r\n]+/g, " ");

export function renderTsv(result: AuditResult): string {
  const sorted = [...result.findings].sort(sortFindings);
  if (sorted.length === 0) return "";
  const lines = sorted.map((f) =>
    [f.severity, f.ruleId, f.axis, f.location.file, String(f.location.line), String(f.location.column), clean(f.message)].join("\t"),
  );
  return lines.join("\n") + "\n";
}
```

- [ ] **Step 6: Run tsv + json tests**

```bash
pnpm exec vitest run tests/reporters/tsv.test.ts tests/reporters/json.test.ts
```
Expected: tsv PASS; `json.test.ts` PASS (output byte-identical after the extraction).

- [ ] **Step 7: Changeset + typecheck + commit**

Create `.changeset/terminal-ui-formats-table-tsv.md`:
```markdown
---
"@lyse-labs/lyse": minor
---

`lyse audit` gains two output formats: `--format=tsv` (keyless tab-separated findings for grep/cut/scripts) and `--format=table` (a human-scannable findings table).
```
Then:
```bash
pnpm typecheck
```
Expected: clean. Commit:
```bash
git add src/reporters/finding-order.ts src/reporters/json.ts src/reporters/tsv.ts tests/reporters/tsv.test.ts .changeset/terminal-ui-formats-table-tsv.md
git commit -m "feat(reporters): add tsv output + extract shared finding sort"
```

---

### Task 2: `renderTable` (human findings table)

**Files:**
- Create: `src/reporters/table.ts`
- Create: `tests/reporters/table.test.ts`

**Interfaces:**
- Consumes: `TerminalOpts`, `severityColor`, `dim`, `bold`, `visiblePad`, `truncateStart` from `./terminal-format.js`; `sortFindings` from `./finding-order.js`.
- Produces: `renderTable(result: AuditResult, opts: TerminalOpts): string`.

- [ ] **Step 1: Write the failing test**

Create `tests/reporters/table.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { renderTable } from "../../src/reporters/table.js";
import type { AuditResult } from "../../src/types.js";
import type { TerminalOpts } from "../../src/reporters/terminal-format.js";

const result: AuditResult = {
  schemaVersion: 2, rulesVersion: "0.1.0", toolVersion: "0.1.0", scoringVersion: "scoring-v1",
  repoRoot: "/r", timestamp: "", stack: [], finalScore: 50, axes: [],
  findings: [
    { ruleId: "tokens/no-hardcoded-color", axis: "tokens", severity: "warning",
      location: { file: "src/Button.tsx", line: 14, column: 1 }, message: "Hardcoded color #3B82F6" },
    { ruleId: "responsive/no-hardcoded-media-query", axis: "responsive", severity: "error",
      location: { file: "src/Modal.tsx", line: 31, column: 1 }, message: "Hardcoded media query 768px" },
  ],
};
const opts: TerminalOpts = {
  mode: "default", color: false, unicode: false, width: 100,
  outDir: undefined, fileCount: 2, durationMs: 0, cwd: "/r",
};

describe("renderTable", () => {
  it("has a header row and one row per finding (error sorted first)", () => {
    const out = renderTable(result, opts);
    const lines = out.split("\n").filter((l) => l.trim() !== "");
    expect(lines[0]).toContain("SEVERITY");
    expect(lines[0]).toContain("RULE");
    expect(lines[0]).toContain("LOCATION");
    expect(lines[0]).toContain("MESSAGE");
    const body = lines.slice(1).join("\n");
    expect(body).toContain("error");
    expect(body).toContain("responsive/no-hardcoded-media-query");
    expect(body).toContain("src/Modal.tsx:31");
    expect(body.indexOf("Modal.tsx")).toBeLessThan(body.indexOf("Button.tsx"));
  });

  it("emits no ANSI escapes when color is off", () => {
    // eslint-disable-next-line no-control-regex
    expect(/\x1b\[/.test(renderTable(result, opts))).toBe(false);
  });

  it("honors findingsLimit", () => {
    const out = renderTable(result, { ...opts, findingsLimit: 1 });
    const rows = out.split("\n").filter((l) => l.includes(".tsx:"));
    expect(rows).toHaveLength(1);
  });

  it("renders an empty-state line when there are no findings", () => {
    const out = renderTable({ ...result, findings: [] }, opts);
    expect(out.toLowerCase()).toContain("no findings");
  });
});
```

- [ ] **Step 2: Run it — expect failure**

```bash
pnpm exec vitest run tests/reporters/table.test.ts
```
Expected: FAIL — module unresolved.

- [ ] **Step 3: Implement `table.ts`**

Create `src/reporters/table.ts`:
```ts
import type { AuditResult, Finding } from "../types.js";
import { sortFindings } from "./finding-order.js";
import { severityColor, dim, bold, visiblePad, truncateStart, type TerminalOpts } from "./terminal-format.js";

const SEVERITY_WIDTH = 8;
const RULE_WIDTH = 36;
const LOCATION_WIDTH = 24;

function row(f: Finding, opts: TerminalOpts): string {
  const sev = visiblePad(severityColor(f.severity, opts)(f.severity), SEVERITY_WIDTH);
  const rule = visiblePad(f.ruleId, RULE_WIDTH);
  const loc = visiblePad(truncateStart(`${f.location.file}:${f.location.line}`, LOCATION_WIDTH), LOCATION_WIDTH);
  const used = SEVERITY_WIDTH + RULE_WIDTH + LOCATION_WIDTH + 3;
  const msgWidth = Math.max(10, opts.width - used);
  const msg = truncateStart(f.message, msgWidth);
  return ` ${sev} ${rule} ${loc} ${msg}`;
}

export function renderTable(result: AuditResult, opts: TerminalOpts): string {
  const sorted = [...result.findings].sort(sortFindings);
  if (sorted.length === 0) {
    return `\n ${dim("No findings.", opts)}\n`;
  }
  const limit = opts.findingsLimit ?? sorted.length;
  const shown = sorted.slice(0, limit);
  const header = ` ${bold(visiblePad("SEVERITY", SEVERITY_WIDTH), opts)} ${bold(visiblePad("RULE", RULE_WIDTH), opts)} ${bold(visiblePad("LOCATION", LOCATION_WIDTH), opts)} ${bold("MESSAGE", opts)}`;
  const lines = [header, ...shown.map((f) => row(f, opts))];
  const remaining = sorted.length - shown.length;
  if (remaining > 0) {
    lines.push(` ${dim(`… ${remaining} more (use --limit=all)`, opts)}`);
  }
  return lines.join("\n") + "\n";
}
```

- [ ] **Step 4: Run table tests**

```bash
pnpm exec vitest run tests/reporters/table.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm typecheck
```
Expected: clean. Commit:
```bash
git add src/reporters/table.ts tests/reporters/table.test.ts
git commit -m "feat(reporters): add human-readable table output"
```

---

### Task 3: wire `table` + `tsv` into the audit dispatch

**Files:**
- Modify: `src/cli.ts`
- Create: `tests/cli.table-tsv-format.test.ts`

**Interfaces:**
- Consumes: `renderTsv` from `./reporters/tsv.js`, `renderTable` from `./reporters/table.js`.

- [ ] **Step 1: Add imports**

In `src/cli.ts`, near the other reporter imports (e.g. after the `renderHtml`/`renderSarif` imports), add:
```ts
import { renderTsv } from "./reporters/tsv.js";
import { renderTable } from "./reporters/table.js";
```

- [ ] **Step 2: Update the `--format` description (line ~187)**

Replace:
```ts
    format: { type: "string", description: "json | text | eslint | legacy | sarif | html (default: text → ESLint-style for tty, json otherwise)" },
```
with:
```ts
    format: { type: "string", description: "json | text | table | tsv | eslint | legacy | sarif | html (default: text for tty, json otherwise)" },
```

- [ ] **Step 3: Treat `tsv` as a machine format for the spinner (line ~322)**

Replace:
```ts
    const isMachineFormatForSpinner =
      formatForSpinner === "json" || formatForSpinner === "sarif" || formatForSpinner === "html";
```
with:
```ts
    const isMachineFormatForSpinner =
      formatForSpinner === "json" || formatForSpinner === "sarif" || formatForSpinner === "html" || formatForSpinner === "tsv";
```

- [ ] **Step 4: `table` honors a full-list limit default (line ~399)**

Replace:
```ts
      textFindingsLimit = resolveLimit(args, format === "eslint" ? null : undefined);
```
with:
```ts
      textFindingsLimit = resolveLimit(args, format === "eslint" || format === "table" ? null : undefined);
```

- [ ] **Step 5: Add the `tsv` branch + the `table` route in the dispatch**

In the dispatch (currently `if sarif … else if html … else { json/text }`), add a `tsv` branch after the `html` branch:
```ts
    } else if (format === "html") {
```
Insert BEFORE the final `} else {`:
```ts
    } else if (format === "tsv") {
      const tsvContent = renderTsv(result);
      if (args.output) {
        const outDir = resolve(args.output);
        mkdirSync(outDir, { recursive: true });
        writeFileSync(join(outDir, "lyse.tsv"), tsvContent);
      } else {
        process.stdout.write(tsvContent);
      }
    } else {
```
Then inside the final `else` block, extend `isTextFormat` and `renderTextForStdout`:
```ts
      const isTextFormat = format === "text" || format === "eslint" || format === "legacy";

      const renderTextForStdout = async (): Promise<string> => {
        if (format === "eslint") {
          return renderEslintStyleAudit(result, textFindingsLimit) + "\n";
        }
        const opts = computeTerminalOpts(args, isTTY, fileCount, Date.now() - startTime, repoRoot, hasTokenRegistry, textFindingsLimit);
        return (await renderTerminal(result, opts)) + "\n";
      };
```
becomes:
```ts
      const isTextFormat = format === "text" || format === "eslint" || format === "legacy" || format === "table";

      const renderTextForStdout = async (): Promise<string> => {
        if (format === "eslint") {
          return renderEslintStyleAudit(result, textFindingsLimit) + "\n";
        }
        const opts = computeTerminalOpts(args, isTTY, fileCount, Date.now() - startTime, repoRoot, hasTokenRegistry, textFindingsLimit);
        if (format === "table") {
          return renderTable(result, opts) + "\n";
        }
        return (await renderTerminal(result, opts)) + "\n";
      };
```

- [ ] **Step 6: Suppress the post-audit menu for `tsv` (line ~459)**

Replace:
```ts
    const isMachineFormat = format === "json" || format === "sarif";
```
with:
```ts
    const isMachineFormat = format === "json" || format === "sarif" || format === "tsv";
```

- [ ] **Step 7: Write the CLI integration test**

Create `tests/cli.table-tsv-format.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const CLI = join(__dirname, "..", "dist", "cli.js");
const FIXTURE = join(__dirname, "..", "fixtures", "full-ds");

function run(format: string): string {
  return execFileSync("node", [CLI, "audit", FIXTURE, `--format=${format}`, "--no-color", "--no-prompt"], {
    encoding: "utf8", env: { ...process.env, CI: "true" },
  });
}

describe("lyse audit --format=tsv|table", () => {
  it("tsv emits tab-separated rows and no ANSI", () => {
    const out = run("tsv");
    const dataLines = out.trimEnd().split("\n").filter((l) => l.includes("\t"));
    expect(dataLines.length).toBeGreaterThan(0);
    // eslint-disable-next-line no-control-regex
    expect(/\x1b\[/.test(out)).toBe(false);
    expect(dataLines[0]!.split("\t").length).toBe(7);
  });

  it("table emits a header and findings", () => {
    const out = run("table");
    expect(out).toContain("SEVERITY");
    expect(out).toContain("MESSAGE");
  });
});
```
Note: this test shells out to `dist/cli.js`, so it requires a build. `pnpm test` runs `pnpm build` first, so it passes under `pnpm test`. If running the file in isolation, build first (`pnpm build`).

- [ ] **Step 8: Build, full suite, typecheck**

```bash
pnpm typecheck && pnpm test
```
Expected: typecheck clean; full suite green including the new CLI test. Confirm `fixtures/full-ds` Health Score is unchanged (rendering-only change).

- [ ] **Step 9: Manual smoke (evidence)**

```bash
node packages/core/dist/cli.js audit packages/core/fixtures/full-ds --format=tsv --no-color --no-prompt | head -3
node packages/core/dist/cli.js audit packages/core/fixtures/full-ds --format=table --no-color --no-prompt | head -6
```
Expected: tsv = tab-separated rows, no header, no color; table = a header row + aligned finding rows. Report both.

- [ ] **Step 10: Commit**

```bash
git add src/cli.ts tests/cli.table-tsv-format.test.ts
git commit -m "feat(cli): wire --format=table and --format=tsv into audit"
```

---

## Self-Review

**1. Spec coverage:** `tsv` reporter (Task 1) + `table` reporter (Task 2) + dispatch wiring incl. machine-format/limit/menu handling (Task 3); shared sort extracted DRY (Task 1); changeset (Task 1). ✅

**2. Placeholder scan:** No TBD/TODO; complete code in every step; commands have expected results. ✅

**3. Type consistency:** `renderTsv(result: AuditResult): string` and `renderTable(result: AuditResult, opts: TerminalOpts): string` are identical between definition (Tasks 1–2) and call sites (Task 3). `sortFindings` signature is identical across `finding-order.ts`, `json.ts`, `tsv.ts`, `table.ts`. `TerminalOpts.findingsLimit?: number | null` honored in `renderTable`. ✅

## Out of scope

Migrating the 3 consent prompts / removing `prompts` (separate, deferred); removing `picocolors`; `resolveUiOpts()`; `LYSE_NO_BANNER`; a `table`/`tsv` variant for non-audit commands.
