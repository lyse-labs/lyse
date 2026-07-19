// Generalization / honesty harness — opt-in (network) CI lane.
//
// Run:  LYSE_GENERALIZATION=1 pnpm --filter @lyse-labs/lyse exec vitest run tests/generalization
//
// For each pinned real design system it fetches (never vendored), audits at the
// repo root (staticOnly, deterministic, no LLM), and evaluates the extraction
// honesty invariants. ENFORCED (repo × invariant) statuses are asserted — a
// regression on a shipped honesty property fails CI. KNOWN-GAP statuses are
// observed and logged (the `[harness]` lines are the internal scorecard's input)
// but NOT asserted, so the public suite stays green. A known-gap that starts
// passing prints a RATCHET line → promote it to "enforced" in corpus.ts.
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { auditDirectory } from "../../src/commands/audit-pipeline.js";
import { fetchGoldenRepo } from "../golden/fetch.js";
import { GENERALIZATION_CORPUS } from "./corpus.js";
import { INVARIANTS } from "./invariants.js";

const NET = process.env.LYSE_GENERALIZATION === "1";

describe.runIf(NET)("generalization honesty harness", () => {
  for (const repo of GENERALIZATION_CORPUS) {
    it(`${repo.label}: enforced extraction-honesty invariants hold`, async () => {
      const root = await fetchGoldenRepo(repo);
      expect(root, `fetch failed for ${repo.label} under LYSE_GENERALIZATION=1`).not.toBeNull();
      const audited = repo.auditSubpath === "." ? root! : join(root!, repo.auditSubpath);
      const { result, graph } = await auditDirectory(audited, { staticOnly: true });

      // Evaluate + log EVERY declared invariant first (the full scorecard row),
      // then assert the enforced ones — so one enforced failure never suppresses
      // the remaining invariants' observability / ratchet signals.
      const evaluated = INVARIANTS.flatMap((inv) => {
        const declared = repo.checks[inv.id];
        if (!declared) return [];
        return [{ inv, declared, ...inv.check({ result, graph }, repo) }];
      });
      for (const { inv, declared, pass, detail } of evaluated) {
        console.log(
          `[harness] ${repo.label.padEnd(20)} ${inv.id} ${declared.padEnd(9)} actual=${pass ? "PASS" : "GAP "} :: ${detail}`,
        );
        if (declared === "known-gap" && pass) {
          console.log(
            `[harness] RATCHET ${repo.label}/${inv.id}: known-gap now PASSES → promote to "enforced" in corpus.ts`,
          );
        }
      }
      for (const { inv, declared, pass, detail } of evaluated) {
        if (declared === "enforced") {
          expect(pass, `${repo.label}/${inv.id} (enforced): ${detail}`).toBe(true);
        }
      }
    }, 300_000);
  }
});
