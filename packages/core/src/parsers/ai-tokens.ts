// Pure (repoRoot: string) => string[] helper that surfaces reserved AI-marker
// design tokens declared in a repository. Consumed both by the
// `ai-governance/ai-tokens-reserved` inventory rule and by Track 3.3
// (`ai-governance/ai-token-requires-marker`), so the contract is intentionally
// minimal: glob + read, no logging, no Rule context, no network. Same input →
// same output, deterministic ordering.
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import fg from "fast-glob";
import { transformScssToCss } from "./scss-transform.js";

const JSON_TOKEN_PATTERNS = [
  "tokens.json",
  "tokens/**/*.json",
  "*.tokens.json",
  "**/tokens.json",
  "**/tokens/**/*.json",
  "**/*.tokens.json",
];

const CSS_PATTERNS = ["**/*.css"];
const SCSS_PATTERNS = ["**/*.scss"];

const IGNORE = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.git/**",
  "**/.next/**",
  "**/out/**",
  "**/coverage/**",
];

const MAX_FILE_BYTES = 2_000_000;

// `--p-color-bg-magic` (CSS) / `color.ai.primary` (JSON) → name segments.
// Splitting on `-`, `_`, `.`, `/`, whitespace gives us segment-boundary
// matching so the substring `ai` in larger words (rain, paint, mainColor,
// captain, detail) does NOT match.
const SEGMENT_SPLIT = /[-_./\s]+/;

// A bare `ai` segment is irreducibly ambiguous by name: real AI tokens (Workday
// `color.ai.*`) and component shorthands (Mantine's `--ai-bg`/`--ai-size`, where
// `ai` = ActionIcon) are indistinguishable. The Track #71 real-DS validation
// found the old bare-`ai` match false-firing across Mantine, poisoning four
// governance rules. We therefore favour precision: `ai` only counts when
// corroborated by an AI-distinctive descriptor or an unambiguous vendor
// signature. The trade is recall on generically-named `--ai-*` AI tokens
// (under-count) — the safe direction vs. penalising a non-AI DS (#139).
const AI_DISTINCTIVE = ["aura", "gradient", "sparkle", "glow", "generative", "generated"];

export function isReservedTokenName(rawName: string): boolean {
  const lower = rawName.toLowerCase();
  // Unambiguous vendor signatures.
  if (lower.includes("dragon-fruit") || lower.includes("dragonfruit")) return true;
  if (lower.includes("genai") || lower.includes("gen-ai")) return true; // Cloudscape (camelCase GenAi)
  const segments = lower.split(SEGMENT_SPLIT).filter((s) => s.length > 0);
  if (segments.some((s) => s.startsWith("magic"))) return true; // Polaris
  // Ambiguous bare `ai` segment: require an AI-distinctive descriptor in the name
  // (Carbon `ai-aura-*` / `ai-gradient-*`; excludes Mantine `--ai-bg`/`--ai-size`).
  if (segments.includes("ai") && AI_DISTINCTIVE.some((d) => lower.includes(d))) return true;
  return false;
}

function safeReadText(absPath: string): string | null {
  try {
    const stat = statSync(absPath);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES || stat.size === 0) {
      return null;
    }
    return readFileSync(absPath, "utf8");
  } catch {
    return null;
  }
}

function collectJsonLeafPaths(node: unknown, prefix: string, out: Set<string>): void {
  if (node === null || node === undefined) return;
  if (typeof node !== "object") {
    if (prefix.length > 0) out.add(prefix);
    return;
  }
  if (Array.isArray(node)) {
    // Arrays in design-token files (e.g. fontFamily: ["Inter", ...]) are
    // value lists; the parent path is the token name.
    if (prefix.length > 0) out.add(prefix);
    return;
  }
  const obj = node as Record<string, unknown>;
  const keys = Object.keys(obj);
  // DTCG leaf shape: `{ value: "...", type: "color", ... }` — treat as a leaf.
  if ("value" in obj && (typeof obj.value !== "object" || obj.value === null)) {
    if (prefix.length > 0) out.add(prefix);
    return;
  }
  for (const k of keys) {
    const childPath = prefix.length === 0 ? k : `${prefix}.${k}`;
    collectJsonLeafPaths(obj[k], childPath, out);
  }
}

// `--token-name: ...` declarations in CSS. Captures the identifier only.
const CSS_CUSTOM_PROPERTY = /(--[a-zA-Z_][a-zA-Z0-9_-]*)\s*:/g;

function extractCssCustomPropertyNames(source: string): string[] {
  CSS_CUSTOM_PROPERTY.lastIndex = 0;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = CSS_CUSTOM_PROPERTY.exec(source)) !== null) {
    if (m[1]) out.push(m[1]);
  }
  return out;
}

// SCSS `$variable` identifiers — declarations (`$ai-aura-end: …`) AND namespaced
// usages (`theme.$ai-aura-start-sm`). `transformScssToCss` blanks `$var`
// declaration lines, so these never survive to the custom-property pass; design
// systems that author AI tokens in Sass (IBM Carbon's `theme.$ai-*`, AWS
// Cloudscape's `$*-gen-ai`) are invisible to a source scan without this (#139).
// The leading `$` is dropped; the precision-gated `isReservedTokenName` decides.
const SCSS_VARIABLE = /\$([a-zA-Z_][a-zA-Z0-9_-]*)/g;

function extractScssVariableNames(source: string): string[] {
  SCSS_VARIABLE.lastIndex = 0;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = SCSS_VARIABLE.exec(source)) !== null) {
    if (m[1]) out.push(m[1]);
  }
  return out;
}

function discoverFiles(repoRoot: string, patterns: string[]): string[] {
  try {
    return fg.sync(patterns, {
      cwd: repoRoot,
      absolute: false,
      dot: false,
      ignore: IGNORE,
      followSymbolicLinks: false,
      onlyFiles: true,
      unique: true,
    });
  } catch {
    return [];
  }
}

export function detectReservedAiTokens(repoRoot: string): string[] {
  if (!repoRoot) return [];

  const found = new Set<string>();

  const jsonFiles = discoverFiles(repoRoot, JSON_TOKEN_PATTERNS);
  for (const rel of jsonFiles) {
    const text = safeReadText(join(repoRoot, rel));
    if (text === null) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      continue;
    }
    const leaves = new Set<string>();
    collectJsonLeafPaths(parsed, "", leaves);
    for (const leaf of leaves) {
      if (isReservedTokenName(leaf)) found.add(leaf);
    }
  }

  const cssFiles = discoverFiles(repoRoot, CSS_PATTERNS);
  for (const rel of cssFiles) {
    const text = safeReadText(join(repoRoot, rel));
    if (text === null) continue;
    for (const name of extractCssCustomPropertyNames(text)) {
      if (isReservedTokenName(name)) found.add(name);
    }
  }

  const scssFiles = discoverFiles(repoRoot, SCSS_PATTERNS);
  for (const rel of scssFiles) {
    const text = safeReadText(join(repoRoot, rel));
    if (text === null) continue;
    // Raw-source `$variable` scan first — the transform blanks these lines.
    for (const name of extractScssVariableNames(text)) {
      if (isReservedTokenName(name)) found.add(`$${name}`);
    }
    let cssText: string;
    try {
      cssText = transformScssToCss(text);
    } catch {
      continue;
    }
    for (const name of extractCssCustomPropertyNames(cssText)) {
      if (isReservedTokenName(name)) found.add(name);
    }
  }

  return Array.from(found).sort();
}

export const _internal = {
  isReservedTokenName,
  collectJsonLeafPaths,
  extractCssCustomPropertyNames,
  extractScssVariableNames,
};
