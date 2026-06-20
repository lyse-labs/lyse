import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Rule, RuleContext, ParsedFiles, RuleEvalResult, Finding } from "../types.js";
import { createLyseRule } from "./_rule-module.js";

const RULE_ID = "tokens/container-query";
const MAX_FILE_BYTES = 1_000_000;

const DISABLE_DIRECTIVE = `lyse-disable ${RULE_ID}`;
const README_CANDIDATES = ["README.md", "README", "readme.md", "README.mdx"];

// An `@container` query at-rule: `@container (min-width: …)` or
// `@container <name> (…)`. The `(?=[\s(])` boundary avoids matching a stray
// `@container-foo` token (none exist in CSS, but stay strict).
const RE_CONTAINER_QUERY = /@container(?=[\s(])/i;
// A containment context DECLARATION (not a selector / pseudo-class). The
// longhands `container-type` / `container-name` are unambiguous property names.
// The `container:` shorthand must be a real declaration (start-of-declaration
// boundary + a value), so a selector like `.container:hover {` can't satisfy it.
const RE_CONTAINER_CONTEXT =
  /\bcontainer-(?:type|name)\s*:\s*[a-z0-9$(]|(?:^|[;{])\s*container\s*:\s*[^{};]+;/i;

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ");
}

function usesContainerQuery(src: string): boolean {
  return RE_CONTAINER_QUERY.test(stripComments(src));
}

function declaresContainerContext(src: string): boolean {
  // Strip comments first so a commented-out `container-type` doesn't count;
  // then exclude `@container` at-rules themselves from the context match.
  const clean = stripComments(src).replace(/@container(?=[\s(])/gi, "@cq");
  return RE_CONTAINER_CONTEXT.test(clean);
}

function readFileIfSmall(absPath: string): string | null {
  try {
    const stat = statSync(absPath);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null;
    return readFileSync(absPath, "utf8");
  } catch {
    return null;
  }
}

function isAllowlisted(repoRoot: string): boolean {
  for (const candidate of README_CANDIDATES) {
    const abs = join(repoRoot, candidate);
    if (!existsSync(abs)) continue;
    const content = readFileIfSmall(abs);
    if (content !== null && content.includes(DISABLE_DIRECTIVE)) return true;
  }
  return false;
}

const evaluate = async (ctx: RuleContext, files: ParsedFiles): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  if (ctx.repoRoot && isAllowlisted(ctx.repoRoot)) return { findings, opportunities: 0 };

  const sources = [
    ...files.css.filter((f) => !f.skipped).map((f) => f.source),
    ...files.cssInJs.map((b) => b.content),
  ];

  // Applicability: only design systems that actually use container queries.
  const usesCq = sources.some((s) => usesContainerQuery(s));
  if (!usesCq) return { findings, opportunities: 0 };

  const hasContext = sources.some((s) => declaresContainerContext(s));
  if (hasContext) return { findings, opportunities: 1 };

  findings.push({
    ruleId: RULE_ID,
    axis: "tokens",
    severity: "warning",
    location: { file: ".", line: 1, column: 1 },
    message:
      "Uses `@container` queries but declares no containment context (`container-type` / `container`) anywhere — the queries never match a query container and silently do nothing",
    suggestion:
      "set `container-type: inline-size` (or the `container:` shorthand) on the element the `@container` rule is meant to respond to",
  });
  return { findings, opportunities: 1 };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "tokens",
    lyseRuleId: RULE_ID,
    defaultSeverity: "warning",
    shortDescription: "Container queries must have a containment context",
    fullDescription:
      "Checks, at repo level, whether a design system that uses CSS `@container` queries (in CSS, SCSS, or extracted CSS-in-JS) also declares a containment context — `container-type`, `container-name`, or the `container:` shorthand — on some ancestor. A `@container` query with no query container anywhere never matches and is dead CSS. Emits one warning when `@container` is used but no context is declared anywhere; emits nothing when a context exists or when the design system uses no container queries (N/A). The rule does NOT penalize design systems for not using container queries — it only checks that the ones present are wired correctly.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/tokens-container-query.md",
    rationale: `Why it matters

Container queries let a component respond to the size of its container rather than the viewport — the right primitive for a reusable design system. But an \`@container\` rule only works if some ancestor establishes a containment context with \`container-type\` (or the \`container\` shorthand). Without it, the query silently never matches and the responsive behavior is dead code — a subtle bug that ships unnoticed.

The check is repo-level and broad: a single containment-context declaration anywhere clears it. It is intentionally non-prescriptive — not using container queries at all is fine (N/A). The rule is experimental and does not contribute to the health score until calibration data is available.`,
    examples: [
      {
        good: ".card-wrap { container-type: inline-size; }\n@container (min-width: 400px) { .card { display: grid; } }",
        bad: "@container (min-width: 400px) { .card { display: grid; } }  /* no container-type anywhere */",
      },
    ],
    allowlist: [
      "repos containing `lyse-disable tokens/container-query` in a README — rule is N/A",
      "design systems that use no `@container` queries — the check does not apply (N/A)",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = {
  usesContainerQuery,
  declaresContainerContext,
  isAllowlisted,
  DISABLE_DIRECTIVE,
};
