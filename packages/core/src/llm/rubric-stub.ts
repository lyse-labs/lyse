import type { AxisName, RuleId } from "../types.js";

export interface RubricDimension {
  key: string;
  axis: AxisName;
  ruleId: RuleId;
  prompt: string;
}

export function getStubRubricDimensions(): RubricDimension[] {
  return [];
}
