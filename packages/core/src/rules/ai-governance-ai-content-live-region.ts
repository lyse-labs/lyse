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
  COMPONENT_GLOB,
  SCAN_IGNORE,
  makeAllowlistCheck,
} from "./ai-governance-ai-marker-component-present.js";

const RULE_ID = "ai-governance/ai-content-live-region";
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

// Fix 3: match "AIResponse" or "ChatMessage" as a complete PascalCase segment
// within a component tag name — not as an arbitrary substring.
//
// Rules (by example):
//   ChatAIResponse  → match  (AIResponse is a terminal segment after a prior word)
//   AIResponseBlock → match  (AIResponse is a leading segment before a following word)
//   ChatMessage     → match  (exact or terminal)
//   MyChatMessage   → match  (ChatMessage is terminal)
//   SystemChatMessageDisplay → NO match (ChatMessage is in the middle with Display after it)
//
// Implementation: the keyword must either start the tag name (at index 0)
// OR be preceded by at least one lowercase character (end of a prior word),
// AND the keyword must end the tag name OR be followed by an uppercase letter
// (start of the next segment). We use two conditions:
//   "ends the name after a prior word"  → /[a-z]KEYWORD$/
//   "starts the name with more after"   → /^KEYWORD[A-Z]/
//   "is the entire name"                → exact equality
function hasAiResponseSegment(tagName: string): boolean {
  for (const kw of ["AIResponse", "ChatMessage"] as const) {
    if (tagName === kw) return true;
    // Terminal: preceded by lowercase (end of another word), at end of string.
    if (new RegExp(`[a-z]${kw}$`).test(tagName)) return true;
    // Leading: at start of string, followed by uppercase (more words after).
    if (new RegExp(`^${kw}[A-Z]`).test(tagName)) return true;
  }
  return false;
}

// Fix 2: streaming prop detection restricted to JSX prop context.
// Scan JSX open tags and test their attribute text for the prop names.
const JSX_TAG_WITH_ATTRS_RE = /<([A-Z][A-Za-z\d.]*)\b([^>]*?)(?:\/?>)/gms;
const STREAMING_ATTR_RE = /\b(?:isStreaming|isGenerating)\b/;

// JSX/Vue open-tag scanner.
const JSX_OPEN_TAG_RE = /<\s*([A-Za-z][\w.]*)/g;

export function detectAiOutputSurface(source: string, repoRoot = ""): boolean {
  JSX_OPEN_TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = JSX_OPEN_TAG_RE.exec(source)) !== null) {
    const tag = m[1];
    if (!tag) continue;
    if (isAiMarkerName(tag, repoRoot)) return true;
    // Fix 3: segment-level match, not substring.
    if (hasAiResponseSegment(tag)) return true;
  }
  // Fix 2: only credit isStreaming/isGenerating when used as a JSX prop.
  JSX_TAG_WITH_ATTRS_RE.lastIndex = 0;
  let tm: RegExpExecArray | null;
  while ((tm = JSX_TAG_WITH_ATTRS_RE.exec(source)) !== null) {
    const attrs = tm[2] ?? "";
    if (STREAMING_ATTR_RE.test(attrs)) return true;
  }
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

// Fix 1: Proximity check — credit info only when the live-region attribute
// wraps the AI-output component, not just co-exists in the same file.
//
// Pragmatic static approximation (documented limitation):
// We extract JSX/template "return blocks" by splitting on `return (` and `};`
// boundaries, then check if both a live-region attribute AND an AI-output tag
// appear within the same block. A live-region element that is in a separate
// component function (e.g. a toast) does not wrap the AI output.
//
// Additionally, within a candidate block, we require that the live-region
// open tag appears BEFORE the AI-output tag in source order (wraps it from
// above), which is the correct DOM wrapping direction.
//
// Limitation: does not handle all patterns (e.g. conditional renders that
// conditionally include both) — bias is conservative (WARNING when in doubt).
const LIVE_REGION_OPEN_RE =
  /<[A-Za-z][\w.]*\b[^>]*?(?:aria-live\s*=\s*["'`](?:polite|assertive)["'`]|\brole\s*=\s*["'`](?:status|alert)["'`]|\bisLiveRegion\b)[^>]*?(?:\/?>)/gms;

function isLiveRegionProximate(source: string, repoRoot = ""): boolean {
  // Collect positions of live-region open tags.
  const livePositions: number[] = [];
  LIVE_REGION_OPEN_RE.lastIndex = 0;
  let lm: RegExpExecArray | null;
  while ((lm = LIVE_REGION_OPEN_RE.exec(source)) !== null) {
    livePositions.push(lm.index);
  }
  if (livePositions.length === 0) return false;

  // Collect positions of AI-output tags.
  const aiPositions: number[] = [];
  JSX_OPEN_TAG_RE.lastIndex = 0;
  let am: RegExpExecArray | null;
  while ((am = JSX_OPEN_TAG_RE.exec(source)) !== null) {
    const tag = am[1];
    if (!tag) continue;
    if (isAiMarkerName(tag, repoRoot) || hasAiResponseSegment(tag)) {
      aiPositions.push(am.index);
    }
  }
  // Also collect positions of streaming-prop JSX tags.
  JSX_TAG_WITH_ATTRS_RE.lastIndex = 0;
  let tm2: RegExpExecArray | null;
  while ((tm2 = JSX_TAG_WITH_ATTRS_RE.exec(source)) !== null) {
    const attrs = tm2[2] ?? "";
    if (STREAMING_ATTR_RE.test(attrs)) {
      aiPositions.push(tm2.index);
    }
  }

  if (aiPositions.length === 0) return false;

  // For proximity: split the source into component-function "slots" by
  // detecting JSX return blocks. A simple heuristic: a "block" is the region
  // between consecutive occurrences of `return (` or `return <` (function
  // body boundaries). We check whether any (livePos, aiPos) pair share the
  // same slot AND live region opens before the AI-output tag.
  //
  // Slot boundaries: positions of `return ` keyword + open paren/angle.
  const RETURN_RE = /\breturn\s*[(<]/g;
  const returnPositions: number[] = [0];
  let rm: RegExpExecArray | null;
  RETURN_RE.lastIndex = 0;
  while ((rm = RETURN_RE.exec(source)) !== null) {
    returnPositions.push(rm.index);
  }
  returnPositions.push(source.length);

  function slotOf(pos: number): number {
    let slot = 0;
    for (let i = 0; i < returnPositions.length - 1; i++) {
      const start = returnPositions[i];
      const end = returnPositions[i + 1];
      if (start !== undefined && end !== undefined && pos >= start && pos < end) {
        slot = i;
        break;
      }
    }
    return slot;
  }

  for (const aiPos of aiPositions) {
    const aiSlot = slotOf(aiPos);
    for (const livePos of livePositions) {
      if (slotOf(livePos) === aiSlot && livePos < aiPos) return true;
    }
  }
  return false;
}

const MAX_LISTED_FILES = 20;

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
    });
  } catch {
    return { findings, opportunities: 0 };
  }

  componentFiles.sort();

  let hasAiSurface = false;
  const missingLiveRegionFiles: string[] = [];

  for (const rel of componentFiles) {
    const abs = join(ctx.repoRoot, rel);
    const source = safeReadText(abs);
    if (!source) continue;

    if (!detectAiOutputSurface(source, ctx.repoRoot)) continue;

    hasAiSurface = true;

    // Fix 1: require proximity — live region must wrap the AI output, not just
    // co-exist in the same file (e.g. a toast component in a different function).
    if (isLiveRegionProximate(source, ctx.repoRoot)) {
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
      missingLiveRegionFiles.push(rel);
    }
  }

  if (!hasAiSurface) return { findings: [], opportunities: 0 };

  if (missingLiveRegionFiles.length > 0) {
    const listed = missingLiveRegionFiles.slice(0, MAX_LISTED_FILES);
    const overflow = missingLiveRegionFiles.length - listed.length;
    const fileList = listed.join(", ") + (overflow > 0 ? `, +${overflow} more` : "");
    findings.unshift({
      ruleId: RULE_ID,
      axis: "ai-governance",
      severity: "warning",
      location: { file: missingLiveRegionFiles[0] ?? "src/index.ts", line: 1, column: 1 },
      message:
        `${missingLiveRegionFiles.length} file${missingLiveRegionFiles.length === 1 ? "" : "s"} contain an AI output or streaming component with no live region — screen-reader users will not hear streamed content: ${fileList}. Wrap each output in aria-live="polite", role="status", or PatternFly isLiveRegion.`,
      suggestion:
        "Add aria-live=\"polite\" (or role=\"status\") to the container wrapping the AI output component, or use PatternFly's isLiveRegion prop.",
    });
  }

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
