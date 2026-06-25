# Lyse Agent Handoff — Phase 2 (v1: copy + install-skill) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After `lyse audit`, offer to hand the findings to the user's coding agent (Claude Code / Cursor / Codex / OpenCode) to fix — by installing a Lyse skill, writing a context bundle (prompt + findings.json + tokens.json), and copying the prompt to the clipboard. Lyse never edits code.

**Architecture:** A new `src/agent/` module: a small in-house agent **registry** (detect via config-dir or binary-on-PATH), a **payload** builder (prompt joins `helpUri` from rule meta) + **artifact writer** (reuse `renderJson`; serialize the `TokenMap`), a **skill** installer (per-agent path), and `runHandoff` (a `wizardSelect`). Wired into the post-audit menu. v1 = copy-to-clipboard + install-skill; **spawning the agent CLI is v2** (a follow-up `src/agent/launch.ts`).

**Tech Stack:** TypeScript (strict), Node ≥22, vitest, `@clack/prompts` (the select, via `wizardSelect`), existing `src/share/clipboard.ts`, `src/reporters/json.ts`, `src/rules/_rule-module.ts`. Package manager: **pnpm**.

## Global Constraints

- Node `>=22`; ESM — relative imports end in `.js`; strict TS (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`); `import type` for type-only imports.
- No comments unless WHY non-obvious. Deterministic output. English. Conventional Commits. Changeset for user-facing change.
- Interactive prompts never run when `!isInteractive()` (CI / non-TTY / `--yes` / `--no-prompt`).
- **Lyse never edits user source.** The handoff writes ONLY to a temp dir + the agent's skill file. No source code leaves the machine (payload = file:line + messages + suggestions + the user's own tokens).
- v1 does NOT spawn the agent (no `launch.ts`); it installs the skill + copies the prompt. Spawn is v2.
- Paths relative to `packages/core/`.

## Verified anchors (from deep search — use these exactly)

- `TokenMap` (`src/types.ts:101-113`): 10 `Map<string,string[]>` fields (`colors,spacing,typography,radii,shadows,motion,breakpoints,zIndex,opacity,borderWidth`) + `source`. Serialize each via `Object.fromEntries(map)`.
- `runAudit` (`src/cli.ts:119-151`) returns `AuditOutcome { result, tokens: TokenMap|null, config, componentInventory, fileCount, hasTokenRegistry }`.
- `renderJson(result, { includeTimestamp? })` (`src/reporters/json.ts`).
- `getRegisteredRuleMeta(id): LyseRuleMeta | undefined` (`src/rules/_rule-module.ts:59`) — `meta.helpUri`. `Finding` has no helpUri; join it. Importing `src/rules/registry.ts` populates the registry.
- Post-audit menu wire point: `src/cli.ts:492-511` (`showActionMenu` → `{fix,mcp-setup,exit}`).
- Clipboard: `copyToClipboard(text): Promise<void>` (`src/share/clipboard.ts`) — reuse, do NOT rebuild.
- `copy-templates.mjs` is a stub (empty `templates` array) — extend it to copy `src/skills/` → `dist/skills/`.
- No command-on-PATH util exists — add one (~15 LOC, spawn-based).

---

### Task 1: agent registry + detection (`src/agent/registry.ts`)

**Files:**
- Create: `src/agent/registry.ts`
- Create: `tests/agent/registry.test.ts`

**Interfaces:**
- Produces: `type AgentId`, `interface AgentSpec`, `const AGENTS: AgentSpec[]`, `isCommandAvailable(bin): Promise<boolean>`, `detectAgents(root): Promise<AgentSpec[]>`.

- [ ] **Step 1: Write the failing test**

Create `tests/agent/registry.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { AGENTS, detectAgents, isCommandAvailable } from "../../src/agent/registry.js";
import { mkdtempSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("agent registry", () => {
  it("lists the four supported agents with stable ids", () => {
    expect(AGENTS.map((a) => a.id).sort()).toEqual(["claude-code", "codex", "cursor", "opencode"]);
    for (const a of AGENTS) {
      expect(a.binary).toBeTruthy();
      expect(a.skillRelPath).toBeTruthy();
    }
  });

  it("isCommandAvailable resolves false for a nonsense binary", async () => {
    await expect(isCommandAvailable("definitely-not-a-real-binary-xyz")).resolves.toBe(false);
  });

  it("detectAgents picks up an agent by repo-local config dir", async () => {
    const root = mkdtempSync(join(tmpdir(), "lyse-agents-"));
    mkdirSync(join(root, ".cursor"), { recursive: true });
    const detected = await detectAgents(root);
    expect(detected.map((a) => a.id)).toContain("cursor");
  });
});
```

- [ ] **Step 2: Run it — expect failure**

```bash
pnpm exec vitest run tests/agent/registry.test.ts
```
Expected: FAIL — module unresolved.

- [ ] **Step 3: Implement `src/agent/registry.ts`**

```ts
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

export type AgentId = "claude-code" | "cursor" | "codex" | "opencode";

export interface AgentSpec {
  id: AgentId;
  displayName: string;
  /** Launch binary (used for PATH detection now; for spawn in v2). */
  binary: string;
  /** Dirs (absolute, or repo-relative) whose presence signals the agent is set up here. */
  configDirs: string[];
  /** Where the Lyse skill is written, relative to the repo root. */
  skillRelPath: string;
  skillFormat: "skill-md" | "cursor-mdc" | "agents-md";
}

export const AGENTS: AgentSpec[] = [
  { id: "claude-code", displayName: "Claude Code", binary: "claude", configDirs: [join(homedir(), ".claude"), ".claude"], skillRelPath: ".claude/skills/lyse/SKILL.md", skillFormat: "skill-md" },
  { id: "cursor", displayName: "Cursor", binary: "cursor", configDirs: [".cursor"], skillRelPath: ".cursor/rules/lyse.mdc", skillFormat: "cursor-mdc" },
  { id: "codex", displayName: "Codex", binary: "codex", configDirs: [join(homedir(), ".codex")], skillRelPath: "AGENTS.md", skillFormat: "agents-md" },
  { id: "opencode", displayName: "OpenCode", binary: "opencode", configDirs: [join(homedir(), ".config", "opencode"), ".opencode"], skillRelPath: ".opencode/skills/lyse/SKILL.md", skillFormat: "skill-md" },
];

export function isCommandAvailable(bin: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = process.platform === "win32"
      ? spawn("where", [bin], { stdio: "ignore" })
      : spawn("/bin/sh", ["-c", `command -v ${bin}`], { stdio: "ignore" });
    probe.on("error", () => resolve(false));
    probe.on("close", (code) => resolve(code === 0));
  });
}

export async function detectAgents(root: string): Promise<AgentSpec[]> {
  const detected: AgentSpec[] = [];
  for (const agent of AGENTS) {
    const dirHit = agent.configDirs.some((d) => existsSync(isAbsolute(d) ? d : join(root, d)));
    if (dirHit || (await isCommandAvailable(agent.binary))) detected.push(agent);
  }
  return detected;
}
```

- [ ] **Step 4: Run it — expect pass**

```bash
pnpm exec vitest run tests/agent/registry.test.ts
```
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm typecheck
git add src/agent/registry.ts tests/agent/registry.test.ts
git commit -m "feat(agent): agent registry + detection (config-dir or PATH)"
```

---

### Task 2: handoff payload + context artifacts (`src/agent/payload.ts`)

**Files:**
- Create: `src/agent/payload.ts`
- Create: `tests/agent/payload.test.ts`
- Create: `.changeset/lyse-agent-handoff.md`

**Interfaces:**
- Consumes: `getRegisteredRuleMeta` (`../rules/_rule-module.js`), `renderJson` (`../reporters/json.js`), types from `../types.js`.
- Produces: `buildHandoffPayload(findings, opts): string`, `serializeTokenMap(t): Record<string, unknown>`, `writeHandoffArtifacts(dir, { result, tokens }): { findingsPath: string; tokensPath: string }`.

- [ ] **Step 1: Write the failing test**

Create `tests/agent/payload.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildHandoffPayload, serializeTokenMap } from "../../src/agent/payload.js";
import type { Finding, TokenMap } from "../../src/types.js";

const findings: Finding[] = [
  { ruleId: "tokens/no-hardcoded-color", axis: "tokens", severity: "warning",
    location: { file: "src/Button.tsx", line: 14, column: 1 }, message: "Hardcoded color #3B82F6",
    suggestion: "consider replacing with token color.action.primary" },
  { ruleId: "a11y/prefers-reduced-motion", axis: "a11y", severity: "error",
    location: { file: "globals.css", line: 1, column: 1 }, message: "No reduced-motion guard" },
];

describe("buildHandoffPayload", () => {
  it("groups by rule, orders error before warning, and includes file:line + suggestion", () => {
    const out = buildHandoffPayload(findings, { projectName: "acme", topN: 5, maxFilesPerRule: 3 });
    expect(out).toContain("acme");
    expect(out.indexOf("a11y/prefers-reduced-motion")).toBeLessThan(out.indexOf("tokens/no-hardcoded-color"));
    expect(out).toContain("src/Button.tsx:14");
    expect(out).toContain("color.action.primary");
    expect(out).toContain("don't commit");
    expect(out).toContain("lyse audit");
  });
});

describe("serializeTokenMap", () => {
  it("turns Maps into plain objects and tolerates null", () => {
    expect(serializeTokenMap(null)).toEqual({});
    const t = { source: "dtcg", colors: new Map([["#3b82f6", ["color.action.primary"]]]),
      spacing: new Map(), typography: new Map(), radii: new Map(), shadows: new Map(),
      motion: new Map(), breakpoints: new Map(), zIndex: new Map(), opacity: new Map(), borderWidth: new Map() } as unknown as TokenMap;
    const s = serializeTokenMap(t) as { source: string; colors: Record<string, string[]> };
    expect(s.source).toBe("dtcg");
    expect(s.colors["#3b82f6"]).toEqual(["color.action.primary"]);
  });
});
```

- [ ] **Step 2: Run it — expect failure**

```bash
pnpm exec vitest run tests/agent/payload.test.ts
```
Expected: FAIL — module unresolved.

- [ ] **Step 3: Implement `src/agent/payload.ts`**

```ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AuditResult, Finding, TokenMap } from "../types.js";
import { getRegisteredRuleMeta } from "../rules/_rule-module.js";
import { renderJson } from "../reporters/json.js";

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 } as const;

export interface PayloadOptions {
  projectName: string;
  topN: number;
  maxFilesPerRule: number;
}

export function buildHandoffPayload(findings: Finding[], opts: PayloadOptions): string {
  const byRule = new Map<string, Finding[]>();
  for (const f of findings) {
    const list = byRule.get(f.ruleId) ?? [];
    list.push(f);
    byRule.set(f.ruleId, list);
  }
  const groups = [...byRule.entries()].sort((a, b) => {
    const sa = SEVERITY_ORDER[a[1][0]!.severity];
    const sb = SEVERITY_ORDER[b[1][0]!.severity];
    if (sa !== sb) return sa - sb;
    return b[1].length - a[1].length;
  });

  const lines: string[] = [
    `Fix the top ${Math.min(opts.topN, groups.length)} design-system issues Lyse found in ${opts.projectName} on this pass — leave the rest for a follow-up.`,
    "",
  ];
  groups.slice(0, opts.topN).forEach(([ruleId, group], i) => {
    const first = group[0]!;
    const help = getRegisteredRuleMeta(ruleId)?.helpUri;
    lines.push(`${i + 1}. ${first.severity.toUpperCase()} ${first.axis}: ${ruleId} (${group.length} site${group.length === 1 ? "" : "s"})`);
    lines.push(`   ${first.message}`);
    if (first.suggestion) lines.push(`   fix: ${first.suggestion}`);
    if (help) lines.push(`   recipe: ${help}  (or run \`lyse explain ${ruleId}\`)`);
    group.slice(0, opts.maxFilesPerRule).forEach((f) => lines.push(`   - ${f.location.file}:${f.location.line}`));
    const extra = group.length - opts.maxFilesPerRule;
    if (extra > 0) lines.push(`   - +${extra} more file${extra === 1 ? "" : "s"}`);
    lines.push("");
  });
  lines.push(
    "All findings + the project's token map are in the handoff dir (findings.json, tokens.json).",
    "Fix the root cause — don't suppress the rule. Map hardcoded values to the project's tokens (see tokens.json).",
    "Edit the working tree only — don't commit, don't open PRs.",
    "When done, run `lyse audit` and confirm the Health Score went up. Teach me as you go.",
  );
  return lines.join("\n") + "\n";
}

export function serializeTokenMap(tokens: TokenMap | null): Record<string, unknown> {
  if (!tokens) return {};
  const cats = ["colors", "spacing", "typography", "radii", "shadows", "motion", "breakpoints", "zIndex", "opacity", "borderWidth"] as const;
  const out: Record<string, unknown> = { source: tokens.source };
  for (const c of cats) out[c] = Object.fromEntries(tokens[c]);
  return out;
}

export function writeHandoffArtifacts(dir: string, input: { result: AuditResult; tokens: TokenMap | null }): { findingsPath: string; tokensPath: string } {
  mkdirSync(dir, { recursive: true });
  const findingsPath = join(dir, "findings.json");
  const tokensPath = join(dir, "tokens.json");
  writeFileSync(findingsPath, renderJson(input.result));
  writeFileSync(tokensPath, JSON.stringify(serializeTokenMap(input.tokens), null, 2) + "\n");
  return { findingsPath, tokensPath };
}
```

- [ ] **Step 4: Run + changeset + commit**

```bash
pnpm exec vitest run tests/agent/payload.test.ts && pnpm typecheck
```
Expected: PASS. Create `.changeset/lyse-agent-handoff.md`:
```markdown
---
"@lyse-labs/lyse": minor
---

`lyse audit` can now hand its findings to your coding agent (Claude Code, Cursor, Codex, OpenCode) to fix — it installs a Lyse skill and copies a ready-to-paste prompt with the findings + your token map. Lyse never edits your code.
```
Then:
```bash
git add src/agent/payload.ts tests/agent/payload.test.ts .changeset/lyse-agent-handoff.md
git commit -m "feat(agent): handoff payload + findings.json/tokens.json artifacts"
```

---

### Task 3: the Lyse skill + installer (`skills/lyse/SKILL.md`, `src/agent/skill.ts`)

**Files:**
- Create: `src/skills/lyse/SKILL.md` (bundled source)
- Modify: `scripts/copy-templates.mjs` (copy `src/skills` → `dist/skills`)
- Create: `src/agent/skill.ts`
- Create: `tests/agent/skill.test.ts`

**Interfaces:**
- Consumes: `AgentSpec` from `./registry.js`.
- Produces: `installLyseSkill(agent: AgentSpec, root: string): { path: string; installed: boolean }`, `lyseSkillSource(): string`.

- [ ] **Step 1: Write the skill**

Create `src/skills/lyse/SKILL.md`:
```markdown
---
name: lyse
description: Use when the user runs `lyse`, asks to fix design-system drift, or after a Lyse audit. Fixes token/a11y/component/AI-readiness issues a Lyse scan found.
version: "1.0.0"
---

# Lyse — fix design-system drift

Lyse scans a design system and scores its health (0–100). Your job: fix the issues it found, in the working tree.

## Workflow
1. Run `lyse audit` (or read the handoff `findings.json` + `tokens.json` if provided).
2. Fix issues by severity — errors first, then warnings. Fix the root cause; never suppress a rule.
3. For hardcoded values (color/spacing/radius/…), map them to the project's tokens — `tokens.json` maps each raw value to its token path; prefer the single exact match.
4. For each rule, run `lyse explain <ruleId>` for the rationale + good/bad examples (the canonical recipe).
5. Edit the working tree only. Do NOT commit and do NOT open PRs.
6. When done, run `lyse audit` again and confirm the Health Score went up. If a rule still fires, your fix was incomplete.

## Notes
- `lyse audit --format=json` gives the full machine-readable report.
- Token names (no values) and the component inventory are in `LYSE.md` at the repo root.
```

- [ ] **Step 2: Wire the build copy**

In `scripts/copy-templates.mjs`, after the existing templates block, add a skills copy. Replace the early-exit logic so the skills tree is always copied:
```js
import { cp, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const PKG_ROOT = process.cwd();
const SRC_SKILLS = join(PKG_ROOT, "src/skills");
const DIST_SKILLS = join(PKG_ROOT, "dist/skills");
if (existsSync(SRC_SKILLS)) {
  await mkdir(DIST_SKILLS, { recursive: true });
  await cp(SRC_SKILLS, DIST_SKILLS, { recursive: true });
  console.log("Copied skills -> dist/skills.");
} else {
  console.log("No skills to copy.");
}
```
(Keep any existing template-copy lines above; this adds the skills subtree. Adjust imports to avoid duplicate declarations.)

- [ ] **Step 3: Write the failing test**

Create `tests/agent/skill.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { installLyseSkill, lyseSkillSource } from "../../src/agent/skill.js";
import { AGENTS } from "../../src/agent/registry.js";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("installLyseSkill", () => {
  it("writes the skill to the agent's path and returns it", () => {
    const root = mkdtempSync(join(tmpdir(), "lyse-skill-"));
    const claude = AGENTS.find((a) => a.id === "claude-code")!;
    const res = installLyseSkill(claude, root);
    expect(res.installed).toBe(true);
    expect(res.path).toBe(join(root, ".claude/skills/lyse/SKILL.md"));
    expect(readFileSync(res.path, "utf8")).toContain("name: lyse");
  });

  it("lyseSkillSource returns the skill markdown with frontmatter", () => {
    expect(lyseSkillSource()).toContain("# Lyse — fix design-system drift");
  });
});
```

- [ ] **Step 4: Run — expect fail; implement `src/agent/skill.ts`**

```bash
pnpm exec vitest run tests/agent/skill.test.ts
```
Expected: FAIL. Then create `src/agent/skill.ts`:
```ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentSpec } from "./registry.js";

function skillPath(): string {
  // dist/agent/skill.js -> dist/skills/lyse/SKILL.md
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "skills", "lyse", "SKILL.md");
}

export function lyseSkillSource(): string {
  return readFileSync(skillPath(), "utf8");
}

export function installLyseSkill(agent: AgentSpec, root: string): { path: string; installed: boolean } {
  const target = join(root, agent.skillRelPath);
  const source = lyseSkillSource();
  try {
    mkdirSync(dirname(target), { recursive: true });
    if (agent.skillFormat === "agents-md") {
      // Append/replace a lyse-managed block in AGENTS.md rather than overwrite.
      const begin = "<!-- lyse-skill:begin -->";
      const end = "<!-- lyse-skill:end -->";
      const block = `${begin}\n${source}\n${end}`;
      let existing = "";
      try { existing = readFileSync(target, "utf8"); } catch { existing = ""; }
      const next = existing.includes(begin)
        ? existing.replace(new RegExp(`${begin}[\\s\\S]*${end}`), block)
        : (existing ? `${existing.trimEnd()}\n\n${block}\n` : `${block}\n`);
      writeFileSync(target, next);
    } else {
      writeFileSync(target, source);
    }
    return { path: target, installed: true };
  } catch {
    return { path: target, installed: false };
  }
}
```

- [ ] **Step 5: Build (so the skill is in dist) + run + commit**

```bash
pnpm build && pnpm exec vitest run tests/agent/skill.test.ts && pnpm typecheck
git add src/skills/lyse/SKILL.md scripts/copy-templates.mjs src/agent/skill.ts tests/agent/skill.test.ts
git commit -m "feat(agent): bundle the lyse skill + per-agent installer"
```
(The skill test reads from `dist/skills`, so `pnpm build` must run first. The test resolves `lyseSkillSource` via `dist/agent/skill.js`; vitest runs TS from `src`, so add a fallback in `skillPath()` if needed: try the dist path, then `join(here,"..","..","src","skills","lyse","SKILL.md")`. Include this fallback in Step 4's implementation if the test can't find the file from `src`.)

---

### Task 4: the handoff select (`src/agent/handoff.ts`)

**Files:**
- Create: `src/agent/handoff.ts`
- Create: `tests/agent/handoff.test.ts`

**Interfaces:**
- Consumes: `detectAgents`, `AgentSpec` (`./registry.js`); `buildHandoffPayload`, `writeHandoffArtifacts` (`./payload.js`); `installLyseSkill` (`./skill.js`); `copyToClipboard` (`../share/clipboard.js`); `wizardSelect` (`../ui/wizard.js`); `isInteractive` (`../menu/prompts.js`).
- Produces: `runHandoff(input: HandoffInput): Promise<void>` where `HandoffInput = { findings: Finding[]; result: AuditResult; tokens: TokenMap|null; projectName: string; root: string }`.

- [ ] **Step 1: Write the failing test (non-interactive no-op contract)**

Create `tests/agent/handoff.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { runHandoff } from "../../src/agent/handoff.js";
import type { AuditResult, Finding } from "../../src/types.js";

const findings: Finding[] = [
  { ruleId: "a11y/prefers-reduced-motion", axis: "a11y", severity: "error",
    location: { file: "globals.css", line: 1, column: 1 }, message: "x" },
];
const result = { findings } as unknown as AuditResult;

describe("runHandoff (non-interactive)", () => {
  it("is a no-op (no prompt, no clipboard) when not interactive", async () => {
    // vitest is non-TTY → isInteractive() false
    await expect(
      runHandoff({ findings, result, tokens: null, projectName: "acme", root: "/tmp/none" }),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — expect fail; implement `src/agent/handoff.ts`**

```bash
pnpm exec vitest run tests/agent/handoff.test.ts
```
Expected: FAIL. Then create `src/agent/handoff.ts`:
```ts
import { homedir } from "node:os";
import { join } from "node:path";
import type { AuditResult, Finding, TokenMap } from "../types.js";
import { isInteractive } from "../menu/prompts.js";
import { wizardSelect } from "../ui/wizard.js";
import { copyToClipboard } from "../share/clipboard.js";
import { detectAgents, type AgentId } from "./registry.js";
import { buildHandoffPayload, writeHandoffArtifacts } from "./payload.js";
import { installLyseSkill } from "./skill.js";

export interface HandoffInput {
  findings: Finding[];
  result: AuditResult;
  tokens: TokenMap | null;
  projectName: string;
  root: string;
}

type Choice = AgentId | "copy" | "skip";

export async function runHandoff(input: HandoffInput): Promise<void> {
  if (!isInteractive() || input.findings.length === 0) return;

  const agents = await detectAgents(input.root);
  const choices: { value: Choice; label: string; hint?: string }[] = [
    ...agents.map((a) => ({ value: a.id, label: `Fix with ${a.displayName}`, hint: "install the lyse skill + copy the prompt" })),
    { value: "copy", label: "Copy the fix prompt", hint: "paste into any agent" },
    { value: "skip", label: "Skip" },
  ];
  const choice = await wizardSelect<Choice>("Fix these with your coding agent", choices, agents[0]?.id ?? "copy");
  if (choice === "skip") return;

  const dir = join(homedir(), ".lyse", `handoff-${input.result.findings.length}-${input.findings[0]?.ruleId.replace(/\W+/g, "-") ?? "x"}`);
  writeHandoffArtifacts(dir, { result: input.result, tokens: input.tokens });
  const payload = buildHandoffPayload(input.findings, { projectName: input.projectName, topN: 5, maxFilesPerRule: 3 }) +
    `\nHandoff dir: ${dir}\n`;

  if (choice !== "copy") {
    const agent = agents.find((a) => a.id === choice);
    if (agent) installLyseSkill(agent, input.root);
  }
  await copyToClipboard(payload);
}
```
(v1: always copies the prompt to the clipboard and, for an agent choice, also installs the skill. **v2** replaces the copy with a spawn of the agent CLI.)

- [ ] **Step 3: Run + typecheck + commit**

```bash
pnpm exec vitest run tests/agent/handoff.test.ts && pnpm typecheck
git add src/agent/handoff.ts tests/agent/handoff.test.ts
git commit -m "feat(agent): runHandoff select (copy prompt + install skill)"
```

---

### Task 5: wire the handoff into the post-audit menu

**Files:**
- Modify: `src/cli.ts` (the post-audit block at ~492-511)
- Modify: `src/menu/action-menu.ts` (add a `handoff` choice)
- Test: existing `tests/menu/action-menu.test.ts` + `tests/cli.menu.test.ts` stay green

**Interfaces:**
- Consumes: `runHandoff` from `./agent/handoff.js`.

- [ ] **Step 1: Add a `handoff` choice to `showActionMenu`**

In `src/menu/action-menu.ts`: extend `MenuChoice` to `"fix" | "mcp-setup" | "handoff" | "exit"`, and add (as the FIRST choice when there are findings) `{ title: "Fix with your coding agent", value: "handoff" }`. Default the select to `"handoff"` when findings exist.

- [ ] **Step 2: Dispatch it in `cli.ts`**

In the post-audit block (`cli.ts:492-511`), add the import `import { runHandoff } from "./agent/handoff.js";` and a branch:
```ts
      const choice = await showActionMenu({ autoFixableCount, detectedIDE });
      if (choice === "handoff") {
        await runHandoff({
          findings: result.findings,
          result,
          tokens,
          projectName: require("node:path").basename(repoRoot),
          root: repoRoot,
        });
      } else if (choice === "fix") {
        await runFix({ cwd: repoRoot, autoApprove: Boolean(args.yes) });
      } else if (choice === "mcp-setup") {
        await runMcpSetup({ cwd: repoRoot, autoApprove: Boolean(args.yes) });
      }
```
(Use `import { basename } from "node:path"` at the top instead of `require`. `tokens`/`config`/`repoRoot` are already in scope in this block.)

- [ ] **Step 3: Run the menu + cli suites + full suite**

```bash
pnpm exec vitest run tests/menu tests/cli.menu.test.ts && pnpm typecheck && pnpm test
```
Expected: green. The menu tests run non-interactive (return "exit"), so the new choice doesn't fire; if a test asserts the exact choice list, update it to include "handoff" (do not weaken).

- [ ] **Step 4: Build + manual smoke**

```bash
pnpm build
# non-interactive: handoff no-ops; report still renders + exit code:
node dist/cli.js audit fixtures/full-ds --no-prompt --format=text --no-color 2>/dev/null | tail -3
```
Report that the audit still completes cleanly (handoff is interactive-only). Note the interactive handoff select needs a real TTY to view.

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts src/menu/action-menu.ts tests/menu tests/cli.menu.test.ts
git commit -m "feat(cli): offer agent handoff after audit"
```

---

## Self-Review

- Registry + detection → Task 1. Payload + artifacts (findings.json + serialized tokens.json + helpUri join) → Task 2. Skill + installer + build bundling → Task 3. Handoff select (copy + install-skill, non-TTY no-op) → Task 4. Wiring → Task 5. ✅
- Lyse never edits source (writes only temp dir + skill file); no spawn in v1. ✅
- Token-map gap closed (tokens.json). helpUri joined from `getRegisteredRuleMeta`. ✅
- Type consistency: `AgentSpec`/`AgentId` (Task 1) used by Tasks 3-4; `HandoffInput` (Task 4) used by Task 5; `writeHandoffArtifacts`/`buildHandoffPayload` (Task 2) used by Task 4. ✅

## Out of scope (v2)

`src/agent/launch.ts` (spawn the agent CLI with the payload, `stdio:inherit`, auto-approve flags, Windows .cmd shim) replacing the clipboard copy; bare `lyse` = scan+report+handoff (replace the REPL); the `lyse install` one-time command (skill for all agents + git/agent hooks); the hosted playbook at getlyse.com/prompts. The full use-case/edge-case matrix is in `2026-06-23-lyse-agent-handoff-chantier.md`.
