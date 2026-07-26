import { git } from "./git.js";

export interface CandidateChange {
  repo: string;
  commit: string;
  parent: string;
  file: string;
  removedLiteral: string;
  addedRef: string;
  line: number;
  parentLine: number;
  massCodemod: boolean;
}

export interface ParseDiffMeta {
  repo: string;
  commit: string;
  parent: string;
}

const COLOR_LITERAL_RE = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/i;
const TOKEN_REF_RE = /var\(--[\w-]+\)|[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+/;
const HUNK_HEADER_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
const JS_DECL_RE = /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(.+)$/;
const CSS_DECL_RE = /^([A-Za-z-]+)\s*:\s*(.+)$/;
const MASS_CODEMOD_THRESHOLD = 30;

interface Declaration {
  key: string;
  value: string;
}

// JS_DECL_RE's `.+$` greedily swallows the WHOLE physical line's remainder as
// one value blob. When a single line actually holds a SECOND declaration --
// either a wholly separate statement (`const a = fn(); const b = '#hex';`)
// or a comma-separated multi-binding (`const a = fn(), b = '#hex';`) -- that
// blob silently fuses two unrelated key/value pairs together, and the
// caller's colour/token regexes then first-match over the fused text. That
// cross-wires the pairing (e.g. reading `b`'s hex as if it were `a`'s
// removed value). There is no reliable way to tell FROM THE VALUE ALONE
// which declaration a matched colour/token belongs to, so this fails closed:
// a value containing a second top-level `const`/`let`/`var` binding, or a
// top-level (paren/bracket/brace depth 0, outside quotes) comma -- which in
// valid JS after a declarator's `=` can only mean a second declarator, since
// a bare comma-operator expression isn't legal unparenthesized there -- makes
// the whole line ambiguous. A comma/`=` INSIDE an expression (`fn(a, b)`,
// `a === b ? '#fff' : '#000'`) sits at depth > 0 or isn't a keyword match, so
// it does not trigger this.
function hasAmbiguousDeclaration(value: string): boolean {
  let masked = "";
  let depth = 0;
  let quote = "";
  for (let i = 0; i < value.length; i++) {
    const ch = value.charAt(i);
    if (quote) {
      if (ch === quote) quote = "";
      masked += " ";
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      masked += " ";
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") {
      depth++;
      masked += " ";
      continue;
    }
    if (ch === ")" || ch === "]" || ch === "}") {
      depth = Math.max(0, depth - 1);
      masked += " ";
      continue;
    }
    masked += depth === 0 ? ch : " ";
  }
  if (masked.includes(",")) return true;
  return /(?:^|[^\w$])(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=/.test(masked);
}

function extractDeclaration(diffLine: string): Declaration | null {
  const trimmed = diffLine.slice(1).trim();
  const jsMatch = JS_DECL_RE.exec(trimmed);
  if (jsMatch) {
    const key = jsMatch[1];
    const value = jsMatch[2];
    if (key !== undefined && value !== undefined) {
      // Ambiguity is judged on the comment-stripped value -- a decoy
      // `const`/comma sitting only inside a trailing `//` or `/* */` comment
      // must not fail-close a line whose real code is a single declaration.
      if (hasAmbiguousDeclaration(stripTrailingComment(value))) return null;
      return { key, value };
    }
  }
  const cssMatch = CSS_DECL_RE.exec(trimmed);
  if (cssMatch) {
    const key = cssMatch[1];
    const value = cssMatch[2];
    if (key !== undefined && value !== undefined) return { key, value };
  }
  return null;
}

// A trailing `//` comment on a `+` line is where the fixtures deliberately
// stash the OLD hex (e.g. `base.orange400; //'#FD7E00';`) — it must not
// disqualify the candidate or be mistaken for the added token reference.
// But a bare `indexOf("//")` also cuts into a legitimate `url(https://...)`
// value, so `//` only counts as a comment start at paren/quote depth 0 —
// inside `url(...)` or a quoted string it's left alone. A single-line
// `/* ... */` block comment (or a `/*` with no closing `*/` on the line) is
// stripped the same way, at the same depth-0 guard — e.g.
// `deriveColor(); /* was '#FD7E00' */` must not surface the hex as this
// line's real value, mirroring confirm.ts's `stripJsLineComments`.
function stripTrailingComment(value: string): string {
  let out = "";
  let depth = 0;
  let quote = "";
  for (let i = 0; i < value.length; i++) {
    const ch = value.charAt(i);
    if (quote) {
      if (ch === quote) quote = "";
      out += ch;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === "(") {
      depth++;
      out += ch;
      continue;
    }
    if (ch === ")") {
      depth = Math.max(0, depth - 1);
      out += ch;
      continue;
    }
    if (depth === 0 && ch === "/" && value.charAt(i + 1) === "/") {
      break;
    }
    if (depth === 0 && ch === "/" && value.charAt(i + 1) === "*") {
      const end = value.indexOf("*/", i + 2);
      if (end === -1) break;
      i = end + 1;
      // A block comment is whitespace: collapse it to a single space so
      // fragments on either side (`#FD7E/* x */00`) cannot fuse into a
      // spurious value (`#FD7E00`).
      out += " ";
      continue;
    }
    out += ch;
  }
  return out.trim();
}

interface RemovedEntry {
  key: string;
  literal: string;
  lineNumber: number;
}

interface AddedEntry {
  key: string;
  addedRef: string;
  lineNumber: number;
}

// A replace-block is a maximal run of `-` lines immediately followed by a
// maximal run of `+` lines (no context line, and no interleaved opposite
// run, in between). Pairing is scoped to a single block so unrelated
// same-key declarations elsewhere in the hunk — e.g. a pure deletion, or a
// wholly different declaration that happens to reuse the same CSS
// property/JS identifier — can never be mistaken for each other via a
// whole-hunk-scoped FIFO. Within a block, a key with exactly one removed
// entry (or N removed vs. a different count of added) pairs positionally
// (FIFO) — unambiguous. A key with >= 2 removed AND >= 2 added entries in
// the SAME block is a case the diff gives no reliable signal for (a
// reordered same-key swap looks identical to an in-order replace) — that
// case fails closed (no candidate emitted for that key) rather than risk a
// silently wrong pairing reaching the downstream value-equality gate.
function flushReplaceBlock(
  removedEntries: RemovedEntry[],
  addedEntries: AddedEntry[],
  candidates: CandidateChange[],
  meta: ParseDiffMeta,
  currentFile: string,
): void {
  if (removedEntries.length === 0 || addedEntries.length === 0) return;

  const removedByKey = new Map<string, RemovedEntry[]>();
  for (const entry of removedEntries) {
    const queue = removedByKey.get(entry.key) ?? [];
    queue.push(entry);
    removedByKey.set(entry.key, queue);
  }

  const addedCountByKey = new Map<string, number>();
  for (const entry of addedEntries) {
    addedCountByKey.set(entry.key, (addedCountByKey.get(entry.key) ?? 0) + 1);
  }

  const ambiguousKeys = new Set<string>();
  for (const [key, queue] of removedByKey) {
    if (queue.length >= 2 && (addedCountByKey.get(key) ?? 0) >= 2) {
      ambiguousKeys.add(key);
    }
  }

  for (const added of addedEntries) {
    if (ambiguousKeys.has(added.key)) continue;
    const queue = removedByKey.get(added.key);
    if (!queue || queue.length === 0) continue;
    const removed = queue.shift();
    if (removed === undefined) continue;
    candidates.push({
      repo: meta.repo,
      commit: meta.commit,
      parent: meta.parent,
      file: currentFile,
      removedLiteral: removed.literal,
      addedRef: added.addedRef,
      line: added.lineNumber,
      parentLine: removed.lineNumber,
      massCodemod: false,
    });
  }
}

function fileFromPlusPlusPlusLine(line: string): string {
  const rest = line.slice("+++ ".length);
  const raw = rest.split("\t")[0] ?? rest;
  const trimmed = raw.trim();
  return trimmed.startsWith("b/") ? trimmed.slice(2) : trimmed;
}

export function parseUnifiedDiff(content: string, meta: ParseDiffMeta): CandidateChange[] {
  const lines = content.split("\n");
  const candidates: CandidateChange[] = [];
  let currentFile = "";
  let index = 0;

  while (index < lines.length && !(lines[index] ?? "").startsWith("diff --git ")) {
    index++;
  }

  while (index < lines.length) {
    const line = lines[index] ?? "";

    if (line.startsWith("diff --git ")) {
      index++;
      continue;
    }

    if (line.startsWith("+++ ")) {
      currentFile = fileFromPlusPlusPlusLine(line);
      index++;
      continue;
    }

    if (line.startsWith("@@")) {
      const header = HUNK_HEADER_RE.exec(line);
      index++;
      if (!header) continue;
      const oldStart = header[1];
      const newStart = header[2];
      if (oldStart === undefined || newStart === undefined) continue;
      let oldLine = Number.parseInt(oldStart, 10);
      let newLine = Number.parseInt(newStart, 10);

      let removedEntries: RemovedEntry[] = [];
      let addedEntries: AddedEntry[] = [];
      const flushBlock = (): void => {
        flushReplaceBlock(removedEntries, addedEntries, candidates, meta, currentFile);
        removedEntries = [];
        addedEntries = [];
      };

      while (
        index < lines.length &&
        !(lines[index] ?? "").startsWith("diff --git ") &&
        !(lines[index] ?? "").startsWith("@@")
      ) {
        const contentLine = lines[index] ?? "";
        index++;

        if (contentLine.startsWith("-")) {
          // A `+` run ending and immediately being followed by a new `-`
          // run means the previous replace-block is over — flush it before
          // starting to accumulate the next one.
          if (addedEntries.length > 0) flushBlock();
          // The old-file line of this removed line — recorded so Gate A can
          // check the exact parent declaration by line number (not by re-finding
          // it via name/scope heuristics).
          const removedLineNumber = oldLine;
          oldLine++;
          const decl = extractDeclaration(contentLine);
          if (decl) {
            // Mirror the `+` side: a colour that survives ONLY inside a
            // trailing comment (`const c = deriveColor(); // '#FD7E00'`) is not
            // the line's real removed value — strip the comment (url:// guarded)
            // before reading the literal so a commented hex cannot fabricate a
            // removedLiteral for a removed line whose real value isn't a colour.
            const strippedValue = stripTrailingComment(decl.value);
            const colorMatch = COLOR_LITERAL_RE.exec(strippedValue);
            if (colorMatch) {
              removedEntries.push({ key: decl.key, literal: colorMatch[0], lineNumber: removedLineNumber });
            }
          }
          continue;
        }

        if (contentLine.startsWith("+")) {
          const lineNumber = newLine;
          newLine++;
          const decl = extractDeclaration(contentLine);
          if (decl) {
            const strippedValue = stripTrailingComment(decl.value);
            if (!COLOR_LITERAL_RE.test(strippedValue)) {
              const tokenMatch = TOKEN_REF_RE.exec(strippedValue);
              if (tokenMatch) {
                addedEntries.push({ key: decl.key, addedRef: tokenMatch[0], lineNumber });
              }
            }
          }
          continue;
        }

        // A context line (or any other non `-`/`+` line, e.g. a
        // "\ No newline at end of file" marker) ends any open replace-block
        // — pairing must never carry state across a gap. A context line
        // advances BOTH file counters.
        flushBlock();
        oldLine++;
        newLine++;
      }
      flushBlock();
      continue;
    }

    index++;
  }

  if (candidates.length > MASS_CODEMOD_THRESHOLD) {
    return candidates.map((candidate) => ({ ...candidate, massCodemod: true }));
  }
  return candidates;
}

const TOKENIZABLE_PATHSPECS = ["*.css", "*.scss", "*.ts", "*.tsx", "*.js", "*.jsx"];

export async function walkTokenizationCommits(
  repoDir: string,
  repoName: string,
): Promise<CandidateChange[]> {
  const log = await git(["log", "--first-parent", "--format=%H %P"], repoDir);
  const candidates: CandidateChange[] = [];

  for (const rawLine of log.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    const [commit, parent] = line.split(/\s+/);
    if (commit === undefined || parent === undefined) continue;

    const diff = await git(
      ["diff", "-U0", parent, commit, "--", ...TOKENIZABLE_PATHSPECS],
      repoDir,
    );
    candidates.push(...parseUnifiedDiff(diff, { repo: repoName, commit, parent }));
  }

  return candidates;
}
