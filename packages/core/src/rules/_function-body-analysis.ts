// Shared body-analysis primitives for naming-* rules.
//
// These helpers replace the per-rule 2000-char body slices + ad-hoc regex
// matchers that produced both false negatives (long bodies truncated) and
// false positives (generics confused for JSX, utility `use*` calls confused
// for hook calls).
//
// Pure utility module — no rule-specific imports. Helpers are stateless and
// deterministic: same input → same output.

// Why a streaming scan instead of a capped slice: the previous rules sliced
// the function body to 2000 chars before scanning. Real codebases (e.g.
// Enobase) have legitimate hooks whose first hook call sits past that
// cutoff, producing false negatives. We instead match against the full body
// slice using lastIndex iteration — the regex engine streams the input and
// stops on the first match, so the cost is bounded by the position of the
// first hook call, not the length of the body.

// `use[A-Z]\w*\s*\(` finds candidate hook call sites anywhere in the body.
// We then filter for true positives (see `bodyCallsHook`).
const HOOK_CALL_RE = /\buse[A-Z][a-zA-Z0-9]*\s*\(/g;

// Identifier-like prefix that, when it precedes `use<Upper>`, suggests the
// call is NOT a top-level hook call — e.g. `obj.useThing(` or `this.useX(`.
// We deliberately keep this conservative: object-method dispatch on something
// named like a hook is rare and almost never a real hook.
function isMemberAccessAt(source: string, index: number): boolean {
  let i = index - 1;
  while (i >= 0 && /\s/.test(source[i]!)) i--;
  return i >= 0 && source[i] === ".";
}

// Detects whether the call site sits inside a nested function declaration
// or method shorthand. A hook called inside an inner `function inner() {}`
// or `const cb = () => { useX() }` does NOT make the OUTER function a hook.
//
// Approach: scan backwards from the candidate index through the body and
// track brace depth. If we encounter `function` / `=>` whose body wraps the
// candidate, return true.
//
// This is a heuristic — we err on the side of accepting the call as
// top-level (preserves recall) unless we find clear evidence of nesting.
function isInsideNestedFunction(body: string, index: number): boolean {
  // Walk backwards counting braces; if we exit the outer body or hit a
  // `function` / arrow before exiting, the call is nested.
  let depth = 0;
  for (let i = index - 1; i >= 0; i--) {
    const c = body[i]!;
    if (c === "}") depth++;
    else if (c === "{") {
      if (depth === 0) {
        // We are at the opening brace of the enclosing block. Inspect what
        // precedes it: a `function ...(`, `() =>`, or `<id>(...)\s*` arrow
        // body means this brace opens a nested function.
        const head = body.slice(Math.max(0, i - 60), i);
        if (/=>\s*$/.test(head)) return true;
        if (/\bfunction\b[^{}]*$/.test(head)) {
          // Could be the outer function's own opening brace — in that case
          // there are no more closing braces between i and the start, which
          // we already verified by depth==0. But the outer function's body
          // IS what we are scanning, so its opening brace marks the start
          // of the body, not a nested function. We assume the caller passes
          // a body slice that starts AFTER the outer `{`, so any `function`
          // we find here is necessarily nested.
          return true;
        }
        return false;
      }
      depth--;
    }
  }
  return false;
}

/**
 * Returns true if the function body slice contains at least one top-level
 * call to a function named `use<Upper>…`. Filters out:
 *   - member-access calls (`obj.useThing(`)
 *   - calls nested inside an inner function/arrow declaration
 *
 * The body slice should start at the OPENING brace of the function body
 * (or just after) so the nesting heuristic can attribute braces correctly.
 */
export function bodyCallsHook(body: string): boolean {
  HOOK_CALL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = HOOK_CALL_RE.exec(body)) !== null) {
    const idx = m.index;
    if (isMemberAccessAt(body, idx)) continue;
    if (isInsideNestedFunction(body, idx)) continue;
    return true;
  }
  return false;
}

// JSX-return detection.
//
// Goal: distinguish `return <Tag …` (JSX) from TS type-position generics like
// `return useMemo<Foo>(…)` / `return Array<X>(…)` / `return dynamic<T>(loader)`.
//
// Strategy: find every `return` followed by an expression, then for the first
// `<` in that expression decide whether it opens a JSX element. JSX is
// disambiguated by what FOLLOWS the `<`:
//   - `<` (fragment opener `<>`) → JSX
//   - `<UpperIdent` → JSX (component) UNLESS the next non-name char is `,`
//     or the construct is clearly a generic-arg list
//   - `<lowerIdent` where the identifier matches a known HTML tag → JSX
//   - `</`  → JSX close (shouldn't appear at return start but cheap to accept)
//   - anything else → not JSX
//
// We avoid full tokenization: a regex sweep over the body is enough because
// the false-positive cases all share the property that `<` is preceded by a
// JavaScript identifier or `)` (call/expression position), whereas a JSX `<`
// at return position is preceded only by `return`, `(`, or whitespace.

const RETURN_LT_RE = /\breturn\b\s*\(?\s*</g;

// Common lowercase HTML / SVG tag names. Extending this list is cheap; we
// only need enough coverage to avoid false negatives on hand-written
// components. JSX with custom lowercase tags (`<my-component>`) is rare and
// not idiomatic React.
const HTML_TAGS = new Set([
  "a","abbr","address","area","article","aside","audio","b","base","bdi",
  "bdo","blockquote","body","br","button","canvas","caption","cite","code",
  "col","colgroup","data","datalist","dd","del","details","dfn","dialog",
  "div","dl","dt","em","embed","fieldset","figcaption","figure","footer",
  "form","h1","h2","h3","h4","h5","h6","head","header","hgroup","hr","html",
  "i","iframe","img","input","ins","kbd","label","legend","li","link","main",
  "map","mark","meta","meter","nav","noscript","object","ol","optgroup",
  "option","output","p","param","picture","pre","progress","q","rp","rt",
  "ruby","s","samp","script","section","select","slot","small","source",
  "span","strong","style","sub","summary","sup","table","tbody","td",
  "template","textarea","tfoot","th","thead","time","title","tr","track",
  "u","ul","var","video","wbr",
  "svg","circle","ellipse","g","line","path","polygon","polyline","rect",
  "text","defs","linearGradient","radialGradient","stop","clipPath","mask",
  "use","symbol","pattern","filter","feGaussianBlur","feOffset","feMerge",
]);

/**
 * Returns true if the body slice contains a JSX-returning expression.
 *
 * Handles:
 *   - `return <div>` → true (HTML tag)
 *   - `return <Suspense/>` → true (Component)
 *   - `return <>` → true (fragment)
 *   - `return ( <Foo /> )` → true (parenthesized)
 *   - `return useMemo<Foo>(...)` → false (generic at return)
 *   - body containing `Array<X>` or `dynamic<T>(…)` elsewhere → false (no return prefix)
 */
export function bodyReturnsJsx(body: string): boolean {
  const scan = blankReturnObjectLiterals(body);

  RETURN_LT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RETURN_LT_RE.exec(scan)) !== null) {
    // Symmetric with bodyCallsHook: a `return <Foo/>` inside a nested
    // function/arrow does NOT make the OUTER function JSX-returning.
    if (isInsideNestedFunction(scan, m.index)) continue;
    // The `<` that the regex matched starts at m.index + m[0].length - 1.
    const ltIndex = m.index + m[0].length - 1;
    if (looksLikeJsxOpenAt(scan, ltIndex)) return true;
  }

  return false;
}

// Replace every `return { ... }` object literal's contents with spaces so
// JSX inside object values (factory pattern, e.g. `getMdxComponents`) is not
// counted as evidence the outer function returns JSX. Whitespace-preserving
// to keep indices stable for the subsequent regex scans.
function blankReturnObjectLiterals(body: string): string {
  const RETURN_OBJ_RE = /\breturn\s*\{/g;
  let out = body;
  let m: RegExpExecArray | null;
  RETURN_OBJ_RE.lastIndex = 0;
  while ((m = RETURN_OBJ_RE.exec(out)) !== null) {
    const openIdx = m.index + m[0].length - 1;
    let depth = 1;
    let i = openIdx + 1;
    for (; i < out.length; i++) {
      const c = out[i]!;
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    const endIdx = i;
    const blanked = out.slice(openIdx + 1, endIdx).replace(/[^\n]/g, " ");
    out = out.slice(0, openIdx + 1) + blanked + out.slice(endIdx);
    RETURN_OBJ_RE.lastIndex = endIdx + 1;
  }
  return out;
}

function looksLikeJsxOpenAt(body: string, ltIndex: number): boolean {
  // Verify the char before `<` (skipping whitespace and one optional `(`)
  // is `return` or `(`. RETURN_LT_RE guarantees this; this check is belt-
  // and-suspenders against pathological matches.
  const next = body[ltIndex + 1];
  if (next === undefined) return false;
  // Fragment `<>` or close `</`
  if (next === ">" || next === "/") return true;
  // Component `<UpperIdent`
  if (/[A-Z]/.test(next)) {
    // Read the identifier
    let j = ltIndex + 1;
    while (j < body.length && /[A-Za-z0-9_]/.test(body[j]!)) j++;
    const after = body[j];
    // Reject `<UpperIdent,` (multi-param generic arrow / type-arg list:
    // `<T,U>(x, y) => ...`).
    if (after === ",") return false;
    // Reject bare generic arrow `<T>(x) => x`: shape is `<UpperIdent>` with
    // `(` as the next non-whitespace char after `>`. Real JSX `<Foo>` is
    // followed by children (text, `{`, `<`) or `</`, never by `(`.
    if (after === ">") {
      let k = j + 1;
      while (k < body.length && /\s/.test(body[k]!)) k++;
      if (body[k] === "(") return false;
    }
    return true;
  }
  // Lowercase identifier → HTML tag check
  if (/[a-z]/.test(next)) {
    let j = ltIndex + 1;
    while (j < body.length && /[A-Za-z0-9-]/.test(body[j]!)) j++;
    const tag = body.slice(ltIndex + 1, j);
    return HTML_TAGS.has(tag);
  }
  return false;
}

/**
 * Extracts the body of a function declaration starting at `declStart` via
 * naive brace matching. Returns the slice from just AFTER the opening `{`
 * up to (but not including) the matching closing `}`.
 *
 * Defensive fallbacks:
 *   - If no `{` is found at/after `declStart`, returns `source.slice(declStart)`
 *     (matches prior naive behavior for declaration-only forms).
 *   - If EOF is reached before depth returns to zero, returns everything from
 *     just after the opening `{` to end-of-source.
 *
 * Future improvement: braces inside string/template literals or comments are
 * NOT tracked. Current heuristic is sufficient for the rule surface that
 * consumes this helper (component/hook naming detection on real React
 * sources). Switch to a TS-AST extraction if FP/FN evidence emerges.
 */
export function extractFunctionBody(source: string, declStart: number): string {
  const open = source.indexOf("{", declStart);
  if (open < 0) return source.slice(declStart);
  let depth = 1;
  for (let i = open + 1; i < source.length; i++) {
    const c = source[i]!;
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return source.slice(open + 1);
}

/**
 * Returns true if `source` at `declStart` declares an implicit-return arrow
 * function whose body is a JSX expression: `export const X = (...) => <JSX>`.
 *
 * `declStart` should point at the start of the export declaration (the same
 * index `EXPORT_FUNC_RE` reports). We walk past `export … = (` and the param
 * list, expect `=>`, and then check that the first non-whitespace char opens
 * JSX (via the shared `looksLikeJsxOpenAt` disambiguator).
 *
 * Returns false for:
 *   - block-body arrows (`=> {`) — caller should use `bodyReturnsJsx` instead
 *   - non-JSX implicit returns (`=> text.toUpperCase()`)
 *   - implicit returns whose JSX is inside a nested expression
 *     (`xs => xs.map(x => <li/>)`)
 */
export function arrowImplicitReturnsJsx(source: string, declStart: number): boolean {
  const eq = source.indexOf("=", declStart);
  if (eq < 0) return false;
  let i = eq + 1;
  while (i < source.length && /\s/.test(source[i]!)) i++;
  if (source.slice(i, i + 5) === "async") {
    i += 5;
    while (i < source.length && /\s/.test(source[i]!)) i++;
  }
  if (source[i] !== "(") return false;
  let depth = 1;
  i++;
  for (; i < source.length && depth > 0; i++) {
    const c = source[i]!;
    if (c === "(") depth++;
    else if (c === ")") depth--;
  }
  if (depth !== 0) return false;
  while (i < source.length && /\s/.test(source[i]!)) i++;
  if (source[i] === ":") {
    // Optional return-type annotation: skip until `=>`.
    while (i < source.length && !(source[i] === "=" && source[i + 1] === ">")) i++;
  }
  if (source[i] !== "=" || source[i + 1] !== ">") return false;
  i += 2;
  while (i < source.length && /\s/.test(source[i]!)) i++;
  if (source[i] !== "<") return false;
  return looksLikeJsxOpenAt(source, i);
}

/**
 * Filename / path evidence: a function is more likely to be a hook when it
 * lives under `**\/hooks\/**` or in a file named `use-*.{ts,tsx,js,jsx}`.
 */
export function fileIsInHooksDir(filePath: string): boolean {
  // Normalise backslashes for cross-platform determinism.
  const p = filePath.replace(/\\/g, "/");
  if (/(^|\/)hooks\//.test(p)) return true;
  const base = p.slice(p.lastIndexOf("/") + 1);
  if (/^use-[\w.-]+\.(tsx?|jsx?)$/.test(base)) return true;
  return false;
}

/**
 * Filename-as-evidence refinement (issue #166).
 *
 * Returns true ONLY when the file is named `use-<kebab>.{ts,tsx,js,jsx}` AND
 * `funcName` is the camelCase form of `<kebab>` — i.e. the function name
 * literally matches what the filename advertises as the hook target
 * (minus the `use` prefix).
 *
 * Examples:
 *   use-toggle.ts          + "toggle"      → true
 *   use-combine-ref.ts     + "combineRef"  → true
 *   use-combine-ref.ts     + "composeRefs" → false  (co-located helper)
 *   use-toggle.ts          + "useToggle"   → false  (already prefixed)
 *   hooks/index.ts         + anything      → false  (no use-X filename)
 *   lib/helpers.ts         + anything      → false  (not a use-X file)
 *
 * Used by `naming/hook-prefix` to gate path-evidence: a function in a
 * `hooks/` directory is flagged via path alone only when its name matches
 * the filename's advertised target. Unrelated co-located utilities are not
 * flagged via path-evidence and must show body-call evidence to fire.
 */
export function filenameMatchesFunction(
  filePath: string,
  funcName: string,
): boolean {
  const p = filePath.replace(/\\/g, "/");
  const base = p.slice(p.lastIndexOf("/") + 1);
  const m = base.match(/^use-([\w.-]+)\.(?:tsx?|jsx?)$/);
  if (!m) return false;
  const kebab = m[1]!;
  // Convert kebab to camelCase: split on `-`, lowercase first segment,
  // capitalize the rest. `combine-ref` → `combineRef`.
  const parts = kebab.split("-").filter((s) => s.length > 0);
  if (parts.length === 0) return false;
  const camel =
    parts[0]!.toLowerCase() +
    parts
      .slice(1)
      .map((s) => s[0]!.toUpperCase() + s.slice(1).toLowerCase())
      .join("");
  return funcName === camel;
}
