import type {
  RuleContext,
  ParsedFiles,
  RuleEvalResult,
  Finding,
  StoryEntry,
} from "../types.js";
import { createLyseRule } from "./_rule-module.js";

function documentsProps(entry: StoryEntry): boolean {
  if (entry.hasArgTypes === true) return true;
  if (entry.hasArgs === true) return true;
  return (entry.stories ?? []).some(
    (s) => s.args !== undefined && Object.keys(s.args).length > 0,
  );
}

const evaluate = async (
  ctx: RuleContext,
  _files: ParsedFiles,
): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  if (!ctx.storyIndex) return { findings, opportunities: 0 };

  let opportunities = 0;
  for (const c of ctx.componentInventory) {
    const entry = ctx.storyIndex.byTitle.get(c.name);
    if (!entry) continue;
    const props = c.props ?? [];
    if (props.length === 0) continue;
    opportunities++;
    if (!documentsProps(entry)) {
      findings.push({
        ruleId: "stories/props-documented",
        axis: "stories",
        severity: "warning",
        location: { file: "(inventory)", line: 0, column: 0 },
        message: `DS component <${c.name}> has a story that documents no props (no argTypes and no args)`,
        suggestion: `add an \`argTypes\` block or arg'd story exports to ${c.name}'s story`,
      });
    }
  }
  return { findings, opportunities };
};

export const rule = createLyseRule({
  meta: {
    axis: "stories",
    lyseRuleId: "stories/props-documented",
    defaultSeverity: "warning",
    shortDescription: "Stories that document no component props",
    fullDescription:
      "A DS component that HAS a Storybook story, HAS known props (from the component inventory), but whose story documents none of those props — neither an `argTypes` block in the default-export meta nor any named story carrying `args` — is flagged. Such a story renders the component but teaches a consumer (human or AI agent) nothing about its API. Prop-less components (e.g. `<Divider>`) and components whose props could not be parsed are excluded. Only components with a story AND known non-empty props are judged; absence of a story is owned by `stories/coverage`.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/stories-props-documented.md",
    rationale: `Why it matters

The story is the canonical example surface for a DS component. A story that exercises no props documents nothing an integrator can act on. \`argTypes\` (explicit controls/docs) OR concrete \`args\` on a named story both satisfy the rule — autodocs users who set args are not penalized.

The rule only fires when the component is known to have props. Prop-less components (e.g. layout primitives like \`<Divider>\`) and components whose props were not parsed are skipped — flagging them would be a false positive since there is nothing to document.

Experimental and unmeasured: real-world precision is pending a harvest measurement; the rule does not contribute to the Health Score.`,
    examples: [
      {
        good: "export default { component: Button, argTypes: { variant: {...} } }",
        bad: "export default { component: Button }; export const Primary = {};",
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
