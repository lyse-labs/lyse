// Network lane, opt-in like the generalization harness:
//   LYSE_HELDOUT=1 pnpm -F lyse exec vitest run tests/heldout/health.test.ts
//
// Asserts only that each pin still resolves and still audits. It deliberately
// reads no score, no axis value and no finding count: a held-out corpus whose
// numbers surface on every pull request is one the team tunes against by
// osmosis, which is how .bench-corpus became in-sample.
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { auditDirectory } from "../../src/commands/audit-pipeline.js";
import { fetchGoldenRepo } from "../golden/fetch.js";
import { HELDOUT_CORPUS, HELDOUT_NEGATIVES } from "./corpus.js";

const NET = process.env["LYSE_HELDOUT"] === "1";

describe.runIf(NET)("held-out corpus health", () => {
  for (const repo of [...HELDOUT_CORPUS, ...HELDOUT_NEGATIVES]) {
    it(`${repo.label}: the pin resolves and the audit completes`, async () => {
      const root = await fetchGoldenRepo(repo);
      expect(root, `fetch failed for ${repo.label} under LYSE_HELDOUT=1`).not.toBeNull();
      const audited = repo.auditSubpath === "." ? root! : join(root!, repo.auditSubpath);
      const { result, graph } = await auditDirectory(audited, { staticOnly: true });
      // A repository that audits to literally nothing means the pin is dead or an
      // extractor broke. That is the only failure this lane exists to catch — the
      // magnitude of what was found is not read here, on purpose.
      const sawSomething =
        result.findings.length > 0 || graph.tokens.length > 0 || graph.components.length > 0;
      expect(sawSomething, `${repo.label} audited to nothing at all`).toBe(true);
    }, 300_000);
  }
});
