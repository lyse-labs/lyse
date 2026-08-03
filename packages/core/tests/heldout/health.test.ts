// Network lane, opt-in like the generalization harness:
//   LYSE_HELDOUT=1 pnpm -F lyse exec vitest run tests/heldout/health.test.ts
//
// Asserts only that each pin still resolves and still audits. It deliberately
// reads no score, no axis value and no finding count: a held-out corpus whose
// numbers surface on every pull request is one the team tunes against by
// osmosis, which is how .bench-corpus became in-sample.
import { readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { auditDirectory } from "../../src/commands/audit-pipeline.js";
import { SOURCE_GLOBS } from "../../src/walker.js";
import { fetchGoldenRepo } from "../golden/fetch.js";
import { HELDOUT_CORPUS, HELDOUT_NEGATIVES } from "./corpus.js";

const NET = process.env["LYSE_HELDOUT"] === "1";

// Derived from the walker's own globs, never re-listed here. A second copy of a
// candidate list drifts from the first — `.mjs` and `.cjs` were missing from the
// hand-written version this replaced — and that drift is the exact defect
// `docs/measurement/labeling-protocol.md` was written about.
const SOURCE_EXT = new Set(SOURCE_GLOBS.map((glob) => extname(glob)));

function sourceFilesOnDisk(dir: string, budget = 200): number {
  let seen = 0;
  const stack = [dir];
  while (stack.length > 0 && seen < budget) {
    const current = stack.pop()!;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch (err) {
      // Never silently: an unreadable subtree looks identical to an absent one,
      // and the runbook for a zero here is "re-pin the repository" — the wrong
      // advice entirely if the real cause was a permission or I/O fault.
      process.stderr.write(`[heldout-health] could not read ${current}: ${String(err)}\n`);
      continue;
    }
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      if (entry.isDirectory()) stack.push(join(current, entry.name));
      else if (SOURCE_EXT.has(extname(entry.name))) seen++;
    }
  }
  return seen;
}

describe.runIf(NET)("held-out corpus health", () => {
  for (const repo of [...HELDOUT_CORPUS, ...HELDOUT_NEGATIVES]) {
    it(`${repo.label}: the pin resolves and the audit completes`, async () => {
      const root = await fetchGoldenRepo(repo);
      expect(root, `fetch failed for ${repo.label} under LYSE_HELDOUT=1`).not.toBeNull();
      const audited = repo.auditSubpath === "." ? root! : join(root!, repo.auditSubpath);
      // Counted off the filesystem, not out of the audit. Three signals were
      // tried here and only this one answers the question the lane asks:
      //   findings.length     an EMPTY directory reports nine, because the
      //                       repo-level rules fire on the ABSENCE of a
      //                       CHANGELOG, an llms.txt and so on. Passes on
      //                       exactly the dead pin this lane exists to catch.
      //   audit fileCount     zero on magicui, whose entire library lives under
      //                       `apps/www` and is excluded by the walker. That is
      //                       a defect in Lyse's reach, not a dead pin, and
      //                       failing here would make the lane permanently red
      //                       over a known issue — a check nobody reads.
      //   sources on disk     zero only when the pin genuinely fetched nothing.
      // What Lyse then makes of those files is `measure:heldout`'s to report.
      expect(
        sourceFilesOnDisk(audited),
        `${repo.label} fetched no source files — the pin is dead or empty`,
      ).toBeGreaterThan(0);
      await auditDirectory(audited, { staticOnly: true });
    }, 300_000);
  }
});
