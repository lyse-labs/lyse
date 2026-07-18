import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import fg from "fast-glob";
import { parse as parseBabel } from "@babel/parser";
import _traverse from "@babel/traverse";
import type { TraverseOptions } from "@babel/traverse";
import type * as t from "@babel/types";
import type { Rule, RuleContext, ParsedFiles, RuleEvalResult, Finding } from "../types.js";
import { isPathExcluded } from "./_exclude.js";
import { isLowSignalValueFile } from "./_skip-context.js";
import { createLyseRule } from "./_rule-module.js";

type TraverseFn = (ast: t.Node, opts: TraverseOptions) => void;
const traverse = (
  (_traverse as unknown as { default: TraverseFn }).default ??
  (_traverse as unknown as TraverseFn)
);

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

/**
 * JSX (.ts/.tsx) scan via Babel — a real `<html>` JSX element, not a `<html>`
 * substring inside a string literal, comment, or code example. Returns
 * `{ found, missingLang }`: whether any `<html>` JSX root exists and whether
 * at least one lacks a lang attribute.
 */
function scanJsxHtmlRoot(source: string): { found: boolean; missingLang: boolean } {
  if (!/<html\b/i.test(source)) return { found: false, missingLang: false };
  let ast: t.File;
  try {
    ast = parseBabel(source, { sourceType: "module", plugins: ["typescript", "jsx"], errorRecovery: true });
  } catch {
    return { found: false, missingLang: false };
  }
  let found = false;
  let missingLang = false;
  try {
    traverse(ast, {
      JSXOpeningElement(path) {
        if (path.node.name.type !== "JSXIdentifier" || path.node.name.name !== "html") return;
        found = true;
        const hasLang = path.node.attributes.some(
          (a) =>
            (a.type === "JSXAttribute" && a.name.type === "JSXIdentifier" && /^(?:xml:)?lang$/i.test(a.name.name)) ||
            (a.type === "JSXAttribute" && a.name.type === "JSXNamespacedName" && a.name.name.name.toLowerCase() === "lang"),
        );
        if (!hasLang) missingLang = true;
      },
    });
  } catch {
    return { found, missingLang };
  }
  return { found, missingLang };
}

/** Returns the opening `<html>` tags in an HTML-file source with no lang attr. */
function htmlTagsWithoutLang(source: string): string[] {
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

  let opportunities = 0;
  let firstOffender: string | null = null;
  let sawHtml = false;

  // JSX/TSX framework roots (Next app/layout.tsx, Remix root.tsx, Gatsby
  // html.js): parse with Babel so a `<html>` inside a string literal, comment,
  // or code example is NOT mistaken for a real document root.
  for (const f of files.ts) {
    if (isPathExcluded(f.path, ctx.excludePaths)) continue;
    if (isLowSignalValueFile(f.path)) continue;
    const { found, missingLang } = scanJsxHtmlRoot(f.source);
    if (!found) continue;
    sawHtml = true;
    opportunities++;
    if (firstOffender === null && missingLang) firstOffender = f.path;
  }

  // Real .html / .htm files: regex scan (no JS string/comment ambiguity).
  if (ctx.repoRoot) {
    for (const rel of discoverHtmlFiles(ctx)) {
      if (isPathExcluded(rel, ctx.excludePaths)) continue;
      const content = readFileIfSmall(join(ctx.repoRoot, rel));
      if (content === null) continue;
      RE_HTML_OPEN.lastIndex = 0;
      if (!RE_HTML_OPEN.test(content)) continue;
      sawHtml = true;
      opportunities++;
      if (firstOffender === null && htmlTagsWithoutLang(content).length > 0) firstOffender = rel;
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

The check is repo-level and applies only when the design system actually ships an \`<html>\` root; a component library that never renders \`<html>\` is N/A.`,
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
