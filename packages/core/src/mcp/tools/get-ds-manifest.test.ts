import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDsManifestTool, runGetDsManifest } from "./get-ds-manifest.js";

describe("get_ds_manifest", () => {
  it("declares project_root as a required input", () => {
    expect(getDsManifestTool.name).toBe("get_ds_manifest");
    expect(getDsManifestTool.inputSchema.required).toContain("project_root");
  });

  it("serves the projected manifest for a project", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lyse-mcp-manifest-"));
    writeFileSync(
      join(dir, "a.tokens.json"),
      JSON.stringify({ color: { brand: { $type: "color", $value: "#3b82f6" } } }),
    );
    const out = await runGetDsManifest({ project_root: dir });
    expect(out.manifest.schemaVersion).toBe(1);
    expect(out.manifest.tokens.some((t) => t.value === "#3b82f6")).toBe(true);
    expect(out.manifest.extraction).toBeDefined();
  });

  it("throws a clear error when project_root is missing", async () => {
    await expect(runGetDsManifest({})).rejects.toThrow(/project_root/);
  });
});
