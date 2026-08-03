import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  HELDOUT_CORPUS,
  HELDOUT_NEGATIVES,
  CALIBRATION_SLUGS,
  type Framework,
  type Stack,
} from "./corpus.js";
import { GOLDEN_CORPUS } from "../golden/corpus.js";
import { GENERALIZATION_CORPUS } from "../generalization/corpus.js";
import { NEGATIVE_CORPUS } from "../generalization/negatives.js";

const norm = (s: string) => s.toLowerCase();
const heldout = [...HELDOUT_CORPUS, ...HELDOUT_NEGATIVES];
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const benchCorpus = join(repoRoot, ".bench-corpus");

const SEEN: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["lyse-bench tier1 (the calibration set)", CALIBRATION_SLUGS],
  ["tests/golden/corpus.ts", GOLDEN_CORPUS.map((r) => r.slug)],
  ["tests/generalization/corpus.ts", GENERALIZATION_CORPUS.map((r) => r.slug)],
  ["tests/generalization/negatives.ts", NEGATIVE_CORPUS.map((r) => r.slug)],
];

describe("the held-out corpus is held out", () => {
  for (const [source, slugs] of SEEN) {
    it(`shares no repository with ${source}`, () => {
      const seen = new Set(slugs.map(norm));
      const overlap = heldout.map((r) => r.slug).filter((s) => seen.has(norm(s)));
      expect(overlap, `already seen in ${source}`).toEqual([]);
    });
  }

  it("pins no repository twice", () => {
    const slugs = heldout.map((r) => norm(r.slug));
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("keeps positives and negatives disjoint", () => {
    const negatives = new Set(HELDOUT_NEGATIVES.map((r) => norm(r.slug)));
    expect(HELDOUT_CORPUS.filter((r) => negatives.has(norm(r.slug)))).toEqual([]);
  });
});

// `expect(overlap).toEqual([])` above passes trivially when the source list is
// itself empty — the same vacuous shape `findings.length > 0` had before this
// branch fixed it. These pin that each SEEN list still has something in it to
// guard against, so emptying one cannot silently defang the disjointness check.
describe("the disjointness guard cannot be satisfied by emptying its inputs", () => {
  it("CALIBRATION_SLUGS holds exactly the 20 lyse-bench tier1 repositories", () => {
    expect(CALIBRATION_SLUGS.length).toBe(20);
  });

  it("GOLDEN_CORPUS is non-empty", () => {
    expect(GOLDEN_CORPUS.length).toBeGreaterThan(0);
  });

  it("GENERALIZATION_CORPUS is non-empty", () => {
    expect(GENERALIZATION_CORPUS.length).toBeGreaterThan(0);
  });

  it("NEGATIVE_CORPUS is non-empty", () => {
    expect(NEGATIVE_CORPUS.length).toBeGreaterThan(0);
  });
});

// Local convenience only: .bench-corpus is gitignored and absent in CI, so this
// arm cannot be the guard. CALIBRATION_SLUGS is.
describe.runIf(existsSync(benchCorpus))("does not overlap the local .bench-corpus", () => {
  it("shares no directory name with a checked-out calibration repo", () => {
    const dirs = new Set(readdirSync(benchCorpus).map(norm));
    const overlap = heldout.filter((r) => dirs.has(norm(r.slug.split("/")[1] ?? "")));
    expect(overlap.map((r) => r.slug)).toEqual([]);
  });
});

describe("the held-out corpus is stratified as designed", () => {
  it("holds 10 positives and 5 negatives", () => {
    expect(HELDOUT_CORPUS).toHaveLength(10);
    expect(HELDOUT_NEGATIVES).toHaveLength(5);
  });

  const FRAMEWORKS: Framework[] = ["react", "vue", "svelte", "agnostic"];
  for (const framework of FRAMEWORKS) {
    it(`covers ${framework} among the positives`, () => {
      expect(HELDOUT_CORPUS.some((r) => r.framework === framework)).toBe(true);
    });
  }

  const STACKS: Stack[] = ["css-in-js", "css-modules", "tailwind-v3", "tailwind-v4", "vanilla-css"];
  for (const stack of STACKS) {
    it(`covers ${stack} among the positives`, () => {
      expect(HELDOUT_CORPUS.some((r) => r.stack === stack)).toBe(true);
    });
  }

  it("covers every maturity among the positives", () => {
    expect(new Set(HELDOUT_CORPUS.map((r) => r.maturity))).toEqual(
      new Set(["early", "growing", "mature"]),
    );
  });

  it("spans at least three frameworks among the negatives", () => {
    expect(new Set(HELDOUT_NEGATIVES.map((r) => r.framework)).size).toBeGreaterThanOrEqual(3);
  });

  it("gives every negative a stated human reason", () => {
    for (const r of HELDOUT_NEGATIVES) {
      expect(r.reason.length, `${r.slug} has no reason`).toBeGreaterThan(40);
    }
  });

  it("pins every repository by a full 40-character SHA", () => {
    for (const r of heldout) {
      expect(r.sha, r.slug).toMatch(/^[0-9a-f]{40}$/);
    }
  });
});
