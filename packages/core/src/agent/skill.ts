import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import type { AgentSpec } from "./registry.js";

function skillPath(): string {
  // dist/agent/skill.js -> dist/skills/lyse/SKILL.md
  // src/agent/skill.ts -> src/skills/lyse/SKILL.md (for tests)
  const here = dirname(fileURLToPath(import.meta.url));
  const distPath = join(here, "..", "skills", "lyse", "SKILL.md");
  if (existsSync(distPath)) {
    return distPath;
  }
  // Fallback for test environments where we haven't built yet
  const srcPath = join(here, "..", "..", "src", "skills", "lyse", "SKILL.md");
  return srcPath;
}

export function lyseSkillSource(): string {
  return readFileSync(skillPath(), "utf8");
}

export function installLyseSkill(agent: AgentSpec, root: string): { path: string; installed: boolean } {
  const target = join(root, agent.skillRelPath);
  const source = lyseSkillSource();
  try {
    mkdirSync(dirname(target), { recursive: true });
    if (agent.skillFormat === "agents-md") {
      // Append/replace a lyse-managed block in AGENTS.md rather than overwrite.
      const begin = "<!-- lyse-skill:begin -->";
      const end = "<!-- lyse-skill:end -->";
      const block = `${begin}\n${source}\n${end}`;
      let existing = "";
      try { existing = readFileSync(target, "utf8"); } catch { existing = ""; }
      const next = existing.includes(begin)
        ? existing.replace(new RegExp(`${begin}[\\s\\S]*${end}`), block)
        : (existing ? `${existing.trimEnd()}\n\n${block}\n` : `${block}\n`);
      writeFileSync(target, next);
    } else {
      writeFileSync(target, source);
    }
    return { path: target, installed: true };
  } catch {
    return { path: target, installed: false };
  }
}
