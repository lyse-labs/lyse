import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { auditDirectory } from "../../src/commands/audit-pipeline.js";
import { GOLDEN_CORPUS, type GoldenRepo } from "./corpus.js";
import { fetchGoldenRepo } from "./fetch.js";
import { compactGolden } from "./normalization.js";

const NET = process.env.LYSE_GOLDEN === "1";
const UPDATE = process.env.UPDATE_GOLDEN === "1";
const SNAP_DIR = join(import.meta.dirname, "snapshots");

async function auditRepo(repo: GoldenRepo): Promise<{ json: string; audited: string } | null> {
  const root = await fetchGoldenRepo(repo);
  if (!root) return null;
  const audited = repo.auditSubpath === "." ? root : join(root, repo.auditSubpath);
  const { result } = await auditDirectory(audited, { staticOnly: true });
  return { json: compactGolden(result, root), audited };
}
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

describe.runIf(NET)("golden corpus snapshots", () => {
  for (const repo of GOLDEN_CORPUS) {
    it(`${repo.label}: byte-identical to committed snapshot + deterministic`, async () => {
      const first = await auditRepo(repo);
      expect(first, "fetch failed under LYSE_GOLDEN=1").not.toBeNull();
      const snapPath = join(SNAP_DIR, `${repo.label}.json`);
      if (UPDATE || !existsSync(snapPath)) {
        mkdirSync(SNAP_DIR, { recursive: true });
        writeFileSync(snapPath, first!.json);
      }
      expect(first!.json).toBe(readFileSync(snapPath, "utf8")); // photograph
      const second = await auditRepo(repo); // twice-run determinism
      expect(sha256(second!.json)).toBe(sha256(first!.json));
    }, 240_000);
  }
});

type Axis = { axis: string; score: number | "N/A"; findings: number; opportunities: number };
const snap = (label: string) =>
  JSON.parse(readFileSync(join(SNAP_DIR, `${label}.json`), "utf8")) as { axes: Axis[] };
const axis = (label: string, name: string) => snap(label).axes.find((a) => a.axis === name)!;

describe("expected-to-change: known-wrong audit numbers photographed as expected-to-change", () => {
  // P2 (zone-aware token/component rules) fixed these two — see CHANGELOG "Fixed" entry for the
  // exact before/after numbers (Carbon tokens 0 → 54, shadcn components 0 → 31). Bands stay loose
  // (floors, not equalities) so future rule tuning doesn't require touching this file every time.
  // The stories case below was P1's fix (Appendix-A story-title seeding). Snapshots are now scored
  // by the v3 default model — axes with < 30 opportunities N/A out by design (min-N sample guard).
  it("Carbon: tokens axis now scored meaningfully above the old zone-blind floor", () => {
    expect(axis("carbon-react", "tokens").score).toBeGreaterThan(40);
  });
  it("shadcn: components axis now scored above 0 (ds-source zone findings no longer counted)", () => {
    expect(axis("shadcn-ui", "components").score).toBeGreaterThan(0);
  });
  it("Carbon & Polaris: stories axis is now populated (P1 Appendix-A fix — no more silent N/A)", () => {
    // Carbon clears v3 min-N (222 story opportunities) so it scores.
    expect(axis("carbon-react", "stories").score).not.toBe("N/A");
    expect(axis("carbon-react", "stories").opportunities).toBeGreaterThan(0);
    // Polaris's stories ARE seeded (opportunities > 0 — the P1 fix), but under
    // the v3 default they fall below min-N=30 (o=18) so the axis N/A's by design.
    // This asserts the seeding fix; the N/A is v3's small-sample guard, not a
    // regression to the old silent-N/A bug (which had 0 opportunities).
    expect(axis("polaris-react", "stories").opportunities).toBeGreaterThan(0);
  });
});
