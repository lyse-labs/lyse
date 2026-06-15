import { existsSync, readFileSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Rule, RuleContext, ParsedFiles, RuleEvalResult, Finding } from "../types.js";
import { createLyseRule } from "./_rule-module.js";

const RULE_ID = "versioning/migration-guide-present";
const MAX_FILE_BYTES = 2_000_000;
const DISABLE_DIRECTIVE = `lyse-disable ${RULE_ID}`;

const README_CANDIDATES = ["README.md", "README", "README.mdx", "readme.md"];

// Root-level migration/upgrade guide filenames (case-insensitive match).
const GUIDE_FILE_RE = /^(migrat|migrating|upgrad|upgrading|upgrade)[\w.-]*\.mdx?$/i;
// Same, but the bare stem (MIGRATION, UPGRADING) without extension.
const GUIDE_STEM_RE = /^(migration|migrating|upgrade|upgrading|migrate)$/i;

// A heading announcing migration/upgrade guidance inside another doc.
const GUIDE_HEADING_RE = /^#{1,4}\s+.*\b(migrat(e|ion|ing)|upgrad(e|ing))\b/im;

const DOC_DIRS = ["docs", "doc", "documentation", ".github"];

function readFileIfSmall(absPath: string): string | null {
  try {
    const stat = statSync(absPath);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null;
    return readFileSync(absPath, "utf8");
  } catch {
    return null;
  }
}

function listDir(absPath: string): string[] {
  try {
    return readdirSync(absPath);
  } catch {
    return [];
  }
}

function isGuideFilename(name: string): boolean {
  if (GUIDE_FILE_RE.test(name)) return true;
  const dot = name.lastIndexOf(".");
  const stem = dot === -1 ? name : name.slice(0, dot);
  return GUIDE_STEM_RE.test(stem);
}

function hasGuideFileAtRoot(repoRoot: string): boolean {
  return listDir(repoRoot).some(isGuideFilename);
}

function hasGuideFileInDocs(repoRoot: string): boolean {
  for (const dir of DOC_DIRS) {
    const abs = join(repoRoot, dir);
    if (!existsSync(abs)) continue;
    if (listDir(abs).some(isGuideFilename)) return true;
  }
  return false;
}

/** A "## Migration" / "## Upgrading" section inside CHANGELOG or README. */
function hasGuideHeading(repoRoot: string): boolean {
  for (const candidate of ["CHANGELOG.md", "CHANGES.md", "HISTORY.md", ...README_CANDIDATES]) {
    const content = readFileIfSmall(join(repoRoot, candidate));
    if (content !== null && GUIDE_HEADING_RE.test(content)) return true;
  }
  return false;
}

function isAllowlisted(repoRoot: string): boolean {
  for (const candidate of README_CANDIDATES) {
    const abs = join(repoRoot, candidate);
    if (!existsSync(abs)) continue;
    const content = readFileIfSmall(abs);
    if (content !== null && content.includes(DISABLE_DIRECTIVE)) return true;
  }
  return false;
}

function hasMigrationGuide(repoRoot: string): boolean {
  return hasGuideFileAtRoot(repoRoot) || hasGuideFileInDocs(repoRoot) || hasGuideHeading(repoRoot);
}

const evaluate = async (ctx: RuleContext, _files: ParsedFiles): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  if (!ctx.repoRoot) return { findings, opportunities: 0 };
  if (isAllowlisted(ctx.repoRoot)) return { findings, opportunities: 0 };

  if (hasMigrationGuide(ctx.repoRoot)) {
    return { findings, opportunities: 1 };
  }

  findings.push({
    ruleId: RULE_ID,
    axis: "ai-surface",
    severity: "warning",
    location: { file: "MIGRATION.md", line: 1, column: 1 },
    message:
      "No migration/upgrade guide found — AI agents (and humans) upgrading across versions have no documented path for breaking changes",
    suggestion:
      "add a MIGRATION.md / UPGRADING.md (or a `## Migration` section in the CHANGELOG) describing how to move across breaking versions",
  });
  return { findings, opportunities: 1 };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "ai-surface",
    lyseRuleId: RULE_ID,
    defaultSeverity: "warning",
    shortDescription: "Design system should ship a migration/upgrade guide",
    fullDescription:
      "Checks whether the repository ships migration/upgrade guidance — a `MIGRATION.md` / `UPGRADING.md` file (at root or under `docs/`), or a `## Migration` / `## Upgrading` heading inside the CHANGELOG or README. Emits one warning at repo level when none is found; emits nothing when present. Part of the AI-consumable contract (Face A): an agent upgrading an app across a breaking design-system version needs a documented migration path.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/versioning-migration-guide-present.md",
    rationale: `Why it matters

A design system without any migration/upgrade guidance forces every consumer — human or AI agent — to reverse-engineer how to move across a breaking version from diffs and release notes. For AI-readiness specifically, an agent upgrading an app needs a documented migration path to apply breaking-change codemods safely.

The check is lenient on both filename (MIGRATION / MIGRATING / UPGRADING / UPGRADE, with or without extension) and location (repo root, \`docs/\`, or a migration/upgrade heading inside the CHANGELOG/README). It is a deterministic presence/structure check, so synthetic precision equals real precision.`,
    examples: [
      {
        good: "// MIGRATION.md, or UPGRADING.md, or a `## Migrating to v2` section in CHANGELOG.md",
        bad: "// no migration/upgrade guide anywhere — consumers must reverse-engineer breaking changes",
      },
    ],
    allowlist: [
      "repos containing `lyse-disable versioning/migration-guide-present` in a README — rule is N/A",
      "guide files larger than 2 MB — skipped to avoid pathological cases",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = { isGuideFilename, hasMigrationGuide, isAllowlisted, DISABLE_DIRECTIVE };
