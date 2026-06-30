import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import fg from "fast-glob";
import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
import type { TraverseOptions } from "@babel/traverse";
import type * as t from "@babel/types";
import { measureKindOf } from "./rule-measure-kind.js";
import type { FindingRow } from "./finding-row.js";

export type Label = { verdict: "tp" | "fp"; source: "auto"; reason: string };

// Repo-level verifier: given repoDir, returns true if the artifact is genuinely
// ABSENT (i.e. the structural finding is a true positive).
type Verifier = (repoDir: string) => boolean;

// Row-aware verifier: re-derives the verdict from the individual finding row.
// Returns a Label directly (tp/fp/needs-verifier).
type RowAwareVerifier = (row: FindingRow, repoDir: string) => Label;

type TraverseFn = (ast: t.Node, opts: TraverseOptions) => void;
const traverse = (
  (_traverse as unknown as { default: TraverseFn }).default ??
  (_traverse as unknown as TraverseFn)
);

// ── helpers ──────────────────────────────────────────────────────────────────

const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

const VERSION_HEADING_RE = /^#{1,3}\s*\[?v?\d+\.\d+(\.\d+)?/m;

const CHANGELOG_CANDIDATES = [
  "CHANGELOG.md",
  "CHANGELOG",
  "CHANGELOG.mdx",
  "changelog.md",
  "HISTORY.md",
  "CHANGES.md",
  "docs/CHANGELOG.md",
];

const MCP_CONFIG_CANDIDATES = [".mcp.json", ".cursor/mcp.json", "claude_desktop_config.json"];

const AGENTS_CANDIDATES = ["AGENTS.md", ".github/AGENTS.md", "docs/AGENTS.md"];

const GUIDE_FILE_RE = /^(migrat|migrating|upgrad|upgrading|upgrade)[\w.-]*\.mdx?$/i;
const GUIDE_STEM_RE = /^(migration|migrating|upgrade|upgrading|migrate)$/i;
const GUIDE_HEADING_RE = /^#{1,4}\s+.*\b(migrat(e|ion|ing)|upgrad(e|ing))\b/im;
const DOC_DIRS = ["docs", "doc", "documentation", ".github"];

function readSmall(absPath: string, maxBytes = 2_000_000): string | null {
  try {
    const stat = statSync(absPath);
    if (!stat.isFile() || stat.size > maxBytes) return null;
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

// ── per-rule verifiers (absent = tp) ─────────────────────────────────────────

function manifestAbsent(repoDir: string): boolean {
  const candidates = [
    "components.json",
    "lyse.components.json",
  ];
  // Also check apps/* and packages/* sub-trees (first-level only, cheap).
  for (const base of ["apps", "packages"]) {
    const baseDir = join(repoDir, base);
    for (const sub of listDir(baseDir)) {
      candidates.push(`${base}/${sub}/components.json`);
      candidates.push(`${base}/${sub}/lyse.components.json`);
    }
  }
  for (const rel of candidates) {
    const abs = join(repoDir, rel);
    if (!existsSync(abs)) continue;
    // Confirm it is not a shadcn-config components.json.
    try {
      const raw = readSmall(abs);
      if (raw === null) continue;
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null) continue;
      const obj = parsed as Record<string, unknown>;
      // shadcn/ui: has $schema pointing to shadcn or has `aliases` without `components`.
      if (typeof obj.$schema === "string" && obj.$schema.includes("shadcn")) continue;
      if (typeof obj.aliases === "object" && obj.aliases !== null && !("components" in obj)) continue;
      // Lyse-style manifest present.
      return false;
    } catch {
      continue;
    }
  }
  return true;
}

function changelogAbsent(repoDir: string): boolean {
  for (const candidate of CHANGELOG_CANDIDATES) {
    const content = readSmall(join(repoDir, candidate));
    if (content !== null && VERSION_HEADING_RE.test(content)) return false;
  }
  return true;
}

function semverAbsent(repoDir: string): boolean {
  const pkgPath = join(repoDir, "package.json");
  const raw = readSmall(pkgPath);
  if (raw === null) return true;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return true;
    const pkg = parsed as { version?: unknown };
    if (typeof pkg.version === "string" && SEMVER_RE.test(pkg.version.trim())) return false;
  } catch {
    return true;
  }
  return true;
}

function isGuideFilename(name: string): boolean {
  if (GUIDE_FILE_RE.test(name)) return true;
  const dot = name.lastIndexOf(".");
  const stem = dot === -1 ? name : name.slice(0, dot);
  return GUIDE_STEM_RE.test(stem);
}

function migrationAbsent(repoDir: string): boolean {
  // Root-level migration file.
  if (listDir(repoDir).some(isGuideFilename)) return false;
  // In docs dirs.
  for (const dir of DOC_DIRS) {
    const abs = join(repoDir, dir);
    if (!existsSync(abs)) continue;
    if (listDir(abs).some(isGuideFilename)) return false;
  }
  // Migration section in CHANGELOG or README.
  const docsToScan = [
    "CHANGELOG.md",
    "CHANGELOG",
    "HISTORY.md",
    "CHANGES.md",
    "README.md",
    "README",
    "README.mdx",
  ];
  for (const candidate of docsToScan) {
    const content = readSmall(join(repoDir, candidate));
    if (content !== null && GUIDE_HEADING_RE.test(content)) return false;
  }
  return true;
}

function mcpConfigAbsent(repoDir: string): boolean {
  for (const candidate of MCP_CONFIG_CANDIDATES) {
    if (existsSync(join(repoDir, candidate))) return false;
  }
  return true;
}

function llmsTxtAbsent(repoDir: string): boolean {
  return !existsSync(join(repoDir, "llms.txt"));
}

function agentsMdAbsent(repoDir: string): boolean {
  for (const candidate of AGENTS_CANDIDATES) {
    if (existsSync(join(repoDir, candidate))) return false;
  }
  return true;
}

// ── props-documented row-aware verifier ──────────────────────────────────────

const PROPS_DOC_COMPONENT_RE = /DS component <([^>]+)>/;

/**
 * Parse a story source file and return whether it documents any props:
 * true if argTypes present OR any named story has non-empty args.
 * Returns null on parse failure.
 */
function storyDocumentsProps(src: string): boolean | null {
  let ast: t.File;
  try {
    ast = parse(src, {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
      errorRecovery: true,
    });
  } catch {
    return null;
  }

  let hasArgTypes = false;
  let hasArgs = false;

  try {
    traverse(ast, {
      ExportDefaultDeclaration(path) {
        const decl = path.node.declaration;
        if (decl.type !== "ObjectExpression") return;
        for (const prop of (decl as t.ObjectExpression).properties) {
          if (prop.type !== "ObjectProperty") continue;
          const key = (prop as t.ObjectProperty).key;
          if (key.type === "Identifier" && (key as t.Identifier).name === "argTypes") {
            hasArgTypes = true;
          }
        }
      },
      ExportNamedDeclaration(path) {
        const decl = path.node.declaration;
        if (!decl || decl.type !== "VariableDeclaration") return;
        for (const declarator of (decl as t.VariableDeclaration).declarations) {
          const init = declarator.init;
          if (!init || init.type !== "ObjectExpression") continue;
          for (const prop of (init as t.ObjectExpression).properties) {
            if (prop.type !== "ObjectProperty") continue;
            const key = (prop as t.ObjectProperty).key;
            if (key.type === "Identifier" && (key as t.Identifier).name === "args") {
              const val = (prop as t.ObjectProperty).value;
              if (val.type === "ObjectExpression" && (val as t.ObjectExpression).properties.length > 0) {
                hasArgs = true;
              }
            }
          }
        }
      },
    });
  } catch {
    // partial parse is fine
  }

  return hasArgTypes || hasArgs;
}

/**
 * Parse a component source file and return whether the named component has any
 * extractable props (non-empty prop type members). Returns null on parse failure.
 */
function componentHasProps(componentName: string, src: string): boolean | null {
  let ast: t.File;
  try {
    ast = parse(src, {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
      errorRecovery: true,
    });
  } catch {
    return null;
  }

  const typeDeclarations = new Map<string, t.TSTypeElement[]>();
  let propsTypeRef: string | undefined;
  let hasInlineProps = false;

  try {
    traverse(ast, {
      TSInterfaceDeclaration(path) {
        typeDeclarations.set(path.node.id.name, path.node.body.body);
      },
      TSTypeAliasDeclaration(path) {
        const ann = path.node.typeAnnotation;
        if (ann.type === "TSTypeLiteral") {
          typeDeclarations.set(path.node.id.name, (ann as t.TSTypeLiteral).members);
        }
      },
    });

    const checkParams = (params: t.Node[]): void => {
      if (params.length === 0) return;
      const first = params[0]!;
      if (
        first.type === "Identifier" &&
        (first as t.Identifier).typeAnnotation?.type === "TSTypeAnnotation"
      ) {
        const ann = ((first as t.Identifier).typeAnnotation as t.TSTypeAnnotation).typeAnnotation;
        if (ann.type === "TSTypeLiteral") {
          if ((ann as t.TSTypeLiteral).members.length > 0) hasInlineProps = true;
        } else if (ann.type === "TSTypeReference") {
          const refName = (ann as t.TSTypeReference).typeName;
          if (refName.type === "Identifier") propsTypeRef = (refName as t.Identifier).name;
        }
      } else if (first.type === "ObjectPattern") {
        const typeAnn = (first as t.ObjectPattern).typeAnnotation;
        const ann =
          typeAnn?.type === "TSTypeAnnotation" ? typeAnn.typeAnnotation : undefined;
        if (ann?.type === "TSTypeLiteral") {
          if ((ann as t.TSTypeLiteral).members.length > 0) hasInlineProps = true;
        } else if (ann?.type === "TSTypeReference") {
          const refName = (ann as t.TSTypeReference).typeName;
          if (refName.type === "Identifier") propsTypeRef = (refName as t.Identifier).name;
        }
      }
    };

    traverse(ast, {
      FunctionDeclaration(path) {
        if (path.node.id?.name !== componentName) return;
        checkParams(path.node.params as t.Node[]);
      },
      VariableDeclarator(path) {
        const id = path.node.id;
        if (id.type !== "Identifier" || (id as t.Identifier).name !== componentName) return;
        const init = path.node.init;
        if (!init) return;
        if (init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression") {
          checkParams((init as t.ArrowFunctionExpression | t.FunctionExpression).params as t.Node[]);
        }
      },
    });
  } catch {
    return null;
  }

  if (hasInlineProps) return true;
  if (propsTypeRef !== undefined) {
    const members = typeDeclarations.get(propsTypeRef);
    if (members !== undefined) return members.length > 0;
    // Cross-file reference — assume it may have props (conservative)
    return true;
  }
  return false;
}

/**
 * Row-aware verifier for stories/props-documented.
 *
 * Re-derives the verdict independently from the corpus finding:
 * 1. Extract component name from the finding message.
 * 2. Find the story file for that component in repoDir.
 * 3. Re-parse the story to confirm it documents no props (no argTypes, no args).
 * 4. Find the component source file and confirm it has extractable props.
 *
 * Genuine deficiency (story has no docs + component has props) → tp.
 * Story actually documents props OR component is prop-less → fp.
 * Cannot determine (no story file, no component file, parse fail) → needs-verifier.
 */
function propsDocumentedVerifier(row: FindingRow, repoDir: string): Label {
  const msg = row.message ?? "";
  const match = PROPS_DOC_COMPONENT_RE.exec(msg);
  if (match === null || !match[1]) {
    return { verdict: "fp", source: "auto", reason: "needs-verifier" };
  }
  const componentName = match[1];

  // Find story file(s) for this component synchronously using a glob pattern.
  const storyGlobs = [
    `**/${componentName}.stories.{ts,tsx,js,jsx}`,
    `**/${componentName}.story.{ts,tsx,js,jsx}`,
  ];
  const storyFiles: string[] = [];
  for (const pattern of storyGlobs) {
    try {
      const found = fg.sync(pattern, { cwd: repoDir, absolute: true, ignore: ["**/node_modules/**"] });
      storyFiles.push(...found);
    } catch {
      // ignore
    }
  }

  if (storyFiles.length === 0) {
    return { verdict: "fp", source: "auto", reason: "needs-verifier" };
  }

  const storyFile = storyFiles[0]!;
  let storySrc: string;
  try {
    storySrc = readFileSync(storyFile, "utf8");
  } catch {
    return { verdict: "fp", source: "auto", reason: "needs-verifier" };
  }

  const storyDocs = storyDocumentsProps(storySrc);
  if (storyDocs === null) {
    return { verdict: "fp", source: "auto", reason: "needs-verifier" };
  }
  if (storyDocs) {
    return { verdict: "fp", source: "auto", reason: "props-documented: story has argTypes or args (rule mis-fired)" };
  }

  // Story confirms no docs. Now verify component actually has props.
  const compGlobs = [
    `**/${componentName}.{ts,tsx,js,jsx}`,
  ];
  const compFiles: string[] = [];
  for (const pattern of compGlobs) {
    try {
      const found = fg.sync(pattern, {
        cwd: repoDir,
        absolute: true,
        ignore: ["**/node_modules/**", "**/*.stories.*", "**/*.story.*", "**/*.test.*", "**/*.spec.*"],
      });
      compFiles.push(...found);
    } catch {
      // ignore
    }
  }

  if (compFiles.length === 0) {
    return { verdict: "fp", source: "auto", reason: "needs-verifier" };
  }

  const compFile = compFiles[0]!;
  let compSrc: string;
  try {
    compSrc = readFileSync(compFile, "utf8");
  } catch {
    return { verdict: "fp", source: "auto", reason: "needs-verifier" };
  }

  const hasProps = componentHasProps(componentName, compSrc);
  if (hasProps === null) {
    return { verdict: "fp", source: "auto", reason: "needs-verifier" };
  }
  if (!hasProps) {
    return { verdict: "fp", source: "auto", reason: "props-documented: prop-less component (rule should not have fired)" };
  }

  return {
    verdict: "tp",
    source: "auto",
    reason: "props-documented: component has props AND story documents none",
  };
}

// ── verifier table ───────────────────────────────────────────────────────────

// Repo-level entry: [verifier, tp-reason, fp-reason, qualityRule?]
// qualityRule=true: file present does NOT prove fp — quality verdict cannot be
// independently verified cheaply, so route to needs-verifier instead.
type VerifierEntry = [Verifier, string, string, true?];

// Row-aware entry: a function that receives the full FindingRow and repoDir and
// returns a Label directly (used for rules where the verdict depends on the
// individual finding, not just the repo's file system state).
type RowAwareEntry = { rowAware: RowAwareVerifier };

const VERIFIERS: Record<string, VerifierEntry | RowAwareEntry> = {
  "ai-surface/component-manifest-json": [
    manifestAbsent,
    "presence-check: component manifest absent",
    "presence-check: component manifest found (rule fired incorrectly)",
  ],
  "ai-surface/agents-md-quality": [
    agentsMdAbsent,
    "presence-check: AGENTS.md absent",
    "needs-verifier",
    true,
  ],
  "ai-surface/llms-txt-structure": [
    llmsTxtAbsent,
    "presence-check: llms.txt absent",
    "needs-verifier",
    true,
  ],
  "ai-surface/mcp-config-present": [
    mcpConfigAbsent,
    "presence-check: MCP config absent",
    "presence-check: MCP config found (rule fired incorrectly)",
  ],
  "versioning/changelog-present": [
    changelogAbsent,
    "presence-check: structured CHANGELOG absent",
    "presence-check: structured CHANGELOG found (rule fired incorrectly)",
  ],
  "versioning/semver-versioning": [
    semverAbsent,
    "presence-check: no valid semver in package.json",
    "presence-check: valid semver found in package.json (rule fired incorrectly)",
  ],
  "versioning/migration-guide-present": [
    migrationAbsent,
    "presence-check: migration guide absent",
    "presence-check: migration guide found (rule fired incorrectly)",
  ],
  "stories/props-documented": { rowAware: propsDocumentedVerifier },
};

// ── public API ────────────────────────────────────────────────────────────────

export function autoLabel(row: FindingRow, repoDir: string): Label {
  const kind = measureKindOf(row.ruleId);
  if (kind !== "structural") {
    throw new Error(
      `autoLabel only accepts structural rules; "${row.ruleId}" is "${kind}"`,
    );
  }

  const entry = VERIFIERS[row.ruleId];
  if (entry === undefined) {
    return { verdict: "fp", source: "auto", reason: "needs-verifier" };
  }

  // Row-aware verifier: delegate entirely.
  if ("rowAware" in entry) {
    return entry.rowAware(row, repoDir);
  }

  const [verifier, tpReason, fpReason, qualityRule] = entry;
  const absent = verifier(repoDir);
  if (absent) return { verdict: "tp", source: "auto", reason: tpReason };
  if (qualityRule) return { verdict: "fp", source: "auto", reason: "needs-verifier" };
  return { verdict: "fp", source: "auto", reason: fpReason };
}
