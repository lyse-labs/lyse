import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rule, _internal } from "../../src/rules/ai-surface-mcp-config-present.js";
import type { RuleContext, ParsedFiles } from "../../src/types.js";

const emptyParsed: ParsedFiles = { ts: [], css: [], cssInJs: [] };

function makeCtx(repoRoot: string): RuleContext {
  return {
    repoRoot,
    tokens: null,
    componentsModule: null,
    componentInventory: [],
    storyIndex: null,
    excludePaths: [],
  };
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2));
}

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "lyse-mcp-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("rule ai-surface/mcp-config-present", () => {
  describe("fixture: mcp-valid", () => {
    it("emits no findings when .mcp.json declares 1 valid server", async () => {
      writeJson(join(tmp, ".mcp.json"), {
        mcpServers: {
          lyse: { command: "npx", args: ["@lyse-labs/lyse", "mcp"] },
        },
      });
      const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
      expect(result.findings).toHaveLength(0);
      expect(result.opportunities).toBe(1);
    });

    it("accepts a server entry with command but no args", async () => {
      writeJson(join(tmp, ".mcp.json"), {
        mcpServers: { ds: { command: "./server.js" } },
      });
      const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
      expect(result.findings).toHaveLength(0);
    });
  });

  describe("fixture: mcp-malformed", () => {
    it("emits an error for broken JSON", async () => {
      writeFileSync(join(tmp, ".mcp.json"), "{ this is not json");
      const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
      const errors = result.findings.filter((f) => f.severity === "error");
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors[0]?.message).toContain("not valid JSON");
    });
  });

  describe("fixture: mcp-empty", () => {
    it("emits an error for empty mcpServers object", async () => {
      writeJson(join(tmp, ".mcp.json"), { mcpServers: {} });
      const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
      const errors = result.findings.filter((f) => f.severity === "error");
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors[0]?.message).toContain("empty");
    });

    it("emits an error when mcpServers field is missing", async () => {
      writeJson(join(tmp, ".mcp.json"), { something: "else" });
      const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
      const errors = result.findings.filter((f) => f.severity === "error");
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors[0]?.message).toContain("mcpServers");
    });
  });

  describe("fixture: mcp-missing", () => {
    it("emits a single warning when no config file is found", async () => {
      const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]?.severity).toBe("warning");
      expect(result.findings[0]?.axis).toBe("ai-surface");
      expect(result.findings[0]?.message).toContain("No MCP config");
      expect(result.opportunities).toBe(1);
    });
  });

  describe("fixture: cursor-mcp", () => {
    it("emits no findings when .cursor/mcp.json declares 1 valid server", async () => {
      mkdirSync(join(tmp, ".cursor"), { recursive: true });
      writeJson(join(tmp, ".cursor/mcp.json"), {
        mcpServers: { ds: { command: "node", args: ["./mcp.js"] } },
      });
      const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
      expect(result.findings).toHaveLength(0);
      expect(result.opportunities).toBe(1);
    });

    it("also accepts claude_desktop_config.json at repo root", async () => {
      writeJson(join(tmp, "claude_desktop_config.json"), {
        mcpServers: { ds: { command: "node", args: ["./mcp.js"] } },
      });
      const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
      expect(result.findings).toHaveLength(0);
    });
  });

  describe("edge case: parse error on partially-valid JSON", () => {
    it("emits an error for a file containing only an array", async () => {
      writeJson(join(tmp, ".mcp.json"), ["mcpServers"]);
      const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
      const errors = result.findings.filter((f) => f.severity === "error");
      expect(errors.length).toBeGreaterThanOrEqual(1);
    });

    it("emits an error when a server entry lacks `command`", async () => {
      writeJson(join(tmp, ".mcp.json"), {
        mcpServers: { broken: { args: ["x"] } },
      });
      const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
      const errors = result.findings.filter((f) => f.severity === "error");
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors[0]?.message).toContain("command");
    });

    it("emits an error when `args` is not an array", async () => {
      writeJson(join(tmp, ".mcp.json"), {
        mcpServers: { broken: { command: "node", args: "not-an-array" } },
      });
      const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
      const errors = result.findings.filter((f) => f.severity === "error");
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors[0]?.message).toContain("args");
    });

    it("accepts an empty args array", async () => {
      writeJson(join(tmp, ".mcp.json"), {
        mcpServers: { ok: { command: "node", args: [] } },
      });
      const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
      const errors = result.findings.filter((f) => f.severity === "error");
      expect(errors).toHaveLength(0);
    });

    it("treats a file containing literal `null` as a config-root error, not a parse error", async () => {
      writeFileSync(join(tmp, ".mcp.json"), "null");
      const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
      const errors = result.findings.filter((f) => f.severity === "error");
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors[0]?.message).not.toContain("is not valid JSON");
      expect(errors[0]?.message).toContain("root is not a JSON object");
    });
  });

  describe("edge case: empty file", () => {
    it("emits an error for an empty .mcp.json file", async () => {
      writeFileSync(join(tmp, ".mcp.json"), "");
      const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
      const errors = result.findings.filter((f) => f.severity === "error");
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors[0]?.message).toMatch(/not valid JSON|empty/i);
    });
  });

  describe("allowlist", () => {
    it("suppresses findings when README contains the disable directive", async () => {
      writeFileSync(
        join(tmp, "README.md"),
        "# Project\n\n<!-- lyse-disable ai-surface/mcp-config-present -->\n\nNo MCP needed.\n",
      );
      const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
      expect(result.findings).toHaveLength(0);
      expect(result.opportunities).toBe(0);
    });

    it("does NOT suppress when the disable directive is in another file", async () => {
      writeFileSync(
        join(tmp, "NOTES.md"),
        "// lyse-disable ai-surface/mcp-config-present",
      );
      const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
      expect(result.findings).toHaveLength(1);
    });
  });

  it("does not emit when repoRoot is missing", async () => {
    const ctx: RuleContext = { ...makeCtx(tmp), repoRoot: "" };
    const result = await rule.evaluate(ctx, emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });
});

describe("_internal helpers", () => {
  it("validateServerEntry accepts { command } and { command, args }", () => {
    expect(_internal.validateServerEntry("a", { command: "node" }).ok).toBe(true);
    expect(_internal.validateServerEntry("a", { command: "node", args: ["x"] }).ok).toBe(true);
  });

  it("validateServerEntry rejects empty name", () => {
    expect(_internal.validateServerEntry("", { command: "node" }).ok).toBe(false);
  });

  it("validateServerEntry rejects missing command", () => {
    expect(_internal.validateServerEntry("a", { args: ["x"] }).ok).toBe(false);
  });

  it("validateServerEntry rejects non-string command", () => {
    expect(_internal.validateServerEntry("a", { command: 123 }).ok).toBe(false);
  });

  it("validateServerEntry rejects non-array args", () => {
    expect(_internal.validateServerEntry("a", { command: "node", args: "x" }).ok).toBe(false);
  });

  it("validateConfig rejects null and primitives", () => {
    expect(_internal.validateConfig(null).validServers).toBe(0);
    expect(_internal.validateConfig("string").errors.length).toBeGreaterThan(0);
  });

  it("validateConfig counts valid servers", () => {
    const result = _internal.validateConfig({
      mcpServers: {
        a: { command: "x" },
        b: { command: "y", args: ["z"] },
      },
    });
    expect(result.validServers).toBe(2);
    expect(result.errors).toHaveLength(0);
  });
});
