// 13 sub-axes, 1:1 mapped to the 13 shipped rules.
// Each sub-axis declares the scoring axis it reports under (5 total per
// AxisName in packages/core/src/types.ts: tokens, a11y, components, stories,
// ai-surface). Naming rules report under the components axis.
import type { SubAxisRecord } from "../types.js";

export const SUB_AXES: SubAxisRecord[] = [
  { id: "tokens.color", axis: "tokens", name: "Color tokens", status: "experimental", precisionMeasured: null, recallMeasured: null, precisionWilsonLowerBound: null, recallWilsonLowerBound: null, lastCalibrated: null, contributesToScore: false, ruleIds: ["tokens/no-hardcoded-color"], llmDriven: false },
  { id: "tokens.spacing", axis: "tokens", name: "Spacing tokens", status: "experimental", precisionMeasured: null, recallMeasured: null, precisionWilsonLowerBound: null, recallWilsonLowerBound: null, lastCalibrated: null, contributesToScore: false, ruleIds: ["tokens/no-hardcoded-spacing"], llmDriven: false },
  { id: "tokens.dtcg-conformance", axis: "tokens", name: "DTCG conformance", status: "experimental", precisionMeasured: null, recallMeasured: null, precisionWilsonLowerBound: null, recallWilsonLowerBound: null, lastCalibrated: null, contributesToScore: false, ruleIds: ["tokens/dtcg-conformance"], llmDriven: false },
  { id: "tokens.description-coverage", axis: "tokens", name: "Token description coverage", status: "experimental", precisionMeasured: null, recallMeasured: null, precisionWilsonLowerBound: null, recallWilsonLowerBound: null, lastCalibrated: null, contributesToScore: false, ruleIds: ["tokens/description-coverage"], llmDriven: false },
  { id: "a11y.essentials", axis: "a11y", name: "jsx-a11y essentials", status: "experimental", precisionMeasured: null, recallMeasured: null, precisionWilsonLowerBound: null, recallWilsonLowerBound: null, lastCalibrated: null, contributesToScore: false, ruleIds: ["a11y/essentials"], llmDriven: false },
  { id: "components.native-shadows", axis: "components", name: "Native shadow elements", status: "experimental", precisionMeasured: null, recallMeasured: null, precisionWilsonLowerBound: null, recallWilsonLowerBound: null, lastCalibrated: null, contributesToScore: false, ruleIds: ["components/no-native-shadows"], llmDriven: false },
  { id: "components.naming-component-pascalcase", axis: "components", name: "Component PascalCase", status: "experimental", precisionMeasured: null, recallMeasured: null, precisionWilsonLowerBound: null, recallWilsonLowerBound: null, lastCalibrated: null, contributesToScore: false, ruleIds: ["naming/component-pascalcase"], llmDriven: false },
  { id: "components.naming-hook-prefix", axis: "components", name: "Hook `use` prefix", status: "experimental", precisionMeasured: null, recallMeasured: null, precisionWilsonLowerBound: null, recallWilsonLowerBound: null, lastCalibrated: null, contributesToScore: false, ruleIds: ["naming/hook-prefix"], llmDriven: false },
  { id: "stories.coverage", axis: "stories", name: "Storybook coverage", status: "experimental", precisionMeasured: null, recallMeasured: null, precisionWilsonLowerBound: null, recallWilsonLowerBound: null, lastCalibrated: null, contributesToScore: false, ruleIds: ["stories/coverage"], llmDriven: false },
  { id: "ai-surface.agents-md-quality", axis: "ai-surface", name: "AGENTS.md quality", status: "experimental", precisionMeasured: null, recallMeasured: null, precisionWilsonLowerBound: null, recallWilsonLowerBound: null, lastCalibrated: null, contributesToScore: false, ruleIds: ["ai-surface/agents-md-quality"], llmDriven: false },
  { id: "ai-surface.component-manifest-json", axis: "ai-surface", name: "Component manifest JSON", status: "experimental", precisionMeasured: null, recallMeasured: null, precisionWilsonLowerBound: null, recallWilsonLowerBound: null, lastCalibrated: null, contributesToScore: false, ruleIds: ["ai-surface/component-manifest-json"], llmDriven: false },
  { id: "ai-surface.ds-index-exported", axis: "ai-surface", name: "DS index export", status: "experimental", precisionMeasured: null, recallMeasured: null, precisionWilsonLowerBound: null, recallWilsonLowerBound: null, lastCalibrated: null, contributesToScore: false, ruleIds: ["ai-surface/ds-index-exported"], llmDriven: false },
  { id: "ai-surface.mcp-config-present", axis: "ai-surface", name: "MCP config present", status: "experimental", precisionMeasured: null, recallMeasured: null, precisionWilsonLowerBound: null, recallWilsonLowerBound: null, lastCalibrated: null, contributesToScore: false, ruleIds: ["ai-surface/mcp-config-present"], llmDriven: false },
];

export function getSubAxis(id: string): SubAxisRecord | undefined {
  return SUB_AXES.find((s) => s.id === id);
}
