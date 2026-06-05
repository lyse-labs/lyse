import { existsSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import fg from "fast-glob";
import type {
  Rule,
  RuleContext,
  ParsedFiles,
  RuleEvalResult,
  Finding,
} from "../types.js";
import { isPathExcluded } from "./_exclude.js";
import { createLyseRule } from "./_rule-module.js";

const RULE_ID = "ai-surface/shadcn-registry-valid";
const MAX_FILE_BYTES = 4_000_000;

const SHADCN_MARKER = "components.json";

const REGISTRY_CANDIDATES = [
  "registry.json",
  "public/registry.json",
  "registry/**/*.json",
];

const VALID_ITEM_TYPES = new Set([
  "registry:ui",
  "registry:lib",
  "registry:hook",
  "registry:block",
  "registry:component",
  "registry:page",
  "registry:file",
  "registry:style",
  "registry:theme",
  "registry:item",
]);

interface RegistryFileEntry {
  path?: unknown;
  content?: unknown;
  type?: unknown;
  [key: string]: unknown;
}

interface RegistryItem {
  name?: unknown;
  type?: unknown;
  files?: unknown;
  dependencies?: unknown;
  registryDependencies?: unknown;
  tailwind?: unknown;
  cssVars?: unknown;
  [key: string]: unknown;
}

function discoverRegistryFiles(ctx: RuleContext): string[] {
  if (!ctx.repoRoot) return [];
  let entries: string[] = [];
  try {
    entries = fg.sync(REGISTRY_CANDIDATES, {
      cwd: ctx.repoRoot,
      absolute: false,
      dot: false,
      ignore: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.git/**"],
      followSymbolicLinks: false,
    });
  } catch {
    return [];
  }
  const out = new Set<string>();
  for (const rel of entries) {
    if (isPathExcluded(rel, ctx.excludePaths)) continue;
    out.add(rel);
  }
  return Array.from(out).sort();
}

function readJsonIfSmall(absPath: string): { data: unknown | null; parseError: string | null } {
  try {
    const stat = statSync(absPath);
    if (!stat.isFile()) return { data: null, parseError: null };
    if (stat.size > MAX_FILE_BYTES) return { data: null, parseError: "file too large" };
    const raw = readFileSync(absPath, "utf8");
    if (raw.trim().length === 0) return { data: null, parseError: "empty file" };
    return { data: JSON.parse(raw), parseError: null };
  } catch (e) {
    return { data: null, parseError: e instanceof Error ? e.message : "unknown parse error" };
  }
}

function hasShadcnMarker(repoRoot: string): boolean {
  return existsSync(join(repoRoot, SHADCN_MARKER));
}

interface ItemValidation {
  ok: boolean;
  reasons: string[];
}

function validateRegistryItem(item: unknown): ItemValidation {
  const reasons: string[] = [];
  if (typeof item !== "object" || item === null) {
    return { ok: false, reasons: ["registry item is not a JSON object"] };
  }
  const r = item as RegistryItem;

  if (typeof r.name !== "string" || r.name.trim().length === 0) {
    reasons.push("missing or empty `name` (required, string)");
  }
  if (typeof r.type !== "string" || r.type.trim().length === 0) {
    reasons.push("missing or empty `type` (required, e.g. \"registry:ui\")");
  }
  // Note: we don't gate on a fixed `VALID_ITEM_TYPES` set — the shadcn schema
  // has evolved over time and accepts arbitrary `registry:*` namespaces, so
  // checking against a hardcoded list produces false positives on legitimate
  // custom types. We just require a non-empty string.
  if (!Array.isArray(r.files)) {
    reasons.push("missing `files` (required, non-empty array of `{ path, content?, type? }`)");
  } else if (r.files.length === 0) {
    reasons.push("`files` is empty (must contain at least one `{ path }` entry)");
  } else {
    for (let i = 0; i < r.files.length; i++) {
      const f = r.files[i];
      if (typeof f !== "object" || f === null) {
        reasons.push(`files[${i}] is not an object`);
        continue;
      }
      const fe = f as RegistryFileEntry;
      if (typeof fe.path !== "string" || fe.path.trim().length === 0) {
        reasons.push(`files[${i}] missing \`path\` (required, string)`);
      }
    }
  }
  return { ok: reasons.length === 0, reasons };
}

function looksLikeRegistryItem(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false;
  const r = data as RegistryItem;
  return "name" in r || "type" in r || "files" in r;
}

function looksLikeRegistryCollection(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false;
  const r = data as Record<string, unknown>;
  if (Array.isArray(r.items)) return true;
  if (Array.isArray(r.registry)) return true;
  return false;
}

interface ParsedRegistry {
  items: unknown[];
  shape: "single" | "collection";
}

function extractRegistryItems(data: unknown): ParsedRegistry {
  if (looksLikeRegistryCollection(data)) {
    const r = data as Record<string, unknown>;
    const arr = (Array.isArray(r.items) ? r.items : r.registry) as unknown[];
    return { items: arr, shape: "collection" };
  }
  return { items: [data], shape: "single" };
}

const evaluate = async (
  ctx: RuleContext,
  _files: ParsedFiles,
): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  if (!ctx.repoRoot) {
    return { findings, opportunities: 0 };
  }

  const registryFiles = discoverRegistryFiles(ctx);
  const shadcnMarker = hasShadcnMarker(ctx.repoRoot);

  if (registryFiles.length === 0) {
    if (!shadcnMarker) {
      return { findings, opportunities: 0 };
    }
    findings.push({
      ruleId: RULE_ID,
      axis: "ai-surface",
      severity: "warning",
      location: { file: "registry.json", line: 1, column: 1 },
      message: "components.json found but no shadcn registry — missed AI-Consumable surface",
      suggestion:
        "publish a `registry.json` (or `public/registry.json`) describing your components so AI agents and the shadcn CLI can install them",
    });
    return { findings, opportunities: 1 };
  }

  let opportunities = 0;
  for (const rel of registryFiles) {
    opportunities += 1;
    const abs = join(ctx.repoRoot, rel);
    const { data, parseError } = readJsonIfSmall(abs);
    const relPath = relative(ctx.repoRoot, abs) || rel;

    if (data === null) {
      findings.push({
        ruleId: RULE_ID,
        axis: "ai-surface",
        severity: "error",
        location: { file: relPath, line: 1, column: 1 },
        message: `shadcn registry ${relPath} is not valid JSON${parseError ? ` (${parseError})` : ""}`,
        suggestion: "ensure the registry file is parseable JSON",
      });
      continue;
    }

    if (!looksLikeRegistryItem(data) && !looksLikeRegistryCollection(data)) {
      findings.push({
        ruleId: RULE_ID,
        axis: "ai-surface",
        severity: "error",
        location: { file: relPath, line: 1, column: 1 },
        message: `shadcn registry ${relPath} has no \`name\`/\`type\`/\`files\` at the root and no \`items\` collection`,
        suggestion:
          "each registry entry must be `{ name, type, files: [{ path, ... }] }` per https://ui.shadcn.com/docs/registry",
      });
      continue;
    }

    const parsed = extractRegistryItems(data);
    if (parsed.items.length === 0) {
      findings.push({
        ruleId: RULE_ID,
        axis: "ai-surface",
        severity: "error",
        location: { file: relPath, line: 1, column: 1 },
        message: `shadcn registry ${relPath} contains no items`,
        suggestion: "add at least one `{ name, type, files }` entry",
      });
      continue;
    }

    for (let i = 0; i < parsed.items.length; i++) {
      const item = parsed.items[i];
      const validation = validateRegistryItem(item);
      if (validation.ok) continue;
      const label =
        parsed.shape === "collection"
          ? `items[${i}]`
          : (typeof (item as RegistryItem)?.name === "string" ? `"${(item as RegistryItem).name as string}"` : "registry item");
      for (const reason of validation.reasons) {
        findings.push({
          ruleId: RULE_ID,
          axis: "ai-surface",
          severity: "error",
          location: { file: relPath, line: 1, column: 1 },
          message: `shadcn registry ${relPath} ${label}: ${reason}`,
          suggestion:
            "each entry must include `name` (string), `type` (e.g. \"registry:ui\") and a non-empty `files` array of `{ path }`",
        });
      }
    }
  }

  return { findings, opportunities };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "ai-surface",
    lyseRuleId: RULE_ID,
    defaultSeverity: "warning",
    shortDescription: "shadcn-style registry.json must be present and valid",
    fullDescription:
      "Detects whether the design system ships a shadcn-style component registry — `registry.json` at the repo root, `public/registry.json` (Next.js-hosted), or per-component `registry/*.json` files. Validates the minimal shadcn shape: each item must have `name` (string), `type` (e.g. \"registry:ui\") and a non-empty `files` array of `{ path, content?, type? }`. Optional fields (`dependencies`, `registryDependencies`, `tailwind`, `cssVars`) are not validated. When `components.json` exists but no registry is shipped, emits a warning for the missed AI-Consumable surface; malformed JSON or missing required fields are errors.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/ai-surface-shadcn-registry-valid.md",
    rationale: `Why it matters

A valid shadcn-style \`registry.json\` is the single most reliable signal that a design system is AI-Consumable today. The shadcn CLI uses it to install components into downstream apps; coding agents (Cursor, Claude, GPT) increasingly look for it to discover and pull components instead of scraping source files.

Detection is conservative — we look for the canonical locations only (\`registry.json\`, \`public/registry.json\`, \`registry/*.json\`) and validate only the three required fields per the public shadcn schema. Optional fields like \`tailwind\` and \`cssVars\` vary across versions and are not part of the validity contract.

A repo declaring \`components.json\` (the shadcn CLI marker) but no registry is a strong indicator the team is on the shadcn path but hasn't published the consumable surface — that's a warning, not an error. Malformed JSON or items missing \`name\`/\`type\`/\`files\` will silently break the shadcn CLI and any agent consumer, so they are errors.`,
    examples: [
      {
        good: '{ "name": "button", "type": "registry:ui", "files": [{ "path": "ui/button.tsx" }] }',
        bad: '{ "name": "button", "type": "registry:ui" }',
      },
      {
        good: '{ "items": [{ "name": "button", "type": "registry:ui", "files": [{ "path": "ui/button.tsx" }] }] }',
        bad: '{ "items": [{ "name": "button" }] }',
      },
    ],
    allowlist: [
      "repos with no `components.json` AND no `registry.json` — rule is N/A",
      "files larger than 4 MB — skipped to avoid pathological cases",
      "files matching `ctx.excludePaths` config",
      "disable in `.lyse.yaml`: `rules: { ai-surface/shadcn-registry-valid: off }`",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = {
  validateRegistryItem,
  looksLikeRegistryItem,
  looksLikeRegistryCollection,
  extractRegistryItems,
  REGISTRY_CANDIDATES,
  VALID_ITEM_TYPES,
};
