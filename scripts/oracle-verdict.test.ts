import { describe, it, expect } from "vitest";
import { decideOutcome, type VerdictRow } from "./oracle-verdict.js";

const row = (name: string, verdict: VerdictRow["verdict"]): VerdictRow => ({ name, verdict });

describe("decideOutcome — not measured is not a pass", () => {
  it("fails a run that evaluated nothing", () => {
    // The exact reproduction: `ORACLE_DIR=$(mktemp -d) npx tsx scripts/measure-oracle.ts`
    // printed "0 within tolerance · 0 out · 6 not measured" and exited 0.
    expect(decideOutcome([]).exitCode).toBe(1);
  });

  it("fails when any repository could not be measured", () => {
    const outcome = decideOutcome([
      row("primer-react", "ok"),
      row("polaris", "ok"),
      row("mantine", "skipped"),
    ]);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.reasons.join(" ")).toContain("mantine");
  });

  it("fails when a repository is outside tolerance", () => {
    expect(decideOutcome([row("polaris", "ok"), row("tremor", "out-of-tolerance")]).exitCode).toBe(1);
  });

  it("names every reason rather than reporting only the first", () => {
    const outcome = decideOutcome([
      row("a", "skipped"),
      row("b", "out-of-tolerance"),
    ]);
    expect(outcome.reasons).toHaveLength(2);
  });

  it("passes only when every repository was measured and every one held", () => {
    const outcome = decideOutcome([row("a", "ok"), row("b", "ok"), row("c", "ok")]);
    expect(outcome).toEqual({ exitCode: 0, reasons: [] });
  });

  it("cannot be satisfied by an empty corpus dressed as success", () => {
    // A gate that returns the same verdict for "checked six, all good" and
    // "checked none" is a coin that always lands heads.
    expect(decideOutcome([]).exitCode).toBe(decideOutcome([row("a", "skipped")]).exitCode);
    expect(decideOutcome([]).exitCode).not.toBe(decideOutcome([row("a", "ok")]).exitCode);
  });
});
