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
  safeReadText,
  extractNamesFromSource,
  extractVueNames,
  COMPONENT_GLOB,
  SCAN_IGNORE,
  deriveComponentNameFromPath,
  makeAllowlistCheck,
} from "./ai-governance-ai-marker-component-present.js";

const RULE_ID = "ai-governance/ai-loading-error-states";
const DISABLE_DIRECTIVE = `lyse-disable ${RULE_ID}`;

const isAllowlisted = makeAllowlistCheck(DISABLE_DIRECTIVE);

// Component names whose presence alone implies a named AI loading state.
const LOADING_NAME_PATTERNS = [
  "generating",
  "thinking",
  "ailoading",
  "streamingindicator",
  "loadingstate",
  "aistatus",
];

// Text signals that pair with the component to confirm it is not a bare spinner.
// Matches: loadingText prop, aria-label attribute, or a visible AI-progress
// status string (quoted or unquoted in JSX text content).
const PAIRED_TEXT_RE =
  /loadingText|aria-label\s*=|["` >]Generating|["` >]Thinking|Please wait|["` >]Loading AI/i;

// Names that are unambiguously descriptive and carry implicit text semantics.
const SELF_DESCRIBING_LOADING = ["generating", "thinking", "streamingindicator"];

export function detectNamedLoadingWithText(source: string, componentName: string): boolean {
  const lower = componentName.toLowerCase();
  const hasNamedMatch = LOADING_NAME_PATTERNS.some((p) => lower.includes(p));
  if (!hasNamedMatch) return false;
  if (SELF_DESCRIBING_LOADING.some((p) => lower.includes(p))) return true;
  return PAIRED_TEXT_RE.test(source);
}

// Match "ai" only on a word/segment boundary to avoid false positives from
// substrings like "email", "retail", "cocktail".
const AI_WORD_RE = /(^|[^a-z])ai([^a-z]|$)/;
const AI_COMPOUND_KEYWORDS = ["generation", "genai", "llm", "generative"];
const ERROR_KEYWORDS = ["error", "failure", "failed", "timeout"];

const ERROR_NAME_PATTERNS = [
  "aierror",
  "generationerror",
  "aifailure",
  "generationfailed",
  "aitimeout",
];

export function detectAiErrorState(source: string, componentName: string): boolean {
  const lower = componentName.toLowerCase();
  if (ERROR_NAME_PATTERNS.some((p) => lower.includes(p))) return true;
  const hasAi = AI_WORD_RE.test(lower) || AI_COMPOUND_KEYWORDS.some((k) => lower.includes(k));
  const hasError = ERROR_KEYWORDS.some((k) => lower.includes(k));
  return hasAi && hasError;
}

export const _internal = { detectNamedLoadingWithText, detectAiErrorState, isAllowlisted };

function namesFromFile(source: string, relPath: string): string[] {
  if (relPath.endsWith(".vue")) return extractVueNames(source);
  const fromSource = extractNamesFromSource(source);
  if (fromSource.length > 0) return fromSource;
  return [deriveComponentNameFromPath(relPath)];
}

function hasAiSurface(files: string[], repoRoot: string): boolean {
  for (const rel of files) {
    const source = safeReadText(join(repoRoot, rel));
    if (!source) continue;
    const names = namesFromFile(source, rel);
    const pathName = deriveComponentNameFromPath(rel);
    const allNames = [...names, pathName];
    if (allNames.some((n) => isAiMarkerName(n))) return true;
  }
  return false;
}

const evaluate = async (
  ctx: RuleContext,
  _files: ParsedFiles,
): Promise<RuleEvalResult> => {
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
    }).sort();
  } catch {
    return { findings, opportunities: 0 };
  }

  if (!hasAiSurface(componentFiles, ctx.repoRoot)) {
    return { findings, opportunities: 0 };
  }

  let foundNamedLoading = false;
  let foundAiError = false;

  for (const rel of componentFiles) {
    const source = safeReadText(join(ctx.repoRoot, rel));
    if (!source) continue;
    const names = namesFromFile(source, rel);
    const pathName = deriveComponentNameFromPath(rel);
    const allNames = [...names, pathName];

    for (const name of allNames) {
      if (!foundNamedLoading && detectNamedLoadingWithText(source, name)) {
        foundNamedLoading = true;
      }
      if (!foundAiError && detectAiErrorState(source, name)) {
        foundAiError = true;
      }
      if (foundNamedLoading && foundAiError) break;
    }
    if (foundNamedLoading && foundAiError) break;
  }

  const location = { file: "src/index.ts", line: 1, column: 1 };

  if (foundNamedLoading && foundAiError) {
    findings.push({
      ruleId: RULE_ID,
      axis: "ai-governance",
      severity: "info",
      location,
      message:
        "AI loading state (named, with paired text) and AI-specific error state detected — both present.",
      suggestion:
        "Ensure the error state communicates the AI context clearly and the loading state always carries visible or accessible text (AWS Cloudscape gen-AI pattern).",
    });
  } else {
    if (!foundNamedLoading) {
      findings.push({
        ruleId: RULE_ID,
        axis: "ai-governance",
        severity: "warning",
        location,
        message:
          "AI surface detected but no named AI loading state with paired text found — a bare spinner is not sufficient (AWS Cloudscape gen-AI: loading states must carry visible text, e.g. \"Generating response…\").",
        suggestion:
          "Add a named component such as Generating, Thinking, AILoading, or StreamingIndicator that always renders a visible/accessible status string alongside the spinner.",
      });
    }
    if (!foundAiError) {
      findings.push({
        ruleId: RULE_ID,
        axis: "ai-governance",
        severity: "warning",
        location,
        message:
          "AI surface detected but no AI-specific error state found — generic error boundaries do not communicate AI-specific failure context.",
        suggestion:
          "Add a component such as AIError or GenerationError that clearly communicates the AI operation failed and what the user can do next.",
      });
    }
  }

  return { findings, opportunities: componentFiles.length };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "ai-governance",
    lyseRuleId: RULE_ID,
    defaultSeverity: "warning",
    shortDescription: "Named AI loading state with paired text + AI-specific error state present",
    fullDescription:
      "Scans component files (`**/*.{tsx,jsx,vue}`) for (a) a named AI loading state that carries paired visible or accessible text — not a bare spinner — and (b) an AI-specific error state component. Recognised loading vocabulary: `*Generating*`, `*Thinking*`, `*AILoading*`, `*StreamingIndicator*`, `*AIStatus*`, `*LoadingState*`. A bare generic spinner (`Spinner`, `LoadingSpinner`) without an AI-named wrapper and without a `loadingText` prop or visible status string does NOT satisfy the requirement. Recognised error vocabulary: `*AIError*`, `*GenerationError*`, `*AIFailure*`, `*GenerationFailed*`, `*AITimeout*`, or any name combining an AI keyword (`ai`, `generation`, `genai`, `llm`, `generative`) with an error keyword (`error`, `failure`, `failed`, `timeout`). Emits `warning` for each absent state type when an AI marker surface is detected; emits `info` when both are present; emits nothing when no AI surface is detected. Recovery-flow detection (retry orchestration, post-error behavior) is out of scope — tracked in Track 4 (#16).",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/ai-governance-ai-loading-error-states.md",
    rationale: `Why it matters

AI-generating surfaces have two failure modes invisible to generic DS rules: (1) a loading state that gives no context — users see a spinner but don't know if the model is generating, stuck, or done — and (2) a generic error boundary that offers no AI-specific message, leaving users without guidance when a generation fails.

AWS Cloudscape's generative-AI patterns mandate that every AI loading state carry named, visible text (e.g. "Generating response…") so users understand what the system is doing and can judge when to wait vs. cancel. A bare, unlabelled spinner violates this requirement.

An AI-specific error component is equally critical: it must communicate that the AI operation failed (not a generic network error) and ideally suggest next steps — though the recovery-flow logic itself is deferred to Track 4.

This rule detects the static presence of both states. It cross-conditions: if an AI marker is found but either state is absent, a warning is emitted; if both are present, an info finding confirms the DS is provisioned for AI-state handling.`,
    examples: [
      {
        good: `// Generating.tsx
export const Generating = () => (
  <div role="status" aria-live="polite">
    <Spinner /> Generating response…
  </div>
);`,
        bad: `// LoadingSpinner.tsx — bare spinner, no AI name, no paired text
export const LoadingSpinner = () => <svg className="spin" />;`,
      },
      {
        good: `// AILoading.tsx — loadingText prop satisfies paired-text requirement
export function AILoading({ loadingText }: { loadingText: string }) {
  return <div><Spinner /><span>{loadingText}</span></div>;
}`,
        bad: `// No AI-named loading state at all — only generic Spinner exported`,
      },
      {
        good: `// AIError.tsx
export const AIError = ({ message }: { message: string }) => (
  <div role="alert">
    <strong>Generation failed</strong>
    <p>{message}</p>
  </div>
);`,
        bad: `// ErrorBoundary.tsx — generic, gives no AI context
export class ErrorBoundary extends React.Component {
  render() { return this.props.children; }
}`,
      },
    ],
    allowlist: [
      "repos containing `lyse-disable ai-governance/ai-loading-error-states` in an adjacent README, README.md, README.mdx, .lyse.yaml, or .lyse.yml — rule is N/A",
      "repos with no AI marker surface detected (no AILabel, AIBadge, magic-* etc.) — no AI surface, rule emits nothing",
      "files larger than 1 MB — skipped to avoid pathological cases",
      "files under `node_modules/`, `dist/`, `build/`, `.git/`, `.next/`, `out/`, `coverage/`",
      "recovery-flow detection (retry orchestration, post-error navigation) — explicitly deferred to Track 4 (#16)",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});
