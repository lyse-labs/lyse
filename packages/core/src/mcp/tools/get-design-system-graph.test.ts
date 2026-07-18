import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDesignSystemGraphTool, runGetDesignSystemGraph } from "./get-design-system-graph.js";

describe("get_design_system_graph tool", () => {
  it("declares an input+output schema and a name", () => {
    expect(getDesignSystemGraphTool.name).toBe("get_design_system_graph");
    expect(getDesignSystemGraphTool.inputSchema.required).toEqual(["project_root"]);
  });
  it("returns the graph for a project root", async () => {
    const root = mkdtempSync(join(tmpdir(), "lyse-mcp-"));
    writeFileSync(join(root, "a.tokens.json"), JSON.stringify({ color: { p: { $value: "#3b82f6", $type: "color" } } }));
    const out = await runGetDesignSystemGraph({ project_root: root });
    expect(out.schema_version).toBe("1.0.0");
    expect(out.graph.tokens.some((t) => t.rawValue === "#3b82f6")).toBe(true);
  });
});
