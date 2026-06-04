export interface DummyInput {
  size: number;
  lineCount: number;
  content: string;
}

export interface DummyInputFull extends DummyInput {
  sha256: string;
  knownDummyHashes: ReadonlySet<string>;
}

const PLACEHOLDER_RE = /\b(todo|placeholder|coming soon|wip|fixme|tbd)\b/i;

export function isLikelyDummy(input: DummyInput): boolean {
  if (input.size < 100) return true;
  if (input.lineCount < 5) return true;
  const nonBlankLines = input.content.split("\n").filter((l) => l.trim().length > 0);
  if (nonBlankLines.length < 3) return true;
  const placeholderRatio = nonBlankLines.filter((l) => PLACEHOLDER_RE.test(l)).length / nonBlankLines.length;
  if (placeholderRatio > 0.5) return true;
  return false;
}

export function computeIsLikelyDummy(input: DummyInputFull): boolean {
  if (input.knownDummyHashes.has(input.sha256)) return true;
  return isLikelyDummy(input);
}
