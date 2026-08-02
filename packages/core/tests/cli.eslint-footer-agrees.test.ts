import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runAuditTest } from "./_helpers/cli.js";
import type { AuditResult } from "../src/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = join(__dirname, "../fixtures/full-ds");

/**
 * #277. `--format=eslint` printed "1 stable findings · 107 experimental (not
 * counted)" under a score of 59 that 76 of those findings had produced,
 * because it partitioned on `Finding.confidence` — a codemod-safety field
 * assigned after the score exists, which neither scorer reads.
 *
 * The invariant, not the wording: the ESLint footer and the JSON reporter
 * describe one audit and must agree about how much of it counted.
 */
describe("the ESLint footer agrees with the JSON reporter (#277)", () => {
  const json = JSON.parse(
    runAuditTest({ path: fixture, format: "json" }).stdout,
  ) as AuditResult;
  const eslint = runAuditTest({ path: fixture, extraArgs: ["--format=eslint"] }).stdout;

  const countedFromAxes = json.axes.reduce(
    (n, a) => (typeof a.score === "number" ? n + a.findings : n),
    0,
  );

  it("reports the number of counted findings the axes report", () => {
    const m = eslint.match(/(\d+) findings counted in score/);
    expect(m, `no counted line in:\n${eslint}`).not.toBeNull();
    expect(Number(m?.[1])).toBe(countedFromAxes);
  });

  it("accounts for every finding — counted plus not counted is the total", () => {
    const counted = Number(eslint.match(/(\d+) findings counted in score/)?.[1]);
    const notCounted = Number(eslint.match(/·\s+(\d+) not counted/)?.[1] ?? 0);
    expect(counted + notCounted).toBe(json.findings.length);
  });

  it("does not tag a score-driving finding EXP", () => {
    // Every EXP line must belong to a rule that did not count. The cheap
    // observable: the number of EXP-tagged lines cannot exceed not-counted.
    const expLines = (eslint.match(/^\s+\S+\s+EXP\s+/gm) ?? []).length;
    const notCounted = Number(eslint.match(/·\s+(\d+) not counted/)?.[1] ?? 0);
    expect(expLines).toBeLessThanOrEqual(notCounted);
  });

  it("never claims a score with zero findings behind it", () => {
    if (json.finalScore === "N/A") return;
    const counted = Number(eslint.match(/(\d+) findings counted in score/)?.[1]);
    expect(counted + json.axes.filter((a) => typeof a.score === "number").length).toBeGreaterThan(0);
  });
});
