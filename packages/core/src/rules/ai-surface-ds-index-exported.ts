import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import fg from "fast-glob";
import { parse as parseYaml } from "yaml";
import type {
  Rule,
  RuleContext,
  ParsedFiles,
  RuleEvalResult,
  Finding,
} from "../types.js";
import { createLyseRule } from "./_rule-module.js";

const RULE_ID = "ai-surface/ds-index-exported";
const MAX_FILE_BYTES = 1_000_000;
const MIN_NAMED_EXPORTS = 3;

const INDEX_CANDIDATES = ["src/index.ts", "src/index.tsx", "index.ts", "index.tsx"];

interface PackageJsonShape {
  name?: string;
  workspaces?: string[] | { packages?: string[] };
  private?: boolean;
}

function readJsonIfSmall(absPath: string): unknown | null {
  try {
    const stat = statSync(absPath);
    if (!stat.isFile()) return null;
    if (stat.size > MAX_FILE_BYTES) return null;
    const raw = readFileSync(absPath, "utf8");
    if (raw.trim().length === 0) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readPnpmWorkspaceGlobs(repoRoot: string): string[] | null {
  const abs = join(repoRoot, "pnpm-workspace.yaml");
  if (!existsSync(abs)) return null;
  try {
    const raw = readFileSync(abs, "utf8");
    const parsed = parseYaml(raw) as { packages?: string[] } | null;
    if (parsed && Array.isArray(parsed.packages) && parsed.packages.length > 0) {
      return parsed.packages;
    }
  } catch {
    // ignore
  }
  return null;
}

function resolveWorkspaceGlobs(repoRoot: string): string[] {
  const rootPkg = readJsonIfSmall(join(repoRoot, "package.json")) as PackageJsonShape | null;
  if (rootPkg?.workspaces) {
    if (Array.isArray(rootPkg.workspaces)) return rootPkg.workspaces;
    return rootPkg.workspaces.packages ?? [];
  }
  return readPnpmWorkspaceGlobs(repoRoot) ?? [];
}

function findDsPackageDir(repoRoot: string, componentsModule: string): string | null {
  const globs = resolveWorkspaceGlobs(repoRoot);
  if (globs.length === 0) return null;
  const pkgJsonPaths = fg.sync(
    globs.map((g) => `${g}/package.json`),
    {
      cwd: repoRoot,
      absolute: true,
      onlyFiles: true,
      ignore: ["**/node_modules/**"],
    },
  );
  for (const pkgPath of pkgJsonPaths) {
    const pkg = readJsonIfSmall(pkgPath) as PackageJsonShape | null;
    if (pkg?.name === componentsModule) {
      return dirname(pkgPath);
    }
  }
  return null;
}

function findIndexFile(packageDir: string): string | null {
  for (const candidate of INDEX_CANDIDATES) {
    const abs = join(packageDir, candidate);
    if (existsSync(abs)) return abs;
  }
  return null;
}

interface ExportSurface {
  starReexports: number;
  namedReexports: number;
  namedDeclarations: number;
  exportedNames: Set<string>;
}

const STAR_REEXPORT_RE = /^\s*export\s*\*\s*(?:as\s+\w+\s*)?from\s+['"][^'"]+['"]\s*;?/gm;
const NAMED_REEXPORT_RE = /^\s*export\s*\{([^}]+)\}\s*from\s+['"][^'"]+['"]\s*;?/gm;
const NAMED_DECL_RE = /^\s*export\s+(?:const|let|var|function|class|async\s+function|default\s+function|default\s+class)\s+([A-Za-z_$][\w$]*)/gm;
const NAMED_TYPE_RE = /^\s*export\s+(?:type|interface)\s+([A-Za-z_$][\w$]*)/gm;
const NAMED_EXPORT_BLOCK_RE = /^\s*export\s*\{([^}]+)\}\s*;?/gm;

function analyseExports(content: string): ExportSurface {
  const surface: ExportSurface = {
    starReexports: 0,
    namedReexports: 0,
    namedDeclarations: 0,
    exportedNames: new Set(),
  };

  for (const _m of content.matchAll(STAR_REEXPORT_RE)) {
    surface.starReexports++;
  }

  for (const m of content.matchAll(NAMED_REEXPORT_RE)) {
    const names = (m[1] ?? "")
      .split(",")
      .map((s) => {
        const parts = s.trim().split(/\s+as\s+/);
        const surfaceName = parts.length > 1 ? parts[1] : parts[0];
        return surfaceName?.trim() ?? "";
      })
      .filter((s) => s.length > 0 && s !== "type");
    for (const n of names) surface.exportedNames.add(n);
    surface.namedReexports += names.length;
  }

  for (const m of content.matchAll(NAMED_DECL_RE)) {
    const name = m[1];
    if (name) {
      surface.exportedNames.add(name);
      surface.namedDeclarations++;
    }
  }

  for (const m of content.matchAll(NAMED_TYPE_RE)) {
    const name = m[1];
    if (name) {
      surface.exportedNames.add(name);
      surface.namedDeclarations++;
    }
  }

  for (const m of content.matchAll(NAMED_EXPORT_BLOCK_RE)) {
    const block = m[0] ?? "";
    if (/from\s+['"]/.test(block)) continue;
    const names = (m[1] ?? "")
      .split(",")
      .map((s) => {
        const parts = s.trim().split(/\s+as\s+/);
        const surfaceName = parts.length > 1 ? parts[1] : parts[0];
        return surfaceName?.trim() ?? "";
      })
      .filter((s) => s.length > 0 && s !== "type");
    for (const n of names) surface.exportedNames.add(n);
  }

  return surface;
}

const evaluate = async (
  ctx: RuleContext,
  _files: ParsedFiles,
): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  if (!ctx.repoRoot) {
    return { findings, opportunities: 0 };
  }
  if (!ctx.componentsModule) {
    return { findings, opportunities: 0 };
  }

  const packageDir = findDsPackageDir(ctx.repoRoot, ctx.componentsModule);
  if (!packageDir) {
    return { findings, opportunities: 0 };
  }

  const indexFile = findIndexFile(packageDir);
  if (!indexFile) {
    const relPkg = relative(ctx.repoRoot, packageDir) || ".";
    findings.push({
      ruleId: RULE_ID,
      axis: "ai-surface",
      severity: "warning",
      location: { file: `${relPkg}/src/index.ts`, line: 1, column: 1 },
      message: `DS package ${ctx.componentsModule} has no index entry (looked for ${INDEX_CANDIDATES.join(", ")})`,
      suggestion: "create a `src/index.ts` re-exporting your components so MCP tools and consumers have a single discoverable entry point",
    });
    return { findings, opportunities: 1 };
  }

  const relIndex = relative(ctx.repoRoot, indexFile);
  let content: string;
  try {
    content = readFileSync(indexFile, "utf8");
  } catch {
    return { findings, opportunities: 1 };
  }

  const surface = analyseExports(content);
  const totalExports = surface.exportedNames.size + surface.starReexports;
  // Counts star re-exports as opaque "≥1 export" — combine with named.
  const hasAnyExport = totalExports > 0;
  if (!hasAnyExport) {
    findings.push({
      ruleId: RULE_ID,
      axis: "ai-surface",
      severity: "warning",
      location: { file: relIndex, line: 1, column: 1 },
      message: `DS index ${relIndex} has no \`export\` statements`,
      suggestion: "add `export * from './components'` or named re-exports so the package surface is discoverable",
    });
    return { findings, opportunities: 1 };
  }

  // Star re-exports are treated as opaque but valid — assume they re-export
  // a meaningful number of names, so we don't flag star-only indexes.
  if (surface.starReexports === 0 && surface.exportedNames.size < MIN_NAMED_EXPORTS) {
    findings.push({
      ruleId: RULE_ID,
      axis: "ai-surface",
      severity: "warning",
      location: { file: relIndex, line: 1, column: 1 },
      message: `DS index ${relIndex} exports only ${surface.exportedNames.size} name(s); ≥${MIN_NAMED_EXPORTS} expected for a meaningful DS surface`,
      suggestion: "re-export at least 3 distinct components/utilities or use `export * from ...` to surface multiple modules at once",
    });
  }

  return { findings, opportunities: 1 };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "ai-surface",
    lyseRuleId: RULE_ID,
    defaultSeverity: "warning",
    shortDescription: "DS package must export a discoverable index entry",
    fullDescription:
      "When `ctx.componentsModule` is configured (or auto-detected) and resolves to a workspace package, verifies that the package has an `src/index.ts` (or `src/index.tsx` / `index.ts` / `index.tsx`) file containing `export` statements (named, type, or `export * from`), with a meaningful surface (≥3 distinct named exports unless `export * from` is used). Rule is N/A when no DS module is configured or when the module is an external library (not a workspace package).",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/ai-surface-ds-index-exported.md",
    rationale: `Why it matters

A single, discoverable index entry point is the contract surface for MCP servers, code-connect tools, and humans alike. Without it, agents and IDEs must page through arbitrary file structures, guessing at where \`Button\` lives.

The rule is intentionally conservative: it accepts \`export * from './components'\` as an opaque-but-valid surface (we don't recursively follow it) and requires ≥3 distinct named exports only when no star re-exports are present. This avoids false positives on packages that legitimately re-export a single barrel module.

When the configured DS module is external (e.g., \`@mui/material\`), the rule is N/A — there's nothing in the user's repo to fix.`,
    examples: [
      {
        good: "// packages/ui/src/index.ts\\nexport { Button } from './button';\\nexport { Card } from './card';\\nexport { Modal } from './modal';",
        bad: "// packages/ui/src/index.ts is missing entirely",
      },
      {
        good: "// packages/ui/src/index.ts\\nexport * from './components';",
        bad: "// packages/ui/src/index.ts\\nconst internal = 1;",
      },
    ],
    allowlist: [
      "external libraries (componentsModule not resolvable to a workspace package) — rule is N/A",
      "repos with no `componentsModule` configured or auto-detected — rule is N/A",
      "indexes using `export * from ...` — accepted without counting named exports",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = {
  analyseExports,
  findDsPackageDir,
  findIndexFile,
  INDEX_CANDIDATES,
  MIN_NAMED_EXPORTS,
};
