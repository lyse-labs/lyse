import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { measureRecall } from "../../src/reliability/recall/measure-recall.js";
import { gateEligibleFor } from "../../src/reliability/measure/bucket.js";
import type { RecallLedger } from "../../src/reliability/recall/types.js";

const realUrl = new URL("../../rules-recall.json", import.meta.url);
const committed: RecallLedger = JSON.parse(readFileSync(realUrl, "utf8"));

const key = (b: { ruleId: string; class: string; zone: string }) => `${b.ruleId}|${b.class}|${b.zone}`;

describe("rules-recall.json (the committed seeded-drift recall baseline)", () => {
  it(
    "regenerated recall reproduces the committed rules-recall.json buckets exactly (golden)",
    async () => {
      const fresh = await measureRecall();
      const freshByKey = new Map(fresh.map((b) => [key(b), b]));
      expect(fresh.length).toBe(committed.buckets.length);
      for (const base of committed.buckets) {
        const now = freshByKey.get(key(base));
        expect(now, `missing bucket ${key(base)}`).toBeDefined();
        expect(now).toEqual(base);
      }
    },
    120_000,
  );

  it("no seeded recall bucket is ever gate-eligible, even under an adversarial auto label", () => {
    for (const b of committed.buckets) {
      expect(b.recallSource).toBe("seeded");
      expect(
        gateEligibleFor({ ...b, precision: null, precisionWilsonLB: null, labelSource: "none", n: b.seeded } as never),
      ).toBe(false);
      expect(
        gateEligibleFor({ ...b, precision: null, precisionWilsonLB: null, labelSource: "auto", n: b.seeded } as never),
      ).toBe(false);
    }
  });
});
