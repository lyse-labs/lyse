import { describe, it, expect } from "vitest";
import { makeVocabularyAdapter } from "../../validation/vocabulary-adapters.js";

describe("makeVocabularyAdapter", () => {
  it("clean fixture contains the affordance (passing state); mutation removes it (violation state)", () => {
    const adapter = makeVocabularyAdapter({
      ruleId: "ai-governance/confidence-indicator-present",
      aiSurface: 'export const Chat = () => <div className="ai-magic">out</div>;',
      affordanceSnippet: 'export const ConfidenceBadge = () => <span>80%</span>;',
      affordanceFile: "src/ConfidenceBadge.tsx",
    });
    expect(adapter.oracleKind).toBe("metamorphic"); // proxy-coherence, not construct validity
    // clean = affordance present → engine labels negative → rule must not flag
    const clean = adapter.cleanFixture();
    expect(Object.keys(clean)).toContain("src/ConfidenceBadge.tsx");
    // mutation = remove affordance → engine labels positive → rule must flag
    const mutated = adapter.mutations[0]!.apply(clean);
    expect(Object.keys(mutated)).not.toContain("src/ConfidenceBadge.tsx");
  });
});
