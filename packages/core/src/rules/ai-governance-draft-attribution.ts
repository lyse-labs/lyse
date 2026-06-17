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
  safeReadText,
  COMPONENT_GLOB,
  SCAN_IGNORE,
  fileHasAiMarker,
  makeAllowlistCheck,
} from "./ai-governance-ai-marker-component-present.js";

const RULE_ID = "ai-governance/draft-attribution";
const DISABLE_DIRECTIVE = `lyse-disable ${RULE_ID}`;
const SCAN_GLOB = "**/*.{tsx,jsx,vue,md,mdx,ts}";

const isAllowlisted = makeAllowlistCheck(DISABLE_DIRECTIVE);

// The "First draft created/generated/drafted with/by [tool]" convention —
// anchored on "first draft" + an authoring verb + with/by, so generic
// "Created with Sketch" / "first draft of the proposal" do not match.
const PHRASE_RE = /first draft\b[^.\n]{0,40}\b(created|made|generated|written|drafted)\b[^.\n]{0,8}\b(with|by|using)\b/i;

// Structured attribution markers (attribute / prop / component identifier).
const STRUCTURED_RES: readonly RegExp[] = [
  /\bdata-ai-generated\b/i,
  /\bai[-_]?generated\b/i,
  /\baiGenerated\b/,
  /\bdrafted[-_]?(with|by|tool)\b/i,
  /\bDraftAttribution\b/,
  /\bAiAttribution\b/,
  /\bGeneratedWith(Badge|Label|Attribution)\b/,
];

export function hasDraftAttribution(source: string): boolean {
  if (PHRASE_RE.test(source)) return true;
  return STRUCTURED_RES.some((re) => re.test(source));
}

const evaluate = async (ctx: RuleContext, _files: ParsedFiles): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  if (!ctx.repoRoot) return { findings, opportunities: 0 };
  if (isAllowlisted(ctx.repoRoot)) return { findings, opportunities: 0 };

  // AI-surface gate.
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

  let scanFiles: string[] = [];
  try {
    scanFiles = fg.sync(SCAN_GLOB, {
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

  let present = false;
  for (const rel of scanFiles) {
    const source = safeReadText(join(ctx.repoRoot, rel));
    if (!source) continue;
    if (hasDraftAttribution(source)) {
      present = true;
      break;
    }
  }

  if (present) {
    findings.push({
      ruleId: RULE_ID,
      axis: "ai-governance",
      severity: "info",
      location: { file: "src/index.ts", line: 1, column: 1 },
      message:
        "AI draft-attribution convention detected (\"first draft created with [tool]\" / structured AI-generated marker). (Appendix A)",
      suggestion:
        "Attribution convention found — keep applying it consistently to AI-assisted content so provenance is transparent.",
    });
    return { findings, opportunities: 1 };
  }

  findings.push({
    ruleId: RULE_ID,
    axis: "ai-governance",
    severity: "warning",
    location: { file: "src/index.ts", line: 1, column: 1 },
    message:
      "An AI surface is present but no AI draft-attribution convention was detected (Appendix A). Adopt a \"First draft created with [tool]\" convention or a structured AI-generated marker so AI-assisted content is transparently attributed.",
    suggestion:
      "Add an attribution convention — a \"First draft created with [tool]\" note, a `data-ai-generated` marker, or a `DraftAttribution` component — for AI-assisted content.",
  });
  return { findings, opportunities: 1 };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "ai-governance",
    lyseRuleId: RULE_ID,
    defaultSeverity: "warning",
    shortDescription: "Detect the AI draft-attribution convention",
    fullDescription:
      'When an AI surface (AI-marker component) is present, this rule checks whether the design system adopts an AI-content attribution convention (Appendix A). Detection is conservative for precision: the phrase form requires "first draft" anchored to an authoring verb (created / made / generated / written / drafted) plus with/by/using — so generic "Created with Sketch" or "first draft of the proposal" do not match; the structured form matches distinctive markers (`data-ai-generated`, `ai-generated` / `aiGenerated`, `drafted-with`, or a `DraftAttribution` / `AiAttribution` / `GeneratedWith*` identifier). Scans `**/*.{tsx,jsx,vue,md,mdx,ts}`. Three outcomes: AI surface + convention present → `info`; AI surface + absent → `warning`; no AI surface → no finding.',
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/ai-governance-draft-attribution.md",
    rationale: `Why it matters

As AI assists more design-system content — copy, docs, even component scaffolds — transparent provenance becomes a trust and governance requirement. The "First draft created with [tool]" convention (HAX / emerging AI-disclosure norms, Appendix A) gives teams a lightweight, consistent way to attribute AI-assisted content so reviewers and users know what was machine-drafted.

This rule detects whether the convention is adopted at all. It is deliberately precision-first — anchored phrases and distinctive structured markers, never bare "created with" — so it rewards genuine attribution rather than incidental text. The rule is silent on design systems with no AI surface, so non-AI systems are never penalized.`,
    examples: [
      {
        good: "<!-- README.md — AI-assisted content attributed -->\n# Component spec\n\n_First draft created with Claude; reviewed by the design team._",
        bad: "<!-- AI surface shipped, but no attribution convention anywhere -->\n# Component spec\n\nWritten by the team.",
      },
      {
        good: "// Structured marker on AI-assisted content\nexport const Doc = () => <article data-ai-generated=\"true\">…</article>;",
        bad: "// Generic footer — not an attribution convention\nexport const Footer = () => <p>Created with Sketch</p>;",
      },
    ],
    allowlist: [
      "repos containing `lyse-disable ai-governance/draft-attribution` in an adjacent README or `.lyse.yaml` — rule is N/A",
      "repos with no AI-marker component — no AI surface detected, rule emits nothing",
      "generic `created with` / unrelated `first draft` text — not matched (anchored detection)",
      "files under `node_modules/`, `dist/`, `build/`, `.git/`, `.next/`, `out/`, `coverage/`",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = {
  hasDraftAttribution,
  isAllowlisted,
  DISABLE_DIRECTIVE,
  PHRASE_RE,
  STRUCTURED_RES,
};
