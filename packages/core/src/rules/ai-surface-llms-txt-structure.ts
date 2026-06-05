import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type {
  Rule,
  RuleContext,
  ParsedFiles,
  RuleEvalResult,
  Finding,
} from "../types.js";
import { createLyseRule } from "./_rule-module.js";

const RULE_ID = "ai-surface/llms-txt-structure";
const MAX_FILE_BYTES = 1_000_000;

const README_CANDIDATES = ["README.md", "README", "readme.md"];
const ALLOWLIST_DIRECTIVE = "lyse-disable ai-surface/llms-txt-structure";

const H1_RE = /^#\s+\S/;
const H2_RE = /^##\s+\S/;
const BLOCKQUOTE_RE = /^>\s+\S/;
const LIST_LINK_RE = /^\s*[-*]\s+\[([^\]]*)\]\(([^)]*)\)/;

function readFileIfSmall(absPath: string): string | null {
  try {
    const stat = statSync(absPath);
    if (!stat.isFile()) return null;
    if (stat.size > MAX_FILE_BYTES) return null;
    const content = readFileSync(absPath, "utf8");
    // Strip UTF-8 BOM so VSCode-with-BOM / Notepad-default files don't break H1 detection.
    return content.startsWith("﻿") ? content.slice(1) : content;
  } catch {
    return null;
  }
}

function hasAllowlistDirective(repoRoot: string): boolean {
  for (const candidate of README_CANDIDATES) {
    const abs = join(repoRoot, candidate);
    if (!existsSync(abs)) continue;
    const content = readFileIfSmall(abs);
    if (content !== null && content.includes(ALLOWLIST_DIRECTIVE)) {
      return true;
    }
  }
  return false;
}

interface StructureIssue {
  line: number;
  message: string;
  suggestion: string;
}

interface StructureReport {
  hasH1: boolean;
  hasBlockquote: boolean;
  hasSection: boolean;
  malformedLinks: StructureIssue[];
}

function analyseStructure(content: string): StructureReport {
  const report: StructureReport = {
    hasH1: false,
    hasBlockquote: false,
    hasSection: false,
    malformedLinks: [],
  };

  const lines = content.split("\n");

  let firstMeaningfulIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if ((lines[i] ?? "").trim().length > 0) {
      firstMeaningfulIdx = i;
      break;
    }
  }
  if (firstMeaningfulIdx >= 0 && H1_RE.test(lines[firstMeaningfulIdx] ?? "")) {
    report.hasH1 = true;
  }

  if (report.hasH1) {
    for (let i = firstMeaningfulIdx + 1; i < lines.length; i++) {
      const line = lines[i] ?? "";
      if (line.trim().length === 0) continue;
      if (BLOCKQUOTE_RE.test(line)) {
        report.hasBlockquote = true;
      }
      break;
    }
  }

  let currentSectionLine = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (H2_RE.test(line)) {
      report.hasSection = true;
      currentSectionLine = i + 1;
      continue;
    }
    if (currentSectionLine < 0) continue;
    const match = line.match(LIST_LINK_RE);
    if (!match) continue;
    const title = (match[1] ?? "").trim();
    const url = (match[2] ?? "").trim();
    if (title.length === 0 || url.length === 0) {
      report.malformedLinks.push({
        line: i + 1,
        message:
          title.length === 0 && url.length === 0
            ? "Section link is missing both title and URL"
            : title.length === 0
              ? "Section link is missing a title"
              : "Section link is missing a URL",
        suggestion:
          "format each entry as `- [<title>](<url>): <description>` per llmstxt.org spec",
      });
    }
  }

  return report;
}

const evaluate = async (
  ctx: RuleContext,
  _files: ParsedFiles,
): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  if (!ctx.repoRoot) {
    return { findings, opportunities: 0 };
  }

  if (hasAllowlistDirective(ctx.repoRoot)) {
    return { findings, opportunities: 0 };
  }

  const llmsTxtAbs = join(ctx.repoRoot, "llms.txt");
  const content = readFileIfSmall(llmsTxtAbs);

  if (content === null) {
    findings.push({
      ruleId: RULE_ID,
      axis: "ai-surface",
      severity: "warning",
      location: { file: "llms.txt", line: 1, column: 1 },
      message:
        "No llms.txt at repo root — AI agents have no top-level map of the design system",
      suggestion:
        "add an llms.txt file (llmstxt.org spec) with an H1 title, a blockquote summary, and `## <section>` link lists",
    });
    return { findings, opportunities: 1 };
  }

  const report = analyseStructure(content);

  if (!report.hasH1) {
    findings.push({
      ruleId: RULE_ID,
      axis: "ai-surface",
      severity: "error",
      location: { file: "llms.txt", line: 1, column: 1 },
      message: "llms.txt is missing a top-level `# <title>` H1 heading",
      suggestion:
        "start the file with a single `# <Project Title>` line, per llmstxt.org",
    });
  }

  if (!report.hasBlockquote) {
    findings.push({
      ruleId: RULE_ID,
      axis: "ai-surface",
      severity: "error",
      location: { file: "llms.txt", line: 1, column: 1 },
      message: "llms.txt is missing a `> <summary>` blockquote after the H1",
      suggestion:
        "add a one-sentence `> ...` blockquote summarising the project right after the H1",
    });
  }

  if (!report.hasSection) {
    findings.push({
      ruleId: RULE_ID,
      axis: "ai-surface",
      severity: "error",
      location: { file: "llms.txt", line: 1, column: 1 },
      message: "llms.txt has no `## <section>` headings — link lists are required by the spec",
      suggestion:
        "add at least one `## <Section>` heading followed by `- [<title>](<url>): <description>` items, per llmstxt.org",
    });
  }

  for (const issue of report.malformedLinks) {
    findings.push({
      ruleId: RULE_ID,
      axis: "ai-surface",
      severity: "error",
      location: { file: "llms.txt", line: issue.line, column: 1 },
      message: issue.message,
      suggestion: issue.suggestion,
    });
  }

  return { findings, opportunities: 1 };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "ai-surface",
    lyseRuleId: RULE_ID,
    defaultSeverity: "warning",
    shortDescription:
      "llms.txt at repo root must follow the llmstxt.org structure",
    fullDescription:
      "Detects whether a design-system repository ships an `llms.txt` file at the repo root and validates the file's structure against the llmstxt.org specification: a single `# <title>` H1, a `> <summary>` blockquote, and at least one `## <section>` heading whose list items follow `- [<title>](<url>): <description>`. Absence emits a warning. A present-but-malformed `llms.txt` emits one error per structural issue. The optional companion file `llms-full.txt` is detected as a bonus signal but is not required.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/ai-surface-llms-txt-structure.md",
    rationale: `Why it matters

\`llms.txt\` (llmstxt.org, Tantum 2024) is the emerging convention for handing AI agents a token-cheap, curated map of a project. For a design system this is the AI-Consumable surface: a single discoverable entry that lists the canonical Quickstart, API reference, component index, and policy docs without forcing the agent to crawl the whole repo.

Absence is a missed opportunity, not a bug — agents fall back to scanning the README and source tree, which is slower and more expensive. Structural errors (missing H1, missing summary, malformed link rows) are scored as errors because consumers (cursor, claude code, custom agents) parse the file on the assumption it follows the spec, and silent malformations break the contract.

The companion \`llms-full.txt\` — a single-file inlining of every linked document — is a strong bonus signal but is not enforced as a hard requirement.`,
    examples: [
      {
        good: "# Acme DS\\n\\n> A token-first React design system.\\n\\n## Docs\\n\\n- [Quickstart](https://acme.dev/quickstart): Get started in 3 minutes.\\n- [API reference](https://acme.dev/api): Full method index.",
        bad: "Welcome to Acme DS. We ship Buttons and Cards.\\n\\n- random link list",
      },
    ],
    allowlist: [
      "files larger than 1 MB at `llms.txt` — skipped to avoid pathological cases",
      "repos whose README at the root contains the directive `lyse-disable ai-surface/llms-txt-structure` — rule is N/A",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = {
  analyseStructure,
  hasAllowlistDirective,
  README_CANDIDATES,
  ALLOWLIST_DIRECTIVE,
};
