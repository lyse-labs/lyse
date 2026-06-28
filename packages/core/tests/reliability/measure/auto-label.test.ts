import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { autoLabel } from "../../../src/reliability/measure/auto-label.js";
import type { FindingRow } from "../../../../scripts/harvest-findings.js";

function makeTmpRepo(): string {
  return mkdtempSync(join(tmpdir(), "lyse-auto-label-test-"));
}

const cleanups: string[] = [];
function tempRepo(): string {
  const dir = makeTmpRepo();
  cleanups.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of cleanups.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

function row(overrides: Partial<FindingRow> = {}): FindingRow {
  return {
    ruleId: "ai-surface/component-manifest-json",
    repo: "test-repo",
    file: "components.json",
    line: 1,
    snippet: "",
    fileType: ".json",
    confidence: "high",
    ...overrides,
  };
}

describe("autoLabel (structural)", () => {
  describe("ai-surface/component-manifest-json", () => {
    it("labels tp when no manifest exists in repo", () => {
      const repoDir = tempRepo();
      const label = autoLabel(row({ ruleId: "ai-surface/component-manifest-json" }), repoDir);
      expect(label.verdict).toBe("tp");
      expect(label.source).toBe("auto");
      expect(label.reason.length).toBeGreaterThan(0);
    });

    it("labels fp when a valid components.json exists", () => {
      const repoDir = tempRepo();
      writeFileSync(
        join(repoDir, "components.json"),
        JSON.stringify({
          components: [{ name: "Button", sourceFile: "src/button.tsx" }],
        }),
      );
      const label = autoLabel(row({ ruleId: "ai-surface/component-manifest-json" }), repoDir);
      expect(label.verdict).toBe("fp");
      expect(label.source).toBe("auto");
    });
  });

  describe("versioning/changelog-present", () => {
    it("labels tp when no CHANGELOG exists", () => {
      const repoDir = tempRepo();
      const label = autoLabel(
        row({ ruleId: "versioning/changelog-present", file: "CHANGELOG.md" }),
        repoDir,
      );
      expect(label.verdict).toBe("tp");
    });

    it("labels fp when CHANGELOG.md with version entries exists", () => {
      const repoDir = tempRepo();
      writeFileSync(
        join(repoDir, "CHANGELOG.md"),
        "## [1.0.0] - 2026-01-01\n### Added\n- Initial release\n",
      );
      const label = autoLabel(
        row({ ruleId: "versioning/changelog-present", file: "CHANGELOG.md" }),
        repoDir,
      );
      expect(label.verdict).toBe("fp");
    });
  });

  describe("versioning/semver-versioning", () => {
    it("labels tp when package.json has no valid semver", () => {
      const repoDir = tempRepo();
      writeFileSync(join(repoDir, "package.json"), JSON.stringify({ name: "test", version: "not-semver" }));
      const label = autoLabel(
        row({ ruleId: "versioning/semver-versioning", file: "package.json" }),
        repoDir,
      );
      expect(label.verdict).toBe("tp");
    });

    it("labels fp when package.json has valid semver", () => {
      const repoDir = tempRepo();
      writeFileSync(join(repoDir, "package.json"), JSON.stringify({ name: "test", version: "1.2.3" }));
      const label = autoLabel(
        row({ ruleId: "versioning/semver-versioning", file: "package.json" }),
        repoDir,
      );
      expect(label.verdict).toBe("fp");
    });
  });

  describe("versioning/migration-guide-present", () => {
    it("labels tp when no migration guide exists", () => {
      const repoDir = tempRepo();
      const label = autoLabel(
        row({ ruleId: "versioning/migration-guide-present", file: "MIGRATION.md" }),
        repoDir,
      );
      expect(label.verdict).toBe("tp");
    });

    it("labels fp when MIGRATION.md exists at root", () => {
      const repoDir = tempRepo();
      writeFileSync(join(repoDir, "MIGRATION.md"), "# Migration guide\n\nUpgrade steps.\n");
      const label = autoLabel(
        row({ ruleId: "versioning/migration-guide-present", file: "MIGRATION.md" }),
        repoDir,
      );
      expect(label.verdict).toBe("fp");
    });
  });

  describe("ai-surface/mcp-config-present", () => {
    it("labels tp when no mcp config exists", () => {
      const repoDir = tempRepo();
      const label = autoLabel(
        row({ ruleId: "ai-surface/mcp-config-present", file: ".mcp.json" }),
        repoDir,
      );
      expect(label.verdict).toBe("tp");
    });

    it("labels fp when .mcp.json exists", () => {
      const repoDir = tempRepo();
      writeFileSync(join(repoDir, ".mcp.json"), JSON.stringify({ mcpServers: {} }));
      const label = autoLabel(
        row({ ruleId: "ai-surface/mcp-config-present", file: ".mcp.json" }),
        repoDir,
      );
      expect(label.verdict).toBe("fp");
    });
  });

  describe("ai-surface/llms-txt-structure", () => {
    it("labels tp when no llms.txt exists", () => {
      const repoDir = tempRepo();
      const label = autoLabel(
        row({ ruleId: "ai-surface/llms-txt-structure", file: "llms.txt" }),
        repoDir,
      );
      expect(label.verdict).toBe("tp");
    });

    it("routes to needs-verifier when llms.txt exists at root", () => {
      const repoDir = tempRepo();
      writeFileSync(join(repoDir, "llms.txt"), "# My DS\n\n> A design system.\n\n## Components\n\n- [Button](./button.md): Main button.\n");
      const label = autoLabel(
        row({ ruleId: "ai-surface/llms-txt-structure", file: "llms.txt" }),
        repoDir,
      );
      expect(label.verdict).toBe("fp");
      expect(label.reason).toBe("needs-verifier");
    });
  });

  describe("ai-surface/agents-md-quality", () => {
    it("labels tp when no AGENTS.md exists", () => {
      const repoDir = tempRepo();
      const label = autoLabel(
        row({ ruleId: "ai-surface/agents-md-quality", file: "AGENTS.md" }),
        repoDir,
      );
      expect(label.verdict).toBe("tp");
    });

    it("routes to needs-verifier when AGENTS.md exists at root", () => {
      const repoDir = tempRepo();
      writeFileSync(join(repoDir, "AGENTS.md"), "# Agents\n\nRun:\n\n```sh\npnpm test\n```\n\nExit codes: 0 = success.\n");
      const label = autoLabel(
        row({ ruleId: "ai-surface/agents-md-quality", file: "AGENTS.md" }),
        repoDir,
      );
      expect(label.verdict).toBe("fp");
      expect(label.reason).toBe("needs-verifier");
    });
  });

  describe("structural rule with no specific verifier", () => {
    it("falls back to needs-verifier fp for tokens/dtcg-conformance", () => {
      const repoDir = tempRepo();
      const label = autoLabel(
        row({ ruleId: "tokens/dtcg-conformance", file: "tokens.json" }),
        repoDir,
      );
      expect(label.verdict).toBe("fp");
      expect(label.reason).toContain("needs-verifier");
    });

    it("falls back to needs-verifier fp for components/doc-comments", () => {
      const repoDir = tempRepo();
      const label = autoLabel(
        row({ ruleId: "components/doc-comments", file: "src/Button.tsx" }),
        repoDir,
      );
      expect(label.verdict).toBe("fp");
      expect(label.reason).toContain("needs-verifier");
    });
  });

  describe("detection rule throws", () => {
    it("throws when called with a detection rule", () => {
      expect(() =>
        autoLabel(
          row({ ruleId: "tokens/no-hardcoded-color", file: "styles.css" }),
          "/tmp",
        ),
      ).toThrow();
    });

    it("throws when called with an ai-governance detection rule", () => {
      expect(() =>
        autoLabel(
          row({ ruleId: "ai-governance/ai-marker-component-present", file: "src/AiMarker.tsx" }),
          "/tmp",
        ),
      ).toThrow();
    });
  });

  describe("render-only rule throws", () => {
    it("throws when called with a render-only rule", () => {
      expect(() =>
        autoLabel(
          row({ ruleId: "a11y/runtime-axe", file: "src/Button.tsx" }),
          "/tmp",
        ),
      ).toThrow();
    });
  });
});
