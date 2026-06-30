import type {
  RuleContext,
  ParsedFiles,
  RuleEvalResult,
  Finding,
  StoryEntry,
} from "../types.js";
import { createLyseRule } from "./_rule-module.js";

function hasUsageExamples(entry: StoryEntry): boolean {
  const stories = entry.stories ?? [];
  if (stories.length >= 2) return true;
  return stories.some(
    (s) => s.args !== undefined && Object.keys(s.args).length > 0,
  );
}

const evaluate = async (
  ctx: RuleContext,
  _files: ParsedFiles,
): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  if (ctx.dsSelfMode) return { findings, opportunities: 0 };
  if (!ctx.storyIndex) return { findings, opportunities: 0 };

  let opportunities = 0;
  for (const c of ctx.componentInventory) {
    const entry = ctx.storyIndex.byTitle.get(c.name);
    if (!entry) continue;
    opportunities++;
    if (!hasUsageExamples(entry)) {
      findings.push({
        ruleId: "stories/usage-examples",
        axis: "stories",
        severity: "warning",
        location: { file: "(inventory)", line: 0, column: 0 },
        message: `DS component <${c.name}> has a story but shows no usage examples (a single undifferentiated render)`,
        suggestion: `add named story exports demonstrating ${c.name}'s variants/states`,
      });
    }
  }
  return { findings, opportunities };
};

export const rule = createLyseRule({
  meta: {
    axis: "stories",
    lyseRuleId: "stories/usage-examples",
    defaultSeverity: "warning",
    shortDescription: "Stories that show no usage examples",
    fullDescription:
      "A DS component that HAS a Storybook story but whose story shows essentially nothing — fewer than two named story exports AND no export carrying concrete `args` — is flagged. A single undifferentiated render is not a usage example. Only components present in the inventory AND with a story are judged; absence of a story is owned by `stories/coverage`.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/stories-usage-examples.md",
    rationale: `Why it matters

A consumer (human or AI agent) learns how to use a component from its story examples. A story with a single bare render demonstrates no configuration or variant. Two or more named exports, OR at least one export with concrete \`args\`, counts as showing usage.

Experimental and unmeasured: real-world precision is pending a harvest measurement; the rule does not contribute to the Health Score.`,
    examples: [
      {
        good: "export const Primary = {...}; export const Disabled = {...};",
        bad: "export const Primary = {};",
      },
    ],
    allowlist: [
      "components not in `componentInventory`",
      "inventory components with no story (owned by `stories/coverage`)",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});
