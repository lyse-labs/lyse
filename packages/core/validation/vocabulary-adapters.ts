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

// For all co-presence rules (AI marker + affordance → info; AI marker alone → warning;
// no AI marker → no finding), the only valid clean state is NO AI SURFACE.
// That is the only state that produces zero findings for the rule.
// A plain button-only file has no AI surface → rule emits nothing.
const PLAIN_BUTTON_FILE = `export const Button = () => null;`;

// ai-governance/ai-marker-component-present
// No AI surface → no finding (clean). Add reserved tokens without marker → warning fires.
// isReservedTokenName("dragon-fruit") = true (unambiguous Carbon vendor signature).
const AI_MARKER_COMPONENT_RESERVED_TOKENS = JSON.stringify({
  gradient: { "dragon-fruit": "#ff6b6b" },
});

const aiMarkerComponentPresentAdapter: OracleAdapter = {
  ruleId: "ai-governance/ai-marker-component-present",
  oracleKind: "construction",
  cleanFixture: () => ({
    "package.json": PKG,
    "src/Button.tsx": PLAIN_BUTTON_FILE,
  }),
  mutations: [
    {
      name: "add-reserved-tokens-no-marker-should-flag",
      apply: () => ({
        "package.json": PKG,
        "src/Button.tsx": PLAIN_BUTTON_FILE,
        "tokens.json": AI_MARKER_COMPONENT_RESERVED_TOKENS,
      }),
    },
  ],
  metamorphic: [],
};

// ai-governance/bot-identity-labeling
// Gate: at least one component file has an AI marker (fileHasAiMarker).
// Outcomes: AI marker + bot-identity in same file → info (flagged).
//           AI marker, no bot-identity → warning (flagged).
//           No AI marker → no finding (NOT flagged) ← clean state.
// cleanFixture: no AI marker → no finding.
// mutation: AI marker present, no bot-identity → warning fires.
// Metamorphic: both mutation variants should flag (both warnings → expectViolation: true).
const BOT_IDENTITY_BARE_MARKER = `export const AILabel = () => null;`;

const botIdentityAdapter: OracleAdapter = {
  ruleId: "ai-governance/bot-identity-labeling",
  oracleKind: "construction",
  cleanFixture: () => ({
    "package.json": PKG,
    "src/Chat.tsx": PLAIN_BUTTON_FILE,
  }),
  mutations: [
    {
      name: "ai-marker-no-identity-should-flag",
      apply: () => ({
        "package.json": PKG,
        "src/Chat.tsx": BOT_IDENTITY_BARE_MARKER,
      }),
    },
  ],
  // Metamorphic: AiAvatar vs BotAvatar both suppress the warning (but produce info = still flagged).
  // Since info IS a finding, we cannot use expectViolation: false for the suppressed case.
  // An honest metamorphic pair for this rule: two bare-marker fixtures that both produce a warning.
  metamorphic: [
    {
      name: "both-bare-markers-both-flag",
      a: { "package.json": PKG, "src/Chat.tsx": BOT_IDENTITY_BARE_MARKER },
      b: { "package.json": PKG, "src/Chat.tsx": `export const AIBadge = () => null;` },
      expectViolation: true,
    },
  ],
};

// ai-governance/source-attribution-present
// Gate: any component file has AI marker. No AI surface → no finding (clean).
// mutation: AI marker with no attribution → warning fires.
const sourceAttributionAdapter: OracleAdapter = {
  ruleId: "ai-governance/source-attribution-present",
  oracleKind: "construction",
  cleanFixture: () => ({
    "package.json": PKG,
    "src/AiAnswer.tsx": PLAIN_BUTTON_FILE,
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
      // Two bare-AI-marker fixtures both produce a warning (consistent behaviour).
      name: "both-bare-markers-both-flag",
      a: { "package.json": PKG, "src/AiAnswer.tsx": `export const AILabel = () => null;` },
      b: { "package.json": PKG, "src/AiAnswer.tsx": `export const AIBadge = () => null;` },
      expectViolation: true,
    },
  ],
};

// ai-governance/confidence-indicator-present
// Gate: any component file has AI marker. No AI surface → no finding (clean).
// mutation: AI marker with no confidence indicator → warning fires.
const confidenceIndicatorAdapter: OracleAdapter = {
  ruleId: "ai-governance/confidence-indicator-present",
  oracleKind: "construction",
  cleanFixture: () => ({
    "package.json": PKG,
    "src/AiOutput.tsx": PLAIN_BUTTON_FILE,
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
      name: "both-bare-markers-both-flag",
      a: { "package.json": PKG, "src/AiOutput.tsx": `export const AILabel = () => null;` },
      b: { "package.json": PKG, "src/AiOutput.tsx": `export const AIBadge = () => null;` },
      expectViolation: true,
    },
  ],
};

// ai-governance/feedback-control-present
// Gate: any component file has AI marker. No AI surface → no finding (clean).
// mutation: AI marker with no feedback control → warning fires.
const feedbackControlAdapter: OracleAdapter = {
  ruleId: "ai-governance/feedback-control-present",
  oracleKind: "construction",
  cleanFixture: () => ({
    "package.json": PKG,
    "src/AiFeedback.tsx": PLAIN_BUTTON_FILE,
  }),
  mutations: [
    {
      name: "ai-marker-no-feedback-should-flag",
      apply: () => ({
        "package.json": PKG,
        "src/AiFeedback.tsx": `export const AILabel = () => null;`,
      }),
    },
  ],
  metamorphic: [
    {
      name: "both-bare-markers-both-flag",
      a: { "package.json": PKG, "src/AiFeedback.tsx": `export const AILabel = () => null;` },
      b: { "package.json": PKG, "src/AiFeedback.tsx": `export const AIBadge = () => null;` },
      expectViolation: true,
    },
  ],
};

// ai-governance/product-analytics
// Gate: file has AI marker AND has onAccept/onReject/etc handlers.
// Rule fires when: AI surface has interaction handler BUT NO analytics.
// cleanFixture: AILabel + onAccept handler + analytics.track() call → no finding.
// mutation: remove analytics.track() → warning fires.
const PRODUCT_ANALYTICS_SURFACE_INSTRUMENTED = `
export const AILabel = () => null;
export function AiSuggestion({ onAccept }: { onAccept: () => void }) {
  return <div onAccept={onAccept} />;
}
analytics.track('ai_accepted');
`.trim();

const PRODUCT_ANALYTICS_SURFACE_BARE = `
export const AILabel = () => null;
export function AiSuggestion({ onAccept }: { onAccept: () => void }) {
  return <div onAccept={onAccept} />;
}
`.trim();

const productAnalyticsAdapter: OracleAdapter = {
  ruleId: "ai-governance/product-analytics",
  oracleKind: "construction",
  cleanFixture: () => ({
    "package.json": PKG,
    "src/AiSuggestion.tsx": PRODUCT_ANALYTICS_SURFACE_INSTRUMENTED,
  }),
  mutations: [
    {
      name: "remove-analytics-should-flag",
      apply: () => ({
        "package.json": PKG,
        "src/AiSuggestion.tsx": PRODUCT_ANALYTICS_SURFACE_BARE,
      }),
    },
  ],
  metamorphic: [],
};

// ai-governance/ai-loading-error-states
// Gate: hasAiSurface = any component file has an AI marker name (isAiMarkerName).
// Needs BOTH: (a) named loading state AND (b) AI-specific error state.
// Clean = no AI surface → no finding.
// mutation: AI marker + Generating (no AIError) → warning fires for missing AIError.
const AI_LOADING_BARE_MARKER_WITH_LOADING_ONLY = `
export const AILabel = () => null;
export const Generating = () => null;
`.trim();

const AI_LOADING_WITH_ERROR_ONLY = `
export const AILabel = () => null;
export const AIError = () => null;
`.trim();

const aiLoadingErrorStatesAdapter: OracleAdapter = {
  ruleId: "ai-governance/ai-loading-error-states",
  oracleKind: "construction",
  // clean = no AI surface → no finding
  cleanFixture: () => ({
    "package.json": PKG,
    "src/AiStates.tsx": PLAIN_BUTTON_FILE,
  }),
  mutations: [
    {
      // AI marker + loading only (no error state) → warning fires for missing AIError
      name: "ai-marker-with-loading-no-error-should-flag",
      apply: () => ({
        "package.json": PKG,
        "src/AiStates.tsx": AI_LOADING_BARE_MARKER_WITH_LOADING_ONLY,
      }),
    },
  ],
  metamorphic: [
    {
      // Both loading-only and error-only variants produce warnings (different missing affordances).
      // Both violate (both missing one of the two required affordances).
      name: "loading-only-and-error-only-both-flag",
      a: { "package.json": PKG, "src/AiStates.tsx": AI_LOADING_BARE_MARKER_WITH_LOADING_ONLY },
      b: { "package.json": PKG, "src/AiStates.tsx": AI_LOADING_WITH_ERROR_ONLY },
      expectViolation: true,
    },
  ],
};

// ai-governance/ai-content-live-region
// Gate: detectAiOutputSurface = file has AI marker tag, AIResponse/ChatMessage, or isStreaming/isGenerating.
// Proximity: live-region must WRAP the AI output (appear before it in same return slot).
// Clean = no AI surface → no finding. mutation: <AILabel/> tag without live region → warning fires.
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
  // clean = no AI surface → no finding
  cleanFixture: () => ({
    "package.json": PKG,
    "src/AiAnswer.tsx": PLAIN_BUTTON_FILE,
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
      // AILabel and AIBadge both trigger the AI-output-surface gate → both produce warnings.
      name: "ailabel-and-aibadge-both-flag",
      a: { "package.json": PKG, "src/AiAnswer.tsx": LIVE_REGION_MISSING_AILABEL },
      b: { "package.json": PKG, "src/AiAnswer.tsx": LIVE_REGION_MISSING_AIBADGE },
      expectViolation: true,
    },
  ],
};

// ai-governance/value-gate-doc-present
// Gate: hasAiSurface = scanForMarkerComponents OR detectReservedAiTokens.
// Clean = no AI surface → no finding. mutation: AILabel + no AI_GOVERNANCE.md → warning fires.
const valueGateDocAdapter: OracleAdapter = {
  ruleId: "ai-governance/value-gate-doc-present",
  oracleKind: "construction",
  cleanFixture: () => ({
    "package.json": PKG,
    "src/Button.tsx": PLAIN_BUTTON_FILE,
  }),
  mutations: [
    {
      name: "ai-surface-no-gate-doc-should-flag",
      apply: () => ({
        "package.json": PKG,
        "src/AILabel.tsx": `export const AILabel = () => null;`,
      }),
    },
  ],
  metamorphic: [
    {
      // Reserved tokens alone also trigger the gate → both flag without the doc.
      name: "marker-component-and-reserved-tokens-both-flag",
      a: {
        "package.json": PKG,
        "src/AILabel.tsx": `export const AILabel = () => null;`,
      },
      b: {
        "package.json": PKG,
        "src/Button.tsx": PLAIN_BUTTON_FILE,
        "tokens.json": JSON.stringify({ gradient: { "dragon-fruit": "#ff6b6b" } }),
      },
      expectViolation: true,
    },
  ],
};

// ai-governance/interaction-pattern-docs
// Gate: any component file has AI marker (fileHasAiMarker).
// Clean = no AI surface → no finding. mutation: AILabel + no .md pattern docs → warning fires.
const interactionPatternDocsAdapter: OracleAdapter = {
  ruleId: "ai-governance/interaction-pattern-docs",
  oracleKind: "construction",
  cleanFixture: () => ({
    "package.json": PKG,
    "src/Button.tsx": PLAIN_BUTTON_FILE,
  }),
  mutations: [
    {
      name: "ai-surface-no-pattern-docs-should-flag",
      apply: () => ({
        "package.json": PKG,
        "src/AILabel.tsx": `export const AILabel = () => null;`,
      }),
    },
  ],
  metamorphic: [
    {
      // AILabel and AIBadge both trigger the gate → both warn without pattern docs.
      name: "ailabel-and-aibadge-both-flag",
      a: { "package.json": PKG, "src/AILabel.tsx": `export const AILabel = () => null;` },
      b: { "package.json": PKG, "src/AIBadge.tsx": `export const AIBadge = () => null;` },
      expectViolation: true,
    },
  ],
};

// ai-governance/ai-tokens-reserved
// No reserved tokens → no finding (clean). Add reserved tokens → info fires.
// isReservedTokenName("dragon-fruit") = true (unambiguous Carbon vendor signature).
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

// ai-governance/ai-token-misuse
// Rule fires when reserved AI tokens are USED in a NON-AI-context file.
// AI context: (1) has AI marker, (2) AI-named path, or (3) defines reserved tokens.
// cleanFixture: AILabel export + var(--ai-aura-start) → AI context, no finding.
// mutation: remove AILabel → non-AI context using reserved token → warning fires.
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

// ai-governance/disclaimer-present
// Per-file: detectAiMarkerInSource checks JSX TAGS (<AILabel>) not exported names.
// Gate: file has an AI marker tag. Clean = no AI marker JSX tag → no finding.
// mutation: <AILabel/> JSX tag with no disclaimer → warning fires.
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
  // clean = no AI marker JSX tag → no finding
  cleanFixture: () => ({
    "package.json": PKG,
    "src/AISummary.tsx": PLAIN_BUTTON_FILE,
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
      // AILabel and AIBadge JSX tags both trigger the gate → both warn without disclaimer.
      name: "ailabel-and-aibadge-both-flag",
      a: { "package.json": PKG, "src/AISummary.tsx": DISCLAIMER_BARE_AILABEL },
      b: { "package.json": PKG, "src/AISummary.tsx": DISCLAIMER_BARE_AIBADGE },
      expectViolation: true,
    },
  ],
};

// ai-governance/ai-marker-anti-patterns
// Anti-pattern A (sparkle-only): fires when sparkle + AI context (exported AI marker name) + no AI-marker TAG.
// cleanFixture: sparkle + <AILabel/> JSX tag → detectSparkleOnlyMarker = false (tag suppresses it).
// mutation: remove <AILabel/> tag but keep export + sparkle → sparkle-only anti-pattern fires.
// Metamorphic: AILabel tag vs AIBadge tag — both suppress the sparkle warning (expectViolation: false).
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

// Export AILabel (context) + sparkle + no AI-marker JSX tag → fires.
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
      // AILabel tag vs AIBadge tag — both suppress sparkle anti-pattern (both clean, not flagged).
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
