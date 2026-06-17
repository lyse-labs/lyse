import { join } from "node:path";
import fg from "fast-glob";
import type {
  Rule,
  RuleContext,
  ParsedFiles,
  RuleEvalResult,
  Finding,
} from "../types.js";
import { createLyseRule } from "./_rule-module.js";
import { isReservedTokenName } from "../parsers/ai-tokens.js";
import {
  safeReadText,
  SCAN_IGNORE,
  fileHasAiMarker,
  makeAllowlistCheck,
} from "./ai-governance-ai-marker-component-present.js";

const RULE_ID = "ai-governance/ai-token-misuse";
const DISABLE_DIRECTIVE = `lyse-disable ${RULE_ID}`;

// Scan styles + components: AI tokens are referenced from CSS/SCSS (var()/$var)
// and CSS-in-JS inside .tsx/.jsx/.vue.
const SCAN_GLOB = "**/*.{tsx,jsx,vue,css,scss}";

const isAllowlisted = makeAllowlistCheck(DISABLE_DIRECTIVE);

const VAR_USAGE_RE = /var\(\s*(--[A-Za-z0-9_-]+)/g;
// SCSS variable reference (incl. namespaced `theme.$x`). Declarations (`$x:`)
// are excluded in code by checking the char that follows the full identifier
// (a regex lookahead is defeated by backtracking on hyphenated names).
const SCSS_USAGE_RE = /\$([A-Za-z0-9_-]+)/g;
const CSS_DEF_RE = /(--[A-Za-z0-9_-]+)\s*:/g;
const SCSS_DEF_RE = /\$([A-Za-z0-9_-]+)\s*:/g;

/**
 * Reserved AI token names *used* (not defined) in the source: `var(--ai-*)`
 * references and SCSS `$ai-*` / `theme.$ai-*` references. Token declarations
 * (`--ai-*:` / `$ai-*:`) are excluded — defining a token is not a usage.
 */
export function findReservedAiTokenUsages(source: string): string[] {
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  VAR_USAGE_RE.lastIndex = 0;
  while ((m = VAR_USAGE_RE.exec(source)) !== null) {
    const name = m[1]!;
    if (isReservedTokenName(name)) found.add(name);
  }
  SCSS_USAGE_RE.lastIndex = 0;
  while ((m = SCSS_USAGE_RE.exec(source)) !== null) {
    const name = m[1]!;
    // Skip declarations: `$x:` (the next non-whitespace char after the name is `:`).
    const after = source.slice(m.index + m[0].length);
    if (/^\s*:/.test(after)) continue;
    if (isReservedTokenName(name)) found.add(name);
  }
  return [...found].sort((a, b) => a.localeCompare(b));
}

/** Whether the file DEFINES any reserved AI token (it is an AI-token source). */
function fileDefinesReservedAiToken(source: string): boolean {
  let m: RegExpExecArray | null;
  CSS_DEF_RE.lastIndex = 0;
  while ((m = CSS_DEF_RE.exec(source)) !== null) {
    if (isReservedTokenName(m[1]!)) return true;
  }
  SCSS_DEF_RE.lastIndex = 0;
  while ((m = SCSS_DEF_RE.exec(source)) !== null) {
    if (isReservedTokenName(m[1]!)) return true;
  }
  return false;
}

/**
 * A file is an "AI context" — a legitimate place to use AI tokens — when it
 * (1) contains an AI-marker component/tag, (2) is AI-named by path (e.g.
 * Carbon `_ai-aura.scss`), or (3) defines reserved AI tokens itself.
 */
function fileIsAiContext(source: string, relPath: string, repoRoot: string): boolean {
  if (fileHasAiMarker(source, relPath, repoRoot)) return true;
  if (isReservedTokenName(relPath)) return true;
  if (fileDefinesReservedAiToken(source)) return true;
  return false;
}

const evaluate = async (ctx: RuleContext, _files: ParsedFiles): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  if (!ctx.repoRoot) return { findings, opportunities: 0 };
  if (isAllowlisted(ctx.repoRoot)) return { findings, opportunities: 0 };

  let scanFiles: string[] = [];
  try {
    scanFiles = fg.sync(SCAN_GLOB, {
      cwd: ctx.repoRoot,
      absolute: false,
      dot: false,
      ignore: SCAN_IGNORE,
      onlyFiles: true,
      unique: true,
    });
  } catch {
    // non-fatal
  }

  let opportunities = 0;
  for (const rel of scanFiles.sort()) {
    const source = safeReadText(join(ctx.repoRoot, rel));
    if (!source) continue;
    const used = findReservedAiTokenUsages(source);
    if (used.length === 0) continue;
    opportunities++;
    if (fileIsAiContext(source, rel, ctx.repoRoot)) continue;
    findings.push({
      ruleId: RULE_ID,
      axis: "ai-governance",
      severity: "warning",
      location: { file: rel, line: 1, column: 1 },
      message: `Reserved AI token${used.length === 1 ? "" : "s"} (${used.join(", ")}) used in a non-AI surface (${rel}). AI-reserved visual tokens should be scoped to AI features.`,
      suggestion:
        "Either scope this token usage to an AI surface (co-locate an AI-marker component) or use a general-purpose token here. Reusing AI-reserved tokens on non-AI UI dilutes the AI visual signal (Appendix A: ai-token-misused-on-non-AI-element).",
    });
  }

  return { findings, opportunities };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "ai-governance",
    lyseRuleId: RULE_ID,
    defaultSeverity: "warning",
    shortDescription: "Detect AI-reserved design tokens used outside AI surfaces",
    fullDescription:
      "Flags reserved AI design tokens (Carbon `--cds-ai-*` / `$ai-aura-*`, Cloudscape `$*-gen-ai`, Polaris `magic-*`, etc.) that are USED (`var(--ai-*)`, `$ai-*`, `theme.$ai-*`) in a file that is not an AI surface. A file counts as an AI context — a legitimate place to use AI tokens — when it (1) contains an AI-marker component or JSX tag, (2) is AI-named by path (e.g. Carbon's `_ai-aura.scss`), or (3) defines reserved AI tokens itself. Token DECLARATIONS (`--ai-*:` / `$ai-*:`) are never flagged — defining a token is not misuse. A reserved AI token referenced in a file that is none of those (e.g. a generic `Button.css`) is flagged as misuse. The rule is silent on repos that use no reserved AI tokens.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/ai-governance-ai-token-misuse.md",
    rationale: `Why it matters

AI design systems reserve a distinct visual language — gradient auras, sparkle accents, "magic" tokens — to signal *this content was AI-generated*. The signal only works if it is exclusive: if the same AI-reserved tokens are reused to decorate ordinary, non-AI UI, users can no longer trust the visual cue to mean "AI". IBM Carbon, Salesforce, and Microsoft AI guidelines all treat the AI visual treatment as reserved.

This rule (Appendix A static signal \`ai-token-misused-on-non-AI-element\`) catches the dilution at the source: a reserved AI token referenced outside any AI surface. Detection is deliberately conservative — usage only (never token definitions), and three independent AI-context signals (marker component, AI-named path, or local AI-token definition) suppress the obvious legitimate cases (Carbon's \`_ai-*.scss\`, the token-source file) to keep precision high. The rule emits nothing on design systems that ship no reserved AI tokens, so non-AI systems are never penalized.`,
    examples: [
      {
        good: "/* AiPanel.tsx — AI token used inside an AI surface */\nexport const AILabel = () => null;\nexport const Panel = () => <div style={{ background: 'var(--ai-gradient-1)' }} />;",
        bad: "/* Button.css — AI-reserved token reused on generic UI */\n.btn { background: var(--ai-gradient-1); }",
      },
      {
        good: "/* _ai-aura.scss — AI-named file legitimately uses the AI token */\n.aura { background: theme.$ai-aura-start; }",
        bad: "/* Card.scss — non-AI component misusing the AI aura token */\n.card { box-shadow: 0 0 8px theme.$ai-aura-start; }",
      },
    ],
    allowlist: [
      "repos containing `lyse-disable ai-governance/ai-token-misuse` in an adjacent README or `.lyse.yaml` — rule is N/A",
      "repos with no reserved AI tokens — rule emits nothing",
      "files that define reserved AI tokens, are AI-named, or contain an AI-marker — usage there is legitimate",
      "files under `node_modules/`, `dist/`, `build/`, `.git/`, `.next/`, `out/`, `coverage/`",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = {
  findReservedAiTokenUsages,
  fileDefinesReservedAiToken,
  fileIsAiContext,
  isAllowlisted,
  DISABLE_DIRECTIVE,
};
