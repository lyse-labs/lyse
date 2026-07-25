import { describe, it, expect } from "vitest";
import { measureRecall } from "../../src/reliability/recall/measure-recall.js";
import { RECALL_FIXTURES } from "../../src/reliability/recall/fixtures.js";

describe("measureRecall", () => {
  it("produces resolver-confirmed buckets; colour exact recall is measured", async () => {
    const colourFx = RECALL_FIXTURES.filter((f) => f.axis === "colors");
    const buckets = await measureRecall(colourFx);
    const exact = buckets.find((b) => b.ruleId === "tokens/no-hardcoded-color" && b.class === "exact" && b.zone === "app");
    expect(exact).toBeDefined();
    expect(exact!.seeded).toBeGreaterThanOrEqual(35);
    expect(exact!.recall).toBe(exact!.caught / exact!.seeded);
    expect(exact!.recallWilsonLB).toBeGreaterThan(0);
    expect(exact!.recallSource).toBe("seeded");
  }, 60_000);
});
