import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import fg from "fast-glob";
import { parse as parseYaml } from "yaml";

const MAX_FILE_BYTES = 2_000_000;

// Reserved AI-marker token patterns (case-insensitive).
// Covers: Carbon (*-ai-* colors, dragon-fruit gradient), Polaris (magic namespace),
// Workday Canvas (*-ai-* segment), and generic ai-prefixed/-suffixed/-segmented names.
const AI_TOKEN_PATTERNS: RegExp[] = [
  // Workday Canvas & generic: token name contains -ai- segment or starts with ai- or ends with -ai
  /(?:^|[-_])ai(?:[-_]|$)/i,
  // Polaris: magic namespace (--p-color-*-magic*, magic-* component tokens)
  /magic/i,
  // Carbon AI gradient family
  /dragon[-_]?fruit/i,
  /dragonfruit/i,
];

function isReservedAiToken(name: string): boolean {
  return AI_TOKEN_PATTERNS.some((re) => re.test(name));
}

// JSON token file patterns (flat, W3C DTCG-style, and namespaced)
const JSON_PATTERNS = [
  "tokens.json",
  "tokens/**/*.json",
  "**/*.tokens.json",
  "**/*.token.json",
];

// CSS custom property declaration: --token-name: value;
const CSS_CUSTOM_PROP_RE = /--([a-zA-Z0-9_-]+)\s*:/g;

// JSON value visitor: collect all keys from any depth that look like token names
function collectJsonTokenNames(node: unknown, out: Set<string>): void {
  if (typeof node !== "object" || node === null) return;
  if (Array.isArray(node)) {
    for (const item of node) collectJsonTokenNames(item, out);
    return;
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    out.add(key);
    collectJsonTokenNames(value, out);
  }
}

function readTextIfSmall(absPath: string): string | null {
  try {
    const stat = statSync(absPath);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null;
    return readFileSync(absPath, "utf8");
  } catch {
    return null;
  }
}

function scanJsonFile(absPath: string, found: Set<string>): void {
  const raw = readTextIfSmall(absPath);
  if (raw === null) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  const names = new Set<string>();
  collectJsonTokenNames(parsed, names);
  for (const name of names) {
    if (isReservedAiToken(name)) found.add(name);
  }
}

function scanYamlFile(absPath: string, found: Set<string>): void {
  const raw = readTextIfSmall(absPath);
  if (raw === null) return;
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch {
    return;
  }
  const names = new Set<string>();
  collectJsonTokenNames(parsed, names);
  for (const name of names) {
    if (isReservedAiToken(name)) found.add(name);
  }
}

function scanCssFile(absPath: string, found: Set<string>): void {
  const raw = readTextIfSmall(absPath);
  if (raw === null) return;
  CSS_CUSTOM_PROP_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CSS_CUSTOM_PROP_RE.exec(raw)) !== null) {
    const propName = m[1];
    if (propName !== undefined && isReservedAiToken(propName)) {
      found.add(`--${propName}`);
    }
  }
}

/**
 * Scans the repo's token sources for reserved AI-marker token names and returns
 * the sorted, deduplicated set (max 20 entries — the rule caps findings at 20).
 *
 * Sources scanned:
 * - JSON: tokens.json, tokens/**\/*.json, **\/*.tokens.json
 * - YAML: tokens.yaml, tokens/**\/*.yaml, **\/*.tokens.yaml
 * - CSS:  **\/*.css (--custom-property declarations only)
 */
export function detectReservedAiTokens(repoRoot: string): string[] {
  const found = new Set<string>();

  // JSON token files
  let jsonFiles: string[] = [];
  try {
    jsonFiles = fg.sync(JSON_PATTERNS, {
      cwd: repoRoot,
      absolute: false,
      dot: false,
      ignore: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.git/**"],
      followSymbolicLinks: false,
    });
  } catch {
    jsonFiles = [];
  }
  for (const rel of jsonFiles) {
    scanJsonFile(join(repoRoot, rel), found);
  }

  // YAML token files
  const yamlPatterns = [
    "tokens.yaml",
    "tokens.yml",
    "tokens/**/*.yaml",
    "tokens/**/*.yml",
    "**/*.tokens.yaml",
    "**/*.tokens.yml",
  ];
  let yamlFiles: string[] = [];
  try {
    yamlFiles = fg.sync(yamlPatterns, {
      cwd: repoRoot,
      absolute: false,
      dot: false,
      ignore: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.git/**"],
      followSymbolicLinks: false,
    });
  } catch {
    yamlFiles = [];
  }
  for (const rel of yamlFiles) {
    scanYamlFile(join(repoRoot, rel), found);
  }

  // CSS custom properties
  let cssFiles: string[] = [];
  try {
    cssFiles = fg.sync(["**/*.css"], {
      cwd: repoRoot,
      absolute: false,
      dot: false,
      ignore: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.git/**"],
      followSymbolicLinks: false,
    });
  } catch {
    cssFiles = [];
  }
  for (const rel of cssFiles) {
    scanCssFile(join(repoRoot, rel), found);
  }

  return Array.from(found).sort();
}
