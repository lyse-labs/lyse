import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { auditDirectory } from "../../src/commands/audit-pipeline.js";
import { GOLDEN_CORPUS, type GoldenRepo } from "./corpus.js";
import { fetchGoldenRepo } from "./fetch.js";
import { compactGolden } from "./normalization.js";
import { snapshotAction, missingSnapshotMessage } from "./snapshot-policy.js";

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
      const action = snapshotAction({ exists: existsSync(snapPath), update: UPDATE });
      if (action === "fail") throw new Error(missingSnapshotMessage(repo.label));
      if (action === "write") {
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

describe("coverage the snapshots record: where Lyse now declines to answer", () => {
  // These used to assert the opposite. The reliability catalogue is now honoured
  // on both sides of the adoption ratio, so an axis is scored over its validated
  // rules only — and on the golden corpus that leaves several axes under the
  // min-N=30 sample floor. The numbers below are losses of coverage, not gains,
  // and they are pinned here rather than deleted so that regaining them is
  // visible as a failing test rather than as a snapshot that quietly moved.
  // Measured on this corpus, main → this branch (opportunities in parentheses):
  //   carbon    83 → 78    tokens 78 (82) → N/A (2)     components 88 (451) → 29 (69)
  //   polaris   90 → 62    tokens 96 (2392) → N/A (26)  components 92 (1494) → 16 (133)
  //   shadcn    86 → N/A   tokens 98 (3802) → N/A (5)   components 66 (4231) → 64 (175)
  //   tailwind  80 → N/A   tokens 99 (2018) → N/A (11)  components 45 (176) → 50 (153)
  it("tokens abstains on every repository in the corpus", () => {
    // css-custom-property-export was demoted to non-scoring (its 0.90+ bound came
    // from fixtures that write their variables out literally; element-plus composes
    // --el-* at Sass compile time). What is left of the tokens axis is under the
    // sample floor everywhere. Lyse currently says nothing about anyone's tokens.
    for (const label of ["carbon-react", "polaris-react", "shadcn-ui", "tailwind-dashboard"]) {
      expect(axis(label, "tokens").score, label).toBe("N/A");
    }
  });
  it("stories reports nothing on repositories that ARE design systems", () => {
    // The P1 story-title fix did land — the loader indexes Polaris's 87 CSF3 files
    // and Mantine's 455 `.story.` files. But storybook-coverage.ts:18 and
    // stories-usage-examples.ts:23 both open with
    // `if (ctx.dsSelfMode) return { findings, opportunities: 0 }`, and detection now
    // resolves dsSelfMode correctly on real design systems for the first time. So the
    // axis is dark on exactly the repositories it exists to measure.
    expect(axis("carbon-react", "stories").opportunities).toBe(0);
    expect(axis("polaris-react", "stories").opportunities).toBe(0);
  });
  it("components still scores everywhere — the catalogue narrowed it, it did not blank it", () => {
    for (const label of ["carbon-react", "polaris-react", "shadcn-ui", "tailwind-dashboard"]) {
      expect(axis(label, "components").score, label).not.toBe("N/A");
    }
  });
  it("two of four repositories no longer get a headline score at all", () => {
    // Below MIN_SCORED_AXES (3), `finalScore` is "N/A" by design. shadcn and
    // tailwind are left with two scored axes each (a11y, components).
    const scored = (label: string) =>
      snap(label).axes.filter((a) => a.score !== "N/A").length;
    expect(scored("shadcn-ui")).toBeLessThan(3);
    expect(scored("tailwind-dashboard")).toBeLessThan(3);
    expect(scored("carbon-react")).toBeGreaterThanOrEqual(3);
    expect(scored("polaris-react")).toBeGreaterThanOrEqual(3);
  });
});
