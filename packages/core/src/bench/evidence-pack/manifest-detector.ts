import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type {
  ManifestsBlock,
  ManifestPresence,
  CursorRulesPresence,
  McpConfigPresence,
} from "./types.js";

async function fileMeta(root: string, relPath: string): Promise<ManifestPresence> {
  const absolute = join(root, relPath);
  try {
    const buf = await readFile(absolute);
    const sha = createHash("sha256").update(buf).digest("hex");
    const content = buf.toString("utf8");
    const lineCount = content.length === 0 ? 0 : content.split("\n").length;
    return { present: true, path: relPath, size: buf.byteLength, sha256: sha, lineCount };
  } catch {
    return { present: false };
  }
}

async function dirMeta(root: string, relDir: string): Promise<CursorRulesPresence> {
  const absolute = join(root, relDir);
  try {
    const entries = await readdir(absolute, { withFileTypes: true });
    const files: Array<{ path: string; size: number; sha256: string }> = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const relPath = `${relDir}/${entry.name}`;
      const buf = await readFile(join(root, relPath));
      files.push({
        path: relPath,
        size: buf.byteLength,
        sha256: createHash("sha256").update(buf).digest("hex"),
      });
    }
    files.sort((a, b) => a.path.localeCompare(b.path));
    if (files.length === 0) return { present: false };
    return { present: true, directory: relDir, fileCount: files.length, files };
  } catch {
    return { present: false };
  }
}

async function detectMcp(root: string): Promise<McpConfigPresence> {
  for (const candidate of ["apps/mcp/package.json", "mcp.json", ".mcp/config.json"]) {
    const meta = await fileMeta(root, candidate);
    if (meta.present) {
      return { ...meta, transport: "unknown" };
    }
  }
  return { present: false };
}

export async function detectManifests(repoRoot: string): Promise<ManifestsBlock> {
  return {
    agentsMd: await fileMeta(repoRoot, "AGENTS.md"),
    claudeMd: await fileMeta(repoRoot, "CLAUDE.md"),
    designMd: await fileMeta(repoRoot, "DESIGN.md"),
    skillMd: await fileMeta(repoRoot, "SKILL.md"),
    componentsJson: await fileMeta(repoRoot, "components.json"),
    cursorRules: await dirMeta(repoRoot, ".cursor/rules"),
    llmsTxt: await fileMeta(repoRoot, "llms.txt"),
    llmsFullTxt: await fileMeta(repoRoot, "llms-full.txt"),
    mcpConfig: await detectMcp(repoRoot),
    tokensJsonDtcg: await fileMeta(repoRoot, "tokens.json"),
  };
}
