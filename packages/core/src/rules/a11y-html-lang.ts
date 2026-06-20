import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import fg from "fast-glob";
import type { Rule, RuleContext, ParsedFiles, RuleEvalResult, Finding } from "../types.js";
import { isPathExcluded } from "./_exclude.js";
import { createLyseRule } from "./_rule-module.js";

const RULE_ID = "a11y/html-lang";
const MAX_FILE_BYTES = 1_000_000;

const DISABLE_DIRECTIVE = `lyse-disable ${RULE_ID}`;
const README_CANDIDATES = ["README.md", "README", "readme.md", "README.mdx"];

// An opening `<html …>` tag (HTML or JSX root). Captures the attribute span up
// to the closing `>` so we can check for a lang declaration inside it.
const RE_HTML_OPEN = /<html\b([^>]*)>/gi;
// A language declaration in any form: `lang="en"`, `lang={locale}`, `:lang`,
// `xml:lang`. The boundary keeps `sourcelang=`-style false friends out.
const RE_LANG_ATTR = /(?:^|\s|:)lang\s*=/i;

const HTML_GLOB = ["**/*.html", "**/*.htm"];

/** Returns the opening `<html>` tags in a source that carry no lang attribute. */
export function htmlTagsWithoutLang(source: string): string[] {
  const out: string[] = [];
  RE_HTML_OPEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_HTML_OPEN.exec(source)) !== null) {
    const attrs = m[1] ?? "";
    if (!RE_LANG_ATTR.test(attrs)) out.push(m[0]);
  }
  return out;
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

function discoverHtmlFiles(ctx: RuleContext): string[] {
  if (!ctx.repoRoot) return [];
  try {
    return fg.sync(HTML_GLOB, {
      cwd: ctx.repoRoot,
      absolute: false,
      dot: false,
      ignore: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.git/**", "**/coverage/**"],
      followSymbolicLinks: false,
    });
  } catch {
    return [];
  }
}

const evaluate = async (ctx: RuleContext, files: ParsedFiles): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  if (ctx.repoRoot && isAllowlisted(ctx.repoRoot)) return { findings, opportunities: 0 };

  // Sources that can host an <html> root: JSX/TSX framework roots (Next
  // app/layout.tsx, Remix root.tsx, Gatsby html.js) and real .html files.
  const sources: { path: string; source: string }[] = [];
  for (const f of files.ts) {
    if (isPathExcluded(f.path, ctx.excludePaths)) continue;
    sources.push({ path: f.path, source: f.source });
  }
  if (ctx.repoRoot) {
    for (const rel of discoverHtmlFiles(ctx)) {
      if (isPathExcluded(rel, ctx.excludePaths)) continue;
      const content = readFileIfSmall(join(ctx.repoRoot, rel));
      if (content !== null) sources.push({ path: rel, source: content });
    }
  }

  let opportunities = 0;
  let firstOffender: string | null = null;
  let sawHtml = false;
  for (const { path, source } of sources) {
    RE_HTML_OPEN.lastIndex = 0;
    if (!RE_HTML_OPEN.test(source)) continue;
    sawHtml = true;
    opportunities++;
    if (firstOffender === null && htmlTagsWithoutLang(source).length > 0) {
      firstOffender = path;
    }
  }

  // N/A: no <html> root anywhere (pure component library).
  if (!sawHtml) return { findings, opportunities: 0 };

  if (firstOffender !== null) {
    findings.push({
      ruleId: RULE_ID,
      axis: "a11y",
      severity: "warning",
      location: { file: firstOffender, line: 1, column: 1 },
      message:
        "The document `<html>` root has no `lang` attribute — screen readers can't announce the page language and per-language CSS/typography won't apply (WCAG 3.1.1)",
      suggestion:
        'add a language to the root element: `<html lang="en">` (or `lang={locale}` for localized apps)',
    });
  }
  return { findings, opportunities };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "a11y",
    lyseRuleId: RULE_ID,
    defaultSeverity: "warning",
    shortDescription: "The document root should declare a language",
    fullDescription:
      "Checks, at repo level, whether the document `<html>` root declares a `lang` attribute. Scans JSX/TSX framework roots (Next.js `app/layout.tsx`, Remix `root.tsx`, Gatsby `html.js`) and real `.html` / `.htm` files for an opening `<html>` tag, and flags one that carries no `lang` (in any form: `lang=\"en\"`, `lang={locale}`, `:lang`, `xml:lang`). Emits one warning when an `<html>` root without `lang` is found; emits nothing when every `<html>` has a language or when the repo ships no `<html>` root at all (a pure component library — N/A). The `dir` attribute (RTL) is not required and is not penalized.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/a11y-html-lang.md",
    rationale: `Why it matters

WCAG 3.1.1 (Language of Page) requires the document language to be programmatically determinable. The \`lang\` attribute on \`<html>\` is how screen readers pick the right voice and pronunciation, how browsers choose hyphenation and quotation marks, and how language-scoped CSS (\`:lang()\`) and per-locale typography apply. A missing \`lang\` silently degrades the experience for assistive-tech and international users.

The check is repo-level and applies only when the design system actually ships an \`<html>\` root; a component library that never renders \`<html>\` is N/A. The rule is experimental and does not contribute to the health score until calibration data is available.`,
    examples: [
      {
        good: 'export default function RootLayout({ children }) {\n  return <html lang="en"><body>{children}</body></html>;\n}',
        bad: "export default function RootLayout({ children }) {\n  return <html><body>{children}</body></html>;\n}",
      },
    ],
    allowlist: [
      "repos containing `lyse-disable a11y/html-lang` in a README — rule is N/A",
      "design systems that ship no `<html>` root (pure component libraries) — the check does not apply (N/A)",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = {
  htmlTagsWithoutLang,
  isAllowlisted,
  DISABLE_DIRECTIVE,
};
