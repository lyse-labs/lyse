import { createLyseRule } from "./_rule-module.js";
import { canonicalize } from "../render/canonicalize.js";
import { cssVarToTokenPath } from "../render/dtcg-canonical-map.js";
import type { Finding, RuleContext, ParsedFiles, RuleEvalResult } from "../types.js";
import type { ComputedTokenReading } from "../render/types.js";

const RULE_ID = "tokens/rendered-token-fidelity";

export function detectRenderDrift(
  canonical: Map<string, string>,
  readings: ComputedTokenReading[],
  varToPath: (v: string) => string | null,
): Finding[] {
  const findings: Finding[] = [];
  for (const r of readings) {
    const path = varToPath(r.token);
    if (!path) continue;
    const want = canonical.get(path);
    if (want === undefined) continue;
    const wantC = canonicalize(want);
    const gotC = canonicalize(r.computed);
    if (wantC.kind === "skip" || gotC.kind === "skip") continue;
    if (wantC.canonical !== gotC.canonical) {
      findings.push({
        ruleId: RULE_ID,
        axis: "tokens",
        severity: "warning",
        location: { file: "<rendered>", line: 1, column: 1 },
        message: `Token ${r.token} renders ${gotC.canonical} but DTCG declares ${wantC.canonical} — design→CSS drift.`,
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
    shortDescription: "Rendered token value matches its DTCG canonical declaration",
    fullDescription:
      "Detects design→CSS drift: a CSS custom property whose browser-computed value differs from its DTCG canonical token value. Runs only under `lyse audit --render`.",
    helpUri: "https://github.com/lyse-labs/lyse/blob/main/docs/rules/tokens-rendered-token-fidelity.md",
    rationale:
      "A token can be referenced correctly yet render a different value due to cascade, specificity, or a leaked override — drift static analysis cannot see.",
    examples: [
      {
        good: ":root { --bg: #fff } /* DTCG declares #fff; element computes rgb(255,255,255) */",
        bad: ":root { --bg: #fff } .leak { --bg: #000 } /* DTCG declares #fff; element computes rgb(0,0,0) */",
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
        if (!ctx.canonicalTokens) {
          return { findings: [], opportunities: 0 };
        }
        const findings = detectRenderDrift(ctx.canonicalTokens, ctx.rendered, cssVarToTokenPath);
        return { findings, opportunities: ctx.rendered.length };
      },
    };
  },
  singleFileCapable: false,
});
