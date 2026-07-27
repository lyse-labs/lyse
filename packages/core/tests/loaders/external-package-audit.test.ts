import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditDirectory } from "../../src/commands/audit-pipeline.js";
import type { Finding } from "../../src/types.js";

function repo(withConfig: boolean): string {
  const root = mkdtempSync(join(tmpdir(), "lyse-extpkg-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "consumer", version: "1.0.0" }));
  const css = join(root, "node_modules/@acme/tokens/dist/css/tokens.css");
  mkdirSync(join(css, ".."), { recursive: true });
  writeFileSync(css, ":root { --color-brand: #3b82f6; }");
  // App code hardcoding the brand colour (app zone, not a token-def file).
  writeFileSync(join(root, "Button.tsx"), 'export const s = { color: "#3b82f6" };\n');
  if (withConfig) {
    writeFileSync(join(root, ".lyse.yaml"), 'designSystem:\n  tokenPackages:\n    - "@acme/tokens"\n');
  }
  return root;
}

function brandFinding(findings: Finding[]): Finding | undefined {
  return findings.find(
    (f) => f.ruleId === "tokens/no-hardcoded-color" && f.location.file.endsWith("Button.tsx"),
  );
}

describe("external-package tokens end-to-end", () => {
  it("resolves a hardcoded colour EXACT against an external token (warning/high) WITH config", async () => {
    const { result } = await auditDirectory(repo(true));
    const f = brandFinding(result.findings);
    expect(f).toBeDefined();
    expect(f?.severity).toBe("warning");
    expect(f?.confidence).toBe("high");
  });

  it("is opt-in: the SAME repo without tokenPackages classifies it novel (info/low)", async () => {
    const { result } = await auditDirectory(repo(false));
    const f = brandFinding(result.findings);
    expect(f).toBeDefined();
    expect(f?.severity).toBe("info");
    expect(f?.confidence).toBe("low");
  });

  it("is fail-safe: a configured-but-uninstalled package does not crash the audit", async () => {
    const root = repo(false);
    writeFileSync(join(root, ".lyse.yaml"), 'designSystem:\n  tokenPackages:\n    - "@not/installed"\n');
    const { result } = await auditDirectory(root);
    expect(brandFinding(result.findings)?.severity).toBe("info"); // no external token → novel, no crash
  });
});
