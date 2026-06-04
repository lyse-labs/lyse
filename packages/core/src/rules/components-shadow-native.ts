import { minimatch } from "minimatch";
import type { Rule, RuleContext, ParsedFiles, RuleEvalResult, Finding, ClassifyContext, Confidence, CodemodContext, CodemodResult } from "../types.js";
import { fixShadowNative } from "../codemods/shadow-native.js";
import { adaptOldCodemodResult } from "./_codemod-adapter.js";
import { createLyseRule } from "./_rule-module.js";

const NATIVE_TO_DS = new Map<string, string>([
  ["button", "Button"],
  ["input", "Input"],
  ["select", "Select"],
  ["textarea", "Textarea"],
  ["a", "Link"],
]);

const NATIVE_TAG_RE = /<(button|input|select|textarea|a)(\s|>)/g;
const POLYMORPHIC_AS_RE = /\bas\s*=\s*["'](button|input|select|textarea|a)["']/;

function isExcluded(path: string, patterns: string[]): boolean {
  return patterns.some((p) => minimatch(path, p));
}

function lineFromIndex(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source.charCodeAt(i) === 10) line++;
  }
  return line;
}

const evaluate = async (
  ctx: RuleContext,
  files: ParsedFiles,
): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  let opportunities = 0;
  // DS-self mode: this rule's semantics target consumer-of-DS, not DS-self.
  // A DS that implements <Button> necessarily writes <button> natively — that's its job.
  // Skip to avoid false positives; opportunities=0 means the axis reports N/A.
  // v0.2 will add DS-self-aware component analysis.
  if (ctx.dsSelfMode) return { findings, opportunities };
  if (!ctx.componentsModule) return { findings, opportunities };

  for (const f of files.ts) {
    if (isExcluded(f.path, ctx.excludePaths)) continue;

    const importsFromDs = f.imports.some((i) => i.module === ctx.componentsModule);
    if (!importsFromDs) continue;

    NATIVE_TAG_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = NATIVE_TAG_RE.exec(f.source)) !== null) {
      opportunities++;
      const window = f.source.slice(Math.max(0, m.index - 80), m.index + 80);
      if (POLYMORPHIC_AS_RE.test(window)) continue;

      const tag = m[1];
      const dsName = tag !== undefined ? NATIVE_TO_DS.get(tag) : undefined;
      const line = lineFromIndex(f.source, m.index);
      findings.push({
        ruleId: "components/no-native-shadows",
        axis: "components",
        severity: "warning",
        location: { file: f.path, line, column: 1 },
        message: `Native <${tag}> used where <${dsName}> from ${ctx.componentsModule} is available`,
        suggestion: `replace <${tag}> with <${dsName}>`,
      });
    }
  }
  return { findings, opportunities };
};

const classifyConfidence: NonNullable<Rule["classifyConfidence"]> = (
  finding: Finding,
  _ctx: ClassifyContext,
): Confidence => {
  const snippet = finding.context ?? finding.message;

  // External links can't be replaced with DS Link component safely
  if (/href=["']https?:\/\//.test(snippet)) return "low";

  // Styled-components wraps the native tag — replacement is structural, not trivial
  if (/styled[.(]/.test(snippet)) return "low";

  // className means styles are attached — DS component may not accept them the same way
  if (/className=/.test(snippet)) return "medium";

  return "high";
};

const applyCodemod: NonNullable<Rule["applyCodemod"]> = (
  finding: Finding,
  ctx: CodemodContext,
): CodemodResult => {
  const ruleCtx: RuleContext = {
    repoRoot: "",
    tokens: ctx.tokens,
    componentsModule: ctx.config.designSystem?.componentsModule ?? null,
    componentInventory: [],
    storyIndex: null,
    excludePaths: [],
  };
  const oldResult = fixShadowNative({
    source: ctx.fileContent,
    path: finding.location.file,
    finding,
    ctx: ruleCtx,
  });
  return adaptOldCodemodResult(oldResult);
};

export const rule = createLyseRule({
  meta: {
    axis: "components",
    lyseRuleId: "components/no-native-shadows",
    defaultSeverity: "warning",
    shortDescription: "Disallow native HTML elements when a DS component exists",
    fullDescription:
      "Native `<button>`, `<input>`, `<select>`, `<textarea>`, `<a>` used in a file that ALREADY imports from the configured DS module signals an intentional bypass of the design system's component primitives. Polymorphic `as=` props and `excludePaths` are honored.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/components-shadow-native.md",
    rationale: `Why it matters

DS components encapsulate accessibility, theming, focus-management, and brand-consistent variants. Replacing them with native HTML on a per-component basis fragments these guarantees and creates inconsistent UX.

The rule only flags when the file already imports from the DS module — this is high-signal (the team uses the DS in this file but bypassed it for this element). Files that don't use the DS at all are skipped.`,
    examples: [
      { good: '<Button variant="primary" onClick={save}>Save</Button>', bad: "<button onClick={save}>Save</button>" },
      { good: '<Link href="/about">About</Link>',                       bad: '<a href="/about">About</a>' },
    ],
    allowlist: ['polymorphic `as="button"` in `<Box as="button">`', "files matching `designSystem.excludePaths` config"],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
  classifyConfidence,
  applyCodemod,
});
