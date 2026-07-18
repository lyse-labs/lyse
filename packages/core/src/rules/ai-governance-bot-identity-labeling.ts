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
  COMPONENT_GLOB,
  SCAN_IGNORE,
  fileHasAiMarker,
  makeAllowlistCheck,
} from "./ai-governance-ai-marker-component-present.js";

const RULE_ID = "ai-governance/bot-identity-labeling";
const DISABLE_DIRECTIVE = `lyse-disable ${RULE_ID}`;

const isAllowlisted = makeAllowlistCheck(DISABLE_DIRECTIVE);

// Non-human identity-labeling vocabulary. DISTINCTIVE COMPOUNDS ONLY — a bare
// "bot" substring would false-fire on "bottom"/"bottle"/"robot", so we require
// the avatar/persona/identity compound that signals the agent is labeled as
// non-human: AiAvatar, BotAvatar, AssistantAvatar, AiPersona, NonHumanBadge…
const IDENTITY_PATTERNS = [
  "aiavatar",
  "botavatar",
  "assistantavatar",
  "agentavatar",
  "aipersona",
  "botpersona",
  "assistantpersona",
  "aiidentity",
  "botidentity",
  "nonhuman",
] as const;

function normaliseName(name: string): string {
  return name.toLowerCase().replace(/[-_]/g, "");
}

export function isBotIdentityName(name: string): boolean {
  const lower = normaliseName(name);
  return IDENTITY_PATTERNS.some((p) => lower.includes(p));
}

function deriveNameFromPath(relPath: string): string {
  const parts = relPath.split("/");
  const file = parts[parts.length - 1] ?? "";
  return file.replace(/\.(tsx|jsx|vue)$/, "");
}

function scanForBotIdentity(repoRoot: string, files?: string[]): string[] {
  const found = new Set<string>();

  let componentFiles: string[];
  if (files !== undefined) {
    componentFiles = files;
  } else {
    componentFiles = [];
    try {
      componentFiles = fg.sync(COMPONENT_GLOB, {
        cwd: repoRoot,
        absolute: false,
        dot: false,
        ignore: SCAN_IGNORE,
        onlyFiles: true,
        unique: true,
      });
    } catch {
      // non-fatal
    }
  }

  for (const rel of componentFiles.sort()) {
    const source = safeReadText(join(repoRoot, rel));
    if (!source) continue;
    if (!fileHasAiMarker(source, rel, repoRoot)) continue;

    const baseName = deriveNameFromPath(rel);
    if (isBotIdentityName(baseName)) {
      found.add(baseName);
      continue;
    }

    const names = rel.endsWith(".vue") ? extractVueNames(source) : extractNamesFromSource(source);
    for (const name of names) {
      if (isBotIdentityName(name)) found.add(name);
    }
  }

  return [...found].sort((a, b) => a.localeCompare(b));
}

const evaluate = async (ctx: RuleContext, _files: ParsedFiles): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  if (!ctx.repoRoot) return { findings, opportunities: 0 };
  if (isAllowlisted(ctx.repoRoot)) return { findings, opportunities: 0 };

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

  const names = scanForBotIdentity(ctx.repoRoot, componentFiles);

  if (names.length > 0) {
    findings.push({
      ruleId: RULE_ID,
      axis: "ai-governance",
      severity: "info",
      location: { file: "src/index.ts", line: 1, column: 1 },
      message: `Non-human identity label${names.length === 1 ? "" : "s"} detected: ${names.join(", ")} (HAX G1 / PAIR "Set expectations")`,
      suggestion:
        "Non-human identity label found — ensure conversational AI surfaces clearly disclose that the user is interacting with a bot, not a person.",
    });
    return { findings, opportunities: 1 };
  }

  findings.push({
    ruleId: RULE_ID,
    axis: "ai-governance",
    severity: "warning",
    location: { file: "src/index.ts", line: 1, column: 1 },
    message:
      'An AI-marker component is present but no non-human identity label was detected (HAX G1 / PAIR "Set expectations"). Ship a bot/AI avatar or persona label so users know they are not talking to a human.',
    suggestion:
      "Add a dedicated non-human identity affordance (e.g. AiAvatar, BotAvatar, AssistantAvatar, AiPersona, NonHumanBadge) on conversational AI surfaces.",
  });
  return { findings, opportunities: 1 };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "ai-governance",
    lyseRuleId: RULE_ID,
    defaultSeverity: "warning",
    shortDescription: "Detect non-human (bot/avatar) identity labeling on AI surfaces",
    fullDescription:
      'When an AI-marker component is detected in the design system, this rule checks whether a companion non-human identity label (bot/AI avatar or persona) exists co-located in the same file. Detection is per-file: an identity vocabulary match only earns credit when the same file also contains an AI marker (component name or JSX tag). The scan checks exported identifiers and file base names against a DISTINCTIVE COMPOUND vocabulary (case-insensitive substring, separator-normalised): `aiavatar`, `botavatar`, `assistantavatar`, `agentavatar`, `aipersona`, `botpersona`, `assistantpersona`, `aiidentity`, `botidentity`, `nonhuman`. A bare `bot` token is deliberately NOT used (it would false-fire on "bottom"/"robot"). Three outcomes: AI-marker present + identity label co-located → `info`; AI-marker present + no co-located identity label → `warning`; no AI-marker anywhere → no finding.',
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/ai-governance-bot-identity-labeling.md",
    rationale: `Why it matters

Users have a right to know when they are interacting with an AI rather than a human. HAX G1 (IBM Human-AI Experience guidelines, "Make clear what the system can do") and the Google PAIR "Set expectations" guidance — echoed by emerging disclosure regulation (EU AI Act transparency obligations) — call for conversational AI surfaces to clearly label the agent as non-human, preventing deceptive anthropomorphism.

A dedicated, reusable non-human identity affordance (a bot/AI avatar or a labeled persona) gives teams a consistent, accessible way to disclose the agent's nature. Without one, teams ship human-looking avatars with no disclosure, or hand-roll inconsistent labels.

The rule uses per-file co-location and distinctive compound vocabulary: an identity label only earns credit when it lives in the same file as an AI-marker component or JSX tag, and only compound names (AiAvatar, BotPersona, NonHumanBadge) match — a generic Avatar primitive does not. The rule fires only when at least one AI-marker file exists — a design system with no AI surface is not penalized.`,
    examples: [
      {
        good: "// AiChat.tsx — non-human identity label co-located with AI marker\nexport const AILabel = () => null;\nexport const AiAvatar = () => null;",
        bad: "// AILabel.tsx — AI marker present but no non-human identity label shipped anywhere",
      },
      {
        good: "// Assistant.tsx — exposes a labeled bot persona alongside the AI badge\nexport const AIBadge = () => null;\nexport const BotPersona = () => null;",
        bad: "// Avatar.tsx — generic user avatar primitive, no AI marker in the file → does not count",
      },
    ],
    allowlist: [
      "repos containing `lyse-disable ai-governance/bot-identity-labeling` in an adjacent README or `.lyse.yaml` — rule is N/A",
      "repos with no AI-marker component — no AI surface detected, rule emits nothing",
      "files larger than 1 MB — skipped to avoid pathological cases",
      "files under `node_modules/`, `dist/`, `build/`, `.git/`, `.next/`, `out/`, `coverage/`",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});
