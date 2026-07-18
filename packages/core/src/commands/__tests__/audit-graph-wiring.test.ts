import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditDirectory } from "../audit-pipeline.js";

describe("audit pipeline graph wiring", () => {
  it("attaches meta.extraction and returns a graph", async () => {
    const root = mkdtempSync(join(tmpdir(), "lyse-wire-"));
    writeFileSync(join(root, "a.tokens.json"), JSON.stringify({ color: { p: { $value: "#3b82f6", $type: "color" } } }));
    const { result, graph } = await auditDirectory(root, { staticOnly: true });
    expect(graph.schemaVersion).toBe(1);
    expect(result.meta?.extraction?.entries.some((e) => e.extractor === "tokens")).toBe(true);
    expect(graph.tokens.some((t) => t.rawValue === "#3b82f6")).toBe(true);
  });

  it("seeds inventory from story titles when no module is configured (Appendix-A flip)", async () => {
    const root = mkdtempSync(join(tmpdir(), "lyse-wire2-"));
    writeFileSync(join(root, "Button.stories.tsx"),
      `export default { title: "Button" };\nexport const Primary = { args: { variant: "primary" } };`);
    const { result, componentInventory } = await auditDirectory(root, { staticOnly: true });
    expect(componentInventory.some((c) => c.name === "Button")).toBe(true);
    const stories = result.axes.find((a) => a.axis === "stories");
    expect(stories?.score).not.toBe("N/A");
  });
});
