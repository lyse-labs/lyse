import { createLyseRule } from "./_rule-module.js";
import { buildTokenSourceMap } from "../render/token-source-map.js";
import { canonicalize } from "../render/canonicalize.js";
import type { Finding, RuleContext, ParsedFiles, RuleEvalResult } from "../types.js";
import type { ComputedTokenReading } from "../render/types.js";

const RULE_ID = "tokens/rendered-token-fidelity";

export function detectRenderDrift(sourceCss: string, readings: ComputedTokenReading[]): Finding[] {
  const source = buildTokenSourceMap(sourceCss);
  const findings: Finding[] = [];
  for (const r of readings) {
    const declared = source.get(r.token)?.get(r.mode);
    if (declared === undefined) continue;
    const want = canonicalize(declared);
    const got = canonicalize(r.computed);
    if (want.kind === "skip" || got.kind === "skip") continue;
    if (want.canonical !== got.canonical) {
      findings.push({
        ruleId: RULE_ID,
        axis: "tokens",
        severity: "warning",
        location: { file: "<rendered>", line: 1, column: 1 },
        message: `Token ${r.token} renders ${got.canonical} under ${r.mode} but its source declares ${want.canonical} — cascade/override drift.`,
      });
    }
  }
  return findings;
}

export const rule = createLyseRule({
  meta: {
    axis: "tokens",
    lyseRuleId: RULE_ID,
    defaultSeverity: "warning",
    shortDescription: "Rendered token value matches its source declaration",
    fullDescription:
      "Detects cascade/override drift: a CSS custom property whose browser-computed value differs from its canonical source declaration. Runs only under `lyse audit --render`.",
    helpUri: "https://github.com/lyse-labs/lyse/blob/main/docs/rules/tokens-rendered-token-fidelity.md",
    rationale:
      "A token can be referenced correctly yet render a different value due to cascade, specificity, or a leaked override — drift static analysis cannot see.",
    examples: [
      {
        good: ":root { --bg: #fff } /* element computes rgb(255,255,255) */",
        bad: ":root { --bg: #fff } .leak { --bg: #000 } /* element computes rgb(0,0,0) */",
      },
    ],
    allowlist: [],
  },
  defaultOptions: [],
  create() {
    return {
      async evaluate(ctx: RuleContext, _parsed: ParsedFiles): Promise<RuleEvalResult> {
        if (!ctx.rendered || ctx.rendered.length === 0) {
          return { findings: [], opportunities: 0 };
        }
        const sourceCss = ctx.renderedSourceCss ?? "";
        const findings = detectRenderDrift(sourceCss, ctx.rendered);
        return { findings, opportunities: ctx.rendered.length };
      },
    };
  },
  singleFileCapable: false,
});
