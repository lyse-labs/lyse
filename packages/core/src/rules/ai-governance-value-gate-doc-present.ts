import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import fg from "fast-glob";
import type {
  Rule,
  RuleContext,
  ParsedFiles,
  RuleEvalResult,
  Finding,
} from "../types.js";
import { createLyseRule } from "./_rule-module.js";
import {
  scanForMarkerComponents,
  makeAllowlistCheck,
} from "./ai-governance-ai-marker-component-present.js";
import { detectReservedAiTokens } from "../parsers/ai-tokens.js";
import { makeLocaleMatcher } from "./_i18n-vocabulary.js";

const RULE_ID = "ai-governance/value-gate-doc-present";
const MAX_DOC_BYTES = 500_000;
const DISABLE_DIRECTIVE = `lyse-disable ${RULE_ID}`;

const ALLOWLIST_CANDIDATES = [
  "README.md",
  "README",
  "README.mdx",
  "readme.md",
  ".lyse.yaml",
  ".lyse.yml",
];

// Ordered candidate paths — checked before the broad glob.
const STATIC_CANDIDATES = [
  "AI_GOVERNANCE.md",
  "docs/ai-value-gate.md",
  "docs/ai-governance.md",
  "docs/ai-readiness.md",
  "docs/ai-checklist.md",
  ".lyse/ai-value-gate.md",
];

// Glob patterns for docs/**/ — name-constrained to avoid catching arbitrary AI docs.
const DOC_GLOBS = [
  "docs/**/ai-value-gate.md",
  "docs/**/ai-governance.md",
  "docs/**/ai-readiness.md",
  "docs/**/ai-checklist.md",
  "**/AI_GOVERNANCE.md",
];

const IGNORE = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.git/**",
  "**/.next/**",
  "**/out/**",
  "**/coverage/**",
];

// Language-agnostic structural gate signals: a markdown checklist (the
// go/no-go form itself) or an explicit front-matter opt-in. Safe to credit
// because doc discovery is already name-constrained to gate-doc filenames.
const CHECKLIST_RE = /^[ \t]*[-*]\s+\[[ xX]\]/m;
const FRONT_MATTER_GATE_RE = /^lyse-doc:\s*["']?value-gate["']?\s*$/m;

export function detectGateLanguage(content: string, repoRoot = ""): boolean {
  if (CHECKLIST_RE.test(content) || FRONT_MATTER_GATE_RE.test(content)) {
    return true;
  }
  return makeLocaleMatcher("gatePhrases", repoRoot).matchesPhrase(content);
}

interface GateDocResult {
  rel: string;
  hasGateLanguage: boolean;
}

function readDocIfSmall(absPath: string): string | null {
  try {
    const stat = statSync(absPath);
    if (!stat.isFile() || stat.size > MAX_DOC_BYTES || stat.size === 0) return null;
    return readFileSync(absPath, "utf8");
  } catch {
    return null;
  }
}

export function discoverGateDoc(repoRoot: string): GateDocResult | null {
  for (const candidate of STATIC_CANDIDATES) {
    const abs = join(repoRoot, candidate);
    if (!existsSync(abs)) continue;
    const content = readDocIfSmall(abs);
    if (content === null) continue;
    return { rel: candidate, hasGateLanguage: detectGateLanguage(content, repoRoot) };
  }

  let hits: string[] = [];
  try {
    hits = fg.sync(DOC_GLOBS, {
      cwd: repoRoot,
      absolute: false,
      dot: true,
      ignore: IGNORE,
      onlyFiles: true,
      unique: true,
    }).sort();
  } catch {
    // non-fatal
  }

  for (const rel of hits) {
    const content = readDocIfSmall(join(repoRoot, rel));
    if (content === null) continue;
    return { rel, hasGateLanguage: detectGateLanguage(content, repoRoot) };
  }

  return null;
}

const isAllowlisted = makeAllowlistCheck(DISABLE_DIRECTIVE);

function hasAiSurface(repoRoot: string): boolean {
  const markerComponents = scanForMarkerComponents(repoRoot);
  if (markerComponents.length > 0) return true;
  const reservedTokens = detectReservedAiTokens(repoRoot);
  return reservedTokens.length > 0;
}

const evaluate = async (
  ctx: RuleContext,
  _files: ParsedFiles,
): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  if (!ctx.repoRoot) {
    return { findings, opportunities: 0 };
  }
  if (isAllowlisted(ctx.repoRoot)) {
    return { findings, opportunities: 0 };
  }

  if (!hasAiSurface(ctx.repoRoot)) {
    return { findings, opportunities: 0 };
  }

  const gateDoc = discoverGateDoc(ctx.repoRoot);

  if (gateDoc === null) {
    findings.push({
      ruleId: RULE_ID,
      axis: "ai-governance",
      severity: "warning",
      location: { file: "AI_GOVERNANCE.md", line: 1, column: 1 },
      message:
        "No AI value-gate governance doc found — this DS ships an AI surface but documents no go/no-go decision gate (ServiceNow \"10-Q\" pattern). Create a doc that answers: is AI needed, is it the right tool, what is the fallback?",
      suggestion:
        "add AI_GOVERNANCE.md (or docs/ai-governance.md / .lyse/ai-value-gate.md) with a structured checklist requiring AI justification before shipping each AI feature",
    });
    return { findings, opportunities: 1 };
  }

  if (!gateDoc.hasGateLanguage) {
    findings.push({
      ruleId: RULE_ID,
      axis: "ai-governance",
      severity: "warning",
      location: { file: gateDoc.rel, line: 1, column: 1 },
      message: `Value-gate doc found at \`${gateDoc.rel}\` but contains no gate language — it does not pose the "is AI needed / go/no-go" decision question`,
      suggestion:
        'add explicit gate questions: "Is AI needed?", "Is AI the right tool?", "What is the deterministic fallback?" — phrasing that forces a go/no-go decision before shipping',
    });
    return { findings, opportunities: 1 };
  }

  findings.push({
    ruleId: RULE_ID,
    axis: "ai-governance",
    severity: "info",
    location: { file: gateDoc.rel, line: 1, column: 1 },
    message: `AI value-gate governance doc detected at \`${gateDoc.rel}\` — DS documents an AI go/no-go decision process`,
    suggestion:
      "keep the gate doc up to date as the AI surface evolves; link to it from AGENTS.md or llms.txt so agents can discover it",
  });
  return { findings, opportunities: 1 };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "ai-governance",
    lyseRuleId: RULE_ID,
    defaultSeverity: "warning",
    shortDescription: "AI value-gate governance doc must be present when an AI surface exists",
    fullDescription:
      "When a design system ships an AI surface — detected by an AI-marker component (via the `AI_MARKER_NAMES` vocabulary from Track 3.2) or reserved AI-marker design tokens (Track 3.1, `detectReservedAiTokens`) — this rule checks that a governance value-gate doc exists and contains structured go/no-go decision language. Candidate locations scanned: `AI_GOVERNANCE.md` at repo root, `docs/ai-value-gate.md`, `docs/ai-governance.md`, `docs/ai-readiness.md`, `docs/ai-checklist.md`, `.lyse/ai-value-gate.md`, and `AI_GOVERNANCE.md` anywhere in the repo tree. A doc is considered valid if it carries a language-agnostic structural signal — a markdown checklist (`- [ ]` / `- [x]`) or the YAML front-matter key `lyse-doc: value-gate` — or gate phrasing from the locale-keyed `gatePhrases` vocabulary (en/fr/de/ja/es built-in, extensible via the `i18n` block in `.lyse.yaml`): e.g. \"is AI needed\", \"value gate\", \"go/no-go\", \"is AI the right tool\", \"L'IA est-elle nécessaire\", \"Ist KI notwendig\", \"AIは必要か\". Emits `warning` when AI surface exists but no doc found, or doc found but lacks gate language. Emits `info` when a valid value-gate doc is present. Emits nothing when the DS has no AI surface.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/ai-governance-value-gate-doc-present.md",
    rationale: `Why it matters

Before shipping AI-powered UI, design systems need a structured answer to "is AI actually needed here?" — a go/no-go gate. ServiceNow's internal "10-Q" process documents exactly this: a fixed checklist of questions (is AI the right tool? can a deterministic rule solve this? what is the fallback?) that must be answered before any AI feature lands.

Without this gate doc, individual teams ship AI features ad-hoc, often when a rule-based solution would have been faster, cheaper, and more auditable. The governance debt accumulates: inconsistent AI use, unclear fallback paths, and no audit trail.

This rule does NOT enforce the answers — only that the DS ships the document, ensuring the gate process is defined and discoverable. Teams that use Lyse for AI governance get a measurable signal: "this DS has defined its AI decision process."

The cross-condition logic — checking for an AI surface first via \`scanForMarkerComponents\` and \`detectReservedAiTokens\` — ensures DSs without any AI surface are not penalised. The rule is additive: it rewards good governance without creating false positives for projects that have not yet adopted AI features.`,
    examples: [
      {
        good: `# AI Value Gate

## Is AI needed?
- [ ] Can a deterministic rule solve this instead?
- [ ] Does ML outperform a rule on this specific input distribution?
- [ ] What is the fallback if the model is unavailable?

Go/no-go: answer all three before shipping.`,
        bad: `# AI Guidelines

Use \`AILabel\` on all AI-generated content surfaces.
Follow the design tokens from the \`ai\` namespace.`,
      },
    ],
    allowlist: [
      "repos containing `lyse-disable ai-governance/value-gate-doc-present` in README, README.md, README.mdx, readme.md, .lyse.yaml, or .lyse.yml — rule is N/A",
      "DSs with no AI surface (no AI-marker component and no reserved AI tokens) — rule emits nothing",
      "doc files larger than 500 KB — skipped to avoid pathological cases",
      "files under `node_modules/`, `dist/`, `build/`, `.git/`, `.next/`, `out/`, `coverage/`",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = {
  detectGateLanguage,
  discoverGateDoc,
  isAllowlisted,
  DISABLE_DIRECTIVE,
  ALLOWLIST_CANDIDATES,
  STATIC_CANDIDATES,
  DOC_GLOBS,
};
