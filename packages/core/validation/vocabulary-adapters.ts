import type { OracleAdapter, FixtureFiles } from "./types.js";

const PKG = JSON.stringify({ name: "fx-vocab", version: "1.0.0" });

export interface VocabularySpec {
  ruleId: string;
  aiSurface: string;        // an AI surface that triggers the rule's "applies here" gate
  affordanceSnippet: string;// the affordance whose vocabulary satisfies the rule
  affordanceFile: string;   // path for the affordance file
}

/**
 * Proxy-coherence oracle: the rule SHOULD flag the AI surface that lacks the
 * affordance (clean = missing affordance → flagged), and SHOULD NOT flag once
 * the affordance vocabulary is present (mutation = add affordance → not flagged).
 * Note the inverted polarity vs token rules: here the "violation" is ABSENCE.
 */
export function makeVocabularyAdapter(spec: VocabularySpec): OracleAdapter {
  const surfaceOnly = (): FixtureFiles => ({ "package.json": PKG, "src/Chat.tsx": spec.aiSurface });
  return {
    ruleId: spec.ruleId,
    oracleKind: "metamorphic",
    // "clean" here means the rule's positive condition (missing affordance) — it SHOULD flag.
    cleanFixture: surfaceOnly,
    mutations: [
      {
        name: "add-affordance-should-clear",
        apply: (f) => ({ ...f, [spec.affordanceFile]: spec.affordanceSnippet }),
      },
    ],
    metamorphic: [
      {
        name: "affordance-present-not-flagged",
        a: { ...surfaceOnly(), [spec.affordanceFile]: spec.affordanceSnippet },
        b: { ...surfaceOnly(), [spec.affordanceFile]: spec.affordanceSnippet },
        expectViolation: false,
      },
    ],
  };
}

// Enable per rule only after confirming the AI-surface trigger + affordance
// vocabulary against the rule source. These prove the matcher fires/clears
// correctly — they do NOT prove governance efficacy.
export const vocabularyAdapters: OracleAdapter[] = [];
