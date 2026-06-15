import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Rule, RuleContext, ParsedFiles, RuleEvalResult, Finding } from "../types.js";
import { createLyseRule } from "./_rule-module.js";

const RULE_ID = "versioning/changelog-present";
const MAX_FILE_BYTES = 2_000_000;
const DISABLE_DIRECTIVE = `lyse-disable ${RULE_ID}`;

const CHANGELOG_CANDIDATES = [
  "CHANGELOG.md",
  "CHANGELOG",
  "CHANGELOG.mdx",
  "changelog.md",
  "HISTORY.md",
  "CHANGES.md",
  "docs/CHANGELOG.md",
];
const README_CANDIDATES = ["README.md", "README", "README.mdx", "readme.md"];

// A version-structured heading: `## [1.2.3]` (Keep a Changelog), `## v1.2.3`,
// or `## 1.2.3 …`. Requires a semver-ish x.y(.z) so prose headings don't match.
const VERSION_HEADING_RE = /^#{1,3}\s*\[?v?\d+\.\d+(\.\d+)?/m;

function hasVersionEntries(content: string): boolean {
  return VERSION_HEADING_RE.test(content);
}

function readFileIfSmall(absPath: string): string | null {
  try {
    const stat = statSync(absPath);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null;
    return readFileSync(absPath, "utf8");
  } catch {
    return null;
  }
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

/** Returns the first changelog file that exists AND has version-structured entries. */
function findStructuredChangelog(repoRoot: string): string | null {
  for (const candidate of CHANGELOG_CANDIDATES) {
    const content = readFileIfSmall(join(repoRoot, candidate));
    if (content !== null && hasVersionEntries(content)) return candidate;
  }
  return null;
}

const evaluate = async (ctx: RuleContext, _files: ParsedFiles): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  if (!ctx.repoRoot) return { findings, opportunities: 0 };
  if (isAllowlisted(ctx.repoRoot)) return { findings, opportunities: 0 };

  if (findStructuredChangelog(ctx.repoRoot) !== null) {
    return { findings, opportunities: 1 };
  }

  findings.push({
    ruleId: RULE_ID,
    axis: "ai-surface",
    severity: "warning",
    location: { file: "CHANGELOG.md", line: 1, column: 1 },
    message:
      "No structured CHANGELOG found — AI agents (and humans) can't see what changed between versions",
    suggestion:
      "add a CHANGELOG.md with version-structured entries (Keep a Changelog: `## [1.2.0]` headings) so consumers and AI agents can track changes and breaking updates",
  });
  return { findings, opportunities: 1 };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "ai-surface",
    lyseRuleId: RULE_ID,
    defaultSeverity: "warning",
    shortDescription: "Design system should ship a structured CHANGELOG",
    fullDescription:
      "Checks whether the repository ships a version-structured changelog (`CHANGELOG.md`, `HISTORY.md`, `CHANGES.md`, …) with semver-style entry headings (`## [1.2.3]` / `## v1.2.3` / `## 1.2.3`). Emits one warning at repo level when no structured changelog is found; emits nothing when present. Part of the AI-consumable contract (Face A): an AI agent editing code against the design system needs the changelog to track what changed and what broke.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/versioning-changelog-present.md",
    rationale: `Why it matters

A design system without a structured changelog forces every consumer — human or AI agent — to reverse-engineer what changed from the git log or release tags. For AI-readiness specifically, an agent updating an app against a new DS version needs machine-readable change/breaking-change information to avoid silently breaking the app.

The check is intentionally lenient on format (any Keep-a-Changelog-style or \`v\`-prefixed version heading counts) and on filename (CHANGELOG / HISTORY / CHANGES). It is a deterministic presence/structure check, so synthetic precision equals real precision.`,
    examples: [
      {
        good: "// CHANGELOG.md\n## [1.2.0] - 2026-01-01\n### Added\n- New Button variant",
        bad: "// no CHANGELOG, or a CHANGELOG with only prose and no version headings",
      },
    ],
    allowlist: [
      "repos containing `lyse-disable versioning/changelog-present` in a README — rule is N/A",
      "changelog files larger than 2 MB — skipped to avoid pathological cases",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = { hasVersionEntries, findStructuredChangelog, isAllowlisted, DISABLE_DIRECTIVE };
