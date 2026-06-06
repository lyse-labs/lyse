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
  AI_MARKER_NAMES,
  isAiMarkerName,
  safeReadText,
  extractNamesFromSource,
  extractVueNames,
} from "./ai-governance-ai-marker-component-present.js";

const RULE_ID = "ai-governance/human-control-affordances";
const MAX_ALLOWLIST_FILE_BYTES = 1_000_000;
const DISABLE_DIRECTIVE = `lyse-disable ${RULE_ID}`;

const ALLOWLIST_CANDIDATES = [
  "README.md",
  "README",
  "README.mdx",
  "readme.md",
  ".lyse.yaml",
  ".lyse.yml",
];

const COMPONENT_GLOB = "**/*.{tsx,jsx,vue}";

const IGNORE = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.git/**",
  "**/.next/**",
  "**/out/**",
  "**/coverage/**",
];

// ────────────────────────────────────────────────────────────────────────────
// Group 1 — Per-output control affordances
// ────────────────────────────────────────────────────────────────────────────

const PER_OUTPUT_NAME_PATTERNS = [
  "regenerate",
  "retry",
  "stopgenerat",
  "editresponse",
  "editoutput",
  "undo",
  "confirm",
  "dismiss",
  "accept",
  "reject",
];

const PER_OUTPUT_LABELS: ReadonlySet<string> = new Set([
  "regenerate",
  "retry",
  "stop",
  "stop generating",
  "undo",
  "confirm",
  "dismiss",
  "accept",
  "reject",
]);

export interface ControlHit {
  name?: string;
  label?: string;
}

const BUTTON_OR_CTA_RE = /<(button|Button|a)\b[^>]*>/g;

function isPerOutputName(name: string): boolean {
  const lower = name.toLowerCase();
  return PER_OUTPUT_NAME_PATTERNS.some((p) => lower.includes(p));
}

function extractButtonLabels(source: string): string[] {
  const labels: string[] = [];
  BUTTON_OR_CTA_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BUTTON_OR_CTA_RE.exec(source)) !== null) {
    const rest = source.slice(m.index + m[0].length);
    const close = rest.search(/<\/\s*(button|Button|a)\s*>/);
    const inner = (close === -1 ? rest : rest.slice(0, close))
      .replace(/<[^>]*>/g, " ")
      .trim()
      .replace(/\s+/g, " ");
    if (inner.length > 0 && inner.length < 80) labels.push(inner);
  }
  return labels;
}

export function detectPerOutputControls(source: string): ControlHit[] {
  const hits: ControlHit[] = [];
  for (const name of extractNamesFromSource(source)) {
    if (isPerOutputName(name)) hits.push({ name });
  }
  for (const label of extractButtonLabels(source)) {
    if (PER_OUTPUT_LABELS.has(label.toLowerCase())) hits.push({ label });
  }
  return hits;
}

// ────────────────────────────────────────────────────────────────────────────
// Group 2 — Global AI settings / disable toggle
// ────────────────────────────────────────────────────────────────────────────

const GLOBAL_NAME_PATTERNS = [
  "aisettings",
  "aipreferences",
  "disableai",
  "aicontrols",
  "aiconfig",
];

const GLOBAL_LABEL_RE =
  /(?<![a-zA-Z-])label\s*=\s*["'`](Disable AI|AI features|AI settings|Enable AI|AI on|AI off)["'`]/i;

function isGlobalAiToggleName(name: string): boolean {
  const lower = name.toLowerCase();
  return GLOBAL_NAME_PATTERNS.some((p) => lower.includes(p));
}

export function detectGlobalAiToggle(source: string): boolean {
  for (const name of extractNamesFromSource(source)) {
    if (isGlobalAiToggleName(name)) return true;
  }
  return GLOBAL_LABEL_RE.test(source);
}

// ────────────────────────────────────────────────────────────────────────────
// Allowlist (verbatim from ai-governance-ai-tokens-reserved.ts, RULE_ID swapped)
// ────────────────────────────────────────────────────────────────────────────

function isAllowlisted(repoRoot: string): boolean {
  for (const candidate of ALLOWLIST_CANDIDATES) {
    const abs = join(repoRoot, candidate);
    if (!existsSync(abs)) continue;
    try {
      const stat = statSync(abs);
      if (!stat.isFile() || stat.size > MAX_ALLOWLIST_FILE_BYTES) continue;
      const raw = readFileSync(abs, "utf8");
      if (raw.includes(DISABLE_DIRECTIVE)) return true;
    } catch {
      // unreadable — fall through
    }
  }
  return false;
}

// ────────────────────────────────────────────────────────────────────────────
// AI marker scan per file (reuses isAiMarkerName + extractNamesFromSource/Vue)
// ────────────────────────────────────────────────────────────────────────────

function fileHasAiMarker(source: string, relPath: string): boolean {
  const names = relPath.endsWith(".vue")
    ? extractVueNames(source)
    : extractNamesFromSource(source);
  if (names.some((n) => isAiMarkerName(n))) return true;
  for (const m of source.matchAll(/<\s*([A-Za-z][\w.-]*)/g)) {
    if (m[1] && isAiMarkerName(m[1])) return true;
  }
  return false;
}

// ────────────────────────────────────────────────────────────────────────────
// evaluate
// ────────────────────────────────────────────────────────────────────────────

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

  let componentFiles: string[] = [];
  try {
    componentFiles = fg.sync(COMPONENT_GLOB, {
      cwd: ctx.repoRoot,
      absolute: false,
      dot: false,
      ignore: IGNORE,
      onlyFiles: true,
      unique: true,
    });
  } catch {
    // non-fatal
  }

  componentFiles.sort();

  let seenMarker = false;
  const allControlHits: ControlHit[] = [];
  let hasGlobalToggle = false;

  for (const rel of componentFiles) {
    const abs = join(ctx.repoRoot, rel);
    const source = safeReadText(abs);
    if (!source) continue;

    const hasMarker = fileHasAiMarker(source, rel);
    if (hasMarker) {
      seenMarker = true;
      const hits = detectPerOutputControls(source);
      allControlHits.push(...hits);
    }
    if (detectGlobalAiToggle(source)) hasGlobalToggle = true;
  }

  if (!seenMarker) {
    return { findings, opportunities: 0 };
  }

  const opportunities = componentFiles.length;

  if (allControlHits.length > 0) {
    const names = allControlHits
      .map((h) => h.name ?? h.label ?? "")
      .filter(Boolean);
    const list = [...new Set(names)].join(", ");
    const globalNote = hasGlobalToggle
      ? "Global AI toggle: present."
      : "Global AI toggle: not detected.";
    findings.push({
      ruleId: RULE_ID,
      axis: "ai-governance",
      severity: "info",
      location: { file: "src/index.ts", line: 1, column: 1 },
      message: `Per-output human-control affordances detected (HAX G8): ${list}. ${globalNote} (HAX G9)`,
      suggestion:
        "Human-control affordances found — verify they are accessible and paired consistently with every AI-generated surface.",
    });
    return { findings, opportunities };
  }

  findings.push({
    ruleId: RULE_ID,
    axis: "ai-governance",
    severity: "warning",
    location: { file: "src/index.ts", line: 1, column: 1 },
    message:
      "AI surface detected but no per-output control affordances found (HAX G8 / HAX G9). " +
      "Ship Regenerate / Stop / Edit / Undo / Confirm / Dismiss / Accept / Reject controls " +
      "so users can correct AI-generated output.",
    suggestion:
      "Add per-output control components (e.g. RegenerateButton, StopGenerating, EditResponse, UndoAction, ConfirmOutput, DismissResult, AcceptSuggestion, RejectSuggestion) and a global AI settings/disable toggle (e.g. AISettings, AiPreferences, DisableAI).",
  });
  return { findings, opportunities };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "ai-governance",
    lyseRuleId: RULE_ID,
    defaultSeverity: "warning",
    shortDescription: "Detect human-control affordances over AI output",
    fullDescription:
      "Scans component files (`**/*.{tsx,jsx,vue}`) for two groups of human-control affordances. " +
      "Group 1 — per-output controls: exported component names or button labels matching the correction/dismissal vocabulary " +
      "(Regenerate, Retry, Stop, Edit, Undo, Confirm, Dismiss, Accept, Reject). " +
      "Group 2 — global AI toggle: exported names or toggle labels indicating a settings surface that lets users disable AI " +
      "(AISettings, AiPreferences, DisableAI, or a label 'Disable AI' / 'AI features'). " +
      "Cross-condition: when an AI-marker component is present (per the shared `isAiMarkerName` predicate) but no per-output control is found, emits `warning`; " +
      "when controls are detected, emits `info` listing them and noting global toggle presence. " +
      "Emits nothing when the DS has no AI surface. Guidelines: HAX G8 (efficient correction) / G9 (efficient dismissal).",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/ai-governance-human-control-affordances.md",
    rationale: `Why it matters

HAX G8 (efficient correction) and G9 (efficient dismissal) are foundational human-AI interaction guidelines: users must be able to correct, stop, retry, or dismiss AI-generated output without friction. Without corresponding affordances in the design system, consuming teams implement ad-hoc controls that are inconsistent, inaccessible, and miss the correction loop entirely.

This rule performs static detection: does the DS export components covering the standard correction/dismissal vocabulary? It does not verify usage site coverage (deferred to Track 4).

A DS with no AI-marker component emits nothing and is not penalised.`,
    examples: [
      {
        good: "// src/index.ts\nexport { AIBadge } from './ai-badge';\nexport { RegenerateButton } from './regenerate-button';\nexport { AISettings } from './ai-settings';",
        bad: "// src/index.ts\nexport { AIBadge } from './ai-badge';\n// no correction or dismissal controls exported",
      },
      {
        good: "// AIControls.tsx\nexport function RegenerateButton() { return <button>Regenerate</button>; }\nexport function DismissResult() { return <button>Dismiss</button>; }",
        bad: "// No per-output control components; users have no standardised way to correct AI output",
      },
      {
        good: "// AISettings.tsx\nexport function AISettings() {\n  return <Toggle label=\"Disable AI\" />;\n}",
        bad: "// AI surface present but no global disable/settings toggle shipped",
      },
    ],
    allowlist: [
      "repos containing `lyse-disable ai-governance/human-control-affordances` in an adjacent README or `.lyse.yaml` — rule is N/A",
      "repos with no AI-marker component at all — no AI surface detected, rule emits nothing",
      "files larger than 1 MB — skipped to avoid pathological cases",
      "files under `node_modules/`, `dist/`, `build/`, `.git/`, `.next/`, `out/`, `coverage/`",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = {
  detectPerOutputControls,
  detectGlobalAiToggle,
  isAllowlisted,
  DISABLE_DIRECTIVE,
  ALLOWLIST_CANDIDATES,
  AI_MARKER_NAMES,
};
