import { rule as rColor } from "./tokens-no-hardcoded-color.js";
import { rule as rSpacing } from "./tokens-no-hardcoded-spacing.js";
import { rule as rDtcgConformance } from "./tokens-dtcg-conformance.js";
import { rule as rDescriptionCoverage } from "./tokens-description-coverage.js";
import { rule as rThemeModesPresent } from "./tokens-theme-modes-present.js";
import { rule as rCssCustomPropertyExport } from "./tokens-css-custom-property-export.js";
import { rule as rResponsiveBreakpoints } from "./tokens-responsive-breakpoints.js";
import { rule as rMediaQuery } from "./tokens-no-hardcoded-media-query.js";
import { rule as rContainerQuery } from "./tokens-container-query.js";
import { rule as rShadowNative } from "./components-shadow-native.js";
import { rule as rNoIconFonts } from "./components-no-icon-fonts.js";
import { rule as rSvgViewbox } from "./components-svg-viewbox.js";
import { rule as rContractsStrictness } from "./components-contracts-strictness.js";
import { rule as rDocComments } from "./components-doc-comments.js";
import { rule as rNamingPascalCase } from "./naming-component-pascalcase.js";
import { rule as rNamingHookPrefix } from "./naming-hook-prefix.js";
import { rule as rA11y } from "./a11y-essentials.js";
import { rule as rReducedMotion } from "./a11y-prefers-reduced-motion.js";
import { rule as rFocusVisible } from "./a11y-focus-visible.js";
import { rule as rInclusiveLanguage } from "./a11y-inclusive-language.js";
import { rule as rForcedColors } from "./a11y-forced-colors.js";
import { rule as rHtmlLang } from "./a11y-html-lang.js";
import { rule as rStorybook } from "./storybook-coverage.js";
import { rule as rAgentsMdQuality } from "./ai-surface-agents-md-quality.js";
import { rule as rComponentManifestJson } from "./ai-surface-component-manifest-json.js";
import { rule as rDsIndexExported } from "./ai-surface-ds-index-exported.js";
import { rule as rMcpConfigPresent } from "./ai-surface-mcp-config-present.js";
import { rule as rLlmsTxtStructure } from "./ai-surface-llms-txt-structure.js";
import { rule as rShadcnRegistryValid } from "./ai-surface-shadcn-registry-valid.js";
import { rule as rAgentInstructionFiles } from "./ai-surface-agent-instruction-files.js";
import { rule as rChangelogPresent } from "./versioning-changelog-present.js";
import { rule as rSemverVersioning } from "./versioning-semver-versioning.js";
import { rule as rMigrationGuidePresent } from "./versioning-migration-guide-present.js";
import { rule as rDeprecationMarkers } from "./versioning-deprecation-markers.js";
import { rule as rDeprecatedTokenUsage } from "./tokens-deprecated-token-usage.js";
import { rule as rNoHardcodedZIndex } from "./tokens-no-hardcoded-z-index.js";
import { rule as rNoHardcodedOpacity } from "./tokens-no-hardcoded-opacity.js";
import { rule as rNoHardcodedBorderRadius } from "./tokens-no-hardcoded-border-radius.js";
import { rule as rNoHardcodedBorderWidth } from "./tokens-no-hardcoded-border-width.js";
import { rule as rNoHardcodedMotion } from "./tokens-no-hardcoded-motion.js";
import { rule as rNoHardcodedShadow } from "./tokens-no-hardcoded-shadow.js";
import { rule as rNoHardcodedGradient } from "./tokens-no-hardcoded-gradient.js";
import { rule as rNoHardcodedTypography } from "./tokens-no-hardcoded-typography.js";
import { rule as rAiTokensReserved } from "./ai-governance-ai-tokens-reserved.js";
import { rule as rAiMarkerComponentPresent } from "./ai-governance-ai-marker-component-present.js";
import { rule as rExplainabilityAffordance } from "./ai-governance-explainability-affordance.js";
import { rule as rAiTokenRequiresMarker } from "./ai-governance-ai-token-requires-marker.js";
import { rule as rAiLoadingErrorStates } from "./ai-governance-ai-loading-error-states.js";
import { rule as rHumanControlAffordances } from "./ai-governance-human-control-affordances.js";
import { rule as rAiMarkerAntiPatterns } from "./ai-governance-ai-marker-anti-patterns.js";
import { rule as rAiContentLiveRegion } from "./ai-governance-ai-content-live-region.js";
import { rule as rDisclaimerPresent } from "./ai-governance-disclaimer-present.js";
import { rule as rFeedbackControlPresent } from "./ai-governance-feedback-control-present.js";
import { rule as rValueGateDocPresent } from "./ai-governance-value-gate-doc-present.js";
import { rule as rConfidenceIndicatorPresent } from "./ai-governance-confidence-indicator-present.js";
import { rule as rSourceAttributionPresent } from "./ai-governance-source-attribution-present.js";
import { rule as rBotIdentityLabeling } from "./ai-governance-bot-identity-labeling.js";
import { rule as rAiTokenMisuse } from "./ai-governance-ai-token-misuse.js";
import { rule as rInteractionPatternDocs } from "./ai-governance-interaction-pattern-docs.js";
import { rule as rDraftAttribution } from "./ai-governance-draft-attribution.js";
import { rule as rProductAnalytics } from "./ai-governance-product-analytics.js";
import type { Rule } from "../types.js";

export const ruleObjects: Rule[] = [
  rColor,
  rSpacing,
  rDtcgConformance,
  rDescriptionCoverage,
  rThemeModesPresent,
  rCssCustomPropertyExport,
  rResponsiveBreakpoints,
  rMediaQuery,
  rContainerQuery,
  rShadowNative,
  rNoIconFonts,
  rSvgViewbox,
  rContractsStrictness,
  rDocComments,
  rNamingPascalCase,
  rNamingHookPrefix,
  rA11y,
  rReducedMotion,
  rFocusVisible,
  rInclusiveLanguage,
  rForcedColors,
  rHtmlLang,
  rStorybook,
  rAgentsMdQuality,
  rComponentManifestJson,
  rDsIndexExported,
  rMcpConfigPresent,
  rLlmsTxtStructure,
  rShadcnRegistryValid,
  rAgentInstructionFiles,
  rChangelogPresent,
  rSemverVersioning,
  rMigrationGuidePresent,
  rDeprecationMarkers,
  rDeprecatedTokenUsage,
  rNoHardcodedZIndex,
  rNoHardcodedOpacity,
  rNoHardcodedBorderRadius,
  rNoHardcodedBorderWidth,
  rNoHardcodedMotion,
  rNoHardcodedShadow,
  rNoHardcodedGradient,
  rNoHardcodedTypography,
  rAiTokensReserved,
  rAiMarkerComponentPresent,
  rExplainabilityAffordance,
  rAiTokenRequiresMarker,
  rAiLoadingErrorStates,
  rHumanControlAffordances,
  rAiMarkerAntiPatterns,
  rAiContentLiveRegion,
  rDisclaimerPresent,
  rFeedbackControlPresent,
  rValueGateDocPresent,
  rConfidenceIndicatorPresent,
  rSourceAttributionPresent,
  rBotIdentityLabeling,
  rAiTokenMisuse,
  rInteractionPatternDocs,
  rDraftAttribution,
  rProductAnalytics,
];

export const ruleMap = new Map<string, Rule>(ruleObjects.map((r) => [r.id, r]));
