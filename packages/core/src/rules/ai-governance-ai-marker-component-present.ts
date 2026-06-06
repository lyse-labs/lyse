import { readFileSync, statSync } from "node:fs";
import { relative } from "node:path";
import fg from "fast-glob";
import type {
  Rule,
  RuleContext,
  ParsedFiles,
  RuleEvalResult,
  Finding,
} from "../types.js";
import { createLyseRule } from "./_rule-module.js";

const RULE_ID = "ai-governance/ai-marker-component-present";
const MAX_FILE_BYTES = 1_000_000;

// ---------------------------------------------------------------------------
// AI-marker component name vocabulary (exported for sibling rule reuse).
// ---------------------------------------------------------------------------
export const AI_MARKER_NAMES: ReadonlySet<string> = new Set([
  "AILabel",
  "AiLabel",
  "AIBadge",
  "AiBadge",
  "AITag",
  "AiTag",
  "AIIndicator",
  "AiIndicator",
  "AIMarker",
  "AiMarker",
  "AIAvatar",
  "AiAvatar",
  "GenAIAvatar",
  "GenAILabel",
  "GenAIBadge",
  "GenAITag",
]);

// Polaris magic-* prefix (component names starting with "magic-").
const MAGIC_COMPONENT_RE = /\bmagic-[a-z]/i;

// Matches canonical AI-marker component names (case-insensitive).
const MARKER_NAME_RE =
  /\b(?:Gen)?(?:AI|Ai)(?:Label|Badge|Tag|Indicator|Marker|Avatar)\b|\b\w*(?:AI|Ai)Marker\w*\b|\b\w*(?:AI|Ai)Avatar\w*\b|\b\w*(?:AI|Ai)Indicator\w*\b/i;

// Inline reserved-AI-token check (conservative subset).
// TODO(track-3.1): switch to shared detectReservedAiTokens() once merged.
const RESERVED_AI_TOKEN_PATTERNS: ReadonlyArray<RegExp> = [
  /\bai\b/i,
  /-ai-/i,
  /--p-color-[a-z-]*magic/i,
  /\bdragon-fruit\b/i,
];

const INDEX_CANDIDATES = ["src/index.ts", "src/index.tsx", "index.ts", "index.tsx"];
const DISABLE_DIRECTIVE = `lyse-disable ${RULE_ID}`;
const README_CANDIDATES = ["README.md", "README", "readme.md", "README.mdx"];
const COMPONENT_GLOB = "**/*.{tsx,jsx,vue}";
const IGNORE_GLOBS = [
  "**/node_modules/**",
  "**/*.test.*",
  "**/*.spec.*",
  "**/*.stories.*",
];

function readSmall(absPath: string): string | null {
  try {
    const st = statSync(absPath);
    if (!st.isFile() || st.size > MAX_FILE_BYTES) return null;
    return readFileSync(absPath, "utf8");
  } catch {
    return null;
  }
}

function isAllowlisted(repoRoot: string): boolean {
  for (const candidate of README_CANDIDATES) {
    const content = readSmall(`${repoRoot}/${candidate}`);
    if (content?.includes(DISABLE_DIRECTIVE)) return true;
  }
  return false;
}

const STAR_RE = /^\s*export\s*\*\s*(?:as\s+\w+\s*)?from\s+['"][^'"]+['"]\s*;?/gm;
const NAMED_FROM_RE = /^\s*export\s*\{([^}]+)\}\s*from\s+['"][^'"]+['"]\s*;?/gm;
const NAMED_DECL_RE =
  /^\s*export\s+(?:const|let|var|function|class|async\s+function|default\s+function|default\s+class)\s+([A-Za-z_$][\w$]*)/gm;

function extractExportedNames(content: string): { names: Set<string>; hasStar: boolean } {
  const names = new Set<string>();
  let hasStar = false;

  for (const _m of content.matchAll(STAR_RE)) hasStar = true;

  for (const m of content.matchAll(NAMED_FROM_RE)) {
    for (const part of (m[1] ?? "").split(",")) {
      const parts = part.trim().split(/\s+as\s+/);
      const name = (parts.length > 1 ? parts[1] : parts[0])?.trim() ?? "";
      if (name && name !== "type") names.add(name);
    }
  }

  for (const m of content.matchAll(NAMED_DECL_RE)) {
    if (m[1]) names.add(m[1]);
  }

  return { names, hasStar };
}

function isMarkerName(name: string): boolean {
  return MARKER_NAME_RE.test(name) || MAGIC_COMPONENT_RE.test(name);
}

function componentNameFromPath(filePath: string): string {
  const base = filePath.split("/").pop() ?? filePath;
  return base.replace(/\.(tsx|jsx|vue)$/, "");
}

function hasReservedAiTokens(content: string): boolean {
  return RESERVED_AI_TOKEN_PATTERNS.some((re) => re.test(content));
}

function detectMarkerFromIndex(
  repoRoot: string,
): { found: boolean; markerName: string | null; indexFile: string | null } {
  for (const candidate of INDEX_CANDIDATES) {
    const content = readSmall(`${repoRoot}/${candidate}`);
    if (!content) continue;

    const { names, hasStar } = extractExportedNames(content);

    for (const name of names) {
      if (isMarkerName(name)) {
        return { found: true, markerName: name, indexFile: candidate };
      }
    }

    // Star re-exports are opaque — cannot follow the chain without a full
    // resolver. Treat them as potential marker presence to avoid false positives.
    if (hasStar) return { found: true, markerName: null, indexFile: candidate };
  }

  return { found: false, markerName: null, indexFile: null };
}

function detectMarkerFromFiles(
  repoRoot: string,
): { found: boolean; markerName: string | null; filePath: string | null } {
  const files = fg.sync(COMPONENT_GLOB, {
    cwd: repoRoot,
    absolute: false,
    onlyFiles: true,
    ignore: IGNORE_GLOBS,
  });

  for (const relPath of files) {
    const name = componentNameFromPath(relPath);
    if (isMarkerName(name)) {
      return { found: true, markerName: name, filePath: relPath };
    }
  }

  return { found: false, markerName: null, filePath: null };
}

function detectReservedAiTokensInRepo(repoRoot: string): boolean {
  const files = fg.sync(
    ["**/*.tokens.json", "**/tokens/**/*.json", "**/*.css", "**/*.scss"],
    {
      cwd: repoRoot,
      absolute: true,
      onlyFiles: true,
      ignore: ["**/node_modules/**"],
      deep: 5,
    },
  );

  for (const abs of files) {
    const content = readSmall(abs);
    if (content && hasReservedAiTokens(content)) return true;
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

  const indexResult = detectMarkerFromIndex(ctx.repoRoot);
  const fileResult =
    indexResult.found
      ? { found: false, markerName: null, filePath: null }
      : detectMarkerFromFiles(ctx.repoRoot);

  const markerFound = indexResult.found || fileResult.found;
  const markerName = indexResult.markerName ?? fileResult.markerName;

  if (markerFound) {
    const location = indexResult.indexFile
      ? { file: indexResult.indexFile, line: 1, column: 1 }
      : { file: fileResult.filePath ?? ".", line: 1, column: 1 };

    const label = markerName ? `'${markerName}'` : "a star-re-exported marker";
    findings.push({
      ruleId: RULE_ID,
      axis: "ai-governance",
      severity: "info",
      location,
      message: `AI-marker component detected: ${label} — design system marks AI-generated output`,
      suggestion:
        "ensure the marker component carries adequate explainability metadata (e.g. a popover or tooltip describing the AI source)",
    });
    return { findings, opportunities: 1 };
  }

  const hasTokens = detectReservedAiTokensInRepo(ctx.repoRoot);

  if (hasTokens) {
    const relRoot = relative(ctx.repoRoot, ctx.repoRoot) || ".";
    findings.push({
      ruleId: RULE_ID,
      axis: "ai-governance",
      severity: "warning",
      location: { file: relRoot, line: 1, column: 1 },
      message:
        "Reserved AI tokens are present but no AI-marker component is exported — users cannot visually distinguish AI-generated content",
      suggestion:
        "add an AI-marker component (e.g. AILabel, GenAIAvatar) to your export surface so consuming apps can signal AI provenance",
    });
    return { findings, opportunities: 1 };
  }

  return { findings, opportunities: 0 };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "ai-governance",
    lyseRuleId: RULE_ID,
    defaultSeverity: "warning",
    shortDescription: "Design system should ship an AI-marker component",
    fullDescription:
      "Scans the component export surface (index entry + component file names) for an AI-marker component: a dedicated label, badge, avatar, or tag that visually identifies AI-generated output. Canonical examples include Carbon `AILabel`, Polaris `magic-*` components, and generics (`AIBadge`, `GenAIAvatar`, `AIIndicator`). When no marker component is found but reserved AI tokens exist, emits a `warning`; when a marker is found, emits an `info` finding naming it. Repos with no AI surface at all emit no finding (N/A).",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/ai-governance-ai-marker-component-present.md",
    rationale: `Why it matters

AI-generated output that is indistinguishable from human-authored content violates emerging AI transparency requirements (EU AI Act recital 50, NIST AI RMF) and erodes user trust. A design system that ships AI tokens or AI-branded features but no dedicated marker component forces every product team to invent their own disclosure pattern — creating fragmentation and inconsistency.

The rule detects this gap early, before the DS is consumed by dozens of product teams. When a marker is present it reports an info finding (positive signal) rather than staying silent, so auditors can confirm the component exists without hunting through the codebase.

The secondary warning — tokens present but no marker — catches the most dangerous scenario: a DS that has begun an AI design language but hasn't closed the loop with a visual disclosure component.`,
    examples: [
      {
        good: "// src/index.ts\nexport { AILabel } from './ai-label';\nexport { GenAIAvatar } from './gen-ai-avatar';",
        bad: "// src/index.ts — exports Button, Card, Modal but no AI-marker component even though --ai-color tokens exist",
      },
      {
        good: "// components/magic-button.tsx — Polaris magic-* component exported from index",
        bad: "// AI tokens defined in tokens/ai.json but no corresponding marker component shipped",
      },
    ],
    allowlist: [
      "repos with no AI surface (no AI tokens AND no marker component) — rule is N/A, no finding emitted",
      "star re-exports (`export * from ...`) — treated as opaque marker presence, no warning emitted",
      "repos containing `lyse-disable ai-governance/ai-marker-component-present` in README — rule is N/A",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = {
  extractExportedNames,
  isMarkerName,
  detectMarkerFromIndex,
  detectMarkerFromFiles,
  hasReservedAiTokens,
  AI_MARKER_NAMES,
  DISABLE_DIRECTIVE,
  MARKER_NAME_RE,
  MAGIC_COMPONENT_RE,
};
