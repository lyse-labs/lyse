import type {
  Rule,
  RuleContext,
  ParsedFiles,
  RuleEvalResult,
  AxisName,
  Severity,
  RuleMeta,
} from "../types.js";

export interface LyseRuleMeta {
  axis: AxisName;
  lyseRuleId: string;
  defaultSeverity: Severity;
  shortDescription: string;
  fullDescription: string;
  helpUri: string;
  rationale: string;
  examples: { good: string; bad: string }[];
  allowlist: string[];
}

type LyseEvaluator = (
  ctx: RuleContext,
  parsedFiles: ParsedFiles,
) => Promise<RuleEvalResult>;

export interface LyseRuleDefinition<
  Options extends readonly unknown[] = [],
> {
  meta: LyseRuleMeta;
  defaultOptions: Options;
  create: () => { evaluate: LyseEvaluator };
  classifyConfidence?: Rule["classifyConfidence"];
  applyCodemod?: Rule["applyCodemod"];
  singleFileCapable?: boolean;
}

const META_REGISTRY = new Map<string, LyseRuleMeta>();

export function createLyseRule<
  Options extends readonly unknown[] = [],
>(def: LyseRuleDefinition<Options>): Rule {
  META_REGISTRY.set(def.meta.lyseRuleId, def.meta);
  const { evaluate } = def.create();
  return {
    id: def.meta.lyseRuleId,
    axis: def.meta.axis,
    evaluate,
    ...(def.classifyConfidence ? { classifyConfidence: def.classifyConfidence } : {}),
    ...(def.applyCodemod ? { applyCodemod: def.applyCodemod } : {}),
    ...(def.singleFileCapable ? { singleFileCapable: true } : {}),
  };
}

export function getRegisteredRuleMeta(id: string): LyseRuleMeta | undefined {
  return META_REGISTRY.get(id);
}

export function toRuleMeta(m: LyseRuleMeta): RuleMeta {
  return {
    id: m.lyseRuleId,
    axis: m.axis,
    defaultSeverity: m.defaultSeverity,
    shortDescription: m.shortDescription,
    fullDescription: m.fullDescription,
    helpUri: m.helpUri,
    rationale: m.rationale,
    examples: m.examples,
    allowlist: m.allowlist,
  };
}
