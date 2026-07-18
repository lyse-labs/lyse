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
  // P1/P2 fix these. When a number moves: update the snapshot, update the band here,
  // and record the delta in CHANGELOG ("the score got more honest — proof: <repo> tokens 1 → N").
  it("Carbon: tokens axis floored near 0 (own spacing scale flagged)", () => {
    expect(axis("carbon-react", "tokens").score).toBeLessThanOrEqual(10);
  });
  it("shadcn: components axis is 0 (native-by-design flagged)", () => {
    expect(axis("shadcn-ui", "components").score).toBe(0);
  });
  it("Carbon & Polaris: stories silently N/A despite story files on disk", () => {
    expect(axis("carbon-react", "stories").score).toBe("N/A");
    expect(axis("polaris-react", "stories").score).toBe("N/A");
    // story files DO exist in the clone — the N/A is the silent-degradation bug P1 fixes.
  });
});
