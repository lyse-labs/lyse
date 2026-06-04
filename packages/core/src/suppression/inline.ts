const NEXT_LINE = /\/\/\s*lyse-disable-next-line\s+([\w/,-]+)/g;
const FILE_LEVEL = /\/\*\s*lyse-disable\s+([\w/,-]+)\s*\*\//g;

export interface SuppressionDirective {
  kind: "next-line" | "file";
  ruleIds: string[];
  affectsLine: number;
}

export function parseSuppressionDirectives(source: string): SuppressionDirective[] {
  const dirs: SuppressionDirective[] = [];
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    NEXT_LINE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = NEXT_LINE.exec(line)) !== null) {
      dirs.push({ kind: "next-line", ruleIds: m[1]!.split(",").map((s) => s.trim()), affectsLine: i + 2 });
    }
    FILE_LEVEL.lastIndex = 0;
    while ((m = FILE_LEVEL.exec(line)) !== null) {
      dirs.push({ kind: "file", ruleIds: m[1]!.split(",").map((s) => s.trim()), affectsLine: -1 });
    }
  }
  return dirs;
}

export function isSuppressed(source: string, ruleId: string, line: number): boolean {
  const dirs = parseSuppressionDirectives(source);
  for (const d of dirs) {
    if (!d.ruleIds.includes(ruleId)) continue;
    if (d.kind === "file") return true;
    if (d.kind === "next-line" && d.affectsLine === line) return true;
  }
  return false;
}
