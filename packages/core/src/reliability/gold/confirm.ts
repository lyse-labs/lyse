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

// Injected, authoritative resolver for the added token's value(s) at `commit`.
// Task 7 composes it (pinned corpus value first, else the built-in in-repo CSS
// resolver). An empty array means "unresolved" — Gate B then fails closed.
export type ResolveTokenValue = (ref: string, commit: string) => Promise<string[]>;

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

// Remove JS/TS comments from a single line's RHS so the removed literal cannot
// be satisfied by text that only appears in a comment (`base.old; //'#FD7E00'`
// or `base.old /* #FD7E00 */`). Quote-aware: a `//` or `/*` inside a string
// literal is NOT a comment start. An unterminated block comment strips to EOL.
function stripJsLineComments(value: string): string {
  let out = "";
  let quote = "";
  for (let i = 0; i < value.length; i++) {
    const ch = value.charAt(i);
    if (quote) {
      out += ch;
      if (ch === "\\") {
        const next = value.charAt(i + 1);
        if (next.length > 0) {
          out += next;
          i++;
        }
      } else if (ch === quote) {
        quote = "";
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === "/" && value.charAt(i + 1) === "/") break;
    if (ch === "/" && value.charAt(i + 1) === "*") {
      const end = value.indexOf("*/", i + 2);
      if (end === -1) break;
      i = end + 1;
      // A block comment is whitespace: collapse it to a single space so
      // fragments on either side (`#FD7E/* x */00`) cannot fuse (`#FD7E00`).
      out += " ";
      continue;
    }
    out += ch;
  }
  return out;
}

// Gate A (JS/TS): key on the diff's OWN ground truth — the exact old-file line
// of the removed declaration (`c.parentLine`) and the new-file line of the added
// declaration (`c.line`). No whole-file scan, no scope inference. Read those two
// lines directly and require (comments stripped on both):
//   - the PARENT line to bind the SAME left-hand side AND carry `removedLiteral`;
//   - the CHILD line to bind that same left-hand side AND carry `addedRef`.
// Same LHS on both lines = the same declaration slot. Because the lines come
// from the diff's real `-a` / `+c` numbering, this is immune to the collisions
// that broke the old scope heuristics: two same-header `useEffect` blocks, a
// module-scope `var` redeclaration, or any same-name declaration elsewhere in
// the file are simply never read. A literal that survives only inside a comment
// on the parent line is stripped away, so it cannot satisfy the check.
function gateAStructuralJs(
  childSource: string,
  parentSource: string,
  c: CandidateChange,
): boolean {
  const childRaw = childSource.split("\n")[c.line - 1];
  const parentRaw = parentSource.split("\n")[c.parentLine - 1];
  if (childRaw === undefined || parentRaw === undefined) return false;

  const childDecl = extractLhs(stripJsLineComments(childRaw));
  const parentDecl = extractLhs(stripJsLineComments(parentRaw));
  if (childDecl === null || parentDecl === null) return false;
  if (childDecl.lhs !== parentDecl.lhs) return false;
  if (!childDecl.rhs.includes(c.addedRef)) return false;
  return parentDecl.rhs.toLowerCase().includes(c.removedLiteral.toLowerCase());
}

async function gitGrepFiles(
  repoDir: string,
  commit: string,
  fixed: string,
  pathspecs: string[],
): Promise<string[]> {
  try {
    const args = ["grep", "--no-color", "-l", "-I", "-F", "-e", fixed, commit, "--", ...pathspecs];
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

// Resolve a `--x` custom property in-repo at `commit`. A raw-text grep cannot
// tell a live definition from a commented-out one (`// --x: #f00;` or
// `/* --x: #f00 */`), so both would fabricate a match. Parse each candidate file
// with PostCSS (postcss-scss for `.scss`, as Gate A does) and read real
// `Declaration` nodes only — comments are Comment nodes and are excluded. The
// unanimous-agreement discipline lives in `gateBValueMatch` (zero -> unresolved;
// disagreement -> fail closed).
async function resolveCssVarValues(
  repoDir: string,
  commit: string,
  varName: string,
): Promise<string[]> {
  if (varName.length === 0) return [];
  const files = await gitGrepFiles(repoDir, commit, varName, CSS_PATHSPECS);
  const values: string[] = [];
  for (const file of files) {
    const source = await gitShowFile(repoDir, commit, file);
    if (source.length === 0) continue;
    const root = parseRoot(source, file);
    if (root === null) continue;
    root.walkDecls((decl) => {
      if (decl.prop === varName) values.push(decl.value.trim());
    });
  }
  return values;
}

// Built-in Gate B resolver, exported so Task 7 can compose it behind its own
// pinned-value-first `resolveTokenValue`. A `var(--x)` ref resolves to its
// in-repo `--x` declaration value(s) at `commit` (comment-safe, PostCSS).
// Anything else — a JS/TS member access (`base.orange400`) or a bare
// identifier — has NO sound in-repo source (real JS/TS tokens are external-npm),
// so it returns [] and confirm fails closed unless an injected pinned value is
// supplied. In-repo JS/TS object-literal scraping is deliberately NOT done: it
// adds no real capability (real refs are imported) and is pure fabrication risk.
export async function resolveCssVarInRepo(
  repoDir: string,
  ref: string,
  commit: string,
): Promise<string[]> {
  if (!ref.startsWith("var(")) return [];
  const varName = VAR_REF_RE.exec(ref)?.[1] ?? "";
  return resolveCssVarValues(repoDir, commit, varName);
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
  resolveTokenValue?: ResolveTokenValue,
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

  const values = resolveTokenValue
    ? await resolveTokenValue(c.addedRef, c.commit)
    : await resolveCssVarInRepo(repoDir, c.addedRef, c.commit);
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
