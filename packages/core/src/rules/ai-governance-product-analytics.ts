import { join } from "node:path";
import fg from "fast-glob";
import type { Rule, RuleContext, ParsedFiles, RuleEvalResult, Finding } from "../types.js";
import { createLyseRule } from "./_rule-module.js";
import {
  safeReadText,
  COMPONENT_GLOB,
  SCAN_IGNORE,
  fileHasAiMarker,
  makeAllowlistCheck,
} from "./ai-governance-ai-marker-component-present.js";

const RULE_ID = "ai-governance/product-analytics";
const DISABLE_DIRECTIVE = `lyse-disable ${RULE_ID}`;
const isAllowlisted = makeAllowlistCheck(DISABLE_DIRECTIVE);

// Accept/reject/feedback interaction signals. JSX handler-prop names and
// data-action values are a code-level contract — they stay English even in
// localized products (same reasoning as human-control-affordances).
const HANDLER_PROP_RE =
  /\bon(?:Accept|Reject|Approve|ThumbsUp|ThumbsDown|Rate|Feedback)[A-Za-z]*(?=\s*=)/g;
const DATA_ACTION_RE =
  /\bdata-action\s*=\s*["'](accept|reject|feedback|thumbs-up|thumbs-down|rate)["']/gi;

// Curated, word-bounded product-analytics signal set (narrow first; the recall
// run calibrates breadth). Bare calls, member calls, known-SDK prefixes, hook.
const ANALYTICS_RE =
  /\b(?:track|trackEvent|captureEvent|logEvent|gtag)\s*\(|\.(?:track|capture)\s*\(|\bdataLayer\.push\s*\(|\b(?:posthog|mixpanel|amplitude|segment|analytics)\.|\buseAnalytics\b/;

function lineOfIndex(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source[i] === "\n") line++;
  }
  return line;
}

export function detectInteractionHandlers(source: string): { match: string; line: number }[] {
  const hits: { match: string; line: number }[] = [];
  for (const m of source.matchAll(HANDLER_PROP_RE)) {
    hits.push({ match: m[0], line: lineOfIndex(source, m.index ?? 0) });
  }
  for (const m of source.matchAll(DATA_ACTION_RE)) {
    if (m[1]) hits.push({ match: `data-action="${m[1].toLowerCase()}"`, line: lineOfIndex(source, m.index ?? 0) });
  }
  return hits;
}

export function hasAnalyticsInstrumentation(source: string): boolean {
  return ANALYTICS_RE.test(source);
}

const evaluate = async (ctx: RuleContext, _files: ParsedFiles): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  if (!ctx.repoRoot || isAllowlisted(ctx.repoRoot)) {
    return { findings, opportunities: 0 };
  }

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
  componentFiles.sort();

  for (const rel of componentFiles) {
    const source = safeReadText(join(ctx.repoRoot, rel));
    if (!source) continue;
    if (!fileHasAiMarker(source, rel, ctx.repoRoot)) continue;

    const handlers = detectInteractionHandlers(source);
    if (handlers.length === 0) continue;
    if (hasAnalyticsInstrumentation(source)) continue;

    const first = handlers[0]!;
    findings.push({
      ruleId: RULE_ID,
      axis: "ai-governance",
      severity: "warning",
      location: { file: rel, line: first.line, column: 1 },
      message:
        "AI accept/reject/feedback events are not instrumented for product analytics. " +
        "Without instrumentation (e.g. track / capture / logEvent) on these handlers, AI acceptance and rejection rates cannot be measured.",
      suggestion:
        "Instrument the accept/reject/feedback handlers on this AI surface with your product-analytics SDK (e.g. analytics.track('ai_suggestion_accepted'), posthog.capture(...), gtag(...)).",
    });
  }

  return { findings, opportunities: componentFiles.length };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "ai-governance",
    lyseRuleId: RULE_ID,
    defaultSeverity: "warning",
    shortDescription: "Detect AI accept/reject/feedback surfaces shipped without product-analytics instrumentation",
    fullDescription:
      "Scans component files (`**/*.{tsx,jsx,vue}`) for AI-marker surfaces (per the shared `fileHasAiMarker` predicate) that carry accept/reject/feedback interaction handlers " +
      "(`onAccept`, `onReject`, `onApprove`, `onThumbsUp`, `onThumbsDown`, `onRate`, `onFeedback`, or `data-action=\"accept|reject|feedback|thumbs-up|thumbs-down|rate\"`). " +
      "For each such file it checks, file-level, whether any product-analytics instrumentation call is present (curated, word-bounded set: `track(`, `trackEvent(`, `captureEvent(`, `logEvent(`, `gtag(`, `.track(`, `.capture(`, `dataLayer.push(`, the `posthog.`/`mixpanel.`/`amplitude.`/`segment.`/`analytics.` SDK prefixes, and `useAnalytics`). " +
      "When the AI surface has the interaction handlers but no instrumentation, emits one `warning` per file at the first handler's location. Files that are not AI surfaces, or AI surfaces with no such handler, emit nothing. Presence only — one analytics call satisfies the check.",
    helpUri: "https://github.com/lyse-labs/lyse/blob/main/docs/rules/ai-governance-product-analytics.md",
    rationale: `Why it matters

When a product ships AI accept/reject/feedback controls but never instruments them, it cannot measure acceptance and rejection rates — it flies blind on its own AI quality. Detecting the presence of product-analytics instrumentation on those surfaces is a cheap, high-signal static check.

This rule is presence-only: it verifies that some instrumentation exists in the file, not that it is correctly wired. A repo with no AI-marker surface emits nothing and is not penalised.`,
    examples: [
      {
        good: "// AiSuggestion.tsx — AI surface with accept/reject + analytics\nimport { analytics } from './analytics';\nexport function AiSuggestion() {\n  return <Row onAccept={() => analytics.track('ai_accepted')} onReject={() => analytics.track('ai_rejected')} />;\n}",
        bad: "// AiSuggestion.tsx — AI surface, accept/reject handlers, NO analytics\nexport function AiSuggestion() {\n  return <Row onAccept={accept} onReject={reject} />;\n}",
      },
    ],
    allowlist: [
      "repos containing `lyse-disable ai-governance/product-analytics` in an adjacent README or `.lyse.yaml` — rule is N/A",
      "repos with no AI-marker component at all — no AI surface detected, rule emits nothing",
      "AI surfaces with no accept/reject/feedback handler — out of scope, rule emits nothing",
      "files under `node_modules/`, `dist/`, `build/`, `.git/`, `.next/`, `out/`, `coverage/`",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});
