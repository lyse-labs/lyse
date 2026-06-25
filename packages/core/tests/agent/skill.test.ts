import { describe, it, expect } from "vitest";
import { installLyseSkill, lyseSkillSource } from "../../src/agent/skill.js";
import { AGENTS } from "../../src/agent/registry.js";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("installLyseSkill", () => {
  it("writes the skill to the agent's path and returns it", () => {
    const root = mkdtempSync(join(tmpdir(), "lyse-skill-"));
    const claude = AGENTS.find((a) => a.id === "claude-code")!;
    const res = installLyseSkill(claude, root);
    expect(res.installed).toBe(true);
    expect(res.path).toBe(join(root, ".claude/skills/lyse/SKILL.md"));
    expect(readFileSync(res.path, "utf8")).toContain("name: lyse");
  });

  it("lyseSkillSource returns the skill markdown with frontmatter", () => {
    expect(lyseSkillSource()).toContain("# Lyse — fix design-system drift");
  });
});
