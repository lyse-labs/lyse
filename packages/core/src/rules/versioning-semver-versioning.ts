import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import fg from "fast-glob";
import { parse as parseYaml } from "yaml";
import type { Rule, RuleContext, ParsedFiles, RuleEvalResult, Finding } from "../types.js";
import { createLyseRule } from "./_rule-module.js";

const RULE_ID = "versioning/semver-versioning";
const MAX_FILE_BYTES = 1_000_000;
const DISABLE_DIRECTIVE = `lyse-disable ${RULE_ID}`;

const README_CANDIDATES = ["README.md", "README", "README.mdx", "readme.md"];

// Official semver.org regex (https://semver.org), anchored. Accepts pre-release
// and build metadata; `0.x` is valid (pre-1.0 is still semver).
const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

interface PackageJsonShape {
  version?: unknown;
  workspaces?: string[] | { packages?: string[] };
}

function isValidSemver(value: unknown): boolean {
  return typeof value === "string" && SEMVER_RE.test(value.trim());
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

function readJsonIfSmall(absPath: string): unknown | null {
  const raw = readFileIfSmall(absPath);
  if (raw === null || raw.trim().length === 0) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readPnpmWorkspaceGlobs(repoRoot: string): string[] | null {
  const abs = join(repoRoot, "pnpm-workspace.yaml");
  if (!existsSync(abs)) return null;
  try {
    const parsed = parseYaml(readFileSync(abs, "utf8")) as { packages?: string[] } | null;
    if (parsed && Array.isArray(parsed.packages) && parsed.packages.length > 0) {
      return parsed.packages;
    }
  } catch {
    // ignore
  }
  return null;
}

function resolveWorkspaceGlobs(repoRoot: string, rootPkg: PackageJsonShape | null): string[] {
  if (rootPkg?.workspaces) {
    if (Array.isArray(rootPkg.workspaces)) return rootPkg.workspaces;
    return rootPkg.workspaces.packages ?? [];
  }
  return readPnpmWorkspaceGlobs(repoRoot) ?? [];
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

/** Returns the first manifest path (relative) declaring a valid-semver version, root first. */
function findSemverManifest(repoRoot: string): string | null {
  const rootPkg = readJsonIfSmall(join(repoRoot, "package.json")) as PackageJsonShape | null;
  if (rootPkg && isValidSemver(rootPkg.version)) return "package.json";

  const globs = resolveWorkspaceGlobs(repoRoot, rootPkg);
  if (globs.length === 0) return null;

  const pkgJsonPaths = fg.sync(
    globs.map((g) => `${g}/package.json`),
    { cwd: repoRoot, absolute: false, onlyFiles: true, ignore: ["**/node_modules/**"] },
  );
  for (const rel of pkgJsonPaths.sort()) {
    const pkg = readJsonIfSmall(join(repoRoot, rel)) as PackageJsonShape | null;
    if (pkg && isValidSemver(pkg.version)) return rel;
  }
  return null;
}

const evaluate = async (ctx: RuleContext, _files: ParsedFiles): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  if (!ctx.repoRoot) return { findings, opportunities: 0 };
  if (isAllowlisted(ctx.repoRoot)) return { findings, opportunities: 0 };

  if (findSemverManifest(ctx.repoRoot) !== null) {
    return { findings, opportunities: 1 };
  }

  findings.push({
    ruleId: RULE_ID,
    axis: "ai-surface",
    severity: "warning",
    location: { file: "package.json", line: 1, column: 1 },
    message:
      "No semver version declared in package.json — AI agents (and humans) can't pin or reason about a stable version contract",
    suggestion:
      'set a valid semver `version` in package.json (e.g. `"version": "1.2.0"`) so consumers and AI agents can pin a stable, machine-readable version',
  });
  return { findings, opportunities: 1 };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "ai-surface",
    lyseRuleId: RULE_ID,
    defaultSeverity: "warning",
    shortDescription: "Design system should declare a valid semver version",
    fullDescription:
      "Checks whether the repository declares a valid semver `version` in `package.json` (root, or any workspace manifest in a monorepo). Accepts pre-release and build metadata; `0.x` is valid. Emits one warning at repo level when no manifest carries a valid-semver version; emits nothing when present. Part of the AI-consumable contract (Face A): an AI agent editing code against the design system needs a stable, machine-readable version to pin against.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/versioning-semver-versioning.md",
    rationale: `Why it matters

A design system without a valid semver version gives consumers — human or AI agent — nothing stable to pin against. An agent updating an app against the design system needs a machine-readable version to reason about compatibility and breaking changes.

The check is intentionally lenient: any semver-valid version passes, including pre-1.0 (\`0.x\`) versions, which are common for legitimately-maintained design systems. It is a deterministic presence/structure check, so synthetic precision equals real precision.`,
    examples: [
      {
        good: '// package.json\n{ "version": "1.2.0" }',
        bad: '// no version field, or a non-semver value like "latest" / "1.0" / a date',
      },
    ],
    allowlist: [
      "repos containing `lyse-disable versioning/semver-versioning` in a README — rule is N/A",
      "package.json files larger than 1 MB — skipped to avoid pathological cases",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = { isValidSemver, findSemverManifest, isAllowlisted, DISABLE_DIRECTIVE };
