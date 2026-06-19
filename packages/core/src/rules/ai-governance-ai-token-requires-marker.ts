import { join } from "node:path";
import fg from "fast-glob";
import type {
  Rule,
  RuleContext,
  ParsedFiles,
  RuleEvalResult,
  Finding,
  Confidence,
  ClassifyContext,
} from "../types.js";
import { createLyseRule } from "./_rule-module.js";
import { detectReservedAiTokens, isReservedTokenName } from "../parsers/ai-tokens.js";
import {
  AI_MARKER_NAMES,
  isAiMarkerName,
  safeReadText,
  COMPONENT_GLOB,
  SCAN_IGNORE,
  makeAllowlistCheck,
} from "./ai-governance-ai-marker-component-present.js";

const RULE_ID = "ai-governance/ai-token-requires-marker";
const DISABLE_DIRECTIVE = `lyse-disable ${RULE_ID}`;
const ALLOWLIST_CANDIDATES = [
  "README.md",
  "README",
  "README.mdx",
  "readme.md",
  ".lyse.yaml",
  ".lyse.yml",
];

const isAllowlisted = makeAllowlistCheck(DISABLE_DIRECTIVE);

// Matches `var(--token-name)` CSS-in-JS / inline style references.
const CSS_VAR_RE = /var\(\s*(--[a-zA-Z_][a-zA-Z0-9_-]*)\s*\)/g;

// Matches bare `--token-name` references (not declarations — no trailing colon).
// Used in JSX style props such as style={{ color: `--ai-primary` }} or template literals.
const BARE_CSS_TOKEN_RE = /(?<![a-zA-Z0-9_-])(--[a-zA-Z_][a-zA-Z0-9_-]*)(?!\s*:)(?![a-zA-Z0-9_-])/g;

// Matches dot-path token references like `color.ai.primary`, `tokens["color"]["ai"]`.
// Segment-level: at least one segment must be reserved.
const DOT_TOKEN_RE = /\b([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*){1,})\b/g;

// Matches JSX element opening tags: <AILabel, <AiBadge, <magic-icon, etc.
const JSX_TAG_RE = /<([A-Za-z][A-Za-z0-9_-]*)(?:\s|\/|>)/g;

// Matches `data-ai` or `data-ai-*` attribute (explicit AI annotation).
const DATA_AI_ATTR_RE = /\bdata-ai(?:-[a-z][a-z0-9-]*)?\b/;

interface ComponentAnalysis {
  usesReservedToken: boolean;
  hasAiMarker: boolean;
  confidence: "high" | "low";
  tokenRefs: string[];
}

function analyseComponent(source: string, repoRoot = ""): ComponentAnalysis {
  const tokenRefs: string[] = [];

  // 1. Detect reserved token usage via var(--...) references.
  CSS_VAR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CSS_VAR_RE.exec(source)) !== null) {
    const name = m[1];
    if (name && isReservedTokenName(name)) tokenRefs.push(name);
  }

  // 2. Detect bare --token-name references (not declarations).
  BARE_CSS_TOKEN_RE.lastIndex = 0;
  while ((m = BARE_CSS_TOKEN_RE.exec(source)) !== null) {
    const name = m[1];
    if (name && isReservedTokenName(name) && !tokenRefs.includes(name)) tokenRefs.push(name);
  }

  // 3. Detect dot-path token references in JS/TS expressions.
  DOT_TOKEN_RE.lastIndex = 0;
  while ((m = DOT_TOKEN_RE.exec(source)) !== null) {
    const path = m[1];
    if (path && isReservedTokenName(path) && !tokenRefs.includes(path)) tokenRefs.push(path);
  }

  const usesReservedToken = tokenRefs.length > 0;

  // 4. Detect AI-marker presence: JSX component tags.
  let markerViaJsx = false;
  JSX_TAG_RE.lastIndex = 0;
  while ((m = JSX_TAG_RE.exec(source)) !== null) {
    const tag = m[1];
    if (tag && isAiMarkerName(tag, repoRoot)) {
      markerViaJsx = true;
      break;
    }
  }

  // 5. Detect data-ai attribute (explicit programmatic annotation).
  const markerViaDataAttr = DATA_AI_ATTR_RE.test(source);

  const hasAiMarker = markerViaJsx || markerViaDataAttr;

  // 6. Classify confidence.
  //    HIGH: token usage is unambiguous (var(--...) form) AND marker absence/presence is clear.
  //    LOW: only dot-path references present (may be false positives from variable names).
  const tokenIsUnambiguous = (() => {
    CSS_VAR_RE.lastIndex = 0;
    BARE_CSS_TOKEN_RE.lastIndex = 0;
    let hasCssRef = false;
    let mm: RegExpExecArray | null;
    while ((mm = CSS_VAR_RE.exec(source)) !== null) {
      const name = mm[1];
      if (name && isReservedTokenName(name)) { hasCssRef = true; break; }
    }
    if (!hasCssRef) {
      while ((mm = BARE_CSS_TOKEN_RE.exec(source)) !== null) {
        const name = mm[1];
        if (name && isReservedTokenName(name)) { hasCssRef = true; break; }
      }
    }
    return hasCssRef;
  })();

  let confidence: "high" | "low";
  if (!usesReservedToken) {
    confidence = "high";
  } else if (tokenIsUnambiguous) {
    confidence = "high";
  } else {
    confidence = "low";
  }

  return { usesReservedToken, hasAiMarker, confidence, tokenRefs };
}

const evaluate = async (
  ctx: RuleContext,
  _files: ParsedFiles,
): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  if (!ctx.repoRoot) return { findings, opportunities: 0 };
  if (isAllowlisted(ctx.repoRoot)) return { findings, opportunities: 0 };

  // Fast-exit: no reserved tokens declared at all → nothing to check.
  const reservedTokens = detectReservedAiTokens(ctx.repoRoot);
  if (reservedTokens.length === 0) return { findings, opportunities: 0 };

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
    return { findings, opportunities: 0 };
  }

  let opportunities = 0;

  for (const rel of componentFiles) {
    const source = safeReadText(join(ctx.repoRoot, rel));
    if (source === null) continue;

    const analysis = analyseComponent(source, ctx.repoRoot);
    if (!analysis.usesReservedToken) continue;

    opportunities++;

    if (analysis.hasAiMarker) continue;

    if (analysis.confidence === "low") continue;

    const tokenList = analysis.tokenRefs.slice(0, 5).join(", ");
    const more = analysis.tokenRefs.length > 5 ? ` +${analysis.tokenRefs.length - 5} more` : "";

    findings.push({
      ruleId: RULE_ID,
      axis: "ai-governance",
      severity: "error",
      location: { file: rel, line: 1, column: 1 },
      message: `Component uses reserved AI token(s) (${tokenList}${more}) but renders no AI-marker`,
      suggestion:
        "Add an AI-marker component (e.g. AILabel, AIBadge, or a magic-* component) alongside AI-generated content, or annotate the element with `data-ai`.",
      confidence: "high",
    });
  }

  return { findings, opportunities };
};

const classifyConfidence: NonNullable<Rule["classifyConfidence"]> = (
  finding: Finding,
  _ctx: ClassifyContext,
): Confidence => {
  return finding.confidence ?? "high";
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "ai-governance",
    lyseRuleId: RULE_ID,
    defaultSeverity: "error",
    shortDescription: "AI token usage requires a co-located AI-marker (Carbon mandatory composite)",
    fullDescription:
      "For each component file (`**/*.{tsx,jsx,vue}`): if the file references a reserved AI design token (`var(--ai-*)`, `--p-color-*-magic*`, `color.ai.*`, `dragon-fruit`, etc.) it MUST also render an AI-marker — a JSX element whose name is in the shared `AI_MARKER_NAMES` vocabulary (imported from `ai-governance/ai-marker-component-present`), a `magic-*`-prefixed tag, or an explicit `data-ai` attribute. Token usage without a co-located marker is an `error`. Confidence is HIGH only when token detection is via unambiguous `var(--…)` or bare `--token` references; dot-path heuristic hits are LOW-confidence and suppressed by default. The rule is a no-op when no reserved tokens are declared anywhere in the repo (fast-exit via `detectReservedAiTokens`).",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/ai-governance-ai-token-requires-marker.md",
    rationale: `Why it matters

IBM Carbon's AI design system mandates the composite: every AI-generated surface must both (a) consume an AI-marker token for visual styling and (b) render a labelling component (AILabel, AIBadge, etc.) so the provenance is legible to users. Without this pairing, the marker token is applied silently — the UI looks "AI-styled" without any transparency cue, which violates IBM's own guidance and emerging regulatory expectations around AI disclosure.

Lyse enforces this as an \`error\` (not \`warning\`) because the composite is binary: either both halves are present (correct) or one is missing (incorrect — always a bug or oversight, not a style preference). The fast-exit on \`detectReservedAiTokens\` means the rule is a zero-cost no-op for DS repos with no AI surface.

The marker vocabulary (\`AI_MARKER_NAMES\`) is shared with sibling rule \`ai-governance/ai-marker-component-present\` to keep a single source of truth for what counts as a valid AI marker.`,
    examples: [
      {
        good: "// AICard.tsx — uses var(--ai-gradient) AND renders <AILabel>\nconst AICard = () => (\n  <div style={{ background: 'var(--ai-gradient)' }}>\n    <AILabel>AI-generated</AILabel>\n    {content}\n  </div>\n);",
        bad: "// AICard.tsx — uses var(--ai-gradient) but no AI-marker rendered\nconst AICard = () => (\n  <div style={{ background: 'var(--ai-gradient)' }}>\n    {content}\n  </div>\n);",
      },
      {
        good: "// AnswerCard.tsx — data-ai attribute used as explicit annotation\n<div data-ai style={{ background: 'var(--p-color-bg-magic)' }}>\n  {aiAnswer}\n</div>",
        bad: "// AnswerCard.tsx — magic token applied, no marker whatsoever\n<div style={{ background: 'var(--p-color-bg-magic)' }}>\n  {aiAnswer}\n</div>",
      },
      {
        good: "// Component.tsx — no AI tokens, no AI-marker needed\nconst Card = () => <div style={{ color: 'var(--color-primary)' }}>{content}</div>;",
        bad: "// AIAssistant.vue — uses --ai-surface token, missing data-ai or AIBadge\n<template><div :style=\"{ background: 'var(--ai-surface)' }\">{{ answer }}</div></template>",
      },
    ],
    allowlist: [
      "component files larger than 1 MB — skipped",
      "files under `node_modules/`, `dist/`, `build/`, `.git/`, `.next/`, `out/`, `coverage/`",
      "repos with no reserved AI tokens anywhere — rule is a no-op (zero findings, zero opportunities)",
      "findings where token reference is ambiguous (dot-path heuristic only) — emitted as LOW confidence and suppressed by default",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
  classifyConfidence,
});

/**
 * Source offsets of the HIGH-confidence reserved-token references the rule
 * keys on (`var(--reserved)` and bare `--reserved`). Used by the wrap-ai-token
 * codemod to locate the element to annotate. The dot-path heuristic is excluded
 * (low-confidence, never auto-fixed). Offsets are unique and ascending.
 */
export function reservedTokenRefOffsets(source: string): number[] {
  const offsets = new Set<number>();
  // Track ranges covered by var(--...) matches so bare-token pass skips them.
  const varRanges: Array<[number, number]> = [];

  CSS_VAR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CSS_VAR_RE.exec(source)) !== null) {
    if (m[1] && isReservedTokenName(m[1])) {
      offsets.add(m.index);
      varRanges.push([m.index, m.index + m[0].length]);
    }
  }
  BARE_CSS_TOKEN_RE.lastIndex = 0;
  while ((m = BARE_CSS_TOKEN_RE.exec(source)) !== null) {
    if (m[1] && isReservedTokenName(m[1])) {
      // Skip if this bare reference falls inside an already-captured var() match.
      const inside = varRanges.some(([start, end]) => m!.index >= start && m!.index < end);
      if (!inside) offsets.add(m.index);
    }
  }
  return [...offsets].sort((a, b) => a - b);
}

export const _internal = {
  analyseComponent,
  isAllowlisted,
  DISABLE_DIRECTIVE,
  ALLOWLIST_CANDIDATES,
  AI_MARKER_NAMES,
};
