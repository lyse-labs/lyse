import { existsSync, readFileSync, statSync } from "node:fs";
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
  AI_MARKER_NAMES,
  isAiMarkerName,
  safeReadText,
} from "./ai-governance-ai-marker-component-present.js";

const RULE_ID = "ai-governance/disclaimer-present";
const MAX_ALLOWLIST_FILE_BYTES = 1_000_000;
const DISABLE_DIRECTIVE = `lyse-disable ${RULE_ID}`;

// WHY separate constant: the exact GitLab Pajamas canonical wording is the
// highest-confidence signal that a team has adopted the industry-standard
// disclaimer. Verify against Pajamas AI experience guidelines before updating;
// embed verbatim so substring match is unambiguous.
const GITLAB_EXACT_DISCLAIMER =
  "AI-generated content may be inaccurate. Always check important information.";

// Disclaimer text phrases — word-boundary anchored, case-insensitive.
// "ai generated" (space variant) covered by the first two patterns.
const DISCLAIMER_PHRASES: RegExp[] = [
  /\bgenerated\s+by\s+ai\b/i,
  /\bai[- ]?generated\b/i,
  /\bmay\s+be\s+inaccurate\b/i,
  /\bcheck\s+important\s+info\b/i,
  /\bpowered\s+by\s+ai\b/i,
];

// WHY AI prefix check: generic legal/cookie/privacy disclaimers co-located
// with an AI marker must not earn info credit — only AI-specific disclaimer
// components count. Exact `Disclaimer` (standalone) is always AI-disclaimer
// context; prefixed names must carry an AI-domain qualifier.
function hasDisclaimerTagName(name: string): boolean {
  const lower = name.toLowerCase();
  if (!lower.includes("disclaimer")) return false;
  if (lower === "disclaimer") return true;
  return (
    lower.startsWith("ai") ||
    lower.startsWith("genai") ||
    lower.startsWith("generative") ||
    lower.startsWith("llm")
  );
}

const ALLOWLIST_CANDIDATES = [
  "README.md",
  "README",
  "README.mdx",
  "readme.md",
  ".lyse.yaml",
  ".lyse.yml",
];

const COMPONENT_GLOB = "**/*.{tsx,jsx,vue}";

const IGNORE = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.git/**",
  "**/.next/**",
  "**/out/**",
  "**/coverage/**",
];

interface DisclaimerResult {
  found: boolean;
  isGitLabExact: boolean;
}

export function detectDisclaimer(source: string): DisclaimerResult {
  if (source.includes(GITLAB_EXACT_DISCLAIMER)) {
    return { found: true, isGitLabExact: true };
  }
  for (const re of DISCLAIMER_PHRASES) {
    if (re.test(source)) return { found: true, isGitLabExact: false };
  }
  for (const m of source.matchAll(/<\s*([A-Za-z][\w.]*)/g)) {
    if (m[1] && hasDisclaimerTagName(m[1])) {
      return { found: true, isGitLabExact: false };
    }
  }
  return { found: false, isGitLabExact: false };
}

export function detectAiMarkerInSource(source: string): boolean {
  for (const m of source.matchAll(/<\s*([A-Za-z][\w.-]*)/g)) {
    if (m[1] && isAiMarkerName(m[1])) return true;
  }
  return false;
}

function isAllowlisted(repoRoot: string): boolean {
  for (const candidate of ALLOWLIST_CANDIDATES) {
    const abs = join(repoRoot, candidate);
    if (!existsSync(abs)) continue;
    try {
      const stat = statSync(abs);
      if (!stat.isFile() || stat.size > MAX_ALLOWLIST_FILE_BYTES) continue;
      const raw = readFileSync(abs, "utf8");
      if (raw.includes(DISABLE_DIRECTIVE)) return true;
    } catch {
      // unreadable — fall through
    }
  }
  return false;
}

const MAX_LISTED_FILES = 20;

const evaluate = async (
  ctx: RuleContext,
  _files: ParsedFiles,
): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  if (!ctx.repoRoot) return { findings, opportunities: 0 };
  if (isAllowlisted(ctx.repoRoot)) return { findings, opportunities: 0 };

  let componentFiles: string[] = [];
  try {
    componentFiles = fg
      .sync(COMPONENT_GLOB, {
        cwd: ctx.repoRoot,
        absolute: false,
        dot: false,
        ignore: IGNORE,
        onlyFiles: true,
        unique: true,
      })
      .sort();
  } catch {
    return { findings, opportunities: 0 };
  }

  if (componentFiles.length === 0) return { findings, opportunities: 0 };

  let anyAiSurface = false;
  const missingDisclaimerFiles: string[] = [];

  for (const rel of componentFiles) {
    const abs = join(ctx.repoRoot, rel);
    const source = safeReadText(abs);
    if (!source) continue;

    const hasMarker = detectAiMarkerInSource(source);
    const disclaimer = detectDisclaimer(source);

    if (!hasMarker) continue;

    anyAiSurface = true;

    if (!disclaimer.found) {
      missingDisclaimerFiles.push(rel);
    }

    if (disclaimer.found) {
      const gitlabNote = disclaimer.isGitLabExact
        ? " Matches the GitLab Pajamas canonical disclaimer wording (highest confidence)."
        : "";
      const baseFinding: Finding = {
        ruleId: RULE_ID,
        axis: "ai-governance",
        severity: "info",
        location: { file: rel, line: 1, column: 1 },
        message:
          `AI disclaimer detected in ${rel}.${gitlabNote} Capability framing present (HAX G1/G2).`,
      };
      if (!disclaimer.isGitLabExact) {
        baseFinding.suggestion =
          `Consider adopting the GitLab Pajamas canonical wording for highest-confidence scoring: ` +
          `"AI-generated content may be inaccurate. Always check important information."`;
      }
      findings.push(baseFinding);
    }
  }

  if (!anyAiSurface) return { findings: [], opportunities: 0 };

  if (missingDisclaimerFiles.length > 0) {
    const listed = missingDisclaimerFiles.slice(0, MAX_LISTED_FILES);
    const overflow = missingDisclaimerFiles.length - listed.length;
    const fileList = listed.join(", ") + (overflow > 0 ? `, +${overflow} more` : "");
    findings.unshift({
      ruleId: RULE_ID,
      axis: "ai-governance",
      severity: "warning",
      location: { file: missingDisclaimerFiles[0] ?? "src/index.ts", line: 1, column: 1 },
      message:
        `${missingDisclaimerFiles.length} file${missingDisclaimerFiles.length === 1 ? "" : "s"} contain an AI-marker component but no disclaimer text or disclaimer component (HAX G1/G2 — GitLab Pajamas): ${fileList}.`,
      suggestion:
        `Render a visible disclaimer alongside AI-generated content. ` +
        `GitLab Pajamas canonical wording: "AI-generated content may be inaccurate. Always check important information."`,
    });
  }

  findings.sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity === "warning" ? -1 : 1;
    }
    const fa = a.location?.file ?? "";
    const fb = b.location?.file ?? "";
    if (fa !== fb) return fa < fb ? -1 : 1;
    return (a.location?.line ?? 0) - (b.location?.line ?? 0);
  });

  return { findings, opportunities: componentFiles.length };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "ai-governance",
    lyseRuleId: RULE_ID,
    defaultSeverity: "warning",
    shortDescription: "Detect AI disclaimer near AI-generated output",
    fullDescription:
      "Scans component files (`**/*.{tsx,jsx,vue}`) for a co-located AI disclaimer — " +
      "either disclaimer text (`Generated by AI`, `AI-generated`, `May be inaccurate`, " +
      "`Check important info`, `Powered by AI`, case-insensitive word-boundary) or a " +
      "`*Disclaimer*` / `*AIDisclaimer*` component tag. " +
      "Highest-confidence signal: the GitLab Pajamas canonical disclaimer wording matched verbatim. " +
      "Cross-condition: if an AI-marker component (per AI_MARKER_NAMES) is present but no disclaimer is found, " +
      "emits `warning`; if a disclaimer is detected, emits `info` (noting the GitLab canonical match when applicable). " +
      "Emits nothing when no AI surface is present.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/ai-governance-disclaimer-present.md",
    rationale: `Why it matters

AI systems make errors. Capability-framing guidelines (HAX G1/G2) require that AI-generated surfaces carry a visible disclaimer so users understand the system's limits and know to verify critical information.

GitLab Pajamas formalises this with a canonical disclaimer string: "AI-generated content may be inaccurate. Always check important information." When the exact Pajamas wording is used, Lyse flags it as highest-confidence.

This rule enforces the pairing: an AI-marker component is the visual signal that content is AI-generated; a disclaimer is the capability-framing signal that the content may err. Having the marker without the disclaimer leaves users without the context they need to make safe decisions.

The rule emits \`warning\` (action required) when a marker is present but no disclaimer is found, and \`info\` (inventory) when a disclaimer is detected — flagging whether it matches the GitLab canonical wording.`,
    examples: [
      {
        good:
          "// AISummary.tsx — marker + disclaimer present\n" +
          "<AILabel />\n" +
          "<p>{summary}</p>\n" +
          '<p className="disclaimer">Generated by AI. May be inaccurate.</p>',
        bad:
          "// AISummary.tsx — marker present, no disclaimer\n" +
          "<AILabel />\n" +
          "<p>{summary}</p>",
      },
      {
        good:
          "// GitLab canonical wording — highest-confidence pass\n" +
          '<AIDisclaimer message="AI-generated content may be inaccurate. Always check important information." />',
        bad:
          "// AI marker but disclaimer is buried in a tooltip the user may never see\n" +
          "<AIBadge /><Tooltip>AI content</Tooltip>",
      },
      {
        good:
          "// Vue SFC — disclaimer component rendered alongside output\n" +
          "<template><AIOutput :text /><AiDisclaimer /></template>",
        bad:
          "// Vue SFC — AI token reserved in class, no disclaimer rendered\n" +
          '<template><div class="ai-output">{{ text }}</div></template>',
      },
    ],
    allowlist: [
      "repos containing `lyse-disable ai-governance/disclaimer-present` in an adjacent README or `.lyse.yaml` — rule is N/A",
      "repos with no AI-marker component AND no disclaimer text — no AI surface detected, rule emits nothing",
      "files larger than 1 MB — skipped to avoid pathological cases",
      "files under `node_modules/`, `dist/`, `build/`, `.git/`, `.next/`, `out/`, `coverage/`",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = {
  detectDisclaimer,
  detectAiMarkerInSource,
  isAllowlisted,
  AI_MARKER_NAMES,
  DISABLE_DIRECTIVE,
  ALLOWLIST_CANDIDATES,
  GITLAB_EXACT_DISCLAIMER,
};
