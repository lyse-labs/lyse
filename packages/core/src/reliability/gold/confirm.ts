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
// candidate's line binds the ref, and the PARENT file carries the literal under
// the SAME left-hand side. The child is line-pinned to `c.line`; the parent side
// matches by CONTENT (a line whose LHS identifier equals the child's AND whose
// RHS carries `removedLiteral`) rather than a `c.line ±1` window. The LHS+literal
// pair uniquely identifies the declaration, so the match survives line shifts
// from an earlier hunk in the same file (which a ±1 window would false-reject),
// while still being specific enough that an unrelated same-named binding without
// the literal cannot satisfy the gate.
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
  for (const line of parentLines) {
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

// Read the value token that follows a `:` in an object-literal body, honouring
// quote and bracket depth so a colour with internal commas (`rgb(1, 2, 3)`) or a
// call expression (`computeColor(1, 2, 3)`) is captured whole instead of being
// truncated at its first inner comma. Stops at a top-level `,`, `;`, `}` or
// newline.
function readValueToken(body: string, start: number): string {
  let i = start;
  while (i < body.length && /\s/.test(body.charAt(i))) i++;
  let depth = 0;
  let quote = "";
  const out: string[] = [];
  for (; i < body.length; i++) {
    const ch = body.charAt(i);
    if (quote) {
      out.push(ch);
      if (ch === "\\") {
        const next = body.charAt(i + 1);
        if (next.length > 0) {
          out.push(next);
          i++;
        }
      } else if (ch === quote) {
        quote = "";
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      out.push(ch);
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") {
      depth++;
      out.push(ch);
      continue;
    }
    if (ch === ")" || ch === "]" || ch === "}") {
      if (depth === 0) break;
      depth--;
      out.push(ch);
      continue;
    }
    if (depth === 0 && (ch === "," || ch === ";" || ch === "\n")) break;
    out.push(ch);
  }
  return out.join("").trim();
}

// A raw value token -> its parseable colour, or null. Surrounding matching
// quotes are stripped first (`"#FD7E00"` -> `#FD7E00`). `colorEquals(v, v)` is
// the sole (independent) parseability probe.
function valueTokenToColour(raw: string): string | null {
  let v = raw.trim();
  const first = v.charAt(0);
  if ((first === '"' || first === "'" || first === "`") && v.charAt(v.length - 1) === first) {
    v = v.slice(1, -1);
  }
  if (v.length === 0) return null;
  return colorEquals(v, v) ? v : null;
}

// Return the substring inside the object literal whose opening brace sits at
// `open`, honouring quotes so a brace inside a string is not mistaken for a
// structural one. Null if the braces never balance.
function objectLiteralBody(source: string, open: number): string | null {
  let depth = 0;
  let quote = "";
  for (let i = open; i < source.length; i++) {
    const ch = source.charAt(i);
    if (quote) {
      if (ch === "\\") {
        i++;
      } else if (ch === quote) {
        quote = "";
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "{") {
      depth++;
      continue;
    }
    if (ch === "}") {
      depth--;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return null;
}

interface OwnerBlockScan {
  colours: string[];
  unextractable: boolean;
}

// Scan the genuine in-repo declaration blocks of the OWNER identifier
// (`(export )? const|let|var <owner> = { ... }`, top-level) for the leaf `key`.
// For each owner block that names the key: a parseable colour is collected; a
// value that is NOT a parseable colour (a call like `computeColor(...)`, a
// spread, a reference) sets `unextractable` — the resolution then fails closed
// rather than falling through to some OTHER file's value for the same key. If
// the owner is never declared in-repo as an object literal (imported/external,
// or absent), the scan is empty.
function scanOwnerBlocks(source: string, owner: string, key: string): OwnerBlockScan {
  const colours: string[] = [];
  let unextractable = false;
  const ownerRe = new RegExp(
    `^[ \\t]*(?:export\\s+)?(?:const|let|var)\\s+${escapeRegExp(owner)}\\s*=\\s*\\{`,
    "gm",
  );
  const keyRe = new RegExp(`(?:^|[,{\\s])["'\`]?${escapeRegExp(key)}["'\`]?\\s*:`, "g");
  let ownerMatch: RegExpExecArray | null;
  while ((ownerMatch = ownerRe.exec(source)) !== null) {
    const matched = ownerMatch[0];
    if (matched === undefined) continue;
    const braceIndex = ownerMatch.index + matched.length - 1;
    const body = objectLiteralBody(source, braceIndex);
    if (body === null) continue;
    keyRe.lastIndex = 0;
    let keyMatch: RegExpExecArray | null;
    while ((keyMatch = keyRe.exec(body)) !== null) {
      const colonIndex = body.indexOf(":", keyMatch.index);
      if (colonIndex === -1) continue;
      const colour = valueTokenToColour(readValueToken(body, colonIndex + 1));
      if (colour !== null) colours.push(colour);
      else unextractable = true;
      keyRe.lastIndex = colonIndex + 1;
    }
  }
  return { colours, unextractable };
}

// External-package tokens (e.g. canvas-kit's `base`, IMPORTED from
// `@workday/canvas-tokens-web`) are OUT OF SCOPE here: in-repo resolution returns
// [] and confirm fails closed. Task 7 (orchestrator) materializes the pinned
// corpus token values into the checkout before calling confirm, keeping this
// resolver pure in-repo. In-repo resolution succeeds ONLY when the OWNER object
// (`firstSegment`, e.g. `base`) is genuinely declared in-repo as an object
// literal: resolve the leaf key strictly from those owner-declaration blocks. If
// the key is present in an owner block but its value is not a parseable colour
// (`computeColor(...)`) the whole resolution is unresolved -> [] (fail closed,
// never fall through to an unrelated file's stale value). Disagreement across
// owner blocks is caught downstream by `gateBValueMatch`.
async function resolveJsTokenValues(
  repoDir: string,
  commit: string,
  memberExpr: string,
): Promise<string[]> {
  const segments = memberExpr.split(".");
  const key = segments[segments.length - 1];
  const owner = segments[0];
  if (key === undefined || key.length === 0) return [];
  if (owner === undefined || owner.length === 0) return [];

  // Owner-declaration blocks live in files that name the owner as a whole word.
  const files = await gitGrepFiles(repoDir, commit, owner, JS_TOKEN_PATHSPECS, true);
  if (files.length === 0) return [];

  const colours: string[] = [];
  for (const file of files) {
    const source = await gitShowFile(repoDir, commit, file);
    if (source.length === 0) continue;
    const scan = scanOwnerBlocks(source, owner, key);
    if (scan.unextractable) return [];
    for (const colour of scan.colours) colours.push(colour);
  }
  return colours;
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
