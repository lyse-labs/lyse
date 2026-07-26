import { git } from "./git.js";

export interface CandidateChange {
  repo: string;
  commit: string;
  parent: string;
  file: string;
  removedLiteral: string;
  addedRef: string;
  line: number;
  massCodemod: boolean;
}

export interface ParseDiffMeta {
  repo: string;
  commit: string;
  parent: string;
}

const COLOR_LITERAL_RE = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/i;
const TOKEN_REF_RE = /var\(--[\w-]+\)|[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+/;
const HUNK_HEADER_RE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
const JS_DECL_RE = /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(.+)$/;
const CSS_DECL_RE = /^([A-Za-z-]+)\s*:\s*(.+)$/;
const MASS_CODEMOD_THRESHOLD = 30;

interface Declaration {
  key: string;
  value: string;
}

function extractDeclaration(diffLine: string): Declaration | null {
  const trimmed = diffLine.slice(1).trim();
  const jsMatch = JS_DECL_RE.exec(trimmed);
  if (jsMatch) {
    const key = jsMatch[1];
    const value = jsMatch[2];
    if (key !== undefined && value !== undefined) return { key, value };
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
function stripTrailingComment(value: string): string {
  const idx = value.indexOf("//");
  return (idx === -1 ? value : value.slice(0, idx)).trim();
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
      const newStart = header[1];
      if (newStart === undefined) continue;
      let newLine = Number.parseInt(newStart, 10);
      const pendingRemoved = new Map<string, string[]>();

      while (
        index < lines.length &&
        !(lines[index] ?? "").startsWith("diff --git ") &&
        !(lines[index] ?? "").startsWith("@@")
      ) {
        const contentLine = lines[index] ?? "";
        index++;

        if (contentLine.startsWith("-")) {
          const decl = extractDeclaration(contentLine);
          if (!decl) continue;
          const colorMatch = COLOR_LITERAL_RE.exec(decl.value);
          if (!colorMatch) continue;
          const queue = pendingRemoved.get(decl.key) ?? [];
          queue.push(colorMatch[0]);
          pendingRemoved.set(decl.key, queue);
          continue;
        }

        if (contentLine.startsWith("+")) {
          const lineNumber = newLine;
          newLine++;
          const decl = extractDeclaration(contentLine);
          if (!decl) continue;
          const queue = pendingRemoved.get(decl.key);
          if (!queue || queue.length === 0) continue;
          const strippedValue = stripTrailingComment(decl.value);
          if (COLOR_LITERAL_RE.test(strippedValue)) continue;
          const tokenMatch = TOKEN_REF_RE.exec(strippedValue);
          if (!tokenMatch) continue;
          const removedLiteral = queue.shift();
          if (removedLiteral === undefined) continue;
          candidates.push({
            repo: meta.repo,
            commit: meta.commit,
            parent: meta.parent,
            file: currentFile,
            removedLiteral,
            addedRef: tokenMatch[0],
            line: lineNumber,
            massCodemod: false,
          });
          continue;
        }

        newLine++;
      }
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
