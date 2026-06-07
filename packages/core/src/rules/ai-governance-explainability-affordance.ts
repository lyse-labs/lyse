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
  isAiMarkerName,
  extractNamesFromSource,
  extractVueNames,
  safeReadText,
  COMPONENT_GLOB,
  SCAN_IGNORE,
  fileHasAiMarker,
  deriveComponentNameFromPath,
  scanForMarkerComponents,
  makeAllowlistCheck,
} from "./ai-governance-ai-marker-component-present.js";

const RULE_ID = "ai-governance/explainability-affordance";

const DISABLE_DIRECTIVE = `lyse-disable ${RULE_ID}`;
const ALLOWLIST_CANDIDATES = [
  "README.md",
  "README",
  "README.mdx",
  "readme.md",
  ".lyse.yaml",
  ".lyse.yml",
];

// Name-based affordance detection patterns (case-insensitive substring match).
const AFFORDANCE_PATTERNS = [
  "explain",
  "explainability",
  "whythis",
  "citation",
  "sources",
  "confidence",
  "provenance",
];

// ARIA attributes indicating a popover/tooltip carrying explanation content.
const ARIA_POPOVER_RE =
  /\baria-describedby\s*=|role\s*=\s*["'](?:dialog|tooltip)["']/i;

const isAllowlisted = makeAllowlistCheck(DISABLE_DIRECTIVE);

export function isExplainabilityAffordanceName(name: string): boolean {
  const lower = name.toLowerCase();
  return AFFORDANCE_PATTERNS.some((p) => lower.includes(p));
}

export function isMarkerWithPopover(name: string, source: string): boolean {
  if (!isAiMarkerName(name)) return false;
  return ARIA_POPOVER_RE.test(source);
}

// Accepts an optional pre-computed file list to avoid a second glob in evaluate.
export function scanForExplainabilityAffordances(repoRoot: string, files?: string[]): string[] {
  const found: string[] = [];

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

  for (const rel of componentFiles) {
    const baseName = deriveComponentNameFromPath(rel);
    const source = safeReadText(join(repoRoot, rel));
    if (!source) continue;

    const hasMarker = fileHasAiMarker(source, rel) || isAiMarkerName(baseName);

    if (!hasMarker) continue;

    // File contains an AI marker — now check for co-located affordance names.
    const names = rel.endsWith(".vue")
      ? extractVueNames(source)
      : extractNamesFromSource(source);

    // Also check the file name itself (e.g. AIConfidenceDisplay.tsx where the
    // file is both a marker AND an affordance by name).
    if (isExplainabilityAffordanceName(baseName)) {
      found.push(baseName);
    }

    for (const name of names) {
      if (isExplainabilityAffordanceName(name)) {
        found.push(name);
      } else if (isMarkerWithPopover(name, source)) {
        found.push(`${name}[popover]`);
      }
    }
  }

  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const name of found) {
    const key = name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(name);
    }
  }
  return deduped.sort();
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

  // Glob once — reuse file list for the marker gate check and affordance scan.
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

  if (scanForMarkerComponents(ctx.repoRoot).length === 0) {
    return { findings, opportunities: 0 };
  }

  const affordances = scanForExplainabilityAffordances(ctx.repoRoot, componentFiles);

  if (affordances.length > 0) {
    const list = affordances.join(", ");
    findings.push({
      ruleId: RULE_ID,
      axis: "ai-governance",
      severity: "info",
      location: { file: "src/index.ts", line: 1, column: 1 },
      message: `Explainability affordance${affordances.length === 1 ? "" : "s"} detected: ${list} (HAX G11 / PAIR Explainability)`,
      suggestion:
        "Explainability affordance found — ensure it is paired with the AI-marker component and surfaces rationale or confidence information to users.",
    });
    return { findings, opportunities: 1 };
  }

  findings.push({
    ruleId: RULE_ID,
    axis: "ai-governance",
    severity: "warning",
    location: { file: "src/index.ts", line: 1, column: 1 },
    message:
      "An AI-marker component is present but no explainability affordance was detected (HAX G11 / PAIR Explainability). Consider shipping a companion Explain/Citation/Confidence component or binding the marker to a popover/tooltip with aria-describedby or role=\"dialog\".",
    suggestion:
      "Add a dedicated explainability component (e.g. ExplainPopover, CitationList, ConfidenceDisplay, WhyThis) or attach aria-describedby / role=\"tooltip\" to the AI-marker to surface rationale for AI-generated content.",
  });
  return { findings, opportunities: 1 };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "ai-governance",
    lyseRuleId: RULE_ID,
    defaultSeverity: "warning",
    shortDescription:
      "Detect an explainability affordance paired with AI-marker components",
    fullDescription:
      "When an AI-marker component is detected in the design system (per the shared `isAiMarkerName` predicate exported by `ai-governance/ai-marker-component-present`), this rule checks whether a companion explainability affordance exists. Detection is name-based: any exported identifier or component file whose name contains `Explain`, `Explainability`, `WhyThis`, `Citation`, `Sources`, `Confidence`, or `Provenance` (case-insensitive) qualifies. A marker component that opens a popover or tooltip carrying explanation content (`aria-describedby` / `role=\"dialog\"` / `role=\"tooltip\"`) also satisfies the rule. Emits `info` when an affordance is found; emits `warning` when an AI-marker exists but no affordance is detected. Emits nothing when no AI-marker is present (no AI surface). Guidelines: HAX G11 (Explain AI decisions) / PAIR Explainability. The behavioral slice — verifying that an indicator appears wherever AI output is rendered — is deferred to Track 4.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/ai-governance-explainability-affordance.md",
    rationale: `Why it matters

Users interacting with AI-generated content have a right to understand why a particular output was produced. HAX G11 (Google PAIR / IBM Human-AI Experience guidelines) requires that AI-powered interfaces expose an explanation pathway — a popover, citation list, confidence meter, or similar affordance — so users can evaluate trustworthiness and take informed action.

Without this affordance, consumers of the design system have no standard component to reach for when building explainable AI interfaces, leading to ad-hoc implementations with inconsistent UX and missing accessibility attributes.

This rule checks only the static "affordance present" slice (Track 3.5): does the DS export a component whose name signals explainability intent, or does an AI-marker component carry the appropriate ARIA binding to open an explanation panel? The behavioral slice — ensuring such an indicator appears wherever AI output is rendered in a consuming application — requires semantic location detection and is out of scope here; it will be addressed in Track 4.

A DS with no AI-marker component at all has no AI surface and is not penalised.`,
    examples: [
      {
        good: "// src/index.ts\nexport { AILabel } from './ai-label';\nexport { ExplainPopover } from './explain-popover';",
        bad: "// src/index.ts\nexport { AILabel } from './ai-label';\n// no Explain/Citation/Confidence component exported",
      },
      {
        good: '// AILabel.tsx — marker bound to explanation panel\n<button aria-describedby="explain-panel">AI</button>\n<div id="explain-panel" role="dialog">Why: …</div>',
        bad: "// AILabel.tsx — marker with no explanation binding\n<span className=\"ai-badge\">AI</span>",
      },
      {
        good: "// src/index.ts\nexport { ConfidenceDisplay } from './confidence-display';\nexport { CitationList } from './citation-list';",
        bad: "// AI tokens and AIBadge exported, but no explainability affordance component present",
      },
    ],
    allowlist: [
      "repos containing `lyse-disable ai-governance/explainability-affordance` in an adjacent README or `.lyse.yaml` — rule is N/A",
      "repos with no AI-marker component — no AI surface detected, rule emits nothing",
      "files larger than 1 MB — skipped to avoid pathological cases",
      "files under `node_modules/`, `dist/`, `build/`, `.git/`, `.next/`, `out/`, `coverage/`",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = {
  isAllowlisted,
  isExplainabilityAffordanceName,
  isMarkerWithPopover,
  scanForExplainabilityAffordances,
  AFFORDANCE_PATTERNS,
  DISABLE_DIRECTIVE,
  ALLOWLIST_CANDIDATES,
};
