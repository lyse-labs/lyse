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
// React+TS files and the a11y axis emits zero findings. See #167.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- @typescript-eslint/parser exports a Parser interface; cast for Linter.Config compatibility
const tsParser: any = require("@typescript-eslint/parser");

const linter = new Linter({ configType: "flat" });

const A11Y_RULES = [
  "jsx-a11y/alt-text",
  "jsx-a11y/anchor-has-content",
  "jsx-a11y/label-has-associated-control",
  "jsx-a11y/role-has-required-aria-props",
  "jsx-a11y/aria-role",
] as const;

// Flat config: only register the 5 rules we care about, all as "warn".
// Cast to `never` because eslint-plugin-jsx-a11y lacks TS declarations and
// the inferred `any` shape doesn't match Linter.Config[] exactly.
// Two-entry flat config: @typescript-eslint/parser for .ts/.tsx (handles TS
// syntax + JSX), espree default for .js/.jsx (cheaper, sufficient when no TS
// features are present). Closes #167. The TS parser also handles plain JSX
// cleanly, so this also acts as a safety net if file extensions lie.
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
    // If the upstream SWC parser already failed (`f.ast === null`), the pipeline
    // surfaced this on stderr via `parseErrorCount`. Don't re-report it here as
    // `coverage.parseErrors` (avoid I1 double-counting), but still attempt ESLint
    // analysis — espree handles plain JSX even when SWC's `tsx: false` mode
    // rejects it (e.g. `.jsx` files).
    const swcFailed = f.ast === null;
    // ESLint flat API surfaces parse failures as a single `fatal: true` message.
    // `.tsx` files route through `@typescript-eslint/parser` (#167), `.jsx` keeps
    // espree. Files that still fail to parse (real syntax errors, unsupported
    // features) are excluded from `opportunities` and reported via
    // `meta.coverage.parseErrors` (#155) — otherwise the score would be 100/100
    // on N/0 analyzed, a credibility hole.
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

    // Opportunity heuristic: count JSX elements that COULD have a11y issues.
    // Counted only AFTER successful parse so the score's denominator reflects
    // what was actually analyzed.
    opportunities += (f.source.match(/<(img|a|label|button|input|select|textarea)\b/g) ?? []).length;

    for (const m of messages) {
      if (!m.ruleId || !(A11Y_RULES as readonly string[]).includes(m.ruleId)) continue;
      findings.push({
        ruleId: "a11y/essentials",
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
    lyseRuleId: "a11y/essentials",
    defaultSeverity: "warning",
    shortDescription: "Essential accessibility checks (jsx-a11y subset)",
    fullDescription:
      "Wraps the canonical `eslint-plugin-jsx-a11y` rules: `alt-text`, `anchor-has-content`, `label-has-associated-control`, `role-has-required-aria-props`, `aria-role`. Surface-level accessibility failures that AI agents most frequently introduce.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/a11y-essentials.md",
    rationale: `Why it matters

Missing alt text, empty anchors, unlabeled inputs, and invalid ARIA are the most common a11y regressions in AI-generated UI. They block screen-reader users and violate WCAG 2.1 SC 1.1.1, 2.4.4, 1.3.1, 4.1.2.

Lyse depends on the canonical \`eslint-plugin-jsx-a11y\` rather than re-porting these rules — the upstream impl is battle-tested across millions of repos.`,
    examples: [
      { good: '<img src="/logo.png" alt="Lyse logo" />', bad: '<img src="/logo.png" />' },
      { good: "<label htmlFor=\"email\">Email</label><input id=\"email\" />", bad: "<label>Email</label><input />" },
    ],
    allowlist: ['jsx-a11y allowlists per-rule (e.g., decorative `alt=""` for purely-presentational images)'],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
  singleFileCapable: true,
});
