import { describe, it, expect } from "vitest";
import { makeVocabularyAdapter } from "../../validation/vocabulary-adapters.js";

describe("makeVocabularyAdapter", () => {
  it("clean fixture contains an AI surface WITHOUT the affordance; mutation adds the affordance vocabulary", () => {
    const adapter = makeVocabularyAdapter({
      ruleId: "ai-governance/confidence-indicator-present",
      aiSurface: 'export const Chat = () => <div className="ai-magic">out</div>;',
      affordanceSnippet: 'export const ConfidenceBadge = () => <span>80%</span>;',
      affordanceFile: "src/ConfidenceBadge.tsx",
    });
    expect(adapter.oracleKind).toBe("metamorphic"); // proxy-coherence, not construct validity
    const clean = adapter.cleanFixture();
    expect(Object.keys(clean)).not.toContain("src/ConfidenceBadge.tsx");
  });
});
