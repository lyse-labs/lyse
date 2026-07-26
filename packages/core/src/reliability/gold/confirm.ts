import postcss from "postcss";
import postcssScss from "postcss-scss";
import type { Container, Declaration, Document, Root, Rule } from "postcss";
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

function normalizeSelector(selector: string): string {
  return selector.replace(/\s+/g, " ").trim();
}

// The selector of the nearest enclosing rule for a declaration, so Gate A can
// scope its parent-side search to the SAME rule the candidate changed rather
// than the whole file.
function enclosingSelector(decl: Declaration): string | undefined {
  let node: Container | Document | undefined = decl.parent;
  while (node !== undefined) {
    if (node.type === "rule") return (node as Rule).selector;
    node = node.parent;
  }
  return undefined;
}

// Gate A (CSS/SCSS): the removed literal and the added ref must occupy the
// SAME declaration property WITHIN THE SAME rule/selector. Find the child
// property whose value carries the ref (pinned to `c.line` when the ref
// appears more than once), capture its selector, then require the PARENT's
// rule with that same selector to carry the literal in that property. A
// same-property/same-literal in a different, unrelated rule must NOT satisfy
// Gate A, and a "tangled" change (literal removed from one property, ref
// added to another) fails here too.
function gateAStructuralCss(
  childSource: string,
  parentSource: string,
  c: CandidateChange,
): boolean {
  const childRoot = parseRoot(childSource, c.file);
  const parentRoot = parseRoot(parentSource, c.file);
  if (childRoot === null || parentRoot === null) return false;

  const refBearing: Array<{ decl: Declaration; line: number }> = [];
  childRoot.walkDecls((decl) => {
    if (decl.value.includes(c.addedRef)) {
      refBearing.push({ decl, line: decl.source?.start?.line ?? -1 });
    }
  });

  let target: Declaration | undefined;
  if (refBearing.length === 1) {
    target = refBearing[0]?.decl;
  } else if (refBearing.length > 1) {
    const atLine = refBearing.filter((entry) => entry.line === c.line);
    if (atLine.length === 1) target = atLine[0]?.decl;
  }
  if (target === undefined) return false;

  const prop = target.prop;
  const selector = enclosingSelector(target);
  if (selector === undefined) return false;
  const wantSelector = normalizeSelector(selector);

  const needle = c.removedLiteral.toLowerCase();
  let parentCarriedLiteral = false;
  parentRoot.walkRules((rule) => {
    if (normalizeSelector(rule.selector) !== wantSelector) return;
    rule.walkDecls((decl) => {
      if (decl.prop === prop && decl.value.toLowerCase().includes(needle)) {
        parentCarriedLiteral = true;
      }
    });
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
// candidate's line binds the ref, and the PARENT line at the corresponding
// position binds the literal under the SAME left-hand side. Both sides are
// line-pinned: the child to `c.line`, the parent to `c.line` and its immediate
// neighbours (a `-U0` modify pair keeps the changed line's index stable, so the
// prior value sits at `c.line` or ±1). Scanning the whole parent file would let
// an unrelated same-named binding elsewhere satisfy the gate.
function gateAStructuralJs(
  childSource: string,
  parentSource: string,
  c: CandidateChange,
): boolean {
  const childLines = childSource.split("\n");
  const childLine = childLines[c.line - 1];
  if (childLine === undefined) return false;
  const childDecl = extractLhs(childLine);
  if (childDecl === null || !childDecl.rhs.includes(c.addedRef)) return false;

  const needle = c.removedLiteral.toLowerCase();
  const parentLines = parentSource.split("\n");
  for (const idx of [c.line - 2, c.line - 1, c.line]) {
    const line = parentLines[idx];
    if (line === undefined) continue;
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

async function gitGrepFiles(
  repoDir: string,
  commit: string,
  fixed: string,
  pathspecs: string[],
  wholeWord = false,
): Promise<string[]> {
  try {
    const args = ["grep", "--no-color", "-l", "-I", "-F"];
    if (wholeWord) args.push("-w");
    args.push("-e", fixed, commit, "--", ...pathspecs);
    const out = await git(args, repoDir);
    const prefix = `${commit}:`;
    return out
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => (line.startsWith(prefix) ? line.slice(prefix.length) : line));
  } catch {
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
// pure in-repo. In-repo multi-definition disambiguation is handled HERE: the
// FIRST segment of `A.b(.c)` scopes resolution to files that also name the
// owning object `A`, and `gateBValueMatch` fails closed if the surviving
// definitions still disagree.
async function resolveJsTokenValues(
  repoDir: string,
  commit: string,
  memberExpr: string,
): Promise<string[]> {
  const segments = memberExpr.split(".");
  const key = segments[segments.length - 1];
  const firstSegment = segments[0];
  if (key === undefined || key.length === 0) return [];

  const keyFiles = await gitGrepFiles(repoDir, commit, key, JS_TOKEN_PATHSPECS);
  if (keyFiles.length === 0) return [];

  let files = keyFiles;
  if (
    segments.length > 1 &&
    firstSegment !== undefined &&
    firstSegment.length > 0 &&
    firstSegment !== key
  ) {
    const ownerFiles = await gitGrepFiles(repoDir, commit, firstSegment, JS_TOKEN_PATHSPECS, true);
    const scoped = keyFiles.filter((file) => ownerFiles.includes(file));
    if (scoped.length > 0) files = scoped;
  }

  // Also match quoted-JSON keys (`"orange400": "#..."`) — `*.json` token files
  // are in scope, and the disagreement gate keeps the broadening safe.
  const defRe = new RegExp(
    `(?:^|[^\\w$])["']?${escapeRegExp(key)}["']?\\s*[:=]\\s*["']([^"']+)["']`,
  );
  const values: string[] = [];
  for (const file of files) {
    const source = await gitShowFile(repoDir, commit, file);
    for (const line of source.split("\n")) {
      const value = defRe.exec(line)?.[1];
      if (value !== undefined) values.push(value.trim());
    }
  }
  return values;
}

// Gate B value agreement. `colorEquals(v, v)` doubles as a parseability probe
// (a value with no colour identity fails to equal itself), keeping every
// colour judgement on the single independent primitive. Resolution must be
// UNAMBIGUOUS: zero resolved colours -> unresolved; resolved colours that
// disagree -> fail closed (mirroring walk.ts's `ambiguousKeys` discipline —
// never accept-on-any-match); only a unanimous colour that also equals the
// removed literal passes.
function gateBValueMatch(resolved: string[], literal: string): boolean {
  const colours = resolved.filter((value) => colorEquals(value, value));
  const first = colours[0];
  if (first === undefined) return false;
  for (const colour of colours) {
    if (!colorEquals(colour, first)) return false;
  }
  return colorEquals(first, literal);
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
  if (!gateBValueMatch(values, c.removedLiteral)) return null;

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
