import { describe, it, expect } from "vitest";
import { renderTsv } from "../../src/reporters/tsv.js";
import type { AuditResult } from "../../src/types.js";

const base: AuditResult = {
  schemaVersion: 2, rulesVersion: "0.1.0", toolVersion: "0.1.0", scoringVersion: "scoring-v1",
  repoRoot: "/r", timestamp: "", stack: [], finalScore: 50, axes: [],
  findings: [
    { ruleId: "tokens/b", axis: "tokens", severity: "warning",
      location: { file: "src/B.tsx", line: 2, column: 1 }, message: "msg\twith\ttabs" },
    { ruleId: "tokens/a", axis: "tokens", severity: "error",
      location: { file: "src/A.tsx", line: 9, column: 3 }, message: "first" },
  ],
};

describe("renderTsv", () => {
  it("emits one tab-separated line per finding, error before warning, no header", () => {
    const out = renderTsv(base);
    const lines = out.trimEnd().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("error\ttokens/a\ttokens\tsrc/A.tsx\t9\t3\tfirst");
    expect(lines[0]!.split("\t")).toHaveLength(7);
  });

  it("sanitizes tabs/newlines in the message so columns stay parseable", () => {
    const warnLine = renderTsv(base).trimEnd().split("\n")[1]!;
    expect(warnLine).toBe("warning\ttokens/b\ttokens\tsrc/B.tsx\t2\t1\tmsg with tabs");
  });

  it("ends with a trailing newline when there are findings, empty string when none", () => {
    expect(renderTsv(base).endsWith("\n")).toBe(true);
    expect(renderTsv({ ...base, findings: [] })).toBe("");
  });
});
