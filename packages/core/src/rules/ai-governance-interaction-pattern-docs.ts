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
import {
  safeReadText,
  COMPONENT_GLOB,
  SCAN_IGNORE,
  fileHasAiMarker,
  makeAllowlistCheck,
} from "./ai-governance-ai-marker-component-present.js";

const RULE_ID = "ai-governance/interaction-pattern-docs";
const DISABLE_DIRECTIVE = `lyse-disable ${RULE_ID}`;
const DOCS_GLOB = "**/*.{md,mdx}";

const isAllowlisted = makeAllowlistCheck(DISABLE_DIRECTIVE);

// A doc is "AI-context" when its path or content references an AI surface —
// so generic `## History` (changelog) / `## Generation` (release notes) in
// non-AI docs do not count.
const AI_CONTEXT_RE = /\b(ai|a\.i\.|assistant|generative|gen-?ai|copilot|llm|chatbot|prompt)\b/i;

// The 6 Kavcic/HAX interaction-pattern types, matched against markdown HEADINGS
// only (a `# …` line). `generation` uses a lookbehind so "Regeneration" routes
// to `regeneration`, not `generation`.
const PATTERN_MATCHERS: ReadonlyArray<readonly [string, RegExp]> = [
  ["suggestion", /suggest/i],
  ["generation", /(?<!re)generat/i],
  ["authorization", /authori|consent|permission|approval|opt-?in/i],
  ["handoff", /hand-?off|escalat|human fallback|fallback to/i],
  ["regeneration", /regenerat|try again|\bretry/i],
  ["history", /history|\bundo\b|conversation log/i],
];

function isAiContextDoc(path: string, content: string): boolean {
  return AI_CONTEXT_RE.test(path) || AI_CONTEXT_RE.test(content);
}

export function detectDocumentedPatterns(
  docs: ReadonlyArray<{ path: string; content: string }>,
): Set<string> {
  const found = new Set<string>();
  for (const { path, content } of docs) {
    if (!isAiContextDoc(path, content)) continue;
    for (const line of content.split("\n")) {
      const m = /^#{1,6}\s+(.*)$/.exec(line.trim());
      if (!m) continue;
      const heading = m[1]!;
      for (const [type, re] of PATTERN_MATCHERS) {
        if (re.test(heading)) found.add(type);
      }
    }
  }
  return found;
}

const evaluate = async (ctx: RuleContext, _files: ParsedFiles): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  if (!ctx.repoRoot) return { findings, opportunities: 0 };
  if (isAllowlisted(ctx.repoRoot)) return { findings, opportunities: 0 };

  // AI-surface gate.
  let componentFiles: string[] = [];
  try {
    componentFiles = fg.sync(COMPONENT_GLOB, {
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
  let anyAiMarker = false;
  for (const rel of componentFiles) {
    const source = safeReadText(join(ctx.repoRoot, rel));
    if (!source) continue;
    if (fileHasAiMarker(source, rel, ctx.repoRoot)) {
      anyAiMarker = true;
      break;
    }
  }
  if (!anyAiMarker) return { findings, opportunities: 0 };

  let docFiles: string[] = [];
  try {
    docFiles = fg.sync(DOCS_GLOB, {
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
  const docs: { path: string; content: string }[] = [];
  for (const rel of docFiles) {
    const content = safeReadText(join(ctx.repoRoot, rel));
    if (content) docs.push({ path: rel, content });
  }

  const patterns = detectDocumentedPatterns(docs);

  if (patterns.size > 0) {
    const list = [...patterns].sort().join(", ");
    findings.push({
      ruleId: RULE_ID,
      axis: "ai-governance",
      severity: "info",
      location: { file: "src/index.ts", line: 1, column: 1 },
      message: `AI interaction-pattern docs detected (${patterns.size}/6): ${list} (Kavcic interaction patterns).`,
      suggestion:
        "Interaction-pattern docs found — consider documenting the remaining patterns (suggestion, generation, authorization, handoff, regeneration, history) for full coverage.",
    });
    return { findings, opportunities: 1 };
  }

  findings.push({
    ruleId: RULE_ID,
    axis: "ai-governance",
    severity: "warning",
    location: { file: "src/index.ts", line: 1, column: 1 },
    message:
      "An AI surface is present but no AI interaction-pattern documentation was detected (Kavcic). Document how AI suggestion, generation, authorization, handoff, regeneration, and history patterns work in this design system.",
    suggestion:
      "Add in-repo pattern docs (e.g. `docs/ai-patterns.md`) with headings covering the AI interaction types: suggestion, generation, authorization, handoff, regeneration, history.",
  });
  return { findings, opportunities: 1 };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "ai-governance",
    lyseRuleId: RULE_ID,
    defaultSeverity: "warning",
    shortDescription: "Detect in-repo docs for AI interaction patterns",
    fullDescription:
      "When an AI surface (AI-marker component) is present, this rule checks whether the design system ships in-repo documentation of its AI interaction patterns. Detection is heading-based and AI-context-gated: it scans markdown (`**/*.{md,mdx}`) and counts the six Kavcic/HAX interaction-pattern types (suggestion, generation, authorization, handoff, regeneration, history) that appear as a `#` heading, but only in docs that reference an AI surface (path or content mentions ai / assistant / generative / copilot / llm / chatbot / prompt). This keeps generic `## History` (changelog) or `## Generation` (release notes) in non-AI docs from counting, and ignores pattern words in body text. `generation` uses a negative lookbehind so `## Regeneration` routes to `regeneration`. Three outcomes: AI surface + ≥1 pattern doc → `info` (lists coverage n/6); AI surface + no pattern docs → `warning`; no AI surface → no finding. Doc quality is out of scope (presence only).",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/ai-governance-interaction-pattern-docs.md",
    rationale: `Why it matters

A design system that ships AI features but never documents *how* its AI interaction patterns behave leaves product teams to reinvent — inconsistently — when and how the AI suggests, generates, asks for authorization, hands off to a human, regenerates, or exposes history. The Kavcic AI-design maturity model and IBM HAX guidelines treat documented, reusable interaction patterns as a core governance signal: the difference between an AI design system and a pile of AI components.

This rule (Track 9.9, docs-as-object, presence only) detects whether those patterns are documented in-repo. It is deliberately conservative on precision — heading-based detection in AI-context docs only, never body text — so it rewards genuine pattern documentation rather than incidental keyword matches. Quality of the docs is a separate, semantic concern (no NLP in the static engine). The rule is silent on design systems with no AI surface, so non-AI systems are never penalized.`,
    examples: [
      {
        good: "<!-- docs/ai-patterns.md — AI-context doc with pattern headings -->\n# AI Assistant Patterns\n## Suggestions\n## Regeneration\n## Human Handoff",
        bad: "<!-- AI surface shipped, but only a generic README with no documented AI interaction patterns -->\n# My Design System\n## Installation\n## Components",
      },
      {
        good: "<!-- docs/copilot.md -->\n# Copilot\n## Content Generation\n## Authorization & Consent\n## Conversation History",
        bad: "<!-- CHANGELOG.md — `## History` / `## Generation` here are NOT AI pattern docs (non-AI context) -->\n# Changelog\n## History",
      },
    ],
    allowlist: [
      "repos containing `lyse-disable ai-governance/interaction-pattern-docs` in an adjacent README or `.lyse.yaml` — rule is N/A",
      "repos with no AI-marker component — no AI surface detected, rule emits nothing",
      "non-AI docs (path/content without an AI reference) — pattern headings there do not count",
      "files under `node_modules/`, `dist/`, `build/`, `.git/`, `.next/`, `out/`, `coverage/`",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});
