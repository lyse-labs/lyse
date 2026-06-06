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
  isAiMarkerName,
  safeReadText,
} from "./ai-governance-ai-marker-component-present.js";

const RULE_ID = "ai-governance/ai-content-live-region";
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

const AI_RESPONSE_TAG_RE = /AIResponse|ChatMessage/;

// Streaming / generating indicators — isLoading alone is excluded (too generic).
const STREAMING_PROP_RE = /\b(isStreaming|isGenerating)\b/;

// JSX/Vue open-tag scanner.
const JSX_OPEN_TAG_RE = /<\s*([A-Za-z][\w.]*)/g;

export function detectAiOutputSurface(source: string): boolean {
  JSX_OPEN_TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = JSX_OPEN_TAG_RE.exec(source)) !== null) {
    const tag = m[1];
    if (!tag) continue;
    if (isAiMarkerName(tag)) return true;
    if (AI_RESPONSE_TAG_RE.test(tag)) return true;
  }
  if (STREAMING_PROP_RE.test(source)) return true;
  return false;
}

// aria-live with polite or assertive value (not "off").
const ARIA_LIVE_RE = /\baria-live\s*=\s*["'`](polite|assertive)["'`]/i;
// role="status" or role="alert" (ARIA live-region roles).
const ROLE_LIVE_RE = /\brole\s*=\s*["'`](status|alert)["'`]/i;
// PatternFly isLiveRegion prop (boolean or ={true}).
const IS_LIVE_REGION_RE = /\bisLiveRegion\b/;

export function detectLiveRegion(source: string): boolean {
  return ARIA_LIVE_RE.test(source) || ROLE_LIVE_RE.test(source) || IS_LIVE_REGION_RE.test(source);
}

function describeLiveRegion(source: string): string {
  const ariaMatch = source.match(/aria-live\s*=\s*["'`](polite|assertive)["'`]/i);
  if (ariaMatch) return `aria-live="${ariaMatch[1] ?? "polite"}"`;
  if (/\brole\s*=\s*["'`]status["'`]/i.test(source)) return `role="status"`;
  if (/\brole\s*=\s*["'`]alert["'`]/i.test(source)) return `role="alert"`;
  return "isLiveRegion";
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
      ignore: IGNORE,
      onlyFiles: true,
      unique: true,
    });
  } catch {
    return { findings, opportunities: 0 };
  }

  componentFiles.sort();

  let hasAiSurface = false;

  for (const rel of componentFiles) {
    const abs = join(ctx.repoRoot, rel);
    const source = safeReadText(abs);
    if (!source) continue;

    if (!detectAiOutputSurface(source)) continue;

    hasAiSurface = true;

    if (detectLiveRegion(source)) {
      const mechanism = describeLiveRegion(source);
      findings.push({
        ruleId: RULE_ID,
        axis: "ai-governance",
        severity: "info",
        location: { file: rel, line: 1, column: 1 },
        message: `AI output component is announced to assistive technology via ${mechanism} (WAI-ARIA live region / PatternFly isLiveRegion)`,
        suggestion:
          "Live region detected — verify that the region wraps AI output directly and uses aria-live=\"polite\" for non-urgent streaming content.",
      });
    } else {
      findings.push({
        ruleId: RULE_ID,
        axis: "ai-governance",
        severity: "warning",
        location: { file: rel, line: 1, column: 1 },
        message: `AI output or streaming component detected but no live region found — screen-reader users will not hear streamed content. Wrap the output in aria-live="polite", role="status", or PatternFly isLiveRegion.`,
        suggestion:
          "Add aria-live=\"polite\" (or role=\"status\") to the container wrapping the AI output component, or use PatternFly's isLiveRegion prop.",
      });
    }
  }

  if (!hasAiSurface) return { findings: [], opportunities: 0 };

  return { findings, opportunities: componentFiles.length };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "ai-governance",
    lyseRuleId: RULE_ID,
    defaultSeverity: "warning",
    shortDescription: "Detect ARIA live region on AI output / streaming components",
    fullDescription:
      "Globs `**/*.{tsx,jsx,vue}` and runs two per-file detectors: one that identifies AI-output/streaming surfaces (AI_MARKER_NAMES, *AIResponse*, *ChatMessage*, isStreaming, isGenerating props), another that detects live-region attributes (aria-live=\"polite|assertive\", role=\"status\", role=\"alert\", PatternFly isLiveRegion). Cross-condition: AI surface present but no live region → `warning`; AI surface inside a live region → `info` naming the mechanism; no AI/streaming surface → no finding.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/ai-governance-ai-content-live-region.md",
    rationale: `Why it matters

Screen-reader users rely on ARIA live regions to hear dynamically updated content. When an AI model streams a response token-by-token, the DOM updates silently unless the container carries aria-live="polite", role="status", role="alert", or an equivalent framework mechanism. Without a live region, visually impaired users miss the entire AI response — a failure of both accessibility and AI-governance (the system produces output that some users cannot perceive).

WAI-ARIA specifies that aria-live="polite" announces changes after the user is idle (appropriate for non-urgent AI output); aria-live="assertive" / role="alert" interrupt immediately (use only for errors). PatternFly provides isLiveRegion as a prop on several container components to avoid hand-rolling the attribute.

This rule checks the static presence of a live-region mechanism in the same file as an AI-output or streaming component — it does not verify runtime behaviour or dynamic DOM updates.`,
    examples: [
      {
        good: `// aria-live wraps AI output (React)
export function AiAnswer({ content }: { content: string }) {
  return (
    <div aria-live="polite">
      <AILabel>AI</AILabel>
      <p>{content}</p>
    </div>
  );
}`,
        bad: `// AI output with no live region
export function AiAnswer({ content }: { content: string }) {
  return (
    <div className="response">
      <ChatAIResponse content={content} />
    </div>
  );
}`,
      },
      {
        good: `// PatternFly isLiveRegion
<TextContent isLiveRegion>{streamedContent}</TextContent>`,
        bad: `// isStreaming prop but no live region wrapper
<OutputBlock isGenerating={generating} />`,
      },
    ],
    allowlist: [
      "repos containing `lyse-disable ai-governance/ai-content-live-region` in an adjacent README or `.lyse.yaml` — rule is N/A",
      "repos with no AI-output or streaming component — no AI surface detected, rule emits nothing",
      "files larger than 1 MB — skipped to avoid pathological cases",
      "files under `node_modules/`, `dist/`, `build/`, `.git/`, `.next/`, `out/`, `coverage/`",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = {
  detectAiOutputSurface,
  detectLiveRegion,
  isAllowlisted,
  DISABLE_DIRECTIVE,
  ALLOWLIST_CANDIDATES,
};
