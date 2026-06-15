import { describe, it, expect } from "vitest";
import { listResources, readResource } from "../../src/mcp/resources.js";
import { RULE_MANIFEST_OBJECT } from "../../src/rules/manifest.js";

describe("MCP resources (#95)", () => {
  it("lists the rules manifest + one resource per rule", () => {
    const resources = listResources();
    // 1 manifest resource + one per rule
    expect(resources.length).toBe(RULE_MANIFEST_OBJECT.rules.length + 1);
    expect(resources[0]!.uri).toBe("lyse://rules");
    expect(resources.every((r) => r.mimeType === "application/json")).toBe(true);
    expect(resources.some((r) => r.uri === "lyse://rule/tokens/no-hardcoded-color")).toBe(true);
  });

  it("reads the full manifest", () => {
    const c = readResource("lyse://rules");
    expect(c).not.toBeNull();
    const parsed = JSON.parse(c![0]!.text);
    expect(parsed.rules.length).toBe(RULE_MANIFEST_OBJECT.rules.length);
  });

  it("reads a single rule's metadata by uri", () => {
    const c = readResource("lyse://rule/tokens/no-hardcoded-color");
    expect(c).not.toBeNull();
    const meta = JSON.parse(c![0]!.text);
    expect(meta.id).toBe("tokens/no-hardcoded-color");
    expect(meta.axis).toBe("tokens");
    expect(typeof meta.fullDescription).toBe("string");
  });

  it("returns null for an unknown resource uri", () => {
    expect(readResource("lyse://rule/does/not-exist")).toBeNull();
    expect(readResource("lyse://nonsense")).toBeNull();
  });
});
