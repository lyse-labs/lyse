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
  extractNamesFromSource,
  extractVueNames,
  safeReadText,
} from "./ai-governance-ai-marker-component-present.js";
import { scanForAiMarkers } from "./ai-governance-explainability-affordance.js";

const RULE_ID = "ai-governance/feedback-control-present";
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

const INDEX_CANDIDATES = [
  "src/index.ts",
  "src/index.tsx",
  "index.ts",
  "index.tsx",
];

// Feedback control vocabulary — case-insensitive substring match.
// Names ending in 'icon' (icon primitives) are excluded by the check below.
const FEEDBACK_PATTERNS = [
  "feedback",
  "thumbsup",
  "thumbsdown",
  "rating",
  "vote",
  "helpful",
] as const;

const ICON_SUFFIX_RE = /icon$/i;

export function isFeedbackControlName(name: string): boolean {
  const lower = name.toLowerCase();
  if (ICON_SUFFIX_RE.test(lower)) return false;
  return FEEDBACK_PATTERNS.some((p) => lower.includes(p));
}

// Categorized bonus: source exposes named reason options (enum object, union
// type, or options array) containing known negative-reason vocabulary words.
const REASON_VOCAB =
  /\b(inaccurate|unhelpful|offensive|tooLong|too_long|harmful|misleading|irrelevant)\b/i;
const ENUM_OR_TYPE_RE =
  /(?:type|enum|const)\s+\w*[Rr]eason\w*\s*[=:{<]/;
const OPTIONS_ARRAY_RE = /\w*[Oo]ption\w*\s*=\s*\[/;

export function detectCategorizedFeedback(source: string): boolean {
  if (!REASON_VOCAB.test(source)) return false;
  return ENUM_OR_TYPE_RE.test(source) || OPTIONS_ARRAY_RE.test(source);
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
      // unreadable allowlist source — fall through
    }
  }
  return false;
}

function deriveNameFromPath(relPath: string): string {
  const parts = relPath.split("/");
  const file = parts[parts.length - 1] ?? "";
  return file.replace(/\.(tsx|jsx|vue)$/, "");
}

interface FeedbackScan {
  names: string[];
  categorized: boolean;
}

// Tracks original display name and whether categorized, keyed by lowercase.
interface FeedbackEntry {
  displayName: string;
  categorized: boolean;
}

export function scanForFeedbackControls(repoRoot: string): FeedbackScan {
  const found = new Map<string, FeedbackEntry>();

  function record(name: string, categorized: boolean): void {
    const key = name.toLowerCase();
    const existing = found.get(key);
    if (!existing) {
      found.set(key, { displayName: name, categorized });
    } else {
      found.set(key, { displayName: existing.displayName, categorized: existing.categorized || categorized });
    }
  }

  for (const candidate of INDEX_CANDIDATES) {
    const abs = join(repoRoot, candidate);
    const source = safeReadText(abs);
    if (!source) continue;
    for (const name of extractNamesFromSource(source)) {
      if (isFeedbackControlName(name)) record(name, false);
    }
  }

  let componentFiles: string[] = [];
  try {
    componentFiles = fg.sync(COMPONENT_GLOB, {
      cwd: repoRoot,
      absolute: false,
      dot: false,
      ignore: IGNORE,
      onlyFiles: true,
      unique: true,
    });
  } catch {
    // non-fatal
  }

  for (const rel of componentFiles.sort()) {
    const baseName = deriveNameFromPath(rel);
    const source = safeReadText(join(repoRoot, rel));

    if (isFeedbackControlName(baseName)) {
      const categorized = source ? detectCategorizedFeedback(source) : false;
      record(baseName, categorized);
      continue;
    }

    if (!source) continue;
    const names = rel.endsWith(".vue")
      ? extractVueNames(source)
      : extractNamesFromSource(source);

    for (const name of names) {
      if (isFeedbackControlName(name)) {
        record(name, detectCategorizedFeedback(source));
      }
    }
  }

  const entries = [...found.values()].sort((a, b) =>
    a.displayName.localeCompare(b.displayName),
  );
  const names = entries.map((e) => e.displayName);
  const categorized = entries.some((e) => e.categorized);
  return { names, categorized };
}

const evaluate = async (
  ctx: RuleContext,
  _files: ParsedFiles,
): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  if (!ctx.repoRoot) return { findings, opportunities: 0 };
  if (isAllowlisted(ctx.repoRoot)) return { findings, opportunities: 0 };

  const markerPresent = scanForAiMarkers(ctx.repoRoot);
  if (!markerPresent) return { findings, opportunities: 0 };

  const { names, categorized } = scanForFeedbackControls(ctx.repoRoot);

  if (names.length > 0) {
    const list = names.join(", ");
    const categorizedNote = categorized
      ? " (categorized reason enum detected)"
      : "";
    findings.push({
      ruleId: RULE_ID,
      axis: "ai-governance",
      severity: "info",
      location: { file: "src/index.ts", line: 1, column: 1 },
      message: `Feedback control${names.length === 1 ? "" : "s"} detected: ${list}${categorizedNote} (HAX G15 / PAIR Feedback)`,
      suggestion:
        "Feedback control found — ensure it is paired with the AI-marker component on AI-generated surfaces. If not already categorized, expose a reason enum (e.g. inaccurate, unhelpful, offensive) for richer signal.",
    });
    return { findings, opportunities: 1 };
  }

  findings.push({
    ruleId: RULE_ID,
    axis: "ai-governance",
    severity: "warning",
    location: { file: "src/index.ts", line: 1, column: 1 },
    message:
      "An AI-marker component is present but no feedback control was detected (HAX G15 / PAIR Feedback). Ship a thumbs-up/down, rating, or helpful/unhelpful component so users can signal AI output quality.",
    suggestion:
      "Add a dedicated feedback component (e.g. AiFeedback, ThumbsUp/ThumbsDown, StarRating, WasThisHelpful) and optionally expose a reason enum (inaccurate, unhelpful, offensive) for categorized feedback.",
  });
  return { findings, opportunities: 1 };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "ai-governance",
    lyseRuleId: RULE_ID,
    defaultSeverity: "warning",
    shortDescription: "Detect a feedback control on AI output",
    fullDescription:
      "When an AI-marker component is detected in the design system (per `scanForAiMarkers` exported by `ai-governance/explainability-affordance`), this rule checks whether a companion feedback control exists. Detection is two-phase. Phase 1 — name-based scan: reads `src/index.ts` and component files (`**/*.{tsx,jsx,vue}`) checking exported identifiers and file base names against the feedback vocabulary (case-insensitive substring): `feedback`, `thumbsup`, `thumbsdown`, `rating`, `vote`, `helpful`. Names ending in `Icon` (icon primitives) are excluded. Phase 2 — categorized bonus: for each matched feedback component file, checks whether the source exposes a reason vocabulary word (`inaccurate`, `unhelpful`, `offensive`, `tooLong`, `harmful`, `misleading`, `irrelevant`) alongside an enum object, union type, or options array. Three outcomes: AI-marker present + feedback control found → `info` (notes if categorized; HAX G15 / PAIR Feedback cited); AI-marker present + no feedback control → `warning`; no AI-marker → no finding.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/ai-governance-feedback-control-present.md",
    rationale: `Why it matters

Users interacting with AI-generated content need a structured way to signal output quality. HAX G15 (IBM Human-AI Experience guidelines, Granular feedback) and the Google PAIR Feedback & Control guidebook require that AI-powered interfaces expose a feedback control — thumbs up/down, rating, or helpful/unhelpful — so users can communicate when AI output is wrong, harmful, or unhelpful.

Vendor mandates: Microsoft Fluent 2 AI design guidelines mandate a feedback affordance on AI output; Amazon Cloudscape AI components documentation encourages it; Red Hat PatternFly AI component guidance recommends it. Without a dedicated component, teams implement ad-hoc controls with inconsistent UX, missing accessibility attributes, and no shared vocabulary for categorized negative feedback.

Categorized feedback (why was it bad?) provides richer model-improvement signal than binary thumbs alone. This rule rewards designs that expose a reason enum (inaccurate, unhelpful, offensive) by noting the categorized bonus in the info message.

The rule crosses two conditions: it only fires when an AI-marker component is confirmed present (via the shared \`scanForAiMarkers\` gate from Track 3.5). A DS with no AI surface is not penalized.`,
    examples: [
      {
        good: "// src/index.ts\nexport { AILabel } from './ai-label';\nexport { ThumbsUp, ThumbsDown } from './thumbs';",
        bad: "// src/index.ts\nexport { AILabel } from './ai-label';\n// no feedback control exported",
      },
      {
        good: "// AiFeedback.tsx — exposes categorized reasons\nexport const AiFeedback = () => null;\nexport const FeedbackReason = { inaccurate: 'inaccurate', unhelpful: 'unhelpful', offensive: 'offensive' } as const;",
        bad: "// AiFeedback.tsx — no reason categories\nexport const AiFeedback = () => null;",
      },
      {
        good: "// StarRating.tsx present alongside AIBadge.tsx",
        bad: "// AIBadge.tsx present but no rating, vote, or helpful component shipped",
      },
    ],
    allowlist: [
      "repos containing `lyse-disable ai-governance/feedback-control-present` in an adjacent README or `.lyse.yaml` — rule is N/A",
      "repos with no AI-marker component — no AI surface detected, rule emits nothing",
      "files larger than 1 MB — skipped to avoid pathological cases",
      "files under `node_modules/`, `dist/`, `build/`, `.git/`, `.next/`, `out/`, `coverage/`",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = {
  isFeedbackControlName,
  detectCategorizedFeedback,
  isAllowlisted,
  scanForFeedbackControls,
  DISABLE_DIRECTIVE,
  ALLOWLIST_CANDIDATES,
  FEEDBACK_PATTERNS,
};
