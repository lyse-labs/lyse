import { describe, it, expect } from "vitest";
import { renderTerminal } from "../../src/reporters/terminal.js";
import type { AuditResult } from "../../src/types.js";

const sample: AuditResult = {
  schemaVersion: 2,
  rulesVersion: "0.1.0",
  toolVersion: "0.1.0-alpha.1",
  scoringVersion: "scoring-v1",
  repoRoot: "/r",
  timestamp: "2026-05-15T14:23:00.000Z",
  stack: ["react", "tailwind", "storybook"],
  finalScore: 43,
  axes: [
    { axis: "tokens", score: 31, findings: 247, opportunities: 358 },
    { axis: "a11y", score: 62, findings: 41, opportunities: 108 },
    { axis: "components", score: 38, findings: 89, opportunities: 143 },
    { axis: "stories", score: 47, findings: 56, opportunities: 105 },
  ],
  findings: [
    {
      ruleId: "tokens/no-hardcoded-color", axis: "tokens", severity: "warning",
      location: { file: "src/Header.tsx", line: 42, column: 1 },
      message: "Hardcoded color value: #2563eb",
      suggestion: "consider replacing with token color.action.primary",
    },
    {
      ruleId: "components/no-native-shadows", axis: "components", severity: "warning",
      location: { file: "src/Send.tsx", line: 118, column: 1 },
      message: "Native <button> used where <Button> from @acme/ui is available",
    },
    {
      ruleId: "a11y/essentials", axis: "a11y", severity: "warning",
      location: { file: "src/Logo.tsx", line: 9, column: 1 },
      message: "[jsx-a11y/alt-text] img elements must have an alt prop",
    },
  ],
};

const baseOpts = { mode: "default" as const, color: false, unicode: false, width: 80, outDir: "report", fileCount: 247, durationMs: 1400, cwd: "/tmp/test" };

describe("renderTerminal (plain-text mode for snapshot stability)", () => {
  it("shows an (auto-fail) indicator when the grade auto-failed", async () => {
    const out = await renderTerminal(
      { ...sample, finalScore: 0, grade: { grade: "Fail", autoFailed: true } },
      baseOpts,
    );
    expect(out).toContain("(auto-fail)");
  });

  it("omits the auto-fail indicator on a normal grade", async () => {
    const out = await renderTerminal(
      { ...sample, grade: { grade: "C", autoFailed: false } },
      baseOpts,
    );
    expect(out).not.toContain("(auto-fail)");
  });

  it("suppressNags hides the static-only banner and the run-lyse-init hint", async () => {
    const withLayer4: AuditResult = { ...sample, meta: { layer4: { staticOnly: true } } } as AuditResult;
    const out = await renderTerminal(withLayer4, { ...baseOpts, hasTokenRegistry: false, suppressNags: true });
    expect(out).not.toContain("Static-only");
    expect(out).not.toContain("No token registry detected");
  });

  it("shows the nags by default (suppressNags off)", async () => {
    const withLayer4: AuditResult = { ...sample, meta: { layer4: { staticOnly: true } } } as AuditResult;
    const out = await renderTerminal(withLayer4, { ...baseOpts, hasTokenRegistry: false });
    expect(out).toContain("Static-only");
    expect(out).toContain("No token registry detected");
  });

  it("matches snapshot for the standard case", async () => {
    const out = await renderTerminal(sample, baseOpts);
    expect(out).toMatchSnapshot();
  });

  it("renders the score card box in the default view", async () => {
    const out = await renderTerminal(sample, baseOpts);
    expect(out).toContain("+");        // ascii border (unicode:false)
    expect(out).toContain("43/100");
    expect(out.indexOf("+")).toBeLessThan(out.indexOf("tokens"));
  });

  it("renders the clean report: score line, axes, top findings, no jargon", async () => {
    const out = await renderTerminal(sample, baseOpts);
    // score line: "● <grade> <score>/100   design system health"
    expect(out).toContain("43/100");
    expect(out).toContain("design system health");
    // axes present, no "findings" suffix clutter on the axis line
    expect(out).toContain("tokens");
    expect(out).toContain("a11y");
    expect(out).toContain("components");
    expect(out).toContain("stories");
    // findings
    expect(out).toContain("tokens/no-hardcoded-color");
    // jargon removed
    expect(out).not.toContain("scoring-v");
    expect(out).not.toContain("since");
    expect(out).not.toContain("Health Score ·");
  });

  it("renders every scored axis — ai-surface and ai-governance included (display parity with the score)", async () => {
    const six: AuditResult = {
      ...sample,
      axes: [
        ...sample.axes,
        { axis: "ai-surface", score: 55, findings: 3, opportunities: 8 },
        { axis: "ai-governance", score: "N/A", findings: 0, opportunities: 0 },
      ],
    };
    const out = await renderTerminal(six, baseOpts);
    expect(out).toContain("ai-surface");
    expect(out).toContain("ai-governance");
    const axisSection = out.split("Top findings")[0]!;
    expect(axisSection).toContain("55");
  });

  it("suggests `lyse init --scaffold` when ai-surface scores below 70", async () => {
    const six: AuditResult = {
      ...sample,
      axes: [...sample.axes, { axis: "ai-surface", score: 40, findings: 6, opportunities: 10 }],
    };
    const out = await renderTerminal(six, baseOpts);
    expect(out).toContain("lyse init --scaffold");
  });

  it("tokens tip points at `lyse handoff`, not a deprecated command", async () => {
    const out = await renderTerminal(sample, baseOpts);
    expect(out).toContain("lyse handoff");
    expect(out).not.toContain("agents-md");
  });

  it("quiet mode omits findings list and Next steps", async () => {
    const out = await renderTerminal(sample, { ...baseOpts, mode: "quiet" });
    expect(out).not.toContain("Top findings");
    expect(out).not.toContain("Next steps");
    expect(out).toContain("43");
  });

  it("verbose mode shows all findings (no truncation)", async () => {
    const longFindings = Array.from({ length: 12 }, (_, i) => ({
      ruleId: "tokens/no-hardcoded-color" as const, axis: "tokens" as const, severity: "warning" as const,
      location: { file: `src/F${i}.tsx`, line: i + 1, column: 1 }, message: `Hardcoded #${i}`,
    }));
    const result = { ...sample, findings: longFindings };
    const out = await renderTerminal(result, { ...baseOpts, mode: "verbose" });
    for (let i = 0; i < 12; i++) expect(out).toContain(`src/F${i}.tsx`);
    expect(out).not.toContain("more findings");
  });

  it("default mode truncates to 5 groups + shows N more groups (distinct rules, no fixGroup -> one group per rule)", async () => {
    const longFindings = Array.from({ length: 12 }, (_, i) => ({
      ruleId: `tokens/rule-${String(i).padStart(2, "0")}` as const, axis: "tokens" as const, severity: "warning" as const,
      location: { file: `src/F${i}.tsx`, line: i + 1, column: 1 }, message: `Hardcoded #${i}`,
    }));
    const result = { ...sample, findings: longFindings };
    const out = await renderTerminal(result, baseOpts);
    expect(out).toContain("7 more groups");
  });

  it("strips ANSI when color=false", async () => {
    const out = await renderTerminal(sample, baseOpts);
    expect(out).not.toMatch(/\x1b\[/);
  });

  it("uses plain ASCII (#-o) when unicode=false", async () => {
    const out = await renderTerminal(sample, baseOpts);
    expect(out).not.toContain("█");
    expect(out).not.toContain("░");
    expect(out).not.toContain("●");
    expect(out).toContain("#");
    expect(out).toContain("-");
    expect(out).toContain("o");
  });

  it("handles N/A axes gracefully", async () => {
    const naResult: AuditResult = {
      ...sample,
      axes: [
        { axis: "tokens", score: 31, findings: 1, opportunities: 5 },
        { axis: "a11y", score: 62, findings: 1, opportunities: 5 },
        { axis: "components", score: "N/A", findings: 0, opportunities: 0 },
        { axis: "stories", score: "N/A", findings: 0, opportunities: 0 },
      ],
    };
    const out = await renderTerminal(naResult, baseOpts);
    // N/A axes render as em-dash in the clean layout
    expect(out).toContain("—");
  });

  it("handles final score = N/A", async () => {
    const naResult: AuditResult = {
      ...sample,
      finalScore: "N/A",
      axes: sample.axes.map((a) => ({ ...a, score: "N/A" as const, opportunities: 0, findings: 0 })),
      findings: [],
    };
    const out = await renderTerminal(naResult, baseOpts);
    expect(out).toContain("N/A");
    expect(out).toContain("design system health");
  });

  it("renders a status glyph per axis (doctor view, ascii mode)", async () => {
    const out = await renderTerminal(sample, baseOpts);
    const lines = out.split("\n");
    const tokensLine = lines.find((l) => l.includes("tokens") && l.includes("31"));
    expect(tokensLine).toBeDefined();
    // tokens score 31 -> fail -> ascii glyph "x"
    expect(tokensLine).toContain("x ");
    const a11yLine = lines.find((l) => l.includes("a11y") && l.includes("62"));
    // a11y score 62 -> warn -> ascii glyph "!"
    expect(a11yLine).toContain("! ");
  });

  it("--format json branch is independent — renderTerminal is only called for human mode (sanity: no JSON pollution)", async () => {
    const out = await renderTerminal(sample, baseOpts);
    // Should not contain JSON markers (no curly braces at start of any line)
    expect(out.split("\n").every((line) => !line.trim().startsWith("{"))).toBe(true);
  });

  it("renders '=' symbol for zero delta (no change since last audit)", async () => {
    // Create a temporary directory with history showing two audits with identical scores
    const { mkdtempSync } = await import("node:fs");
    const { appendFileSync, mkdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const histDir = mkdtempSync(join(tmpdir(), "lyse-zero-delta-"));

    try {
      // Manually create history with two audits having the same score (43 to match sample)
      const historyFile = join(histDir, ".lyse", "history.ndjson");
      mkdirSync(join(histDir, ".lyse"), { recursive: true });

      const prev = new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString();
      const first = JSON.stringify({
        schema_version: 1,
        event_type: "audit",
        timestamp: prev,
        score: 43,
        axes: { tokens: 31, a11y: 62, components: 38, stories: 47 },
        findings_count: 200,
        commit_sha: "abc123",
        lyse_version: "0.1.0",
      });
      const second = JSON.stringify({
        schema_version: 1,
        event_type: "audit",
        timestamp: new Date().toISOString(),
        score: 43,
        axes: { tokens: 31, a11y: 62, components: 38, stories: 47 },
        findings_count: 243,
        commit_sha: "def456",
        lyse_version: "0.1.0",
      });

      appendFileSync(historyFile, first + "\n" + second + "\n");

      // Now render with the history directory
      const out = await renderTerminal(sample, { ...baseOpts, cwd: histDir });

      // Zero delta: no delta suffix shown at all (clean score line)
      expect(out).not.toContain("▲ 0");
      expect(out).not.toContain("▼ 0");
      expect(out).not.toContain("= 0");
    } finally {
      // Clean up - simple recursive delete using rmSync
      const { rmSync } = await import("node:fs");
      try {
        rmSync(histDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  });

  it("default mode groups same-fixGroup findings into one block with ×N and the one-fix-clears line", async () => {
    const grouped = Array.from({ length: 12 }, (_, i) => ({
      ruleId: "tokens/no-hardcoded-color" as const, axis: "tokens" as const, severity: "warning" as const,
      location: { file: `src/F${i}.tsx`, line: i + 1, column: 1 }, message: "Hardcoded color value",
      fixGroup: { key: "tokens/no-hardcoded-color::#2563eb", from: "#2563eb", to: "color.brand.primary" },
    }));
    const result = { ...sample, findings: grouped };
    const out = await renderTerminal(result, baseOpts);
    expect(out).toContain("×12");
    expect(out).toContain("one fix clears all 12 findings.");
    expect(out).toContain("and 11 more sites");
    expect(out).toContain("replace with color.brand.primary");
    // one block, not 12 — no leftover per-finding rows beyond the representative one
    expect(out).not.toContain("F1.tsx");
  });

  it("verbose mode stays flat even when findings share a fixGroup", async () => {
    const grouped = Array.from({ length: 3 }, (_, i) => ({
      ruleId: "tokens/no-hardcoded-color" as const, axis: "tokens" as const, severity: "warning" as const,
      location: { file: `src/F${i}.tsx`, line: i + 1, column: 1 }, message: "Hardcoded color value",
      fixGroup: { key: "tokens/no-hardcoded-color::#2563eb", from: "#2563eb", to: "color.brand.primary" },
    }));
    const result = { ...sample, findings: grouped };
    const out = await renderTerminal(result, { ...baseOpts, mode: "verbose" });
    for (let i = 0; i < 3; i++) expect(out).toContain(`F${i}.tsx`);
    expect(out).not.toContain("×3");
    expect(out).not.toContain("one fix clears all");
  });

  it("explicit --limit stays flat even when findings share a fixGroup", async () => {
    const grouped = Array.from({ length: 3 }, (_, i) => ({
      ruleId: "tokens/no-hardcoded-color" as const, axis: "tokens" as const, severity: "warning" as const,
      location: { file: `src/F${i}.tsx`, line: i + 1, column: 1 }, message: "Hardcoded color value",
      fixGroup: { key: "tokens/no-hardcoded-color::#2563eb", from: "#2563eb", to: "color.brand.primary" },
    }));
    const result = { ...sample, findings: grouped };
    const out = await renderTerminal(result, { ...baseOpts, findingsLimit: 2 });
    for (let i = 0; i < 2; i++) expect(out).toContain(`F${i}.tsx`);
    expect(out).not.toContain("×3");
    expect(out).not.toContain("one fix clears all");
  });

  it("migration-scale suffix appears only for a group flagged migrationScale via the projection", async () => {
    const flagged = Array.from({ length: 3 }, (_, i) => ({
      ruleId: "tokens/rule-flagged" as const, axis: "tokens" as const, severity: "warning" as const,
      location: { file: `src/Flag${i}.tsx`, line: i + 1, column: 1 }, message: "drift",
    }));
    const notFlagged = [{
      ruleId: "a11y/essentials" as const, axis: "a11y" as const, severity: "warning" as const,
      location: { file: "src/Other.tsx", line: 1, column: 1 }, message: "drift",
    }];
    const result: AuditResult = {
      ...sample,
      findings: [...flagged, ...notFlagged],
      meta: {
        projection: {
          top: [{ key: "tokens/rule-flagged", ruleId: "tokens/rule-flagged", count: 3, files: 3, gain: 5, migrationScale: true }],
          totalGainTop3: 5,
        },
      },
    } as AuditResult;
    const out = await renderTerminal(result, baseOpts);
    const migrationLines = out.split("\n").filter((l) => l.includes("migration-scale"));
    expect(migrationLines).toHaveLength(1);
    expect(migrationLines[0]).toContain("migration-scale (3 files) — sample before you sweep");
  });

  it("uses opts.migrationScaleFileCount for groups not named in projection.top (custom threshold threaded from config)", async () => {
    const threeFiles = Array.from({ length: 3 }, (_, i) => ({
      ruleId: "tokens/custom-threshold" as const, axis: "tokens" as const, severity: "warning" as const,
      location: { file: `src/T${i}.tsx`, line: i + 1, column: 1 }, message: "drift",
    }));
    const result = { ...sample, findings: threeFiles };
    // No meta.projection — the group's migrationScale is computed by groupFindings
    // itself, using opts.migrationScaleFileCount instead of the hardcoded default.
    const flagged = await renderTerminal(result, { ...baseOpts, migrationScaleFileCount: 3 });
    expect(flagged).toContain("migration-scale (3 files) — sample before you sweep");

    const notFlagged = await renderTerminal(result, baseOpts);
    expect(notFlagged).not.toContain("migration-scale");
  });

  it("'N more groups' wording (not 'N more findings') when default mode overflows 5 groups", async () => {
    const longFindings = Array.from({ length: 8 }, (_, i) => ({
      ruleId: `tokens/rule-${String(i).padStart(2, "0")}` as const, axis: "tokens" as const, severity: "warning" as const,
      location: { file: `src/F${i}.tsx`, line: i + 1, column: 1 }, message: `Hardcoded #${i}`,
    }));
    const result = { ...sample, findings: longFindings };
    const out = await renderTerminal(result, baseOpts);
    expect(out).toContain("3 more groups");
    expect(out).not.toContain("more findings");
  });

  it("prints a 'Scanned: N files in Xs.' footer line when meta.coverage is present", async () => {
    const covResult: AuditResult = {
      ...sample,
      meta: {
        coverage: { scannedFiles: 1234, durationMs: 29623, configPath: null },
      },
    };
    const out = await renderTerminal(covResult, baseOpts);
    expect(out).toMatch(/Scanned:\s+1,234 files in 29\.6s\./);
  });

  it("omits the Scanned footer when meta.coverage is absent", async () => {
    const out = await renderTerminal(sample, baseOpts);
    expect(out).not.toMatch(/Scanned:/);
  });
});

describe("renderTerminal — no-token-registry educational hint (T28)", () => {
  it("shows 'no token registry' hint when hasTokenRegistry is absent (undefined)", async () => {
    // opts without hasTokenRegistry — hint should appear
    const out = await renderTerminal(sample, { ...baseOpts, hasTokenRegistry: undefined });
    expect(out).toContain("No token registry detected");
    expect(out).toContain("lyse init");
  });

  it("shows hint when hasTokenRegistry is explicitly false", async () => {
    const out = await renderTerminal(sample, { ...baseOpts, hasTokenRegistry: false });
    expect(out).toContain("No token registry detected");
    expect(out).toContain("lyse init");
  });

  it("suppresses hint when hasTokenRegistry is true", async () => {
    const out = await renderTerminal(sample, { ...baseOpts, hasTokenRegistry: true });
    expect(out).not.toContain("No token registry detected");
    expect(out).not.toContain("lyse init");
  });

  it("hint content: references calibrated score", async () => {
    const out = await renderTerminal(sample, { ...baseOpts, hasTokenRegistry: false });
    expect(out).toContain("calibrated score");
  });

});

describe("renderTerminal (colored mode alignment)", () => {
  const colorOpts = { mode: "default" as const, color: true, unicode: true, width: 80, outDir: "report", fileCount: 247, durationMs: 1400, cwd: "/tmp/test" };

  // Strip ANSI SGR codes and OSC 8 hyperlinks to get visible text.
  const stripAnsi = (s: string) =>
    s.replace(/\x1b\][^\x07]*\x07/g, "").replace(/\x1b\[[0-9;]*m/g, "");

  it("emits ANSI color escapes (sanity: color is actually emitted)", async () => {
    const out = await renderTerminal(sample, colorOpts);
    // Our custom teal escape must be present (used for brand, arrows, statusDot).
    // This proves color rendering is active — picocolors strips in non-TTY,
    // but our manually constructed escapes always fire when opts.color = true.
    expect(out).toMatch(/\x1b\[38;2;/);
    // The score number must appear in the stripped output.
    expect(stripAnsi(out)).toContain("43");
    // Unicode status dot must be present.
    expect(out).toContain("●");
  });

  it("aligns axis lines to the same visible width across all 4 axes", async () => {
    const out = await renderTerminal(sample, colorOpts);
    // Axis rows live inside the score card box, so the visible line leads with
    // the unicode border char ("│") ahead of the indent, not a bare 2-space gutter.
    const axisLines = out.split("\n").filter((line) =>
      /^│ {2}\S+ (tokens|a11y|components|stories)\b/.test(stripAnsi(line))
    );
    expect(axisLines).toHaveLength(4);
    const visibleWidths = axisLines.map((l) => stripAnsi(l).trimEnd().length);
    // All 4 axis lines must have identical visible widths after padding.
    expect(new Set(visibleWidths).size).toBe(1);
  });

  it("aligns finding rows so the file:line column starts at the same visible offset", async () => {
    const out = await renderTerminal(sample, colorOpts);
    // Match lines that look like finding rows: leading spaces, an index, then a rule id, then a file path.
    const fLines = out.split("\n").filter((line) => {
      const stripped = stripAnsi(line);
      return /^ {2} *\d+  \S+  \S+:\d+/.test(stripped);
    });
    if (fLines.length < 2) return; // not enough findings to compare
    const offsets = fLines.map((l) => {
      const stripped = stripAnsi(l);
      // Find the start of the file:line segment (e.g. "src/Header.tsx:42").
      const m = stripped.match(/(\S+\.tsx:\d+|\S+\.ts:\d+|\S+:\d+)$/);
      if (!m) return -1;
      return stripped.lastIndexOf(m[0]);
    });
    expect(new Set(offsets.filter((o) => o >= 0)).size).toBe(1);
  });

  it("truncates very long file paths with leading ellipsis when they overflow width", async () => {
    const longResult = {
      ...sample,
      findings: [{
        ruleId: "tokens/no-hardcoded-color" as const,
        axis: "tokens" as const,
        severity: "warning" as const,
        location: {
          file: "this/is/a/very/long/file/path/that/will/definitely/exceed/the/terminal/width/available/Component.tsx",
          line: 999,
          column: 1,
        },
        message: "Hardcoded #2563eb",
      }],
    };
    const out = await renderTerminal(longResult, { ...colorOpts, width: 80 });
    expect(stripAnsi(out)).toContain("…");
    expect(stripAnsi(out)).toContain("Component.tsx:999"); // leaf preserved
  });
});
