/**
 * Hand-rolled unified-diff generator for bounded codemods.
 * NOT a spec-perfect unified-diff (no EOF-no-newline handling, etc.).
 * Sufficient for the 3 bounded codemods in V0.1.0.
 * If we later need robustness, swap in the `diff` npm library.
 */

/**
 * Generate a single-hunk unified diff for a single-line substitution.
 * Format: standard `diff -u` output with 3 lines of context.
 */
export function singleLineDiff(
  filePath: string,
  source: string,
  lineNumber: number, // 1-based
  oldLineContent: string,
  newLineContent: string,
): string {
  // Split into lines. If source ends with \n, split produces a trailing empty string.
  // We strip it so line counts match what git expects (git counts logical lines, not
  // the phantom empty element after a trailing newline).
  const allParts = source.split("\n");
  const lines =
    allParts.length > 0 && allParts[allParts.length - 1] === ""
      ? allParts.slice(0, -1)
      : allParts;

  const idx = lineNumber - 1;
  if (idx < 0 || idx >= lines.length) {
    throw new Error(`Line ${lineNumber} out of range (file has ${lines.length} lines)`);
  }

  const before = Math.max(0, idx - 3);
  const after = Math.min(lines.length, idx + 4); // 3 lines after the changed line, exclusive

  // Build hunk lines
  const hunkLines: string[] = [];
  for (let i = before; i < after; i++) {
    const line = lines[i] ?? "";
    if (i === idx) {
      hunkLines.push(`-${line}`);
      hunkLines.push(`+${line.replace(oldLineContent, newLineContent)}`);
    } else {
      hunkLines.push(` ${line}`);
    }
  }

  const oldCount = after - before;
  const newCount = after - before; // single-line replacement = same line count
  const header = `@@ -${before + 1},${oldCount} +${before + 1},${newCount} @@`;

  return [
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    header,
    ...hunkLines,
  ].join("\n") + "\n";
}

/**
 * Generate ONE unified diff that both inserts a line (e.g. an import) and
 * substitutes a fragment on another line. Both edits live under a single
 * `--- a/ +++ b/` header in a single hunk spanning them, so the line offsets
 * stay self-consistent.
 *
 * Concatenating two independently-generated diffs (each computed against the
 * original file) is NOT valid: the second hunk's offsets are wrong once the
 * first hunk changes the file's length, and `git apply` rejects it.
 *
 * `insertAfterLine` is 1-based (0 = before the first line). `replaceLineNumber`
 * is 1-based.
 */
export function insertAndReplaceDiff(
  filePath: string,
  source: string,
  insertAfterLine: number,
  newLine: string,
  replaceLineNumber: number,
  oldFragment: string,
  newFragment: string,
): string {
  const allParts = source.split("\n");
  const lines =
    allParts.length > 0 && allParts[allParts.length - 1] === ""
      ? allParts.slice(0, -1)
      : allParts;

  const insertPos = insertAfterLine; // 0-based index the new line is inserted *before*
  const replaceIdx = replaceLineNumber - 1;
  if (replaceIdx < 0 || replaceIdx >= lines.length) {
    throw new Error(`Line ${replaceLineNumber} out of range (file has ${lines.length} lines)`);
  }

  const lo = Math.min(insertPos, replaceIdx);
  const hi = Math.max(insertPos, replaceIdx);
  const start = Math.max(0, lo - 3);
  const end = Math.min(lines.length, hi + 4);

  const hunkLines: string[] = [];
  for (let i = start; i < end; i++) {
    if (i === insertPos) hunkLines.push(`+${newLine}`);
    const line = lines[i] ?? "";
    if (i === replaceIdx) {
      hunkLines.push(`-${line}`);
      hunkLines.push(`+${line.replace(oldFragment, newFragment)}`);
    } else {
      hunkLines.push(` ${line}`);
    }
  }
  // Insertion point at or past EOF (after the last context line).
  if (insertPos >= end) hunkLines.push(`+${newLine}`);

  const oldCount = end - start;
  const newCount = oldCount + 1; // one inserted line; the replace is 1→1
  const header = `@@ -${start + 1},${oldCount} +${start + 1},${newCount} @@`;
  return [
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    header,
    ...hunkLines,
  ].join("\n") + "\n";
}
