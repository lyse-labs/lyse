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
      continue;
    }
    out += ch;
  }
  return out;
}

interface JsBlock {
  header: string;
  start: number;
  end: number;
}

interface JsScan {
  blocks: JsBlock[];
  depthAtLineStart: number[];
}

// Lightweight brace-depth walk: pair every `{`/`}` (skipping braces inside
// strings, template literals, and `//` / `/* */` comments) into a block spanned
// by its opening/closing line, and record the nesting depth at the start of each
// line. The block's `header` is the trimmed text of its opening-brace line — the
// JS analogue of a CSS selector, used to align the SAME enclosing function/block
// between child and parent.
function scanJsBlocks(source: string): JsScan {
  const lines = source.split("\n");
  const depthAtLineStart = new Array<number>(lines.length).fill(0);
  const blocks: JsBlock[] = [];
  const stack: number[] = [];
  let depth = 0;
  let line = 1;
  let quote = "";
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source.charAt(i);
    const next = source.charAt(i + 1);

    if (ch === "\n") {
      line++;
      inLineComment = false;
      if (line - 1 < depthAtLineStart.length) depthAtLineStart[line - 1] = depth;
      continue;
    }
    if (inLineComment) continue;
    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (quote) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === "/" && next === "/") {
      inLineComment = true;
      i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "{") {
      stack.push(line);
      depth++;
      continue;
    }
    if (ch === "}") {
      const openLine = stack.pop();
      depth = Math.max(0, depth - 1);
      if (openLine !== undefined) {
        blocks.push({ header: (lines[openLine - 1] ?? "").trim(), start: openLine, end: line });
      }
    }
  }
  return { blocks, depthAtLineStart };
}

// The innermost block enclosing a 1-based line, or null when the line sits at
// module scope (no enclosing braces).
function enclosingBlock(scan: JsScan, targetLine: number): JsBlock | null {
  let best: JsBlock | null = null;
  for (const block of scan.blocks) {
    if (block.start <= targetLine && targetLine <= block.end) {
      if (best === null || block.start > best.start) best = block;
    }
  }
  return best;
}

// Gate A (JS/TS): the child line at the candidate's line binds the ref, and the
// PARENT file carries the literal under the SAME left-hand side WITHIN THE SAME
// enclosing function/block. The child is line-pinned to `c.line`; the parent
// side matches by CONTENT (a line whose LHS identifier equals the child's AND
// whose comment-stripped RHS carries `removedLiteral`), so the match survives
// line shifts from an earlier hunk in the same file. The parent search is SCOPED
// to the block enclosing `c.line` — module scope counts only parent module-scope
// declarations (depth 0); a block-scoped candidate counts only parent
// declarations inside a block with the same header (the JS analogue of the CSS
// `enclosingSelector` scope). Without this scope an unrelated, differently
// scoped same-name declaration elsewhere in the parent file could supply the
// sole match and fabricate ground truth. The parent match must be UNAMBIGUOUS:
// the literal has to appear (comments stripped) in the RHS of EXACTLY ONE
// same-LHS declaration within that scope. Zero matches (the literal lived only
// in a comment, in a different scope, or nowhere) or more than one (a shadowed
// same-named declaration) fail closed — recall loss on ambiguity is preferred to
// a false accept.
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

  const childBlock = enclosingBlock(scanJsBlocks(childSource), c.line);
  const parentScan = scanJsBlocks(parentSource);
  const inScope = (lineNo: number): boolean => {
    if (childBlock === null) {
      return (parentScan.depthAtLineStart[lineNo - 1] ?? 0) === 0;
    }
    for (const block of parentScan.blocks) {
      if (block.header === childBlock.header && block.start <= lineNo && lineNo <= block.end) {
        return true;
      }
    }
    return false;
  };

  const needle = c.removedLiteral.toLowerCase();
  const parentLines = parentSource.split("\n");
  let matches = 0;
  for (let i = 0; i < parentLines.length; i++) {
    if (!inScope(i + 1)) continue;
    const line = parentLines[i];
    if (line === undefined) continue;
    const parentDecl = extractLhs(line);
    if (parentDecl === null || parentDecl.lhs !== childDecl.lhs) continue;
    if (stripJsLineComments(parentDecl.rhs).toLowerCase().includes(needle)) matches++;
  }
  return matches === 1;
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
