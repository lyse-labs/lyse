import { describe, it, expect } from "vitest";
import { renderTable } from "../../src/reporters/table.js";
import type { AuditResult } from "../../src/types.js";
import type { TerminalOpts } from "../../src/reporters/terminal-format.js";

const result: AuditResult = {
  schemaVersion: 2, rulesVersion: "0.1.0", toolVersion: "0.1.0", scoringVersion: "scoring-v1",
  repoRoot: "/r", timestamp: "", stack: [], finalScore: 50, axes: [],
  findings: [
    { ruleId: "tokens/no-hardcoded-color", axis: "tokens", severity: "warning",
      location: { file: "src/Button.tsx", line: 14, column: 1 }, message: "Hardcoded color #3B82F6" },
    { ruleId: "responsive/no-hardcoded-media-query", axis: "responsive", severity: "error",
      location: { file: "src/Modal.tsx", line: 31, column: 1 }, message: "Hardcoded media query 768px" },
  ],
};
const opts: TerminalOpts = {
  mode: "default", color: false, unicode: false, width: 100,
  outDir: undefined, fileCount: 2, durationMs: 0, cwd: "/r",
};

describe("renderTable", () => {
  it("has a header row and one row per finding (error sorted first)", () => {
    const out = renderTable(result, opts);
    const lines = out.split("\n").filter((l) => l.trim() !== "");
    expect(lines[0]).toContain("SEVERITY");
    expect(lines[0]).toContain("RULE");
    expect(lines[0]).toContain("LOCATION");
    expect(lines[0]).toContain("MESSAGE");
    const body = lines.slice(1).join("\n");
    expect(body).toContain("error");
    expect(body).toContain("responsive/no-hardcoded-media-query");
    expect(body).toContain("src/Modal.tsx:31");
    expect(body.indexOf("Modal.tsx")).toBeLessThan(body.indexOf("Button.tsx"));
  });

  it("emits no ANSI escapes when color is off", () => {
    // eslint-disable-next-line no-control-regex
    expect(/\x1b\[/.test(renderTable(result, opts))).toBe(false);
  });

  it("honors findingsLimit", () => {
    const out = renderTable(result, { ...opts, findingsLimit: 1 });
    const rows = out.split("\n").filter((l) => l.includes(".tsx:"));
    expect(rows).toHaveLength(1);
  });

  it("renders an empty-state line when there are no findings", () => {
    const out = renderTable({ ...result, findings: [] }, opts);
    expect(out.toLowerCase()).toContain("no findings");
  });
});
