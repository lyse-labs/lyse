import { Linter } from "eslint";
import { createRequire } from "module";
import type { RuleContext, ParsedFiles, RuleEvalResult, Finding, ParseError } from "../types.js";
import { createLyseRule } from "./_rule-module.js";

// eslint-plugin-jsx-a11y ships no TypeScript declarations and is a CJS package.
// We load it via createRequire (safe ESM→CJS bridge) to avoid import assertion
// syntax that esbuild / vitest's transform pipeline rejects.
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- eslint-plugin-jsx-a11y ships no type declarations
const jsxA11yPlugin: any = require("eslint-plugin-jsx-a11y");
// @typescript-eslint/parser unlocks TSX-with-TS-syntax linting (interfaces,
// generics, `as` casts). Without it, espree fails on the majority of real
// React+TS files and the a11y axis emits zero findings.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- @typescript-eslint/parser exports a Parser interface; cast for Linter.Config compatibility
const tsParser: any = require("@typescript-eslint/parser");

const linter = new Linter({ configType: "flat" });

const A11Y_RULES = ["jsx-a11y/control-has-associated-label"] as const;

const flatConfig = [
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module" as const,
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { "jsx-a11y": jsxA11yPlugin },
    rules: Object.fromEntries(A11Y_RULES.map((r) => [r, "warn"] as const)),
  },
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module" as const,
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { "jsx-a11y": jsxA11yPlugin },
    rules: Object.fromEntries(A11Y_RULES.map((r) => [r, "warn"] as const)),
  },
] satisfies object[] as never;

const evaluate = async (
  _ctx: RuleContext,
  files: ParsedFiles,
): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  const parseErrors: ParseError[] = [];
  let opportunities = 0;

  for (const f of files.ts) {
    const swcFailed = f.ast === null;
    let messages;
    try {
      messages = linter.verify(f.source, flatConfig, { filename: f.path });
    } catch (e) {
      if (!swcFailed) {
        parseErrors.push({
          file: f.path,
          reason: e instanceof Error ? e.message : "parser threw non-Error value",
        });
      }
      continue;
    }

    const fatal = messages.find((m) => m.fatal === true);
    if (fatal) {
      if (!swcFailed) {
        parseErrors.push({
          file: f.path,
          reason: fatal.message,
        });
      }
      continue;
    }

    opportunities += (f.source.match(/<(button|input|select|textarea|a)\b/g) ?? []).length;

    for (const m of messages) {
      if (!m.ruleId || !(A11Y_RULES as readonly string[]).includes(m.ruleId)) continue;
      findings.push({
        ruleId: "a11y/interactive-role-name",
        axis: "a11y",
        severity: m.severity === 2 ? "error" : "warning",
        location: { file: f.path, line: m.line ?? 0, column: m.column ?? 0 },
        message: `[${m.ruleId}] ${m.message}`,
      });
    }
  }

  const result: RuleEvalResult = { findings, opportunities };
  if (parseErrors.length > 0) result.parseErrors = parseErrors;
  return result;
};

export const rule = createLyseRule({
  meta: {
    axis: "a11y",
    lyseRuleId: "a11y/interactive-role-name",
    defaultSeverity: "warning",
    shortDescription: "Accessible name on interactive controls",
    fullDescription:
      "Wraps `jsx-a11y/control-has-associated-label`: every interactive control (`<button>`, `<input>`, `<select>`, `<textarea>`, `<a>`) must have an accessible name — via visible text, `aria-label`, `aria-labelledby`, or a `<label>`. This is the one accessible-name rule that `a11y/essentials` does not cover.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/a11y-interactive-role-name.md",
    rationale: `Why it matters

Icon-only buttons (a close button wrapping only an SVG, a toolbar action with no label) are the most frequent accessible-name omission in AI-generated UI. They block screen-reader users who cannot determine what the control does, violating WCAG 2.1 SC 4.1.2 (Name, Role, Value).

\`a11y/essentials\` already covers image \`alt\`, form \`<label>\`, ARIA role validity, and anchor content. This rule covers the remaining interactive-control gap via the upstream \`eslint-plugin-jsx-a11y\` \`control-has-associated-label\` rule.`,
    examples: [
      {
        good: '<button aria-label="Close dialog"><svg aria-hidden="true" /></button>',
        bad: "<button><svg /></button>",
      },
      {
        good: "<button>Save</button>",
        bad: '<button><span class="icon-save" /></button>',
      },
    ],
    allowlist: [
      "Decorative controls that are intentionally hidden from assistive technology via aria-hidden=\"true\" on the control itself",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
  singleFileCapable: true,
});
