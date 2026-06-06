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
import { detectReservedAiTokens } from "../parsers/ai-tokens.js";

const RULE_ID = "ai-governance/ai-tokens-reserved";
const MAX_FINDINGS = 20;
const MAX_FILE_BYTES = 1_000_000;

const DISABLE_DIRECTIVE = `lyse-disable ${RULE_ID}`;

const README_CANDIDATES = ["README.md", "README", "readme.md", "README.mdx"];
const LYSE_YAML_CANDIDATES = [".lyse.yaml", ".lyse.yml", "lyse.config.yaml", "lyse.config.yml"];

function isAllowlisted(repoRoot: string): boolean {
  for (const candidate of [...README_CANDIDATES, ...LYSE_YAML_CANDIDATES]) {
    const abs = join(repoRoot, candidate);
    if (!existsSync(abs)) continue;
    try {
      const stat = statSync(abs);
      if (!stat.isFile() || stat.size > MAX_FILE_BYTES) continue;
      const raw = readFileSync(abs, "utf8");
      if (raw.includes(DISABLE_DIRECTIVE)) return true;
    } catch {
      // ignore unreadable files
    }
  }
  return false;
}

const evaluate = async (
  ctx: RuleContext,
  _files: ParsedFiles,
): Promise<RuleEvalResult> => {
  if (!ctx.repoRoot) return { findings: [], opportunities: 0 };
  if (isAllowlisted(ctx.repoRoot)) return { findings: [], opportunities: 0 };

  const tokens = detectReservedAiTokens(ctx.repoRoot);

  if (tokens.length === 0) return { findings: [], opportunities: 0 };

  const capped = tokens.slice(0, MAX_FINDINGS);
  const truncated = tokens.length > MAX_FINDINGS;
  const tokenList = capped.join(", ") + (truncated ? ` … (${tokens.length - MAX_FINDINGS} more)` : "");

  const finding: Finding = {
    ruleId: RULE_ID,
    axis: "ai-governance",
    severity: "info",
    location: { file: "tokens", line: 1, column: 1 },
    message: `Reserved AI-marker design tokens detected: ${tokenList}`,
    suggestion:
      "Document these tokens in your DS governance spec — they signal an AI-styled surface that Track 3.3 (ai-governance/ai-token-requires-marker) will enforce at use sites.",
  };

  return { findings: [finding], opportunities: 1 };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "ai-governance",
    lyseRuleId: RULE_ID,
    defaultSeverity: "info",
    shortDescription: "Reserved AI-marker design tokens present in the token layer",
    fullDescription:
      "Scans the design-system token layer (JSON/YAML token files and CSS custom properties) for reserved AI-marker token names: Carbon dragon-fruit gradient family, Polaris magic-namespace tokens, Workday Canvas *-ai-* segment, and any generic ai-prefixed/-suffixed/-segmented token name. Emits a single `info` finding listing the matched token names (up to 20) when at least one is found. No finding when none are present — a DS without an AI surface is not penalized. This inventory is the foundation consumed by Track 3.3 (`ai-governance/ai-token-requires-marker`).",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/ai-governance-ai-tokens-reserved.md",
    rationale: `Why it matters

Design systems in 2026 increasingly ship a dedicated AI-styled surface — tokens that encode the brand's AI interaction palette (Carbon's dragon-fruit gradient, Polaris's magic namespace, Workday Canvas's *-ai-* segment). These tokens are reserved: they must not be used outside sanctioned AI components.

Before enforcing use-site constraints (Track 3.3), the toolchain needs an inventory of which reserved AI tokens actually exist in the DS. This rule provides that inventory as a low-severity signal: presence is informational (the DS has an AI surface), absence is neutral (no AI surface yet). The bite lives in the downstream rule.`,
    examples: [
      {
        good: '{ "color-ai-brand": { "$value": "#8a3ffc" } }  → rule emits info (token catalogued)',
        bad: "No token source files found → rule emits nothing (neutral, not penalised)",
      },
      {
        good: '--p-color-text-magic: #8a3ffc;  → rule emits info (Polaris magic token catalogued)',
        bad: "Token file exists but contains no AI-marker names → rule emits nothing",
      },
    ],
    allowlist: [
      "repos containing `lyse-disable ai-governance/ai-tokens-reserved` in README.md or .lyse.yaml",
      "token files larger than 2 MB — skipped",
      "CSS files larger than 2 MB — skipped",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = {
  isAllowlisted,
  DISABLE_DIRECTIVE,
};
