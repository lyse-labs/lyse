import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildGraphForRoot } from "./build-io.js";

describe("buildGraphForRoot", () => {
  it("builds a graph (rule-free) from a repo root", async () => {
    const root = mkdtempSync(join(tmpdir(), "lyse-io-"));
    writeFileSync(join(root, "a.tokens.json"), JSON.stringify({ color: { p: { $value: "#3b82f6", $type: "color" } } }));
    const g = await buildGraphForRoot(root);
    expect(g.schemaVersion).toBe(1);
    expect(g.tokens.some((t) => t.rawValue === "#3b82f6")).toBe(true);
  });
});
