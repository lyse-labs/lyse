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
import { detectReservedAiTokens } from "../parsers/ai-tokens.js";
import { aiNounAlternation } from "./_i18n-vocabulary.js";

const RULE_ID = "ai-governance/ai-marker-component-present";
const MAX_ALLOWLIST_FILE_BYTES = 1_000_000;
const DISABLE_DIRECTIVE = `lyse-disable ${RULE_ID}`;

// Exported so sibling rules 3.3 / 3.5 can reuse the same vocabulary without
// duplicating the set.
export const AI_MARKER_NAMES: ReadonlySet<string> = new Set([
  "ailabel",
  "aibadge",
  "aitag",
  "aiindicator",
  "aimarker",
  "aiavatar",
  "genaiavatar",
  "genaibadge",
  "genailabel",
  "genaitag",
]);

// Polaris `magic-*` prefix matched separately (prefix match, not set lookup).
const MAGIC_PREFIX = "magic-";

const ALLOWLIST_CANDIDATES = [
  "README.md",
  "README",
  "README.mdx",
  "readme.md",
  ".lyse.yaml",
  ".lyse.yml",
];

const INDEX_CANDIDATES = [
  "src/index.ts",
  "src/index.tsx",
  "index.ts",
  "index.tsx",
];

// Shared across all component-scanning ai-governance rules.
export const COMPONENT_GLOB = "**/*.{tsx,jsx,vue}";

export const SCAN_IGNORE = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.git/**",
  "**/.next/**",
  "**/out/**",
  "**/coverage/**",
];

// Keep the module-level alias used internally.
const IGNORE = SCAN_IGNORE;

const MAX_FILE_BYTES = 1_000_000;

const NAMED_EXPORT_RE =
  /\bexport\s+(?:default\s+)?(?:function\s+([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=)/g;
const NAMED_EXPORT_BLOCK_RE = /\bexport\s*\{([^}]+)\}/g;
const VUE_COMPONENT_NAME_RE = /(?:name\s*:\s*['"]([A-Za-z_$][\w$]*)['"])/g;

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

// Code-identifier vocabulary, not UI copy — devs keep these English even in
// localized products, so the list is intentionally not locale-driven.
const STRUCTURAL_MARKER_WORDS = [
  "label",
  "badge",
  "tag",
  "indicator",
  "marker",
  "avatar",
  "chip",
  "pill",
] as const;

// `\b` is unreliable adjacent to CJK (人工知能), and lowercasing erases the
// camelCase boundary in e.g. `BadgeIA`. Structural words are replaced with a
// separator first, then Latin nouns are matched with an explicit non-letter
// boundary so "ai" never matches inside "email"/"detail"/"caption". CJK
// neighbors are never [a-z], so the same boundary works for 人工知能.
const localizedNounReCache = new Map<string, RegExp>();

function localizedNounRe(repoRoot: string): RegExp {
  let re = localizedNounReCache.get(repoRoot);
  if (!re) {
    re = new RegExp(
      `(?:^|[^a-z])(?:${aiNounAlternation(repoRoot)})(?:[^a-z]|$)`,
    );
    localizedNounReCache.set(repoRoot, re);
  }
  return re;
}

function isLocalizedMarkerName(lower: string, repoRoot: string): boolean {
  if (!STRUCTURAL_MARKER_WORDS.some((w) => lower.includes(w))) return false;
  let residue = lower;
  for (const w of STRUCTURAL_MARKER_WORDS) {
    residue = residue.replaceAll(w, " ");
  }
  return localizedNounRe(repoRoot).test(residue);
}

// Universal (non-localized) AI-brand synonyms. Real-world marker components are
// named for the model family, not just "AI" (e.g. `LLMBadge`, `GPTTag`,
// `CopilotLabel`). These complement the i18n "AI" noun without polluting the
// locale vocabulary. Matched with the same boundary discipline as the localized
// nouns so structural-word false friends never match: `FilmTag` (no bounded
// `llm`), `HelicopterChip` (`copter` ≠ `copilot`), `CryptoTag` (no `gpt`).
const AI_SYNONYM_NOUNS = ["llm", "gpt", "copilot"] as const;
const AI_SYNONYM_RE = new RegExp(`(?:^|[^a-z])(?:${AI_SYNONYM_NOUNS.join("|")})(?:[^a-z]|$)`);

function isSynonymMarkerName(lower: string): boolean {
  if (!STRUCTURAL_MARKER_WORDS.some((w) => lower.includes(w))) return false;
  let residue = lower;
  for (const w of STRUCTURAL_MARKER_WORDS) residue = residue.replaceAll(w, " ");
  return AI_SYNONYM_RE.test(residue);
}

export function isAiMarkerName(name: string, repoRoot = ""): boolean {
  const lower = name.toLowerCase();
  if (AI_MARKER_NAMES.has(lower)) return true;
  if (lower.startsWith(MAGIC_PREFIX)) return true;
  if (lower.startsWith("genai")) return true;
  if (lower.includes("aimarker")) return true;
  if (lower.includes("aiavatar")) return true;
  if (lower.includes("aiindicator")) return true;
  if (isSynonymMarkerName(lower)) return true;
  return isLocalizedMarkerName(lower, repoRoot);
}

export function safeReadText(absPath: string): string | null {
  try {
    const stat = statSync(absPath);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES || stat.size === 0) return null;
    return readFileSync(absPath, "utf8");
  } catch {
    return null;
  }
}

export function extractNamesFromSource(source: string): string[] {
  const names: string[] = [];

  NAMED_EXPORT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = NAMED_EXPORT_RE.exec(source)) !== null) {
    const name = m[1] ?? m[2];
    if (name) names.push(name);
  }

  NAMED_EXPORT_BLOCK_RE.lastIndex = 0;
  while ((m = NAMED_EXPORT_BLOCK_RE.exec(source)) !== null) {
    const block = m[1] ?? "";
    for (const part of block.split(",")) {
      const tokens = part.trim().split(/\s+as\s+/);
      const surfaceName = tokens.length > 1 ? tokens[1] : tokens[0];
      if (surfaceName?.trim()) names.push(surfaceName.trim());
    }
  }

  return names;
}

export function extractVueNames(source: string): string[] {
  const names: string[] = [];
  VUE_COMPONENT_NAME_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = VUE_COMPONENT_NAME_RE.exec(source)) !== null) {
    if (m[1]) names.push(m[1]);
  }
  return names;
}

export function deriveComponentNameFromPath(relPath: string): string {
  const parts = relPath.split("/");
  const file = parts[parts.length - 1] ?? "";
  return file.replace(/\.(tsx|jsx|vue)$/, "");
}

// Shared per-file AI-marker check used by explainability, feedback-control,
// human-control-affordances, and ai-loading-error-states rules.
export function fileHasAiMarker(
  source: string,
  relPath: string,
  repoRoot = "",
): boolean {
  const names = relPath.endsWith(".vue")
    ? extractVueNames(source)
    : extractNamesFromSource(source);
  if (names.some((n) => isAiMarkerName(n, repoRoot))) return true;
  for (const m of source.matchAll(/<\s*([A-Za-z][\w.-]*)/g)) {
    if (m[1] && isAiMarkerName(m[1], repoRoot)) return true;
  }
  return false;
}

// Factory for the per-rule allowlist check. Each rule passes its own
// DISABLE_DIRECTIVE so the check reads the same files but looks for the
// rule-specific disable comment.
export function makeAllowlistCheck(
  disableDirective: string,
): (repoRoot: string) => boolean {
  return function isAllowlistedFor(repoRoot: string): boolean {
    for (const candidate of ALLOWLIST_CANDIDATES) {
      const abs = join(repoRoot, candidate);
      if (!existsSync(abs)) continue;
      try {
        const stat = statSync(abs);
        if (!stat.isFile() || stat.size > MAX_ALLOWLIST_FILE_BYTES) continue;
        const raw = readFileSync(abs, "utf8");
        if (raw.includes(disableDirective)) return true;
      } catch {
        // unreadable — fall through
      }
    }
    return false;
  };
}

export function scanForMarkerComponents(repoRoot: string): string[] {
  const found: string[] = [];

  for (const candidate of INDEX_CANDIDATES) {
    const abs = join(repoRoot, candidate);
    const source = safeReadText(abs);
    if (!source) continue;
    for (const name of extractNamesFromSource(source)) {
      if (isAiMarkerName(name, repoRoot)) found.push(name);
    }
  }

  let componentFiles: string[] = [];
  try {
    componentFiles = fg.sync(COMPONENT_GLOB, {
      cwd: repoRoot,
      absolute: false,
      dot: false,
      ignore: IGNORE,
      onlyFiles: true,
      unique: true,
    });
  } catch {
    // non-fatal
  }

  for (const rel of componentFiles) {
    const baseName = deriveComponentNameFromPath(rel);
    if (isAiMarkerName(baseName, repoRoot)) found.push(baseName);

    const source = safeReadText(join(repoRoot, rel));
    if (!source) continue;

    const names = rel.endsWith(".vue")
      ? extractVueNames(source)
      : extractNamesFromSource(source);

    for (const name of names) {
      if (isAiMarkerName(name, repoRoot)) found.push(name);
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

  const markerComponents = scanForMarkerComponents(ctx.repoRoot);
  const reservedTokens = detectReservedAiTokens(ctx.repoRoot);

  if (markerComponents.length === 0 && reservedTokens.length === 0) {
    return { findings, opportunities: 0 };
  }

  if (markerComponents.length > 0) {
    const list = markerComponents.join(", ");
    findings.push({
      ruleId: RULE_ID,
      axis: "ai-governance",
      severity: "info",
      location: { file: "src/index.ts", line: 1, column: 1 },
      message: `AI-marker component${markerComponents.length === 1 ? "" : "s"} detected: ${list}`,
      suggestion:
        "AI-marker components found — ensure they are applied consistently on AI-generated surfaces (Track 3.3 will enforce the pairing with reserved tokens)",
    });
    return { findings, opportunities: 1 };
  }

  // Reserved tokens present but no marker component — cross-condition warning
  findings.push({
    ruleId: RULE_ID,
    axis: "ai-governance",
    severity: "warning",
    location: { file: "tokens.json", line: 1, column: 1 },
    message: `Reserved AI tokens are present (${reservedTokens.length} found) but no AI-marker component was detected in the export surface or component files`,
    suggestion:
      "ship a dedicated AI-marker component (e.g. AILabel, AIBadge, or a magic-prefixed component) so consumers can visually mark AI-generated content",
  });
  return { findings, opportunities: 1 };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "ai-governance",
    lyseRuleId: RULE_ID,
    defaultSeverity: "warning",
    shortDescription: "Detect AI-marker component in the DS export surface",
    fullDescription:
      "Scans the design system's export surface (`src/index.ts`, `index.ts`, etc.) and component files (`**/*.{tsx,jsx,vue}`) for a dedicated AI-marker component — a label, badge, avatar, or indicator that visually marks AI-generated output. Recognised vocabularies: Carbon `AILabel`, generic `AIBadge` / `AITag` / `AIIndicator` / `AIAvatar`, `GenAI*` variants, `*AIMarker*`, Polaris `magic-*` components, and localized markers combining a structural word (label/badge/tag/indicator/marker/avatar/chip/pill) with an AI noun from any active locale (`BadgeIA`, `IALabel`, `KIBadge`, `人工知能Badge`). Emits `info` when a marker component is found; emits `warning` when reserved AI tokens exist (detected by the shared `detectReservedAiTokens` parser) but no marker component is present; emits nothing when the DS has no AI surface at all.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/ai-governance-ai-marker-component-present.md",
    rationale: `Why it matters

AI-marker components are the visual contract between the design system and consumers: they signal "this content was produced by AI." Without a dedicated component, individual teams reinvent ad-hoc markers, breaking consistency and accessibility.

The most important case to flag is a DS that ships reserved AI tokens (signaling AI-surface intent) but provides no corresponding component — consumers have no standardised way to mark AI provenance visually.

This rule emits \`info\` when a marker component is detected (inventory), and \`warning\` when reserved tokens exist but no marker component is found. A DS with no AI surface emits nothing and is not penalised.

The exported \`AI_MARKER_NAMES\` constant is shared with sibling rules (Track 3.3 / 3.5) to ensure a single vocabulary source of truth.`,
    examples: [
      {
        good: "// src/index.ts\nexport { AILabel } from './ai-label';\nexport { Button } from './button';",
        bad: "// src/index.ts — no AI-marker component exported\nexport { Button } from './button';",
      },
      {
        good: "// AILabel.tsx — component file named with the marker vocabulary",
        bad: "// tokens.json has `color.ai.primary` but no AILabel/AIBadge component exists",
      },
      {
        good: "// Polaris-style: magic-icon.tsx component file detected",
        bad: "// Reserved tokens present, no marker component shipped",
      },
    ],
    allowlist: [
      "repos containing `lyse-disable ai-governance/ai-marker-component-present` in an adjacent README or `.lyse.yaml` — rule is N/A",
      "repos with no reserved AI tokens AND no marker component — no AI surface detected, rule emits nothing",
      "files larger than 1 MB — skipped to avoid pathological cases",
      "files under `node_modules/`, `dist/`, `build/`, `.git/`, `.next/`, `out/`, `coverage/`",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = {
  isAiMarkerName,
  isAllowlisted,
  scanForMarkerComponents,
  extractNamesFromSource,
  DISABLE_DIRECTIVE,
  ALLOWLIST_CANDIDATES,
  COMPONENT_GLOB,
  SCAN_IGNORE,
  deriveComponentNameFromPath,
  fileHasAiMarker,
  makeAllowlistCheck,
};
