import { describe, it, expect } from "vitest";
import { groupFindings, MIGRATION_SCALE_FILE_COUNT_DEFAULT } from "../../src/report/fix-groups.js";
import type { Finding } from "../../src/types.js";

function finding(overrides: Partial<Finding> & Pick<Finding, "ruleId" | "axis">): Finding {
  return {
    severity: "warning",
    location: { file: "src/File.tsx", line: 1, column: 1 },
    message: "drift",
    ...overrides,
  };
}

describe("groupFindings", () => {
  it("groups by fixGroup.key when present, keeping distinct `from` values as distinct groups", () => {
    const findings: Finding[] = [
      finding({
        ruleId: "tokens/no-hardcoded-color",
        axis: "tokens",
        location: { file: "src/A.tsx", line: 1, column: 1 },
        fixGroup: { key: "tokens/no-hardcoded-color::#3b82f6", from: "#3b82f6", to: "color.brand.primary" },
      }),
      finding({
        ruleId: "tokens/no-hardcoded-color",
        axis: "tokens",
        location: { file: "src/B.tsx", line: 1, column: 1 },
        fixGroup: { key: "tokens/no-hardcoded-color::#3b82f6", from: "#3b82f6", to: "color.brand.primary" },
      }),
      finding({
        ruleId: "tokens/no-hardcoded-color",
        axis: "tokens",
        location: { file: "src/C.tsx", line: 1, column: 1 },
        fixGroup: { key: "tokens/no-hardcoded-color::#ff0000", from: "#ff0000" },
      }),
    ];

    const groups = groupFindings(findings, MIGRATION_SCALE_FILE_COUNT_DEFAULT);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      key: "tokens/no-hardcoded-color::#3b82f6",
      ruleId: "tokens/no-hardcoded-color",
      from: "#3b82f6",
      to: "color.brand.primary",
      fileCount: 2,
    });
    expect(groups[0]?.findings).toHaveLength(2);
    expect(groups[1]).toMatchObject({
      key: "tokens/no-hardcoded-color::#ff0000",
      ruleId: "tokens/no-hardcoded-color",
      from: "#ff0000",
      fileCount: 1,
    });
    expect(groups[1]?.to).toBeUndefined();
  });

  it("falls back to ruleId as the key when fixGroup is absent", () => {
    const findings: Finding[] = [
      finding({ ruleId: "a11y/essentials", axis: "a11y", location: { file: "src/A.tsx", line: 1, column: 1 } }),
      finding({ ruleId: "a11y/essentials", axis: "a11y", location: { file: "src/B.tsx", line: 2, column: 1 } }),
    ];

    const groups = groupFindings(findings, MIGRATION_SCALE_FILE_COUNT_DEFAULT);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe("a11y/essentials");
    expect(groups[0]?.from).toBeUndefined();
    expect(groups[0]?.to).toBeUndefined();
    expect(groups[0]?.findings).toHaveLength(2);
  });

  it("sorts by findings.length descending, then key ascending as a deterministic tiebreak", () => {
    const findings: Finding[] = [
      finding({ ruleId: "z/rule", axis: "components", location: { file: "src/z1.tsx", line: 1, column: 1 } }),
      finding({ ruleId: "a/rule", axis: "components", location: { file: "src/a1.tsx", line: 1, column: 1 } }),
      finding({ ruleId: "m/rule", axis: "components", location: { file: "src/m1.tsx", line: 1, column: 1 } }),
      finding({ ruleId: "m/rule", axis: "components", location: { file: "src/m2.tsx", line: 1, column: 1 } }),
    ];

    const groups = groupFindings(findings, MIGRATION_SCALE_FILE_COUNT_DEFAULT);

    expect(groups.map((g) => g.key)).toEqual(["m/rule", "a/rule", "z/rule"]);

    // Determinism: re-running on a freshly ordered copy of the same findings
    // produces the identical grouping.
    const again = groupFindings([...findings].reverse(), MIGRATION_SCALE_FILE_COUNT_DEFAULT);
    expect(again.map((g) => g.key)).toEqual(["m/rule", "a/rule", "z/rule"]);
  });

  it("counts distinct files only — the same file hit twice counts once", () => {
    const findings: Finding[] = [
      finding({ ruleId: "tokens/rule", axis: "tokens", location: { file: "src/A.tsx", line: 1, column: 1 } }),
      finding({ ruleId: "tokens/rule", axis: "tokens", location: { file: "src/A.tsx", line: 9, column: 3 } }),
      finding({ ruleId: "tokens/rule", axis: "tokens", location: { file: "src/B.tsx", line: 1, column: 1 } }),
    ];

    const groups = groupFindings(findings, MIGRATION_SCALE_FILE_COUNT_DEFAULT);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.findings).toHaveLength(3);
    expect(groups[0]?.fileCount).toBe(2);
  });

  it("flags migrationScale true at the threshold and false just below it", () => {
    const makeFindings = (fileCount: number): Finding[] =>
      Array.from({ length: fileCount }, (_, i) =>
        finding({ ruleId: "tokens/rule", axis: "tokens", location: { file: `src/F${i}.tsx`, line: 1, column: 1 } }),
      );

    const atThreshold = groupFindings(makeFindings(3), 3);
    expect(atThreshold[0]?.fileCount).toBe(3);
    expect(atThreshold[0]?.migrationScale).toBe(true);

    const belowThreshold = groupFindings(makeFindings(2), 3);
    expect(belowThreshold[0]?.fileCount).toBe(2);
    expect(belowThreshold[0]?.migrationScale).toBe(false);
  });

  it("returns an empty array for no findings", () => {
    expect(groupFindings([], MIGRATION_SCALE_FILE_COUNT_DEFAULT)).toEqual([]);
  });

  it("ranks an error group above an alphabetically-earlier warning group on equal counts (severity tiebreak before key)", () => {
    const findings: Finding[] = [
      finding({
        ruleId: "a/warn-rule", axis: "tokens", severity: "warning",
        location: { file: "src/A1.tsx", line: 1, column: 1 },
      }),
      finding({
        ruleId: "a/warn-rule", axis: "tokens", severity: "warning",
        location: { file: "src/A2.tsx", line: 1, column: 1 },
      }),
      finding({
        ruleId: "z/error-rule", axis: "tokens", severity: "error",
        location: { file: "src/Z1.tsx", line: 1, column: 1 },
      }),
      finding({
        ruleId: "z/error-rule", axis: "tokens", severity: "error",
        location: { file: "src/Z2.tsx", line: 1, column: 1 },
      }),
    ];

    const groups = groupFindings(findings, MIGRATION_SCALE_FILE_COUNT_DEFAULT);

    // Both groups have count 2; key-only ordering would put "a/warn-rule" first.
    // Severity-aware ordering (error < warning < info) must put the error
    // group first despite its alphabetically-later key.
    expect(groups.map((g) => g.key)).toEqual(["z/error-rule", "a/warn-rule"]);
  });
});
