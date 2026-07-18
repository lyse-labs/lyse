# Rules engine

How rules are structured, registered, and run.

## A rule is two things

Each rule has:

1. **Metadata** — declared once in `packages/core/src/rules/manifest.ts`.
2. **Implementation** — a visitor function in `packages/core/src/rules/<rule-id-slug>.ts`.

The metadata is what users see (in `lyse explain`, in SARIF, in JSON output). The implementation is the code that produces findings.

## Metadata shape

```ts
interface RuleMetadata {
  id: string;                   // "tokens/no-hardcoded-color"
  version: string;              // "v1"
  axis: "tokens" | "a11y" | "components" | "stories" | "ai-surface" | "ai-governance";
  severity: "error" | "warning" | "info";
  fixable: boolean;
  helpUri: string;              // URL to docs/rules/<slug>.md
  rationale: string;            // 1-2 paragraph rationale
  examples: {
    bad: string;                // bad code example
    good: string;               // good code example
  };
  allowlist: {
    inline: string;              // syntax for inline allowlist
    notes: string;               // when to allowlist
  };
}
```

The `RULE_METADATA` constant in `manifest.ts` is the single source of truth:

```ts
export const RULE_METADATA: Record<string, RuleMetadata> = {
  "tokens/no-hardcoded-color": {
    id: "tokens/no-hardcoded-color",
    version: "v1",
    axis: "tokens",
    severity: "warning",
    fixable: true,
    helpUri: "https://github.com/lyse-labs/lyse/blob/main/docs/rules/tokens-no-hardcoded-color.md",
    rationale: "Hardcoded colors are the #1 source of design system drift...",
    examples: {
      bad: "style={{ background: '#3B82F6' }}",
      good: "style={{ background: tokens.color.brandPrimary }}",
    },
    allowlist: {
      inline: "// lyse-disable-next-line tokens/no-hardcoded-color",
      notes: "Use for genuinely arbitrary colors (data viz, dynamic fills).",
    },
  },
  // ... 4 more rules
};
```

This is also published as `rules-manifest.json` at build time (`scripts/generate-rules-manifest.mjs`), so external tools can consume it.

## Implementation shape

Each rule exports an object satisfying the `Rule` interface:

```ts
import type { Rule } from "../types.js";

export const tokensNoHardcodedColor: Rule = {
  id: "tokens/no-hardcoded-color",
  axis: "tokens",

  async evaluate(ctx, parsedFiles) {
    const findings = [];
    // walk parsedFiles.ts, parsedFiles.css, parsedFiles.cssInJs
    // push Finding objects into findings[]
    return { findings, opportunities };
  },

  classifyConfidence(finding, ctx) {
    // return "high" | "medium" | "low"
    return "high";
  },

  applyCodemod(finding, ctx) {
    // return { diff, importsAdded, confidence }
    return { diff: "...", importsAdded: [], confidence: "high" };
  },
};
```

`classifyConfidence` and `applyCodemod` are optional. A rule that is not auto-fixable omits them. Codemod consumers (the MCP `suggest_fix` tool, the `lyse handoff` payload) check for their presence at runtime.

## Rule registration

Rule instances are exported from `packages/core/src/rules/registry.ts`:

```ts
import { rule as rColor } from "./tokens-no-hardcoded-color.js";
import { rule as rSpacing } from "./tokens-no-hardcoded-spacing.js";
import { rule as rDtcgConformance } from "./tokens-dtcg-conformance.js";
import { rule as rDescriptionCoverage } from "./tokens-description-coverage.js";
import { rule as rShadowNative } from "./components-shadow-native.js";
import { rule as rNamingPascalCase } from "./naming-component-pascalcase.js";
import { rule as rNamingHookPrefix } from "./naming-hook-prefix.js";
import { rule as rA11y } from "./a11y-essentials.js";
import { rule as rStorybook } from "./storybook-coverage.js";
import { rule as rAgentsMdQuality } from "./ai-surface-agents-md-quality.js";
import { rule as rComponentManifestJson } from "./ai-surface-component-manifest-json.js";
import { rule as rDsIndexExported } from "./ai-surface-ds-index-exported.js";

export const ruleObjects: Rule[] = [
  rColor, rSpacing, rDtcgConformance, rDescriptionCoverage,
  rShadowNative, rNamingPascalCase, rNamingHookPrefix,
  rA11y, rStorybook,
  rAgentsMdQuality, rComponentManifestJson, rDsIndexExported,
];

export const ruleMap = new Map<string, Rule>(
  ruleObjects.map((r) => [r.id, r])
);
```

`ruleObjects` is the canonical rule array. Import from `registry.ts` in `fix.ts`, `share.ts`, `audit-pipeline.ts`, and `codemods/safety.ts`. Do NOT build local rule arrays.

Rule metadata (for `lyse explain`, SARIF, JSON output) is declared separately in `manifest.ts` as `RULE_METADATA`.

## The rule runner

`packages/core/src/rule-runner.ts` is the entrypoint:

```ts
export async function runRules(
  rules: Rule[],
  ctx: RuleContext,
  parsed: ParsedFiles
): Promise<RunRulesResult> {
  const allFindings: Finding[] = [];

  for (const rule of rules) {
    if (isRuleDisabled(ctx.config, rule.id)) continue;
    if (isAxisNA(ctx.config, rule.axis)) continue;

    const { findings, opportunities } = await rule.evaluate(ctx, parsed);
    allFindings.push(...applyAllowlists(findings, ctx));
  }

  return { findings: allFindings };
}
```

Iteration is:
- Rules in alphabetical order (deterministic).
- Files in alphabetical order (deterministic).
- Each rule sees its own emitted findings only via `ctx.emit`.

## RuleContext

What rules have access to:

```ts
interface RuleContext {
  config: LyseConfig;
  designSystem: {
    tokens: TokenMap;             // from loaders/tokens
    components: Set<string>;      // from loaders/components
    stories: Set<string>;         // from loaders/stories
    intentMap: Map<string, string>;
  };
  // Per-call (set by the runner before invoking the visitor):
  filePath: string;
  emit: (finding: Omit<Finding, "filePath">) => void;
}
```

`ctx.emit` is the only way for a rule to produce a finding. Rules cannot directly mutate the findings array.

## Allowlist handling

Two layers:

1. **Inline directives** — `// lyse-disable-next-line <rule-id>`, `// lyse-disable <rule-id>` for the whole file. Parsed during the AST walk.
2. **Config-level disabling** — `rules: { <rule-id>: off }` in `.lyse.yaml`.

The rule runner consults the inline directives at emit time via `_skip-context.ts` helpers. Disabled rules never run at all.

Allowlisted findings are still recorded in the result (with `severity: "off"`) so they're visible in JSON output, but they don't contribute to the score.

## Rule severity vs axis

A rule has both a `severity` (`error` / `warning` / `info`) and an `axis` (`tokens` / `a11y` / `components` / `stories` / `ai-surface` / `ai-governance`).

- **Severity** affects display (color in terminal, level in SARIF) and may affect score weighting in V2 (currently all findings count equally within an axis).
- **Axis** determines which sub-score the rule contributes to.

A rule belongs to exactly one axis. To contribute to multiple axes, ship two rules (rare but supported).

## Why rules are imperative (not declarative)

Lyse uses imperative TypeScript functions rather than a declarative rule DSL (à la ESLint's plugin system):

1. **Type safety end-to-end.** Rules consume AST types directly with strict TypeScript.
2. **Performance.** No interpretation overhead.
3. **Flexibility.** Rules can do non-trivial logic (lookups against the design system, fuzzy matching against tokens) without a DSL escape hatch.
4. **Familiarity.** TypeScript is the project's language.

The cost: rules are slightly more verbose — an acceptable trade for end-to-end type safety.

## Adding a rule

See [CONTRIBUTING.md](../../CONTRIBUTING.md) → "Rule contributions" for the end-to-end procedure. Summary:

1. Pick an ID: `<axis>/<slug>` (e.g., `tokens/no-hardcoded-font-size`).
2. Implement: `packages/core/src/rules/<slug>.ts` exporting the `Rule` object.
3. Register: import in `registry.ts`, add to `ruleObjects`; add metadata in `manifest.ts` `RULE_METADATA` array.
4. Document: `docs/rules/<slug>.md` (the helpUri target).
5. Test: `packages/core/tests/rules/<slug>.test.ts` with positive, negative, allowlist cases.
6. CHANGELOG entry under `[Unreleased] → Added`.

## Rule contract guarantees

Rules can rely on:

- `ctx.emit` is synchronous and produces a finding immediately.
- `ctx.designSystem.tokens` is fully loaded by the time visitors are called.
- The AST shapes (SWC, PostCSS, Babel) are stable across patch releases.
- File paths are absolute and OS-normalized.

Rules must NOT:

- Mutate `ctx` or `ast` (visitors are read-only).
- Perform I/O (no `fs.readFile`, no `fetch`).
- Use `Date.now()` or `Math.random()` (breaks determinism).
- Share state across files (rules are stateless per file).

## Generated rule packs

At `lyse init`, an optional BYOK LLM call generates a custom rule pack saved to `.lyse/generated-rules.yaml`. This file is committed to the repo and loaded by `pack-loader.ts` on every audit run, merging with the 66 built-in rules.

The generated pack uses one of **8 rule templates** from `packages/core/src/rules/templates/`:

| Template | What it enforces |
|---|---|
| `js-prop-token-compliance` | JSX prop values (e.g. `sx={{ color: "..." }}`) must use token prefixes |
| `js-call-token-compliance` | Raw px/rem literals should use theme call patterns |
| `css-property-token-compliance` | CSS property values must match a token pattern |
| `tailwind-utility-class-compliance` | Tailwind arbitrary values bypass configured scale |
| `import-source-restriction` | Named components must be imported from canonical DS module |
| `naming-convention` | File names or exported symbols must match a regex pattern |
| `storybook-coverage-template` | Components must have a corresponding stories file |
| `a11y-jsx-template` | Per-rule a11y checks on JSX (alt-text, label-has-associated-control) |

### Generated pack format (`.lyse/generated-rules.yaml`)

```yaml
version: 1
generated_at: '<iso-timestamp>'
generated_by: claude-sonnet-4-5
generated_from:
  lyse_version: '0.2.0-alpha.4'
  template_catalog_version: 1
  deps_hash: 'sha256:abc123'
  files_hash: 'sha256:def456'
rules:
  - id: 'mui/sx-color-tokens'
    template: 'js-prop-token-compliance'
    axis: tokens
    severity: warning
    config:
      prop_name: sx
      target_key: color
      compliant_prefix: 'palette.'
      allowed_literals: ['transparent']
```

### Collision protection

`pack-loader.ts` skips any generated rule whose `id` collides with a built-in rule ID (built-in wins). A warning is emitted to help debug misconfigured packs.

## See also

- [`overview.md`](./overview.md) — where rules fit in the pipeline.
- [`scoring.md`](./scoring.md) — how rule findings become a score.
- [CONTRIBUTING.md](../../CONTRIBUTING.md) — full rule contribution procedure.
- `packages/core/src/rules/` — implementation.
