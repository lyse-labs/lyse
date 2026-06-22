# Terminal UI — Wave 1 (Doctor View + Design Tokens) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Lyse's terminal output a small, dogfooded design system (color + glyph tokens) and make the default audit view a "doctor"-style health check — a status glyph per axis, one score verdict, the fixes that move it.

**Architecture:** Introduce a single source of truth, `src/ui/tokens.ts` (color via `ansis`, glyphs with ASCII fallback, score→status mapping). Refactor the two existing rendering surfaces (`reporters/terminal-format.ts`, `util/spinner.ts`) to consume it without changing their public APIs. Refresh the gauge-first renderer (`reporters/terminal.ts`) into the doctor view and make it the default `text` format; keep ESLint-style available as `--format=eslint`. Refresh the REPL banner to use the same tokens.

**Tech Stack:** TypeScript (strict), Node ≥22, vitest, `ansis` (new), `string-width`, `citty`. Package manager: **pnpm** (the repo's scripts use `pnpm build`, `pnpm test`, `pnpm changeset`).

## Global Constraints

- Node `>=22`; ESM (`"type": "module"`) — all relative imports end in `.js`.
- Strict TS: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` — type-only imports use `import type`.
- No comments unless the WHY is non-obvious.
- Deterministic output (no time/random in rendered strings except where already present).
- All artifacts in English.
- Conventional Commits (`feat:`, `refactor:`, `test:`, `build:`).
- Any user-facing change needs a Changeset (`pnpm changeset`); **never** hand-edit `packages/core/package.json` version.
- Smoke test must stay green: `npx @lyse-labs/lyse audit fixtures/full-ds/` produces a stable Health Score; the `fixtures/full-ds` snapshot/score must not change.
- Brand teal is `#10b5a4` (existing). Thresholds: score ≥70 = pass, ≥40 = warn, <40 = fail, `"N/A"` = muted.
- All paths below are relative to `packages/core/`.

## Flagged decision (resolve at execution handoff)

Task 4 flips the default `text` audit format from ESLint-style back to the gauge-first doctor view, reversing the Spec §9 / T31 default. ESLint-style stays reachable via `--format=eslint`. If the reviewer wants to keep ESLint as default instead, Task 4 changes to expose the doctor as `--format=doctor` and leaves the default untouched — do Tasks 1–3 + 5 unchanged either way.

## File Structure

- **Create** `src/ui/tokens.ts` — the terminal design system: `color.*` painters, `GLYPH` table + `glyph()`, `statusOf()`, `statusColor()`, `statusGlyph()`, `bar()`. One responsibility: map semantic intent → ANSI/glyph strings, gated by `{color, unicode}`.
- **Create** `src/ui/banner.ts` — `brandHeader()` (the `◈ lyse` line) shared by the doctor view and the REPL.
- **Modify** `src/reporters/terminal-format.ts` — delegate internals to `ui/tokens`; drop the hardcoded teal constant and `picocolors` import. Public signatures unchanged.
- **Modify** `src/util/spinner.ts` — route frame/success/fail color + `✔`/`✗` glyphs through `ui/tokens`; behavior unchanged.
- **Modify** `src/reporters/terminal.ts` — doctor header + status-glyph axis checklist.
- **Modify** `src/cli.ts` — default `text` → `renderTerminal`; `--format=eslint` → ESLint-style; adjust `textFindingsLimit` default.
- **Modify** `src/menu/repl.ts` — `renderReplBanner` uses `brandHeader()`.
- **Create** tests under `tests/ui/`, extend `tests/reporters/terminal.test.ts`, `tests/util/spinner.test.ts`, `tests/menu/` as noted.

---

### Task 1: Design tokens (`ui/tokens.ts`) + `ansis` dependency

**Files:**
- Modify: `package.json` (add `ansis` dependency)
- Create: `src/ui/tokens.ts`
- Create: `tests/ui/tokens.test.ts`
- Create: `.changeset/terminal-ui-wave-1.md`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces:
  - `interface UiOpts { color: boolean; unicode: boolean }`
  - `const color: { brand; pass; warn; fail; muted; bold }` where each is `(s: string, opts: UiOpts) => string`
  - `type GlyphName` and `function glyph(name: GlyphName, opts: UiOpts): string`
  - `type Status = "pass" | "warn" | "fail" | "muted"`
  - `function statusOf(score: number | "N/A"): Status`
  - `function statusColor(status: Status): (s: string, opts: UiOpts) => string`
  - `function statusGlyph(score: number | "N/A", opts: UiOpts): string`
  - `function bar(score: number | "N/A", opts: UiOpts, cells?: number): string`

- [ ] **Step 1: Add the `ansis` dependency**

Run from `packages/core/`:
```bash
pnpm add ansis
```
Expected: `ansis` appears under `dependencies` in `package.json` and is installed in the workspace.

- [ ] **Step 2: Write the failing test**

Create `tests/ui/tokens.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { color, glyph, statusOf, statusGlyph, bar, type UiOpts } from "../../src/ui/tokens.js";

const plain: UiOpts = { color: false, unicode: false };
const rich: UiOpts = { color: true, unicode: true };

describe("ui/tokens", () => {
  it("statusOf maps score bands", () => {
    expect(statusOf(85)).toBe("pass");
    expect(statusOf(70)).toBe("pass");
    expect(statusOf(64)).toBe("warn");
    expect(statusOf(40)).toBe("warn");
    expect(statusOf(12)).toBe("fail");
    expect(statusOf("N/A")).toBe("muted");
  });

  it("color painters are identity when color is off", () => {
    expect(color.brand("lyse", plain)).toBe("lyse");
    expect(color.pass("ok", plain)).toBe("ok");
  });

  it("color painters wrap in ANSI when color is on", () => {
    const out = color.brand("lyse", rich);
    expect(out).not.toBe("lyse");
    expect(out).toContain("lyse");
  });

  it("glyph falls back to ASCII when unicode is off", () => {
    expect(glyph("pass", plain)).toBe("v");
    expect(glyph("fail", plain)).toBe("x");
    expect(glyph("barFull", plain)).toBe("#");
    expect(glyph("pass", rich)).toBe("✔");
  });

  it("statusGlyph picks glyph + color by score band (plain)", () => {
    expect(statusGlyph(85, plain)).toBe("v");
    expect(statusGlyph(64, plain)).toBe("!");
    expect(statusGlyph(10, plain)).toBe("x");
    expect(statusGlyph("N/A", plain)).toBe("o");
  });

  it("bar fills proportionally and pads to cells (plain)", () => {
    expect(bar(50, plain, 10)).toBe("#####-----");
    expect(bar("N/A", plain, 4)).toBe("----");
    expect(bar(100, plain, 4)).toBe("####");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run from `packages/core/`:
```bash
pnpm exec vitest run tests/ui/tokens.test.ts
```
Expected: FAIL — cannot resolve `../../src/ui/tokens.js`.

- [ ] **Step 4: Write the implementation**

Create `src/ui/tokens.ts`:
```ts
import ansis from "ansis";

export interface UiOpts {
  color: boolean;
  unicode: boolean;
}

type Paint = (s: string, opts: UiOpts) => string;

const paint = (fn: (s: string) => string): Paint => (s, opts) => (opts.color ? fn(s) : s);

export const color = {
  brand: paint((s) => ansis.hex("#10b5a4")(s)),
  pass: paint((s) => ansis.green(s)),
  warn: paint((s) => ansis.yellow(s)),
  fail: paint((s) => ansis.red(s)),
  muted: paint((s) => ansis.dim(s)),
  bold: paint((s) => ansis.bold(s)),
} as const;

export const GLYPH = {
  pass: { uni: "✔", ascii: "v" },
  warn: { uni: "⚠", ascii: "!" },
  fail: { uni: "✘", ascii: "x" },
  pending: { uni: "◐", ascii: "*" },
  bullet: { uni: "●", ascii: "o" },
  caret: { uni: "❯", ascii: ">" },
  barFull: { uni: "█", ascii: "#" },
  barEmpty: { uni: "░", ascii: "-" },
} as const;

export type GlyphName = keyof typeof GLYPH;

export function glyph(name: GlyphName, opts: UiOpts): string {
  return opts.unicode ? GLYPH[name].uni : GLYPH[name].ascii;
}

export type Status = "pass" | "warn" | "fail" | "muted";

export function statusOf(score: number | "N/A"): Status {
  if (score === "N/A" || !Number.isFinite(score)) return "muted";
  if (score >= 70) return "pass";
  if (score >= 40) return "warn";
  return "fail";
}

const STATUS_PAINT: Record<Status, Paint> = {
  pass: color.pass,
  warn: color.warn,
  fail: color.fail,
  muted: color.muted,
};

export function statusColor(status: Status): Paint {
  return STATUS_PAINT[status];
}

export function statusGlyph(score: number | "N/A", opts: UiOpts): string {
  const status = statusOf(score);
  const name: GlyphName =
    status === "pass" ? "pass" : status === "warn" ? "warn" : status === "fail" ? "fail" : "bullet";
  return STATUS_PAINT[status](glyph(name, opts), opts);
}

export function bar(score: number | "N/A", opts: UiOpts, cells = 20): string {
  const full = glyph("barFull", opts);
  const empty = glyph("barEmpty", opts);
  if (score === "N/A" || !Number.isFinite(score)) return color.muted(empty.repeat(cells), opts);
  const clamped = Math.max(0, Math.min(100, score));
  const filled = Math.round((clamped / 100) * cells);
  return statusColor(statusOf(clamped))(full.repeat(filled), opts) + color.muted(empty.repeat(cells - filled), opts);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:
```bash
pnpm exec vitest run tests/ui/tokens.test.ts
```
Expected: PASS (6 tests).

- [ ] **Step 6: Add the changeset**

Create `.changeset/terminal-ui-wave-1.md`:
```markdown
---
"@lyse-labs/lyse": minor
---

Terminal UI: introduce a dogfooded design-token layer (color + glyphs) and a doctor-style default audit view — a status glyph per axis with the Health Score as the verdict. ESLint-style output remains available via `--format=eslint`.
```

- [ ] **Step 7: Typecheck + commit**

Run:
```bash
pnpm typecheck
```
Expected: no errors. Then:
```bash
git add package.json src/ui/tokens.ts tests/ui/tokens.test.ts .changeset/terminal-ui-wave-1.md
git commit -m "feat(ui): add terminal design tokens (color + glyphs) on ansis"
```

---

### Task 2: Route `terminal-format.ts` through tokens

**Files:**
- Modify: `src/reporters/terminal-format.ts`
- Create: `tests/reporters/terminal-format.test.ts`

**Interfaces:**
- Consumes: `ui/tokens` — `color`, `glyph`, `statusOf`, `statusColor`, `bar as tokenBar`, `statusGlyph`, `UiOpts`.
- Produces: unchanged public API — `teal`, `thresholdColor`, `severityColor`, `dim`, `bold`, `bar`, `statusDot`, `visiblePad`, `truncateStart`, `link`, `TerminalOpts`. (Existing consumers `terminal.ts` and `cli.ts` keep compiling untouched.)

- [ ] **Step 1: Write the failing test**

Create `tests/reporters/terminal-format.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { teal, dim, bar, statusDot, severityColor } from "../../src/reporters/terminal-format.js";
import type { TerminalOpts } from "../../src/reporters/terminal-format.js";

const base: TerminalOpts = {
  mode: "default", color: false, unicode: false, width: 80,
  outDir: undefined, fileCount: 1, durationMs: 0, cwd: "/tmp",
};

describe("terminal-format token delegation", () => {
  it("no-color mode is plain text", () => {
    expect(teal("lyse", base)).toBe("lyse");
    expect(dim("x", base)).toBe("x");
    expect(severityColor("error", base)("e")).toBe("e");
  });

  it("bar uses ASCII glyphs in no-unicode mode", () => {
    expect(bar(50, base, 10)).toBe("#####-----");
  });

  it("statusDot is the ASCII bullet in no-unicode mode", () => {
    expect(statusDot(85, base)).toBe("o");
    expect(statusDot("N/A", base)).toBe("o");
  });

  it("teal emits ANSI when color is on", () => {
    const out = teal("lyse", { ...base, color: true });
    expect(out).not.toBe("lyse");
    expect(out).toContain("lyse");
  });
});
```
Note: this changes the no-unicode `statusDot` glyph from `*` to `o` (unified bullet token). Acceptable — it's a non-default (`color:false`) path; update any snapshot that captured `*`.

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
pnpm exec vitest run tests/reporters/terminal-format.test.ts
```
Expected: FAIL — `statusDot(85, base)` returns `"*"`, expected `"o"`.

- [ ] **Step 3: Rewrite `terminal-format.ts` internals**

Replace the file `src/reporters/terminal-format.ts` with:
```ts
import stringWidth from "string-width";
import { color, glyph, statusOf, statusColor, bar as tokenBar, type UiOpts } from "../ui/tokens.js";

export type TerminalMode = "default" | "quiet" | "verbose";

export interface TerminalOpts {
  mode: TerminalMode;
  color: boolean;
  unicode: boolean;
  width: number;
  outDir: string | undefined;
  fileCount: number;
  durationMs: number;
  cwd: string;
  hasTokenRegistry?: boolean;
  findingsLimit?: number | null;
}

const ui = (opts: TerminalOpts): UiOpts => ({ color: opts.color, unicode: opts.unicode });

export function teal(s: string, opts: TerminalOpts): string {
  return color.brand(s, ui(opts));
}

export function thresholdColor(score: number | "N/A", opts: TerminalOpts): (s: string) => string {
  if (!opts.color || score === "N/A") return (s) => s;
  const paint = statusColor(statusOf(score));
  return (s) => paint(s, ui(opts));
}

export function severityColor(
  severity: "error" | "warning" | "info",
  opts: TerminalOpts,
): (s: string) => string {
  if (!opts.color) return (s) => s;
  const paint = severity === "error" ? color.fail : severity === "warning" ? color.warn : color.muted;
  return (s) => paint(s, ui(opts));
}

export function dim(s: string, opts: TerminalOpts): string {
  return color.muted(s, ui(opts));
}

export function bold(s: string, opts: TerminalOpts): string {
  return color.bold(s, ui(opts));
}

export function bar(score: number | "N/A", opts: TerminalOpts, cells = 20): string {
  return tokenBar(score, ui(opts), cells);
}

export function visiblePad(text: string, targetWidth: number, side: "left" | "right" = "right"): string {
  const visible = stringWidth(text);
  if (visible >= targetWidth) return text;
  const pad = " ".repeat(targetWidth - visible);
  return side === "right" ? text + pad : pad + text;
}

export function truncateStart(text: string, maxWidth: number): string {
  if (maxWidth < 2) return text;
  const visible = stringWidth(text);
  if (visible <= maxWidth) return text;
  const target = maxWidth - 1;
  let kept = "";
  for (let i = text.length - 1; i >= 0; i--) {
    const candidate = text.charAt(i) + kept;
    if (stringWidth(candidate) > target) break;
    kept = candidate;
  }
  return "…" + kept;
}

export function statusDot(score: number | "N/A", opts: TerminalOpts): string {
  return statusColor(statusOf(score))(glyph("bullet", ui(opts)), ui(opts));
}

const OSC_OPEN = "\x1b]8;;";
const OSC_CLOSE = "\x07";
const OSC_END = "\x1b]8;;\x07";

export function link(text: string, url: string, opts: TerminalOpts): string {
  if (!opts.color || !opts.unicode) return text;
  return OSC_OPEN + url + OSC_CLOSE + text + OSC_END;
}
```

- [ ] **Step 4: Run the focused test + the existing terminal snapshot test**

Run:
```bash
pnpm exec vitest run tests/reporters/terminal-format.test.ts tests/reporters/terminal.test.ts
```
Expected: `terminal-format.test.ts` PASS. `terminal.test.ts` may fail its snapshot only if it captured `*`; if so, update it:
```bash
pnpm exec vitest run tests/reporters/terminal.test.ts -u
```
Then re-run without `-u`; Expected: PASS. (The `terminal.test.ts` assertions in Step shown earlier still hold — brand/score/axes text unchanged.)

- [ ] **Step 5: Typecheck + commit**

Run:
```bash
pnpm typecheck
```
Expected: no errors. Then:
```bash
git add src/reporters/terminal-format.ts tests/reporters/terminal-format.test.ts tests/reporters/__snapshots__ 2>/dev/null; git add src/reporters/terminal-format.ts tests/reporters/terminal-format.test.ts
git commit -m "refactor(reporters): source terminal-format from ui/tokens"
```

---

### Task 3: Route the spinner through tokens

**Files:**
- Modify: `src/util/spinner.ts`
- Modify: `tests/util/spinner.test.ts` (add one assertion; keep existing)

**Interfaces:**
- Consumes: `ui/tokens` — `color`, `glyph`.
- Produces: unchanged `Spinner` / `SpinnerOptions` / `createSpinner` API.

- [ ] **Step 1: Write the failing test**

Append to `tests/util/spinner.test.ts` (inside the existing top-level `describe`, or add a new `describe` block at end of file):
```ts
import { describe, it, expect } from "vitest";
import { createSpinner } from "../../src/util/spinner.js";

describe("spinner success/fail glyphs (tokens)", () => {
  it("writes a check glyph on succeed when color is off", () => {
    const writes: string[] = [];
    const fakeStream = { write: (s: string) => (writes.push(s), true) } as unknown as NodeJS.WriteStream;
    const sp = createSpinner({ isTTY: true, enabled: true, stream: fakeStream, color: false });
    sp.start("working");
    sp.succeed("done");
    const joined = writes.join("");
    expect(joined).toContain("✔");
    expect(joined).toContain("done");
  });

  it("writes a cross glyph on fail when color is off", () => {
    const writes: string[] = [];
    const fakeStream = { write: (s: string) => (writes.push(s), true) } as unknown as NodeJS.WriteStream;
    const sp = createSpinner({ isTTY: true, enabled: true, stream: fakeStream, color: false });
    sp.start("working");
    sp.fail("nope");
    expect(writes.join("")).toContain("✘");
  });
});
```
Note: existing spinner success used `✔` (U+2714) already, but fail used `✗` (U+2717). This unifies fail to `✘` (U+2718, the tokens `fail` glyph). The new test asserts U+2718.

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
pnpm exec vitest run tests/util/spinner.test.ts
```
Expected: the fail-glyph test FAILS (got `✗`, expected `✘`).

- [ ] **Step 3: Update `spinner.ts` to use tokens**

In `src/util/spinner.ts`, replace the import line:
```ts
import pc from "picocolors";
```
with:
```ts
import { color as token, glyph, type UiOpts } from "../ui/tokens.js";
```
Then replace the three color helpers (the `colorFrame` / `colorSuccess` / `colorFail` block, lines ~76–78):
```ts
  const colorFrame = (frame: string): string => (color ? pc.cyan(frame) : frame);
  const colorSuccess = (s: string): string => (color ? pc.green(s) : s);
  const colorFail = (s: string): string => (color ? pc.red(s) : s);
```
with:
```ts
  const uiOpts: UiOpts = { color, unicode: true };
  const colorFrame = (frame: string): string => token.brand(frame, uiOpts);
  const colorSuccess = (s: string): string => token.pass(s, uiOpts);
  const colorFail = (s: string): string => token.fail(s, uiOpts);
```
Then in `succeed()`, replace `colorSuccess("✔")` with `colorSuccess(glyph("pass", uiOpts))`, and in `fail()`, replace `colorFail("✗")` with `colorFail(glyph("fail", uiOpts))`.

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
pnpm exec vitest run tests/util/spinner.test.ts
```
Expected: PASS (existing tests + 2 new). If an existing assertion checked for `✗`, update it to `✘`.

- [ ] **Step 5: Typecheck + commit**

Run:
```bash
pnpm typecheck
```
Expected: no errors. Then:
```bash
git add src/util/spinner.ts tests/util/spinner.test.ts
git commit -m "refactor(spinner): use ui/tokens for color + status glyphs"
```

---

### Task 4: Doctor view + make it the default text format

**Files:**
- Create: `src/ui/banner.ts`
- Create: `tests/ui/banner.test.ts`
- Modify: `src/reporters/terminal.ts` (header + axis line)
- Modify: `src/cli.ts` (default format dispatch + limit default)
- Modify: `tests/reporters/terminal.test.ts` (snapshot + an assertion)

**Interfaces:**
- Consumes: `ui/tokens` — `color`, `glyph`, `statusGlyph`, `UiOpts`.
- Produces: `src/ui/banner.ts` exports `function brandHeader(version: string, subtitle: string, opts: UiOpts): string`.

- [ ] **Step 1: Write the failing banner test**

Create `tests/ui/banner.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { brandHeader } from "../../src/ui/banner.js";

describe("ui/banner", () => {
  it("omits the brand mark in ASCII mode but keeps the wordmark", () => {
    const out = brandHeader("0.2.0", "design system health", { color: false, unicode: false });
    expect(out).toContain("lyse");
    expect(out).toContain("design system health");
    expect(out).not.toContain("◈");
  });

  it("includes the brand mark in unicode mode", () => {
    const out = brandHeader("0.2.0", "design system health", { color: false, unicode: true });
    expect(out).toContain("◈");
    expect(out).toContain("lyse");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
pnpm exec vitest run tests/ui/banner.test.ts
```
Expected: FAIL — cannot resolve `../../src/ui/banner.js`.

- [ ] **Step 3: Implement `banner.ts`**

Create `src/ui/banner.ts`:
```ts
import { color, type UiOpts } from "./tokens.js";

const BRAND_MARK = "◈";

export function brandHeader(version: string, subtitle: string, opts: UiOpts): string {
  const mark = opts.unicode ? `${color.brand(BRAND_MARK, opts)} ` : "";
  const word = color.brand("lyse", opts);
  const sub = color.muted(subtitle, opts);
  const ver = color.muted(version, opts);
  return `  ${mark}${word}  ${sub}   ${ver}`;
}
```

- [ ] **Step 4: Run banner test to verify it passes**

Run:
```bash
pnpm exec vitest run tests/ui/banner.test.ts
```
Expected: PASS.

- [ ] **Step 5: Write the failing doctor-axis assertion**

In `tests/reporters/terminal.test.ts`, add this test inside the existing `describe` block:
```ts
  it("renders a status glyph per axis (doctor view, ascii mode)", async () => {
    const out = await renderTerminal(sample, baseOpts);
    const lines = out.split("\n");
    const tokensLine = lines.find((l) => l.includes("tokens") && l.includes("31"));
    expect(tokensLine).toBeDefined();
    // tokens score 31 -> fail -> ascii glyph "x"
    expect(tokensLine).toContain("x ");
    const a11yLine = lines.find((l) => l.includes("a11y") && l.includes("62"));
    // a11y score 62 -> warn -> ascii glyph "!"
    expect(a11yLine).toContain("! ");
  });
```

- [ ] **Step 6: Run to verify it fails**

Run:
```bash
pnpm exec vitest run tests/reporters/terminal.test.ts
```
Expected: FAIL — the new test can't find a leading status glyph (axis lines currently start with the padded axis name).

- [ ] **Step 7: Add the doctor header + status glyph to `terminal.ts`**

In `src/reporters/terminal.ts`:

(a) Update imports — add `statusGlyph` and the banner:
```ts
import {
  teal, thresholdColor, severityColor, dim, bold, bar, statusDot, link,
  visiblePad, truncateStart,
  type TerminalOpts,
} from "./terminal-format.js";
```
becomes:
```ts
import {
  teal, thresholdColor, severityColor, dim, bold, bar, statusDot, link,
  visiblePad, truncateStart,
  type TerminalOpts,
} from "./terminal-format.js";
import { statusGlyph } from "../ui/tokens.js";
import { brandHeader } from "../ui/banner.js";
```

(b) Replace the `header()` function body:
```ts
function header(result: AuditResult, opts: TerminalOpts): string {
  const brand = teal("lyse", opts);
  const version = dim(result.toolVersion, opts);
  const files = dim(`${opts.fileCount} files`, opts);
  const dur = dim(`${(opts.durationMs / 1000).toFixed(1)}s`, opts);
  const sep = dim("·", opts);
  return `  ${brand}  ${version}  ${sep}  ${files}  ${sep}  ${dur}`;
}
```
with:
```ts
function header(result: AuditResult, opts: TerminalOpts): string {
  const ui = { color: opts.color, unicode: opts.unicode };
  const subtitle = `${opts.fileCount} files · ${(opts.durationMs / 1000).toFixed(1)}s`;
  return brandHeader(result.toolVersion, subtitle, ui);
}
```

(c) Replace the `axisLine()` function to lead with a status glyph:
```ts
function axisLine(a: AxisScore, opts: TerminalOpts): string {
  const name = visiblePad(a.axis, AXIS_NAME_WIDTH);
  const barViz = bar(a.score, opts, 20);
  const scoreText = visiblePad(a.score === "N/A" ? "N/A" : String(a.score), AXIS_SCORE_WIDTH, "left");
  const findingsText = visiblePad(dim(`${a.findings} findings`, opts), AXIS_FINDINGS_WIDTH, "left");
  return `  ${name}  ${barViz}  ${scoreText}  ${findingsText}`;
}
```
with:
```ts
function axisLine(a: AxisScore, opts: TerminalOpts): string {
  const gly = statusGlyph(a.score, { color: opts.color, unicode: opts.unicode });
  const name = visiblePad(a.axis, AXIS_NAME_WIDTH);
  const barViz = bar(a.score, opts, 20);
  const scoreText = visiblePad(a.score === "N/A" ? "N/A" : String(a.score), AXIS_SCORE_WIDTH, "left");
  const findingsText = visiblePad(dim(`${a.findings} findings`, opts), AXIS_FINDINGS_WIDTH, "left");
  return `  ${gly} ${name}  ${scoreText}  ${barViz}  ${findingsText}`;
}
```
(Order now: glyph · name · score · bar · findings — matches the approved mock. `statusDot` is still imported/used by `scoreLine`; leave it.)

- [ ] **Step 8: Run terminal tests + update snapshot**

Run:
```bash
pnpm exec vitest run tests/reporters/terminal.test.ts -u
```
Expected: snapshot updated; then re-run without `-u`:
```bash
pnpm exec vitest run tests/reporters/terminal.test.ts
```
Expected: PASS, including the new doctor-axis test and the existing "contains brand, score, all 4 axes…" assertions.

- [ ] **Step 9: Flip the default text format in `cli.ts`**

In `src/cli.ts`, change the limit default (currently around line 399):
```ts
      textFindingsLimit = resolveLimit(args, format === "legacy" ? undefined : null);
```
to:
```ts
      textFindingsLimit = resolveLimit(args, format === "eslint" ? null : undefined);
```
Then change `renderTextForStdout` (currently around lines 428–434):
```ts
      const renderTextForStdout = async (): Promise<string> => {
        if (format === "legacy") {
          const opts = computeTerminalOpts(args, isTTY, fileCount, Date.now() - startTime, repoRoot, hasTokenRegistry, textFindingsLimit);
          return (await renderTerminal(result, opts)) + "\n";
        }
        return renderEslintStyleAudit(result, textFindingsLimit) + "\n";
      };
```
to:
```ts
      const renderTextForStdout = async (): Promise<string> => {
        if (format === "eslint") {
          return renderEslintStyleAudit(result, textFindingsLimit) + "\n";
        }
        const opts = computeTerminalOpts(args, isTTY, fileCount, Date.now() - startTime, repoRoot, hasTokenRegistry, textFindingsLimit);
        return (await renderTerminal(result, opts)) + "\n";
      };
```
(Now `text` default and `legacy` both render the doctor view; `eslint` is opt-in.)

- [ ] **Step 10: Run the full suite; fix any default-format assertions**

Run from `packages/core/`:
```bash
pnpm test
```
Expected: build + vitest. Some CLI tests may assert ESLint-style output as the default (e.g. checking for `EXP`/`ERROR` tag layout or the `── Health Score:` gauge on default `text`). For each failure: if the test means to exercise ESLint-style, add `--format=eslint` to its invocation; if it means to exercise the default view, update its expectation to the doctor view (brand header + `Top findings`). Do not weaken assertions that guard machine formats (`json`/`sarif`/`html`) — those paths are unchanged. Re-run `pnpm test` until green.

- [ ] **Step 11: Smoke-test the doctor view by eye**

Run from repo root:
```bash
node packages/core/dist/cli.js audit packages/core/fixtures/full-ds --format=text --no-color
```
Expected: brand header line (`lyse  … files · …s`), a status glyph (`v`/`!`/`x`) before each axis, the score gauge, and findings. Confirm the Health Score equals the known-stable value for `fixtures/full-ds` (must be unchanged from before this wave).

- [ ] **Step 12: Commit**

```bash
git add src/ui/banner.ts tests/ui/banner.test.ts src/reporters/terminal.ts src/cli.ts tests/reporters/terminal.test.ts tests/reporters/__snapshots__
git commit -m "feat(reporters): doctor-style default audit view with per-axis status"
```

---

### Task 5: Refresh the REPL banner with the brand mark

**Files:**
- Modify: `src/menu/repl.ts`
- Create: `tests/menu/repl-banner.test.ts`

**Interfaces:**
- Consumes: `ui/banner` — `brandHeader`; `ui/tokens` — `UiOpts`.
- Produces: unchanged `renderReplBanner(ctx: ReplContext): string` signature.

- [ ] **Step 1: Write the failing test**

Create `tests/menu/repl-banner.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { renderReplBanner } from "../../src/menu/repl.js";

describe("renderReplBanner", () => {
  it("shows the lyse wordmark, version, and the no-menu tip", () => {
    const out = renderReplBanner({ cwd: "/work/acme", quiet: false, version: "0.2.0" });
    expect(out).toContain("lyse");
    expect(out).toContain("0.2.0");
    expect(out).toContain("/work/acme");
    expect(out).toContain("--no-menu");
  });
});
```

- [ ] **Step 2: Run to verify it passes or fails**

Run:
```bash
pnpm exec vitest run tests/menu/repl-banner.test.ts
```
Expected: PASS already (current banner contains all four). This test pins behavior before the refactor so Step 4 can't regress it.

- [ ] **Step 3: Refactor `renderReplBanner` to use the brand header**

In `src/menu/repl.ts`, add imports at the top (after the existing imports):
```ts
import { brandHeader } from "../ui/banner.js";
```
Then replace `renderReplBanner`:
```ts
export function renderReplBanner(ctx: ReplContext): string {
  return [
    "",
    `  lyse ${ctx.version} — interactive menu`,
    `  cwd: ${ctx.cwd}`,
    "",
    "  Tip: pass --no-menu (or set LYSE_NO_MENU=1) to skip the menu.",
    "  Or invoke a subcommand directly (lyse audit, lyse fix, …).",
    "",
  ].join("\n");
}
```
with:
```ts
export function renderReplBanner(ctx: ReplContext): string {
  const noColorEnv = typeof process.env["NO_COLOR"] === "string" && process.env["NO_COLOR"] !== "";
  const ui = {
    color: (process.stdout.isTTY ?? false) && !noColorEnv,
    unicode: (process.stdout.isTTY ?? false) && process.platform !== "win32",
  };
  return [
    "",
    brandHeader(ctx.version, "interactive menu", ui),
    `  ${ctx.cwd}`,
    "",
    "  Tip: pass --no-menu (or set LYSE_NO_MENU=1) to skip the menu.",
    "  Or invoke a subcommand directly (lyse audit, lyse fix, …).",
    "",
  ].join("\n");
}
```

- [ ] **Step 4: Run the test + typecheck**

Run:
```bash
pnpm exec vitest run tests/menu/repl-banner.test.ts && pnpm typecheck
```
Expected: PASS, no type errors.

- [ ] **Step 5: Full suite + commit**

Run:
```bash
pnpm test
```
Expected: green. Then:
```bash
git add src/menu/repl.ts tests/menu/repl-banner.test.ts
git commit -m "feat(menu): repl banner uses the shared brand header"
```

---

## Self-Review

**1. Spec coverage** (against the validated Wave 1 from the artifact):
- `ui/tokens.ts` on ansis → Task 1. ✅
- Unified status glyphs across reporters → Task 2 (terminal-format), Task 3 (spinner), Task 4 (axis glyph). ✅
- Doctor-style audit → Task 4. ✅
- Spinner milestones → already implemented in `audit-pipeline.ts` (no task needed); spinner color/glyphs unified in Task 3. Noted, not re-built.
- Skippable/branded header → Task 4 (`banner.ts`, doctor header) + Task 5 (REPL). The `◈` mark is unicode-gated (drops to plain wordmark in ASCII/no-unicode); a hard `LYSE_NO_BANNER` kill-switch is **deferred to Wave 2** since the mark is already minimal and degrades — call this out at review.
- One dependency added (`ansis`) → Task 1. picocolors left installed; removing it is deferred until a grep confirms no other consumers (out of scope here).

**2. Placeholder scan:** No TBD/TODO; every code step shows complete code; every command has an expected result. ✅

**3. Type consistency:** `UiOpts {color, unicode}` is the single options shape across tokens/banner; `statusGlyph(score, opts)` / `bar(score, opts, cells)` signatures match between `tokens.ts` (Task 1) and consumers (Tasks 2, 4); `brandHeader(version, subtitle, opts)` matches between `banner.ts` (Task 4) and callers (Tasks 4, 5). ✅

## Out of scope (Wave 2)

`@clack/prompts` for init/REPL/consent flows; consolidating/retiring the ESLint-style or legacy aliases; `--format=table` and `--format=tsv`; a `LYSE_NO_BANNER` kill-switch; removing `picocolors`; true per-phase progress UI beyond the existing milestone labels.
