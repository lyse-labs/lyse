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
  extractNamesFromSource,
  extractVueNames,
  safeReadText,
  COMPONENT_GLOB,
  SCAN_IGNORE,
  fileHasAiMarker,
  makeAllowlistCheck,
} from "./ai-governance-ai-marker-component-present.js";

const RULE_ID = "ai-governance/confidence-indicator-present";
const DISABLE_DIRECTIVE = `lyse-disable ${RULE_ID}`;

const isAllowlisted = makeAllowlistCheck(DISABLE_DIRECTIVE);

// Confidence / uncertainty vocabulary — case-insensitive substring match after
// separator normalisation (kebab/snake stripped). Covers ConfidenceBadge,
// ConfidenceScore, ConfidenceLevel, UncertaintyIndicator, CertaintyMeter, etc.
const CONFIDENCE_PATTERNS = ["confidence", "uncertainty", "certainty"] as const;

function normaliseName(name: string): string {
  return name.toLowerCase().replace(/[-_]/g, "");
}

export function isConfidenceIndicatorName(name: string): boolean {
  const lower = normaliseName(name);
  return CONFIDENCE_PATTERNS.some((p) => lower.includes(p));
}

function deriveNameFromPath(relPath: string): string {
  const parts = relPath.split("/");
  const file = parts[parts.length - 1] ?? "";
  return file.replace(/\.(tsx|jsx|vue)$/, "");
}

// Per-file co-location: a confidence indicator only earns credit when it lives
// in a FILE that also contains an AI marker (component name or JSX tag).
export function scanForConfidenceIndicators(repoRoot: string, files?: string[]): string[] {
  const found = new Set<string>();

  let componentFiles: string[];
  if (files !== undefined) {
    componentFiles = files;
  } else {
    componentFiles = [];
    try {
      componentFiles = fg.sync(COMPONENT_GLOB, {
        cwd: repoRoot,
        absolute: false,
        dot: false,
        ignore: SCAN_IGNORE,
        onlyFiles: true,
        unique: true,
      });
    } catch {
      // non-fatal
    }
  }

  for (const rel of componentFiles.sort()) {
    const source = safeReadText(join(repoRoot, rel));
    if (!source) continue;
    if (!fileHasAiMarker(source, rel, repoRoot)) continue;

    const baseName = deriveNameFromPath(rel);
    if (isConfidenceIndicatorName(baseName)) {
      found.add(baseName);
      continue;
    }

    const names = rel.endsWith(".vue") ? extractVueNames(source) : extractNamesFromSource(source);
    for (const name of names) {
      if (isConfidenceIndicatorName(name)) found.add(name);
    }
  }

  return [...found].sort((a, b) => a.localeCompare(b));
}

const evaluate = async (ctx: RuleContext, _files: ParsedFiles): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  if (!ctx.repoRoot) return { findings, opportunities: 0 };
  if (isAllowlisted(ctx.repoRoot)) return { findings, opportunities: 0 };

  let componentFiles: string[] = [];
  try {
    componentFiles = fg.sync(COMPONENT_GLOB, {
      cwd: ctx.repoRoot,
      absolute: false,
      dot: false,
      ignore: SCAN_IGNORE,
      onlyFiles: true,
      unique: true,
    });
  } catch {
    // non-fatal
  }

  let anyAiMarker = false;
  for (const rel of componentFiles) {
    const source = safeReadText(join(ctx.repoRoot, rel));
    if (!source) continue;
    if (fileHasAiMarker(source, rel, ctx.repoRoot)) {
      anyAiMarker = true;
      break;
    }
  }
  if (!anyAiMarker) return { findings, opportunities: 0 };

  const names = scanForConfidenceIndicators(ctx.repoRoot, componentFiles);

  if (names.length > 0) {
    findings.push({
      ruleId: RULE_ID,
      axis: "ai-governance",
      severity: "info",
      location: { file: "src/index.ts", line: 1, column: 1 },
      message: `Confidence/uncertainty indicator${names.length === 1 ? "" : "s"} detected: ${names.join(", ")} (HAX G2 / PAIR Trust & Explainability)`,
      suggestion:
        "Confidence indicator found — ensure it is shown on AI-generated output so users can calibrate trust in the result.",
    });
    return { findings, opportunities: 1 };
  }

  findings.push({
    ruleId: RULE_ID,
    axis: "ai-governance",
    severity: "warning",
    location: { file: "src/index.ts", line: 1, column: 1 },
    message:
      "An AI-marker component is present but no confidence/uncertainty indicator was detected (HAX G2 / PAIR Trust). Ship a component that communicates how certain the AI output is so users can calibrate trust.",
    suggestion:
      "Add a dedicated confidence affordance (e.g. ConfidenceBadge, ConfidenceScore, UncertaintyIndicator, CertaintyMeter) shown alongside AI-generated content.",
  });
  return { findings, opportunities: 1 };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "ai-governance",
    lyseRuleId: RULE_ID,
    defaultSeverity: "warning",
    shortDescription: "Detect a confidence/uncertainty indicator on AI output",
    fullDescription:
      "When an AI-marker component is detected in the design system, this rule checks whether a companion confidence/uncertainty indicator exists co-located in the same file. Detection is per-file: a confidence vocabulary match only earns credit when the same file also contains an AI marker (component name or JSX tag). The scan checks exported identifiers and file base names against the confidence vocabulary (case-insensitive substring, separator-normalised): `confidence`, `uncertainty`, `certainty` — covering names like ConfidenceBadge, ConfidenceScore, ConfidenceLevel, UncertaintyIndicator, CertaintyMeter. Three outcomes: AI-marker present + confidence indicator co-located → `info`; AI-marker present + no co-located confidence indicator → `warning`; no AI-marker anywhere → no finding.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/ai-governance-confidence-indicator-present.md",
    rationale: `Why it matters

Generative AI output is probabilistic — it can be confidently wrong. HAX G2 (IBM Human-AI Experience guidelines, "Make clear how well the system can do what it can do") and the Google PAIR Explainability + Trust guidebook require AI interfaces to communicate uncertainty, so users can calibrate how much to trust a given result rather than treating every answer as authoritative.

A dedicated, reusable confidence affordance (badge, score, meter, or qualitative low/medium/high indicator) gives teams a consistent vocabulary and accessible UX for surfacing model uncertainty. Without one, teams either omit uncertainty entirely (over-trust) or hand-roll inconsistent ad-hoc indicators.

The rule uses per-file co-location: a confidence component only earns credit when it lives in the same file as an AI-marker component or JSX tag, so a statistical ConfidenceInterval chart component in an unrelated file does not falsely count. The rule fires only when at least one AI-marker file exists — a design system with no AI surface is not penalized.`,
    examples: [
      {
        good: "// AiAnswer.tsx — confidence indicator co-located with AI marker\nexport const AILabel = () => null;\nexport const ConfidenceBadge = () => null;",
        bad: "// AILabel.tsx — AI marker present but no confidence indicator shipped anywhere",
      },
      {
        good: "// AIOutput.tsx — exposes an uncertainty indicator alongside the AI badge\nexport const AIBadge = () => null;\nexport const UncertaintyIndicator = () => null;",
        bad: "// ConfidenceInterval.tsx — statistics chart, no AI marker in the file → does not count",
      },
    ],
    allowlist: [
      "repos containing `lyse-disable ai-governance/confidence-indicator-present` in an adjacent README or `.lyse.yaml` — rule is N/A",
      "repos with no AI-marker component — no AI surface detected, rule emits nothing",
      "files larger than 1 MB — skipped to avoid pathological cases",
      "files under `node_modules/`, `dist/`, `build/`, `.git/`, `.next/`, `out/`, `coverage/`",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = {
  isConfidenceIndicatorName,
  scanForConfidenceIndicators,
  isAllowlisted,
  DISABLE_DIRECTIVE,
  CONFIDENCE_PATTERNS,
};
