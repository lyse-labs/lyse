import postcss from "postcss";
import postcssScss from "postcss-scss";
import type { Root } from "postcss";
import { colorEquals } from "./color-eq.js";
import { git, gitShowFile } from "./git.js";
import type { GoldLabel } from "./types.js";
import type { CandidateChange } from "./walk.js";

const CSS_EXT = /\.(?:css|scss)$/i;
const SCSS_EXT = /\.scss$/i;
const JS_EXT = /\.(?:ts|tsx|js|jsx)$/i;
const VAR_REF_RE = /var\(\s*(--[\w-]+)/;

const JS_LHS_RES = [
  /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(.*)$/,
  /^\s*([A-Za-z_$][\w$.]*)\s*=\s*(.*)$/,
  /^\s*([A-Za-z_$][\w$]*)\s*:\s*(.*)$/,
];

const CSS_PATHSPECS = ["*.css", "*.scss"];
const JS_TOKEN_PATHSPECS = ["*.ts", "*.tsx", "*.js", "*.jsx", "*.json"];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseRoot(source: string, path: string): Root | null {
  try {
    return SCSS_EXT.test(path) ? postcssScss.parse(source) : postcss.parse(source);
  } catch {
    return null;
  }
}

// Gate A (CSS/SCSS): the removed literal and the added ref must occupy the
// SAME declaration property. Find the child property whose value carries the
// ref, then require the parent's declaration of THAT property to have carried
// the literal — a "tangled" change (literal removed from one property, ref
// added to another) fails here.
function gateAStructuralCss(
  childSource: string,
  parentSource: string,
  c: CandidateChange,
): boolean {
  const childRoot = parseRoot(childSource, c.file);
  const parentRoot = parseRoot(parentSource, c.file);
  if (childRoot === null || parentRoot === null) return false;

  const refBearing: Array<{ prop: string; line: number }> = [];
  childRoot.walkDecls((decl) => {
    if (decl.value.includes(c.addedRef)) {
      refBearing.push({ prop: decl.prop, line: decl.source?.start?.line ?? -1 });
    }
  });

  let prop: string | undefined;
  if (refBearing.length === 1) {
    prop = refBearing[0]?.prop;
  } else if (refBearing.length > 1) {
    const atLine = refBearing.filter((entry) => entry.line === c.line);
    if (atLine.length === 1) prop = atLine[0]?.prop;
  }
  if (prop === undefined) return false;

  const needle = c.removedLiteral.toLowerCase();
  let parentCarriedLiteral = false;
  parentRoot.walkDecls((decl) => {
    if (decl.prop === prop && decl.value.toLowerCase().includes(needle)) {
      parentCarriedLiteral = true;
    }
  });
  return parentCarriedLiteral;
}

function extractLhs(line: string): { lhs: string; rhs: string } | null {
  for (const re of JS_LHS_RES) {
    const match = re.exec(line);
    const lhs = match?.[1];
    const rhs = match?.[2];
    if (lhs !== undefined && rhs !== undefined) return { lhs, rhs };
  }
  return null;
}

// Gate A (JS/TS): lightweight same-assignment check — the child line at the
// candidate's line binds the ref, and a parent line with the SAME left-hand
// side bound the literal. Pinning by `c.line` disambiguates a token reused
// across several declarations (e.g. base.amber300 on two lines).
function gateAStructuralJs(
  childSource: string,
  parentSource: string,
  c: CandidateChange,
): boolean {
  const childLine = childSource.split("\n")[c.line - 1];
  if (childLine === undefined) return false;
  const childDecl = extractLhs(childLine);
  if (childDecl === null || !childDecl.rhs.includes(c.addedRef)) return false;

  const needle = c.removedLiteral.toLowerCase();
  for (const line of parentSource.split("\n")) {
    const parentDecl = extractLhs(line);
    if (
      parentDecl !== null &&
      parentDecl.lhs === childDecl.lhs &&
      parentDecl.rhs.toLowerCase().includes(needle)
    ) {
      return true;
    }
  }
  return false;
}

async function gitGrep(
  repoDir: string,
  commit: string,
  fixed: string,
  pathspecs: string[],
): Promise<string[]> {
  try {
    const out = await git(
      ["grep", "--no-color", "-h", "-I", "-F", "-e", fixed, commit, "--", ...pathspecs],
      repoDir,
    );
    return out.split("\n").filter((line) => line.length > 0);
  } catch {
    // `git grep` exits non-zero (throws here) when nothing matches.
    return [];
  }
}

async function resolveCssVarValues(
  repoDir: string,
  commit: string,
  varName: string,
): Promise<string[]> {
  if (varName.length === 0) return [];
  const lines = await gitGrep(repoDir, commit, varName, CSS_PATHSPECS);
  const defRe = new RegExp(`(?:^|[^\\w-])${escapeRegExp(varName)}\\s*:\\s*([^;}\\n]+)`);
  const values: string[] = [];
  for (const line of lines) {
    const value = defRe.exec(line)?.[1];
    if (value !== undefined) values.push(value.trim());
  }
  return values;
}

// External-package tokens (e.g. primer/css or canvas-kit values shipped in npm
// packages) are OUT OF SCOPE here: the in-repo resolver returns [] for them and
// confirm fails closed. Task 7 (orchestrator) materializes the pinned corpus
// token values into the checkout before calling confirm, keeping this resolver
// pure in-repo.
async function resolveJsTokenValues(
  repoDir: string,
  commit: string,
  memberExpr: string,
): Promise<string[]> {
  const segments = memberExpr.split(".");
  const key = segments[segments.length - 1];
  if (key === undefined || key.length === 0) return [];
  const lines = await gitGrep(repoDir, commit, key, JS_TOKEN_PATHSPECS);
  const defRe = new RegExp(`(?:^|[^\\w$])${escapeRegExp(key)}\\s*[:=]\\s*["']([^"']+)["']`);
  const values: string[] = [];
  for (const line of lines) {
    const value = defRe.exec(line)?.[1];
    if (value !== undefined) values.push(value.trim());
  }
  return values;
}

export async function confirmCandidate(
  repoDir: string,
  c: CandidateChange,
): Promise<GoldLabel | null> {
  const childSource = await gitShowFile(repoDir, c.commit, c.file);
  const parentSource = await gitShowFile(repoDir, c.parent, c.file);
  if (childSource.length === 0 || parentSource.length === 0) return null;

  let structural: boolean;
  if (JS_EXT.test(c.file)) {
    structural = gateAStructuralJs(childSource, parentSource, c);
  } else if (CSS_EXT.test(c.file)) {
    structural = gateAStructuralCss(childSource, parentSource, c);
  } else {
    structural = false;
  }
  if (!structural) return null;

  const values = c.addedRef.startsWith("var(")
    ? await resolveCssVarValues(repoDir, c.commit, VAR_REF_RE.exec(c.addedRef)?.[1] ?? "")
    : await resolveJsTokenValues(repoDir, c.commit, c.addedRef);
  if (!values.some((value) => colorEquals(value, c.removedLiteral))) return null;

  return {
    repo: c.repo,
    commit: c.commit,
    parent: c.parent,
    file: c.file,
    line: c.line,
    literal: c.removedLiteral,
    expectedToken: c.addedRef,
    axis: "colors",
    ruleId: "tokens/no-hardcoded-color",
  };
}
