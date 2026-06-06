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
const MAX_FINDING_NAMES = 20;
const MAX_ALLOWLIST_FILE_BYTES = 1_000_000;
const DISABLE_DIRECTIVE = `lyse-disable ${RULE_ID}`;

const ALLOWLIST_CANDIDATES = [
  "README.md",
  "README",
  "README.mdx",
  "readme.md",
  ".lyse.yaml",
  ".lyse.yml",
];

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
      // unreadable allowlist source — fall through
    }
  }
  return false;
}

const evaluate = async (
  ctx: RuleContext,
  _files: ParsedFiles,
): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  if (!ctx.repoRoot) {
    return { findings, opportunities: 0 };
  }
  if (isAllowlisted(ctx.repoRoot)) {
    return { findings, opportunities: 0 };
  }

  const names = detectReservedAiTokens(ctx.repoRoot);
  if (names.length === 0) {
    return { findings, opportunities: 0 };
  }

  const shown = names.slice(0, MAX_FINDING_NAMES);
  const more = names.length - shown.length;
  const list = shown.join(", ") + (more > 0 ? `, +${more} more` : "");

  findings.push({
    ruleId: RULE_ID,
    axis: "ai-governance",
    severity: "info",
    location: { file: "tokens.json", line: 1, column: 1 },
    message: `Detected ${names.length} reserved AI-marker design token${names.length === 1 ? "" : "s"}: ${list}`,
    suggestion:
      "inventory only — reserved AI tokens are recognised vocabularies (Carbon dragon-fruit / *-ai-*, Polaris magic, Workday Canvas *-ai-*); the composite rule `ai-governance/ai-token-requires-marker` will gate downstream usage",
  });

  return { findings, opportunities: 1 };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "ai-governance",
    lyseRuleId: RULE_ID,
    defaultSeverity: "info",
    shortDescription: "Inventory reserved AI-marker design tokens",
    fullDescription:
      "Scans token sources (`tokens.json`, `tokens/**/*.json`, `*.tokens.json`, and `**/*.css` `--*` custom properties) for token names that match reserved AI-marker vocabularies: Carbon (`dragon-fruit`, `*-ai-*` color tokens), Shopify Polaris (`--p-color-*-magic*`, `magic-*`), Workday Canvas (`*-ai-*` segment), and the generic leading/trailing `ai` segment. Matching is segment-anchored (split by `-`, `_`, `.`, `/`) so `rain`, `paint`, `mainColor`, `captain`, `detail` do not trigger. Emits one info finding listing up to 20 matched names when reserved tokens are present; emits nothing when none are. Severity is informational — a DS with no AI surface is not penalized here; the gating rule lives in Track 3.3 (`ai-governance/ai-token-requires-marker`).",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/ai-governance-ai-tokens-reserved.md",
    rationale: `Why it matters

AI-marker tokens are how a design system tells consumers — humans and agents — that a UI region was produced by AI. Carbon's \`dragon-fruit\` AI gradient, Polaris's \`magic\` namespace, and Workday Canvas's \`*-ai-*\` color tokens are the three established vocabularies; a fourth generic \`ai\` segment covers the long tail.

Track 3 of the Lyse roadmap (Face B — AI-Governance) treats these tokens as the foundation for the composite gating rule \`ai-governance/ai-token-requires-marker\` (Track 3.3), which enforces that AI-produced surfaces actually wear the AI marker. This rule is the inventory step: detect which reserved tokens the repo declares so 3.3 has a deterministic set to check against. It carries no penalty — a DS with zero AI tokens (no AI surface) emits no finding and is not down-scored. The teeth live in 3.3.

The shared parser \`detectReservedAiTokens(repoRoot)\` is exported from \`packages/core/src/parsers/ai-tokens.ts\` so 3.3 reuses the exact same detection set.`,
    examples: [
      {
        good: '/* tokens.json */ { "color": { "primary": "#0070f3" } }',
        bad: '/* tokens.json */ { "color": { "ai": { "primary": "#0070f3" } } }',
      },
      {
        good: ":root { --color-primary: #0070f3; }",
        bad: ":root { --p-color-bg-magic: #f4f0fd; }",
      },
      {
        good: '/* tokens.json */ { "gradient": { "sunrise": "..." } }',
        bad: '/* tokens.json */ { "gradient": { "dragon-fruit": "..." } }',
      },
    ],
    allowlist: [
      "repos containing `lyse-disable ai-governance/ai-tokens-reserved` in an adjacent README or `.lyse.yaml` — rule is N/A",
      "token files larger than 2 MB — skipped to avoid pathological cases",
      "files under `node_modules/`, `dist/`, `build/`, `.git/`, `.next/`, `out/`, `coverage/`",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = {
  isAllowlisted,
  DISABLE_DIRECTIVE,
  ALLOWLIST_CANDIDATES,
  MAX_FINDING_NAMES,
};
