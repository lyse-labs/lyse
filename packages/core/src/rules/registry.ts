import { rule as rColor } from "./tokens-no-hardcoded-color.js";
import { rule as rSpacing } from "./tokens-no-hardcoded-spacing.js";
import { rule as rDtcgConformance } from "./tokens-dtcg-conformance.js";
import { rule as rDescriptionCoverage } from "./tokens-description-coverage.js";
import { rule as rShadowNative } from "./components-shadow-native.js";
import { rule as rContractsStrictness } from "./components-contracts-strictness.js";
import { rule as rNamingPascalCase } from "./naming-component-pascalcase.js";
import { rule as rNamingHookPrefix } from "./naming-hook-prefix.js";
import { rule as rA11y } from "./a11y-essentials.js";
import { rule as rStorybook } from "./storybook-coverage.js";
import { rule as rAgentsMdQuality } from "./ai-surface-agents-md-quality.js";
import { rule as rComponentManifestJson } from "./ai-surface-component-manifest-json.js";
import { rule as rDsIndexExported } from "./ai-surface-ds-index-exported.js";
import { rule as rMcpConfigPresent } from "./ai-surface-mcp-config-present.js";
import { rule as rLlmsTxtStructure } from "./ai-surface-llms-txt-structure.js";
import { rule as rShadcnRegistryValid } from "./ai-surface-shadcn-registry-valid.js";
import { rule as rAgentInstructionFiles } from "./ai-surface-agent-instruction-files.js";
import { rule as rAiTokensReserved } from "./ai-governance-ai-tokens-reserved.js";
import { rule as rAiMarkerComponentPresent } from "./ai-governance-ai-marker-component-present.js";
import { rule as rExplainabilityAffordance } from "./ai-governance-explainability-affordance.js";
import { rule as rAiTokenRequiresMarker } from "./ai-governance-ai-token-requires-marker.js";
import { rule as rAiLoadingErrorStates } from "./ai-governance-ai-loading-error-states.js";
import type { Rule } from "../types.js";

export const ruleObjects: Rule[] = [
  rColor,
  rSpacing,
  rDtcgConformance,
  rDescriptionCoverage,
  rShadowNative,
  rContractsStrictness,
  rNamingPascalCase,
  rNamingHookPrefix,
  rA11y,
  rStorybook,
  rAgentsMdQuality,
  rComponentManifestJson,
  rDsIndexExported,
  rMcpConfigPresent,
  rLlmsTxtStructure,
  rShadcnRegistryValid,
  rAgentInstructionFiles,
  rAiTokensReserved,
  rAiMarkerComponentPresent,
  rExplainabilityAffordance,
  rAiTokenRequiresMarker,
  rAiLoadingErrorStates,
];

export const ruleMap = new Map<string, Rule>(ruleObjects.map((r) => [r.id, r]));
