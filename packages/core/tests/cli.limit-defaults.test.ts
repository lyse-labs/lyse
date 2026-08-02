import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runAuditTest } from "./_helpers/cli.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = join(__dirname, "../fixtures/full-ds");

/**
 * #278. `docs/guide/cli-reference.md` documented a single `--limit` default of
 * `10` for "the text/eslint/legacy output". No format behaves that way, and the
 * code says so at `cli.ts:547-557` — `null` (unlimited) for eslint and table,
 * `undefined` (terminal.ts's historical top-5) for the rest.
 *
 * These pin the real numbers so the doc cannot drift back. The fixture reports
 * 12 findings, which distinguishes 5 from 10 from all.
 */
const countGroups = (s: string) => (s.match(/^ +\d+ {2}/gm) ?? []).length;
const countRows = (s: string, re: RegExp) => (s.match(re) ?? []).length;

describe("the --limit default is per-format (#278)", () => {
  it("text shows 5 groups, not 10", () => {
    const out = runAuditTest({ path: fixture, extraArgs: ["--format=text"] }).stdout;
    expect(countGroups(out)).toBe(5);
  });

  it("eslint shows every finding", () => {
    const out = runAuditTest({ path: fixture, extraArgs: ["--format=eslint"] }).stdout;
    expect(countRows(out, /:\d+:\d+ +(EXP|ERROR|WARNING|INFO)/g)).toBe(12);
  });

  it("table shows every finding", () => {
    const out = runAuditTest({ path: fixture, extraArgs: ["--format=table"] }).stdout;
    expect(countRows(out, /^ (error|warn|warning|info) /gm)).toBe(12);
  });

  it("text honours an explicit --limit", () => {
    const out = runAuditTest({ path: fixture, extraArgs: ["--format=text", "--limit=2"] }).stdout;
    expect(countGroups(out)).toBe(2);
  });

  // tsv is a machine format (`cli.ts:632` groups it with json and sarif), so it
  // ignores --limit like they do. Pinned because the doc listed only json|sarif
  // as ignoring it, which read as a bug in tsv rather than a documentation gap.
  it("tsv shows every finding", () => {
    const out = runAuditTest({ path: fixture, extraArgs: ["--format=tsv"] }).stdout;
    expect(out.split("\n").filter((l) => l.includes("\t")).length).toBe(12);
  });

  it("tsv ignores --limit, as the other machine formats do", () => {
    const out = runAuditTest({ path: fixture, extraArgs: ["--format=tsv", "--limit=2"] }).stdout;
    expect(out.split("\n").filter((l) => l.includes("\t")).length).toBe(12);
  });
});
