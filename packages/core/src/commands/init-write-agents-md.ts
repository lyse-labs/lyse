import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const LYSE_BLOCK_BEGIN = "<!-- lyse-managed:begin -->";
export const LYSE_BLOCK_END = "<!-- lyse-managed:end -->";

const LYSE_HEADING = "## Lyse audit (auto-managed)";

const MINIMAL_PREAMBLE =
  "# Agents\n\nThis file is read by AI coding assistants. Edit freely outside the Lyse-managed block.\n\n";

export interface WriteAgentsMdResult {
  path: string;
  created: boolean;
  blockReplaced: boolean;
  blockAppended: boolean;
}

export function buildLyseBlock(): string {
  return [
    LYSE_HEADING,
    "",
    LYSE_BLOCK_BEGIN,
    "### Validate design-system conformance",
    "",
    "```bash",
    "pnpm exec lyse audit",
    "```",
    "",
    "Exit codes:",
    "- 0 — pass (Health Score ≥ project threshold)",
    "- 1 — fail (Health Score below threshold or hard errors)",
    "- 2 — config error",
    LYSE_BLOCK_END,
    "",
  ].join("\n");
}

export function replaceOrAppendLyseBlock(existing: string, block: string): { content: string; replaced: boolean } {
  const beginIdx = existing.indexOf(LYSE_BLOCK_BEGIN);
  const endIdx = existing.indexOf(LYSE_BLOCK_END);
  if (beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx) {
    const headingStart = findHeadingStart(existing, beginIdx);
    const blockEndPos = endIdx + LYSE_BLOCK_END.length;
    let after = existing.slice(blockEndPos);
    if (after.startsWith("\n\n")) after = after.slice(1);
    else if (!after.startsWith("\n")) after = "\n" + after;
    const before = existing.slice(0, headingStart);
    const beforeNormalized = before.endsWith("\n") || before.length === 0 ? before : before + "\n";
    return { content: beforeNormalized + block + after, replaced: true };
  }
  const sep = existing.length === 0 || existing.endsWith("\n\n") ? "" : existing.endsWith("\n") ? "\n" : "\n\n";
  return { content: existing + sep + block, replaced: false };
}

function findHeadingStart(content: string, beginIdx: number): number {
  const headingIdx = content.lastIndexOf(LYSE_HEADING, beginIdx);
  if (headingIdx === -1) return beginIdx;
  if (headingIdx === 0) return 0;
  let i = headingIdx;
  while (i > 0 && content[i - 1] === "\n") i--;
  return i === 0 ? 0 : i + 1;
}

export function writeAgentsMd(repoRoot: string): WriteAgentsMdResult {
  const path = join(repoRoot, "AGENTS.md");
  const block = buildLyseBlock();
  if (!existsSync(path)) {
    const content = MINIMAL_PREAMBLE + block;
    writeFileSync(path, content);
    return { path, created: true, blockReplaced: false, blockAppended: false };
  }
  const existing = readFileSync(path, "utf8");
  const { content, replaced } = replaceOrAppendLyseBlock(existing, block);
  if (content === existing) {
    return { path, created: false, blockReplaced: false, blockAppended: false };
  }
  writeFileSync(path, content);
  return { path, created: false, blockReplaced: replaced, blockAppended: !replaced };
}
