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

const aiMarkerComponentPresentAdapter: OracleAdapter = {
  ruleId: "ai-governance/ai-marker-component-present",
  oracleKind: "construction",
  cleanFixture: () => ({
    "package.json": PKG,
    "src/AILabel.tsx": `export const AILabel = () => null;`,
  }),
  mutations: [
    {
      name: "reserved-tokens-no-marker-should-flag",
      apply: () => ({
        "package.json": PKG,
        "src/Button.tsx": `export const Button = () => null;`,
        "tokens.json": JSON.stringify({ gradient: { "dragon-fruit": "#ff6b6b" } }),
      }),
    },
  ],
  metamorphic: [],
};

const botIdentityAdapter: OracleAdapter = {
  ruleId: "ai-governance/bot-identity-labeling",
  oracleKind: "construction",
  cleanFixture: () => ({
    "package.json": PKG,
    "src/Chat.tsx": `export const AILabel = () => null;\nexport const AiAvatar = () => null;`,
  }),
  mutations: [
    {
      name: "ai-marker-no-identity-should-flag",
      apply: () => ({
        "package.json": PKG,
        "src/Chat.tsx": `export const AILabel = () => null;`,
      }),
    },
  ],
  metamorphic: [
    {
      name: "ailabel-vs-aibadge-both-clean-with-identity",
      a: { "package.json": PKG, "src/Chat.tsx": `export const AILabel = () => null;\nexport const AiAvatar = () => null;` },
      b: { "package.json": PKG, "src/Chat.tsx": `export const AIBadge = () => null;\nexport const BotAvatar = () => null;` },
      expectViolation: false,
    },
  ],
};

const sourceAttributionAdapter: OracleAdapter = {
  ruleId: "ai-governance/source-attribution-present",
  oracleKind: "construction",
  cleanFixture: () => ({
    "package.json": PKG,
    "src/AiAnswer.tsx": `export const AILabel = () => null;\nexport const Citations = () => null;`,
  }),
  mutations: [
    {
      name: "ai-marker-no-attribution-should-flag",
      apply: () => ({
        "package.json": PKG,
        "src/AiAnswer.tsx": `export const AILabel = () => null;`,
      }),
    },
  ],
  metamorphic: [
    {
      name: "citations-vs-provenance-both-clean",
      a: { "package.json": PKG, "src/AiAnswer.tsx": `export const AILabel = () => null;\nexport const Citations = () => null;` },
      b: { "package.json": PKG, "src/AiAnswer.tsx": `export const AIBadge = () => null;\nexport const SourceAttribution = () => null;` },
      expectViolation: false,
    },
  ],
};

const confidenceIndicatorAdapter: OracleAdapter = {
  ruleId: "ai-governance/confidence-indicator-present",
  oracleKind: "construction",
  cleanFixture: () => ({
    "package.json": PKG,
    "src/AiOutput.tsx": `export const AILabel = () => null;\nexport const ConfidenceBadge = () => null;`,
  }),
  mutations: [
    {
      name: "ai-marker-no-confidence-should-flag",
      apply: () => ({
        "package.json": PKG,
        "src/AiOutput.tsx": `export const AILabel = () => null;`,
      }),
    },
  ],
  metamorphic: [
    {
      name: "confidence-badge-vs-uncertainty-indicator-both-clean",
      a: { "package.json": PKG, "src/AiOutput.tsx": `export const AILabel = () => null;\nexport const ConfidenceBadge = () => null;` },
      b: { "package.json": PKG, "src/AiOutput.tsx": `export const AIBadge = () => null;\nexport const UncertaintyIndicator = () => null;` },
      expectViolation: false,
    },
  ],
};

const feedbackControlAdapter: OracleAdapter = {
  ruleId: "ai-governance/feedback-control-present",
  oracleKind: "construction",
  cleanFixture: () => ({
    "package.json": PKG,
    "src/AiReview.tsx": `export const AILabel = () => null;\nexport const ThumbsUp = () => null;`,
  }),
  mutations: [
    {
      name: "ai-marker-no-feedback-should-flag",
      apply: () => ({
        "package.json": PKG,
        "src/AiReview.tsx": `export const AILabel = () => null;`,
      }),
    },
  ],
  metamorphic: [
    {
      name: "thumbs-vs-helpful-both-clean",
      a: { "package.json": PKG, "src/AiReview.tsx": `export const AILabel = () => null;\nexport const ThumbsUp = () => null;` },
      b: { "package.json": PKG, "src/AiReview.tsx": `export const AIBadge = () => null;\nexport const WasThisHelpful = () => null;` },
      expectViolation: false,
    },
  ],
};

const productAnalyticsAdapter: OracleAdapter = {
  ruleId: "ai-governance/product-analytics",
  oracleKind: "construction",
  cleanFixture: () => ({
    "package.json": PKG,
    "src/AiSuggestion.tsx": `
export const AILabel = () => null;
export function AiSuggestion({ onAccept }: { onAccept: () => void }) {
  return <div onAccept={onAccept} />;
}
analytics.track('ai_accepted');
`.trim(),
  }),
  mutations: [
    {
      name: "remove-analytics-should-flag",
      apply: () => ({
        "package.json": PKG,
        "src/AiSuggestion.tsx": `
export const AILabel = () => null;
export function AiSuggestion({ onAccept }: { onAccept: () => void }) {
  return <div onAccept={onAccept} />;
}
`.trim(),
      }),
    },
  ],
  metamorphic: [],
};

const AI_LOADING_BOTH_PRESENT = `
export const AILabel = () => null;
export const Generating = () => null;
export const AIError = () => null;
`.trim();

const AI_LOADING_ONLY = `
export const AILabel = () => null;
export const Generating = () => null;
`.trim();

const AI_ERROR_ONLY = `
export const AILabel = () => null;
export const AIError = () => null;
`.trim();

const aiLoadingErrorStatesAdapter: OracleAdapter = {
  ruleId: "ai-governance/ai-loading-error-states",
  oracleKind: "construction",
  cleanFixture: () => ({
    "package.json": PKG,
    "src/AiStates.tsx": AI_LOADING_BOTH_PRESENT,
  }),
  mutations: [
    {
      name: "ai-marker-with-loading-no-error-should-flag",
      apply: () => ({
        "package.json": PKG,
        "src/AiStates.tsx": AI_LOADING_ONLY,
      }),
    },
  ],
  metamorphic: [
    {
      name: "loading-only-and-error-only-both-flag",
      a: { "package.json": PKG, "src/AiStates.tsx": AI_LOADING_ONLY },
      b: { "package.json": PKG, "src/AiStates.tsx": AI_ERROR_ONLY },
      expectViolation: true,
    },
  ],
};

const LIVE_REGION_COMPLIANT = `
export function AiAnswer() {
  return (
    <div role="status">
      <AILabel />
    </div>
  );
}
`.trim();

const LIVE_REGION_MISSING_AILABEL = `
export function AiAnswer() {
  return (
    <div>
      <AILabel />
    </div>
  );
}
`.trim();

const LIVE_REGION_MISSING_AIBADGE = `
export function AiAnswer() {
  return (
    <div>
      <AIBadge />
    </div>
  );
}
`.trim();

const aiContentLiveRegionAdapter: OracleAdapter = {
  ruleId: "ai-governance/ai-content-live-region",
  oracleKind: "construction",
  cleanFixture: () => ({
    "package.json": PKG,
    "src/AiAnswer.tsx": LIVE_REGION_COMPLIANT,
  }),
  mutations: [
    {
      name: "ai-output-no-live-region-should-flag",
      apply: () => ({
        "package.json": PKG,
        "src/AiAnswer.tsx": LIVE_REGION_MISSING_AILABEL,
      }),
    },
  ],
  metamorphic: [
    {
      name: "ailabel-and-aibadge-both-flag-without-live-region",
      a: { "package.json": PKG, "src/AiAnswer.tsx": LIVE_REGION_MISSING_AILABEL },
      b: { "package.json": PKG, "src/AiAnswer.tsx": LIVE_REGION_MISSING_AIBADGE },
      expectViolation: true,
    },
  ],
};

const VALUE_GATE_DOC_CONTENT = `# AI Value Gate

- [ ] Is AI needed for this feature?
- [ ] Is AI the right tool?
- [ ] What is the deterministic fallback?
`;

const valueGateDocAdapter: OracleAdapter = makeVocabularyAdapter({
  ruleId: "ai-governance/value-gate-doc-present",
  aiSurface: `export const AILabel = () => null;`,
  affordanceSnippet: VALUE_GATE_DOC_CONTENT,
  affordanceFile: "AI_GOVERNANCE.md",
});

const INTERACTION_PATTERN_DOC_CONTENT = `# AI Assistant Patterns

## Suggestions
How AI suggestion UI works.

## Generation
How AI content generation works.
`;

const interactionPatternDocsAdapter: OracleAdapter = makeVocabularyAdapter({
  ruleId: "ai-governance/interaction-pattern-docs",
  aiSurface: `export const AILabel = () => null;`,
  affordanceSnippet: INTERACTION_PATTERN_DOC_CONTENT,
  affordanceFile: "docs/ai-patterns.md",
});

const AI_TOKENS_RESERVED_TOKENS_JSON = JSON.stringify({
  gradient: { "dragon-fruit": "#ff6b6b" },
});

const aiTokensReservedAdapter: OracleAdapter = {
  ruleId: "ai-governance/ai-tokens-reserved",
  oracleKind: "construction",
  cleanFixture: () => ({
    "package.json": PKG,
    "tokens.json": JSON.stringify({ color: { primary: "#0070f3" } }),
  }),
  mutations: [
    {
      name: "add-reserved-token-should-flag",
      apply: () => ({
        "package.json": PKG,
        "tokens.json": AI_TOKENS_RESERVED_TOKENS_JSON,
      }),
    },
  ],
  metamorphic: [],
};

const AI_TOKEN_MISUSE_SURFACE_WITH_MARKER = `
export const AILabel = () => null;
export const Panel = () => <div style={{ background: 'var(--ai-aura-start)' }} />;
`.trim();

const AI_TOKEN_MISUSE_SURFACE_WITHOUT_MARKER = `
export const Panel = () => <div style={{ background: 'var(--ai-aura-start)' }} />;
`.trim();

const aiTokenMisuseAdapter: OracleAdapter = {
  ruleId: "ai-governance/ai-token-misuse",
  oracleKind: "construction",
  cleanFixture: () => ({
    "package.json": PKG,
    "src/AiPanel.tsx": AI_TOKEN_MISUSE_SURFACE_WITH_MARKER,
  }),
  mutations: [
    {
      name: "remove-ai-marker-from-token-user-should-flag",
      apply: () => ({
        "package.json": PKG,
        "src/AiPanel.tsx": AI_TOKEN_MISUSE_SURFACE_WITHOUT_MARKER,
      }),
    },
  ],
  metamorphic: [],
};

const DISCLAIMER_COMPLIANT = `
export function AISummary() {
  return (
    <div>
      <AILabel />
      <p>Some content here.</p>
      <p>AI-generated content may be inaccurate. Always check important information.</p>
    </div>
  );
}
`.trim();

const DISCLAIMER_BARE_AILABEL = `
export function AISummary() {
  return (
    <div>
      <AILabel />
      <p>Some content here.</p>
    </div>
  );
}
`.trim();

const DISCLAIMER_BARE_AIBADGE = `
export function AISummary() {
  return (
    <div>
      <AIBadge />
      <p>Some content here.</p>
    </div>
  );
}
`.trim();

const disclaimerPresentAdapter: OracleAdapter = {
  ruleId: "ai-governance/disclaimer-present",
  oracleKind: "construction",
  cleanFixture: () => ({
    "package.json": PKG,
    "src/AISummary.tsx": DISCLAIMER_COMPLIANT,
  }),
  mutations: [
    {
      name: "ai-marker-tag-no-disclaimer-should-flag",
      apply: () => ({
        "package.json": PKG,
        "src/AISummary.tsx": DISCLAIMER_BARE_AILABEL,
      }),
    },
  ],
  metamorphic: [
    {
      name: "ailabel-and-aibadge-both-flag-without-disclaimer",
      a: { "package.json": PKG, "src/AISummary.tsx": DISCLAIMER_BARE_AILABEL },
      b: { "package.json": PKG, "src/AISummary.tsx": DISCLAIMER_BARE_AIBADGE },
      expectViolation: true,
    },
  ],
};

const ANTI_PATTERN_CLEAN_WITH_AILABEL_TAG = `
export const AILabel = () => null;
export function SparkleAI() {
  return (
    <span>
      <AILabel />
      ✨
    </span>
  );
}
`.trim();

const ANTI_PATTERN_CLEAN_WITH_AIBADGE_TAG = `
export const AIBadge = () => null;
export function SparkleAI() {
  return (
    <span>
      <AIBadge />
      ✨
    </span>
  );
}
`.trim();

const ANTI_PATTERN_FLAGGED = `
export const AILabel = () => null;
export function SparkleOnly() {
  return <span>✨ generatedText</span>;
}
`.trim();

const aiMarkerAntiPatternsAdapter: OracleAdapter = {
  ruleId: "ai-governance/ai-marker-anti-patterns",
  oracleKind: "metamorphic",
  cleanFixture: () => ({
    "package.json": PKG,
    "src/SparkleAI.tsx": ANTI_PATTERN_CLEAN_WITH_AILABEL_TAG,
  }),
  mutations: [
    {
      name: "remove-ai-marker-tag-sparkle-should-flag",
      apply: () => ({
        "package.json": PKG,
        "src/SparkleAI.tsx": ANTI_PATTERN_FLAGGED,
      }),
    },
  ],
  metamorphic: [
    {
      name: "ailabel-tag-vs-aibadge-tag-both-clean",
      a: { "package.json": PKG, "src/SparkleAI.tsx": ANTI_PATTERN_CLEAN_WITH_AILABEL_TAG },
      b: { "package.json": PKG, "src/SparkleAI.tsx": ANTI_PATTERN_CLEAN_WITH_AIBADGE_TAG },
      expectViolation: false,
    },
  ],
};

export const vocabularyAdapters: OracleAdapter[] = [
  aiMarkerComponentPresentAdapter,
  botIdentityAdapter,
  sourceAttributionAdapter,
  confidenceIndicatorAdapter,
  feedbackControlAdapter,
  productAnalyticsAdapter,
  aiLoadingErrorStatesAdapter,
  aiContentLiveRegionAdapter,
  valueGateDocAdapter,
  interactionPatternDocsAdapter,
  aiTokensReservedAdapter,
  aiTokenMisuseAdapter,
  disclaimerPresentAdapter,
  aiMarkerAntiPatternsAdapter,
  // DROPPED: ai-governance/ai-token-requires-marker
  // Cross-file AST tracer is recall-failing (per coverage.ts note). The fixture
  // injection surface requires reserved tokens in one file AND component files
  // referencing them via var() — too complex to produce a deterministic J=1.000.
  // Stays in ADDRESSABLE_PENDING until the tracer is improved.
];
