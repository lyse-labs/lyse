# LLM opt-in consent gate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the cloud LLM layer explicit opt-in and close the silent auto-on hole (`claude`-on-PATH currently sends source to an LLM with no consent).

**Architecture:** A new `llm/consent.ts` mirrors the proven `telemetry/consent.ts` (state in `~/.lyse/llm-consent.json`, `LYSE_LLM` env, max-2 prompts, non-TTY→off). The CLI resolves a single `flags.llmConsented` boolean and threads it down. `resolveConnector`'s **auto-detect branch** (the only silent path) returns `NoopAdapter` unless `flags.llmConsented === true`. Explicit `llm.provider`/`llm.connector` config stays a deliberate opt-in (unchanged). Default (no consent) = the deterministic static floor.

**Tech Stack:** TypeScript (strict), `prompts`, vitest, citty CLI.

## Global Constraints

- Strict TS: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`.
- No comments unless WHY is non-obvious. Artifacts in English.
- Fail-safe to OFF: any ambiguity/error → do NOT send source.
- Mirror `telemetry/consent.ts` structure exactly (deps injection via `{ homeDir }`, atomic tmp+rename write, `isValidRecord` guard, schema version "1.0.0").
- Do NOT decouple the score from the LLM (no ADR-0015 reversal). Opt-in suffices.
- Gate ONLY the auto-detect branch in `resolveConnector`; leave explicit-provider/connector branches and their contract untouched.

---

### Task 1: `llm/consent.ts` — consent module (mirror of telemetry consent)

**Files:**
- Create: `packages/core/src/llm/consent.ts`
- Test: `packages/core/tests/llm/consent.test.ts`

**Interfaces:**
- Produces:
  - `LlmConsentRecord = { accepted: boolean; attempt: 1|2; decided_at: string; version: "1.0.0" }`
  - `LlmConsentDeps = { homeDir?: () => string }`
  - `llmConsentFilePath(deps?): string`
  - `readLlmConsent(deps?): LlmConsentRecord | null`
  - `writeLlmConsent(record, deps?): void`
  - `promptForLlmConsent(): Promise<"yes"|"no"|"skip">`
  - `ensureLlmConsentDecision(deps?): Promise<{ accepted: boolean; justAsked: boolean }>`
  - `resolveLlmConsent(flags: { llm?: boolean } | undefined, deps?): Promise<boolean>`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readLlmConsent,
  writeLlmConsent,
  llmConsentFilePath,
  ensureLlmConsentDecision,
  resolveLlmConsent,
} from "../../src/llm/consent.js";

let home: string;
const deps = () => ({ homeDir: () => home });
beforeEach(() => { home = mkdtempSync(join(tmpdir(), "lyse-llm-consent-")); });
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  delete process.env["LYSE_LLM"];
});

describe("llm consent — persistence", () => {
  it("round-trips a record at ~/.lyse/llm-consent.json", () => {
    writeLlmConsent({ accepted: true, attempt: 1, decided_at: "t", version: "1.0.0" }, deps());
    expect(llmConsentFilePath(deps()).endsWith(join(".lyse", "llm-consent.json"))).toBe(true);
    expect(readLlmConsent(deps())?.accepted).toBe(true);
  });
  it("returns null when absent", () => {
    expect(readLlmConsent(deps())).toBeNull();
  });
});

describe("ensureLlmConsentDecision — env + non-TTY", () => {
  it("LYSE_LLM=1 with no record → accepted + persisted, no prompt", async () => {
    process.env["LYSE_LLM"] = "1";
    const d = await ensureLlmConsentDecision(deps());
    expect(d.accepted).toBe(true);
    expect(d.justAsked).toBe(false);
    expect(readLlmConsent(deps())?.accepted).toBe(true);
  });
  it("LYSE_LLM=0 → off, never prompts, does NOT write a record", async () => {
    process.env["LYSE_LLM"] = "0";
    const d = await ensureLlmConsentDecision(deps());
    expect(d.accepted).toBe(false);
    expect(existsSync(llmConsentFilePath(deps()))).toBe(false);
  });
  it("LYSE_LLM=0 overrides a prior accepted record (runtime opt-out, no rewrite)", async () => {
    writeLlmConsent({ accepted: true, attempt: 1, decided_at: "t", version: "1.0.0" }, deps());
    process.env["LYSE_LLM"] = "0";
    const granted = await resolveLlmConsent(undefined, deps());
    expect(granted).toBe(false);
    expect(readLlmConsent(deps())?.accepted).toBe(true); // record untouched
  });
  it("non-TTY with no record/env → off, no prompt", async () => {
    // vitest runs non-TTY (process.stdout.isTTY is undefined)
    const d = await ensureLlmConsentDecision(deps());
    expect(d.accepted).toBe(false);
  });
  it("persisted accepted → returns accepted without prompting", async () => {
    writeLlmConsent({ accepted: true, attempt: 1, decided_at: "t", version: "1.0.0" }, deps());
    const d = await ensureLlmConsentDecision(deps());
    expect(d).toEqual({ accepted: true, justAsked: false });
  });
});

describe("resolveLlmConsent — flag precedence", () => {
  it("--no-llm (flags.llm=false) → false, even with LYSE_LLM=1", async () => {
    process.env["LYSE_LLM"] = "1";
    expect(await resolveLlmConsent({ llm: false }, deps())).toBe(false);
  });
  it("--llm (flags.llm=true) → true without prompt", async () => {
    expect(await resolveLlmConsent({ llm: true }, deps())).toBe(true);
  });
  it("no flag → defers to ensureLlmConsentDecision (non-TTY → false)", async () => {
    expect(await resolveLlmConsent(undefined, deps())).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @lyse-labs/lyse exec vitest run tests/llm/consent.test.ts`
Expected: FAIL — `src/llm/consent.js` missing.

- [ ] **Step 3: Write minimal implementation**

```typescript
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import prompts from "prompts";

export interface LlmConsentRecord {
  accepted: boolean;
  attempt: 1 | 2;
  decided_at: string;
  version: "1.0.0";
}
export interface LlmConsentDeps {
  homeDir?: () => string;
}

const CONSENT_DIR = ".lyse";
const CONSENT_FILE = "llm-consent.json";
const SCHEMA_VERSION = "1.0.0";

function resolveHome(deps: LlmConsentDeps): string {
  return (deps.homeDir ?? homedir)();
}
export function llmConsentFilePath(deps: LlmConsentDeps = {}): string {
  return join(resolveHome(deps), CONSENT_DIR, CONSENT_FILE);
}
function isValidRecord(value: unknown): value is LlmConsentRecord {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["accepted"] === "boolean" &&
    (v["attempt"] === 1 || v["attempt"] === 2) &&
    typeof v["decided_at"] === "string" &&
    v["version"] === SCHEMA_VERSION
  );
}
export function readLlmConsent(deps: LlmConsentDeps = {}): LlmConsentRecord | null {
  const path = llmConsentFilePath(deps);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return isValidRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
export function writeLlmConsent(record: LlmConsentRecord, deps: LlmConsentDeps = {}): void {
  const path = llmConsentFilePath(deps);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmpPath = `${path}.tmp.${process.pid}`;
  writeFileSync(tmpPath, JSON.stringify(record, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmpPath, path);
}

const CONSENT_MESSAGE = `Lyse can use an LLM to refine findings (drop false positives on hardcoded
color/spacing). This sends ~8-15 representative source files (≤200 KB total,
secrets and .gitignore matches excluded) to the LLM provider you configure
(your own API key / local model — BYOK). Nothing goes to Lyse Labs.
It is OFF by default. Full notice: https://github.com/lyse-labs/lyse/blob/main/PRIVACY.md`;

export async function promptForLlmConsent(): Promise<"yes" | "no" | "skip"> {
  if (!process.stdout.isTTY) return "skip";
  process.stdout.write(CONSENT_MESSAGE + "\n");
  const result = await prompts({
    type: "confirm",
    name: "accepted",
    message: "Enable the LLM precision filter?",
    initial: false,
  });
  if (typeof result["accepted"] !== "boolean") return "skip";
  return result["accepted"] ? "yes" : "no";
}

export async function ensureLlmConsentDecision(
  deps: LlmConsentDeps = {},
): Promise<{ accepted: boolean; justAsked: boolean }> {
  if (process.env["LYSE_LLM"] === "0") return { accepted: false, justAsked: false };

  const existing = readLlmConsent(deps);

  if (!existing && process.env["LYSE_LLM"] === "1") {
    writeLlmConsent(
      { accepted: true, attempt: 1, decided_at: new Date().toISOString(), version: "1.0.0" },
      deps,
    );
    return { accepted: true, justAsked: false };
  }
  if (existing && (existing.accepted || existing.attempt === 2)) {
    return { accepted: existing.accepted, justAsked: false };
  }
  if (!process.stdout.isTTY) {
    return { accepted: false, justAsked: false };
  }
  const outcome = await promptForLlmConsent();
  const accepted = outcome === "yes";
  const nextAttempt: 1 | 2 = existing ? 2 : 1;
  writeLlmConsent(
    { accepted, attempt: nextAttempt, decided_at: new Date().toISOString(), version: "1.0.0" },
    deps,
  );
  return { accepted, justAsked: true };
}

export async function resolveLlmConsent(
  flags: { llm?: boolean } | undefined,
  deps: LlmConsentDeps = {},
): Promise<boolean> {
  if (flags?.llm === false) return false;
  if (flags?.llm === true) return true;
  return (await ensureLlmConsentDecision(deps)).accepted;
}
```

NOTE: `new Date().toISOString()` is used here exactly as telemetry consent does
(persisting a wall-clock decision timestamp). This is production code, not a
workflow script, so `Date` is available.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @lyse-labs/lyse exec vitest run tests/llm/consent.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/llm/consent.ts packages/core/tests/llm/consent.test.ts
git commit -m "feat(llm): opt-in consent module (mirror of telemetry consent) (#115)"
```

---

### Task 2: AuditFlags fields + resolver auto-detect gate

**Files:**
- Modify: `packages/core/src/commands/audit-flags.ts` (add 2 fields to `AuditFlags`)
- Modify: `packages/core/src/llm/connectors/resolver.ts:115-126` (gate auto-detect branch)
- Test: `packages/core/tests/llm/connectors/resolver-consent.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1 at runtime (the flag is a plain boolean).
- Produces: `AuditFlags.llm?: boolean` (CLI `--llm/--no-llm`), `AuditFlags.llmConsented?: boolean` (resolved decision threaded to the resolver). `resolveConnector` returns `NoopAdapter` from the auto-detect branch unless `flags.llmConsented === true`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { resolveConnector } from "../../../src/llm/connectors/resolver.js";
import { NoopAdapter } from "../../../src/llm/connectors/noop-adapter.js";
import type { LyseConfig } from "../../../src/types.js";

const cfg: LyseConfig = {} as LyseConfig;
const available = () => true; // pretend `claude` is on PATH

describe("resolveConnector — auto-detect consent gate (#115)", () => {
  it("auto-detect path returns Noop WITHOUT consent (closes the silent hole)", () => {
    const c = resolveConnector(cfg, {}, { agentCliAvailable: available });
    expect(c).toBeInstanceOf(NoopAdapter);
  });
  it("auto-detect path returns Noop with llmConsented:false", () => {
    const c = resolveConnector(cfg, { llmConsented: false }, { agentCliAvailable: available });
    expect(c).toBeInstanceOf(NoopAdapter);
  });
  it("auto-detect path returns a real connector with llmConsented:true", () => {
    const c = resolveConnector(cfg, { llmConsented: true }, { agentCliAvailable: available });
    expect(c).not.toBeInstanceOf(NoopAdapter);
  });
  it("explicit provider stays a deliberate opt-in (no llmConsented needed)", () => {
    const c = resolveConnector(
      { llm: { provider: "anthropic" } } as LyseConfig,
      {},
      { agentCliAvailable: available },
    );
    expect(c).not.toBeInstanceOf(NoopAdapter);
  });
  it("--static-only still hard-wins → Noop", () => {
    const c = resolveConnector(cfg, { staticOnly: true, llmConsented: true }, { agentCliAvailable: available });
    expect(c).toBeInstanceOf(NoopAdapter);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @lyse-labs/lyse exec vitest run tests/llm/connectors/resolver-consent.test.ts`
Expected: FAIL — first test gets an agent-cli adapter (current silent auto-on), not Noop; `llmConsented` not on AuditFlags (type error).

- [ ] **Step 3: Write minimal implementation**

In `audit-flags.ts`, add to the `AuditFlags` interface:

```typescript
  /** CLI `--llm` / `--no-llm`: per-run opt in/out of the LLM layer. */
  llm?: boolean;
  /**
   * Resolved LLM consent for this run (set by the CLI audit entry via
   * resolveLlmConsent). Gates the connector auto-detect path: source is never
   * sent to an auto-detected `claude` CLI unless this is true.
   */
  llmConsented?: boolean;
```

In `resolver.ts`, change the auto-detect branch (the `if (!provider && !connector)` block) so the consent gate is the FIRST check inside it:

```typescript
  if (!provider && !connector) {
    // #115: the auto-detect path is the only one that can send source to an LLM
    // without the user explicitly configuring a provider — gate it on consent.
    if (flags?.llmConsented !== true) return new NoopAdapter();
    if (process.env["LYSE_DISABLE_AGENT_AUTODETECT"] === "1") return new NoopAdapter();
    const checkAvailable = opts.agentCliAvailable ?? isAgentCliAvailable;
    if (checkAvailable()) {
      const agentModel = model ?? "claude-sonnet-4-6";
      const adapter = new AgentCliAdapter({ model: agentModel });
      const budget = buildBudget(llm, flags, opts);
      const cache = buildCache(llm, opts, flags);
      return new BudgetedCachedClient(adapter, budget, cache, agentModel);
    }
    return new NoopAdapter();
  }
```

(Leave every explicit-provider/connector branch unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @lyse-labs/lyse exec vitest run tests/llm/connectors/resolver-consent.test.ts`
Expected: PASS (5/5).

- [ ] **Step 5: Full suite + typecheck (catch resolver-contract regressions)**

Run: `pnpm --filter @lyse-labs/lyse exec vitest run && pnpm --filter @lyse-labs/lyse exec tsc --noEmit`
Expected: green. (Filter/layer4 stages call `resolveConnector(config, flags)`; existing tests inject a connector or run non-TTY so behavior is unchanged.)

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/commands/audit-flags.ts packages/core/src/llm/connectors/resolver.ts packages/core/tests/llm/connectors/resolver-consent.test.ts
git commit -m "feat(llm): gate connector auto-detect on explicit consent (#115)"
```

---

### Task 3: CLI wiring — `--llm`/`--no-llm` + resolve consent before audit

**Files:**
- Modify: `packages/core/src/cli.ts` (flag defs ~line 195; flags build ~line 278; resolve consent after build)
- Test: `packages/core/tests/cli.llm-consent.test.ts`

**Interfaces:**
- Consumes: `resolveLlmConsent` (Task 1), `AuditFlags.llm`/`llmConsented` (Task 2).
- Produces: `lyse audit --llm` / `--no-llm` flags; `auditFlags.llmConsented` is set from `resolveLlmConsent({ llm }, …)` before `runAudit` calls `auditDirectory`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const CLI = join(__dirname, "..", "dist", "cli.js");
const FIXTURE = join(__dirname, "..", "fixtures", "full-ds");

function run(args: string[], env: Record<string, string> = {}): string {
  return execFileSync("node", [CLI, "audit", FIXTURE, "--format=json", ...args], {
    encoding: "utf8",
    env: { ...process.env, LYSE_LLM: "0", ...env },
  });
}

describe("lyse audit — LLM consent flag (#115)", () => {
  it("--no-llm produces the deterministic static floor (byte-identical runs)", () => {
    const a = run(["--no-llm"]);
    const b = run(["--no-llm"]);
    expect(a).toBe(b);
  });
  it("accepts --llm without error (non-TTY → connector resolves to Noop anyway)", () => {
    expect(() => run(["--llm"])).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @lyse-labs/lyse build && pnpm --filter @lyse-labs/lyse exec vitest run tests/cli.llm-consent.test.ts`
Expected: FAIL — `--llm`/`--no-llm` are unknown flags (citty error) until added.

- [ ] **Step 3: Write minimal implementation**

In `cli.ts`, add to the `args` object (near the other LLM flags ~line 207):

```typescript
    llm: {
      type: "boolean",
      description: "Enable the LLM precision filter for this run (opt-in; sends source to your configured provider)",
    },
    "no-llm": {
      type: "boolean",
      description: "Disable the LLM layer for this run (static-only LLM behaviour)",
    },
```

Import `resolveLlmConsent` (add to the existing import block that includes `ensureConsentDecision`):

```typescript
import { resolveLlmConsent } from "./llm/consent.js";
```

After the `auditFlags` object is built (~line 290), resolve and attach consent:

```typescript
    // #115: resolve LLM consent once, in the CLI layer (mirrors telemetry).
    // --no-llm wins; --llm opts in for this run; otherwise env/persisted/prompt.
    const llmFlag = args["no-llm"] === true ? false : args["llm"] === true ? true : undefined;
    auditFlags.llmConsented = await resolveLlmConsent(
      llmFlag === undefined ? undefined : { llm: llmFlag },
    );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @lyse-labs/lyse build && pnpm --filter @lyse-labs/lyse exec vitest run tests/cli.llm-consent.test.ts`
Expected: PASS (2/2).

- [ ] **Step 5: Verify determinism + score-smoke unaffected**

Run: `pnpm --filter @lyse-labs/lyse exec vitest run tests/cli.determinism.test.ts tests/cli.score-smoke.test.ts`
Expected: PASS (CI is non-TTY → consent off → static floor unchanged).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/cli.ts packages/core/tests/cli.llm-consent.test.ts
git commit -m "feat(cli): --llm/--no-llm flags + resolve LLM consent before audit (#115)"
```

---

### Task 4: Docs — PRIVACY.md, CHANGELOG, README

**Files:**
- Modify: `PRIVACY.md` (the "off by default" section)
- Modify: `CHANGELOG.md` (`### Changed` + `### Fixed`)
- Modify: `README.md` (brief "enabling the LLM layer" note, if a relevant section exists)

- [ ] **Step 1: Amend PRIVACY.md** — under the LLM-assisted flows section, state explicitly:

```markdown
The LLM layer is **off until you opt in**. It activates only when one of:
- you run `lyse audit --llm` (one run), or
- you set `LYSE_LLM=1` (or accept the one-time interactive prompt; persisted to
  `~/.lyse/llm-consent.json`), or
- you set an explicit `llm.provider` / `llm.connector` in `.lyse.yaml`.

Having the `claude` CLI installed no longer silently enables it. `LYSE_LLM=0`
or `--no-llm` force it off. In non-interactive contexts (CI, pipes) it stays off.
```

- [ ] **Step 2: Add CHANGELOG entries**

```markdown
### Changed

- **The LLM precision filter is now strict opt-in.** It activates only via
  `lyse audit --llm`, `LYSE_LLM=1`, a one-time interactive prompt (persisted to
  `~/.lyse/llm-consent.json`), or an explicit `llm.provider`/`llm.connector` in
  config. `--no-llm` / `LYSE_LLM=0` force it off; non-interactive contexts stay
  off (lyse-labs/lyse-internal#115).

### Fixed

- **Closed a silent auto-on hole: having the `claude` CLI on PATH no longer
  sends your source to an LLM without consent.** `resolveConnector`'s
  auto-detect path now requires explicit consent, matching the PRIVACY.md
  "off by default" guarantee (lyse-labs/lyse-internal#115).
```

- [ ] **Step 3: README note (only if an LLM/usage section exists)** — add one line: enabling the LLM layer requires `--llm` / `LYSE_LLM=1` / config; off by default.

- [ ] **Step 4: Verify markdown links + build**

Run: `pnpm --filter @lyse-labs/lyse build`
Expected: clean (no rule/manifest change; docs only).

- [ ] **Step 5: Commit**

```bash
git add PRIVACY.md CHANGELOG.md README.md
git commit -m "docs: LLM layer is opt-in; document the consent gate (#115)"
```

---

## Self-Review

- **Spec coverage:** consent module (T1) ✓, auto-detect gate + flags (T2) ✓, CLI wiring + `--llm/--no-llm` + consent resolution (T3) ✓, PRIVACY/CHANGELOG (T4) ✓. Precedence (hard-off / on / prompt) realized: `--no-llm`/`LYSE_LLM=0` hard-off (T1 `resolveLlmConsent`/`ensureLlmConsentDecision`), `--llm`/`LYSE_LLM=1`/persisted (T1), explicit config provider via resolver's untouched branches (T2). Non-TTY→off ✓ (T1). Fail-safe→off ✓.
- **Refinement vs spec:** spec said a single `llmConsentGranted` + `opts.consented` gating ALL resolver paths. Plan narrows the gate to the **auto-detect branch only** (the sole silent path) via `flags.llmConsented`, leaving explicit-provider branches (= deliberate opt-in, per the locked decision) and their contract intact. Lower blast radius, same hole closed. Naming: `resolveLlmConsent` (async orchestrator) replaces `llmConsentGranted`; config-as-consent is realized by the untouched explicit-provider branches rather than folded into the boolean.
- **Placeholder scan:** none — all code shown.
- **Type consistency:** `resolveLlmConsent(flags?, deps?)`, `ensureLlmConsentDecision(deps?)`, `AuditFlags.llm`/`llmConsented`, `LlmConsentRecord` used consistently across T1–T3.
