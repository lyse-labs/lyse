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

const RULE_ID = "ai-governance/source-attribution-present";
const DISABLE_DIRECTIVE = `lyse-disable ${RULE_ID}`;

const isAllowlisted = makeAllowlistCheck(DISABLE_DIRECTIVE);

// Source-attribution vocabulary — distinctive tokens only, to avoid the bare
// generic "source"/"reference" (which match SourceCode, ReferenceDocs, etc.).
// `citation` covers Citation/Citations/SourceCitation; `attribution` covers
// Attribution/SourceAttribution; `provenance` covers Provenance.
const ATTRIBUTION_PATTERNS = ["citation", "attribution", "provenance"] as const;

function normaliseName(name: string): string {
  return name.toLowerCase().replace(/[-_]/g, "");
}

export function isSourceAttributionName(name: string): boolean {
  const lower = normaliseName(name);
  return ATTRIBUTION_PATTERNS.some((p) => lower.includes(p));
}

function deriveNameFromPath(relPath: string): string {
  const parts = relPath.split("/");
  const file = parts[parts.length - 1] ?? "";
  return file.replace(/\.(tsx|jsx|vue)$/, "");
}

function scanForSourceAttribution(repoRoot: string, files?: string[]): string[] {
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
    if (isSourceAttributionName(baseName)) {
      found.add(baseName);
      continue;
    }

    const names = rel.endsWith(".vue") ? extractVueNames(source) : extractNamesFromSource(source);
    for (const name of names) {
      if (isSourceAttributionName(name)) found.add(name);
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

  const names = scanForSourceAttribution(ctx.repoRoot, componentFiles);

  if (names.length > 0) {
    findings.push({
      ruleId: RULE_ID,
      axis: "ai-governance",
      severity: "info",
      location: { file: "src/index.ts", line: 1, column: 1 },
      message: `Source-attribution component${names.length === 1 ? "" : "s"} detected: ${names.join(", ")} (HAX G11 / PAIR Explainability)`,
      suggestion:
        "Source-attribution component found — ensure AI-generated answers cite their sources so users can verify claims.",
    });
    return { findings, opportunities: 1 };
  }

  findings.push({
    ruleId: RULE_ID,
    axis: "ai-governance",
    severity: "warning",
    location: { file: "src/index.ts", line: 1, column: 1 },
    message:
      "An AI-marker component is present but no source-attribution component was detected (HAX G11 / PAIR Explainability). Ship a citation/attribution component so AI-generated answers can reference their sources.",
    suggestion:
      "Add a dedicated attribution affordance (e.g. Citation, Citations, SourceAttribution, Provenance) shown alongside AI-generated content.",
  });
  return { findings, opportunities: 1 };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "ai-governance",
    lyseRuleId: RULE_ID,
    defaultSeverity: "warning",
    shortDescription: "Detect a source-attribution component on AI output",
    fullDescription:
      "When an AI-marker component is detected in the design system, this rule checks whether a companion source-attribution / citation component exists co-located in the same file. Detection is per-file: an attribution vocabulary match only earns credit when the same file also contains an AI marker (component name or JSX tag). The scan checks exported identifiers and file base names against a distinctive attribution vocabulary (case-insensitive substring, separator-normalised): `citation`, `attribution`, `provenance` — covering names like Citation, Citations, SourceCitation, SourceAttribution, Provenance. The bare generic `source`/`reference` are deliberately excluded to avoid matching SourceCode / ReferenceDocs. Three outcomes: AI-marker present + attribution component co-located → `info`; AI-marker present + no co-located attribution component → `warning`; no AI-marker anywhere → no finding.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/ai-governance-source-attribution-present.md",
    rationale: `Why it matters

Generative AI answers are most trustworthy when they cite where their claims come from. HAX G11 (IBM Human-AI Experience guidelines, "Convey the consequences of user actions" / explainability of outputs) and the Google PAIR Explainability + Trust guidebook call for AI interfaces to attribute sources, so users can verify generated claims rather than taking them on faith — directly mitigating hallucination harm.

A dedicated, reusable source-attribution component (citation list, inline citations, provenance panel) gives teams a consistent, accessible pattern for surfacing the documents or data behind an answer. Without one, teams either omit attribution (unverifiable output) or hand-roll inconsistent citation UIs.

The rule uses per-file co-location: an attribution component only earns credit when it lives in the same file as an AI-marker component or JSX tag, so a generic bibliography or academic Citation component in an unrelated, non-AI file does not falsely count. The rule fires only when at least one AI-marker file exists — a design system with no AI surface is not penalized.`,
    examples: [
      {
        good: "// AiAnswer.tsx — citation component co-located with AI marker\nexport const AILabel = () => null;\nexport const Citations = () => null;",
        bad: "// AILabel.tsx — AI marker present but no source-attribution component shipped anywhere",
      },
      {
        good: "// AIOutput.tsx — exposes a provenance panel alongside the AI badge\nexport const AIBadge = () => null;\nexport const SourceAttribution = () => null;",
        bad: "// Bibliography.tsx — academic citation list, no AI marker in the file → does not count",
      },
    ],
    allowlist: [
      "repos containing `lyse-disable ai-governance/source-attribution-present` in an adjacent README or `.lyse.yaml` — rule is N/A",
      "repos with no AI-marker component — no AI surface detected, rule emits nothing",
      "files larger than 1 MB — skipped to avoid pathological cases",
      "files under `node_modules/`, `dist/`, `build/`, `.git/`, `.next/`, `out/`, `coverage/`",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});
