import { describe, it, expect } from "vitest";
import { abstentionReason } from "./abstention.js";

describe("abstentionReason", () => {
  it("says nothing ran when no scoring rule produced an opportunity", () => {
    // The honest case for a user staring at `tokens N/A n=0`: not "your tokens
    // are bad", not "you have none" — no check that counts toward the score was
    // able to look at anything.
    const why = abstentionReason({ opportunities: 0, minSampleSize: 30, blockedExtractors: [] });
    expect(why).toContain("no scored check");
    expect(why).not.toContain("30");
  });

  it("says how far short of the sample floor it fell", () => {
    const why = abstentionReason({ opportunities: 1, minSampleSize: 30, blockedExtractors: [] });
    expect(why).toContain("1");
    expect(why).toContain("30");
  });

  it("names the extractor when one is why the checks could not run", () => {
    // `components` degrading removes tokens/no-hardcoded-color and
    // no-hardcoded-spacing from scoring, so the tokens axis abstains for a
    // reason that has nothing to do with tokens. Saying "1 of 30" alone would
    // send the user to fix the wrong thing.
    const why = abstentionReason({
      opportunities: 3, minSampleSize: 30, blockedExtractors: ["components"],
    });
    expect(why).toContain("components");
  });

  it("names every blocked extractor, not just the first", () => {
    const why = abstentionReason({
      opportunities: 0, minSampleSize: 30, blockedExtractors: ["components", "stories"],
    });
    expect(why).toContain("components");
    expect(why).toContain("stories");
  });

  it("returns null for an axis that is not abstaining", () => {
    expect(abstentionReason({ opportunities: 30, minSampleSize: 30, blockedExtractors: [] })).toBeNull();
    expect(abstentionReason({ opportunities: 400, minSampleSize: 30, blockedExtractors: [] })).toBeNull();
  });

  it("is a sentence a user can act on, not a status code", () => {
    const why = abstentionReason({ opportunities: 1, minSampleSize: 30, blockedExtractors: [] })!;
    expect(why.length).toBeGreaterThan(30);
    expect(why).not.toMatch(/^[A-Z_]+$/);
  });
});
