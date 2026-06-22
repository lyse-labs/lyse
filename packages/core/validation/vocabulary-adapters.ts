import type { OracleAdapter, FixtureFiles } from "./types.js";

const PKG = JSON.stringify({ name: "fx-vocab", version: "1.0.0" });

export interface VocabularySpec {
  ruleId: string;
  aiSurface: string;        // an AI surface that triggers the rule's "applies here" gate
  affordanceSnippet: string;// the affordance whose vocabulary satisfies the rule
  affordanceFile: string;   // path for the affordance file
}

/**
 * Proxy-coherence oracle for AI-governance "affordance presence" rules, where
 * the VIOLATION is the ABSENCE of the affordance.
 *
 * Polarity matches the engine contract in evaluateAdapter (run-adapter.ts):
 *   cleanFixture() → NEGATIVE label  → rule must NOT flag  → counts TN/FP
 *   each mutation  → POSITIVE label  → rule MUST flag       → counts TP/FN
 *
 * So:
 *   cleanFixture = AI surface WITH the affordance present → rule does not flag ✓
 *   mutation     = REMOVE the affordance, leaving bare AI surface → rule flags ✓
 *
 * Metamorphic pair: two ways of expressing the affordance both → not flagged.
 * This is an honest invariant: if two equivalent representations of the affordance
 * produce different verdicts, Lyse has an inconsistency worth catching.
 */
export function makeVocabularyAdapter(spec: VocabularySpec): OracleAdapter {
  const withAffordance = (): FixtureFiles => ({
    "package.json": PKG,
    "src/Chat.tsx": spec.aiSurface,
    [spec.affordanceFile]: spec.affordanceSnippet,
  });
  return {
    ruleId: spec.ruleId,
    oracleKind: "metamorphic",
    // clean = affordance present → rule does NOT flag (negative, correct)
    cleanFixture: withAffordance,
    mutations: [
      {
        // remove the affordance → rule SHOULD flag (positive, correct)
        name: "remove-affordance-should-flag",
        apply: (f) => {
          const { [spec.affordanceFile]: _removed, ...rest } = f;
          return rest;
        },
      },
    ],
    metamorphic: [
      {
        // Two fixtures that both carry the affordance must both be clean (not flagged).
        name: "affordance-present-both-clean",
        a: withAffordance(),
        b: withAffordance(),
        expectViolation: false,
      },
    ],
  };
}

// Enable per rule only after confirming the AI-surface trigger + affordance
// vocabulary against the rule source. These prove the matcher fires/clears
// correctly — they do NOT prove governance efficacy.
export const vocabularyAdapters: OracleAdapter[] = [];
