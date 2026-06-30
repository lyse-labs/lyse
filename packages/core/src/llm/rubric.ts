import type { AxisName, RuleId } from "../types.js";

export interface RubricDimension {
  key: string;
  axis: AxisName;
  ruleId: RuleId;
  title: string;
  question: string;
  scale: string;
  evidence: string;
  prompt: string;
  guidelines: string[];
}

// Canonical guideline ids from Microsoft HAX G1–G18 and Google PAIR chapters.
export const VALID_GUIDELINE_IDS: ReadonlySet<string> = new Set([
  // Microsoft HAX (Human-AI Experience) guidelines G1–G18
  "HAX G1",
  "HAX G2",
  "HAX G3",
  "HAX G4",
  "HAX G5",
  "HAX G6",
  "HAX G7",
  "HAX G8",
  "HAX G9",
  "HAX G10",
  "HAX G11",
  "HAX G12",
  "HAX G13",
  "HAX G14",
  "HAX G15",
  "HAX G16",
  "HAX G17",
  "HAX G18",
  // Google PAIR Guidebook chapters
  "PAIR Explainability",
  "PAIR Human Control",
  "PAIR Safety",
  "PAIR Feedback",
  "PAIR Augmentation",
  "PAIR Error Recovery",
  "PAIR Onboarding",
  "PAIR Data",
]);

// Dimension key → canonical guideline ids (HAX G1–G18 / Google PAIR chapters).
export const GUIDELINE_TRACEABILITY_MAP: Readonly<Record<string, readonly string[]>> = {
  "recovery-flow-behavioral": ["HAX G7", "PAIR Error Recovery"],
};

const EVIDENCE_CONTRACT = [
  "",
  "## Evidence contract (mandatory)",
  "Every finding MUST cite a real file path and an exact code snippet (at least 20 characters) copied verbatim from that file. Do not paraphrase the snippet.",
  "Return ONLY valid JSON, no markdown and no prose, matching:",
  '{ "findings": [ { "ruleId": string, "axis": "ai-governance", "severity": "error"|"warning"|"info", "file": string, "line": number, "column": number, "snippet": string, "message": string } ] }',
  'If you find no violation for this dimension, return exactly: { "findings": [] }',
  "Score conservatively: when evidence is ambiguous, do not emit a finding.",
].join("\n");

function buildDimensionPrompt(parts: {
  ruleId: string;
  title: string;
  question: string;
  scale: string;
  evidence: string;
  instructions: string[];
  guidelineIds: readonly string[];
}): string {
  return [
    `# Dimension: ${parts.title}`,
    `Rule id to attach to every finding: ${parts.ruleId}`,
    `Canonical guidelines: ${parts.guidelineIds.join(" / ")}`,
    "",
    "## Canonical question",
    parts.question,
    "",
    "## Scoring scale",
    parts.scale,
    "",
    "## Evidence you MUST cite",
    parts.evidence,
    "",
    "## How to judge",
    ...parts.instructions.map((s) => `- ${s}`),
    `- When emitting a finding message, cite the guideline id(s) that the violation contravenes: ${parts.guidelineIds.join(", ")}.`,
    EVIDENCE_CONTRACT,
  ].join("\n");
}

const DIMENSIONS: RubricDimension[] = [
  {
    key: "recovery-flow-behavioral",
    axis: "ai-governance",
    ruleId: "ai-governance/ai-loading-error-states",
    title: "AI error recovery flow (behavioral)",
    question:
      "When an AI operation fails, is a recovery affordance (retry, regenerate, fallback action) actually wired to the AI error state — and does a graceful degradation path exist so the user is never left at a dead end?",
    scale:
      "0 = no recovery path; error state is a dead end with no user action; 1 = error state exists but offers no actionable affordance; 2 = affordance present but not wired to an actual retry/fallback handler; 3 = retry or regenerate affordance is wired to the AI call AND a graceful degradation path (fallback content or clear next step) is available.",
    evidence:
      "The AI error state component AND the recovery affordance (button, link, or handler) wired to it. Cite both the error state and the retry/fallback handler; an error state with no handler or with a handler that does not trigger a retry or provide a fallback path scores low.",
    prompt: buildDimensionPrompt({
      ruleId: "ai-governance/ai-loading-error-states",
      title: "AI error recovery flow (behavioral)",
      question:
        "Is a retry or regenerate affordance wired to the AI error state, and does a graceful degradation path exist?",
      scale:
        "0 = dead-end error, no recovery; 1 = error state with no affordance; 2 = affordance not wired; 3 = wired retry/regenerate + graceful degradation.",
      evidence:
        "Cite the AI error state component and the retry/fallback handler that connects it to the AI request or provides a path forward.",
      instructions: [
        "An AI error state with no retry button, regenerate action, or fallback content is a dead end — flag it as a recovery gap.",
        "Look for onClick/onRetry handlers, regenerate callbacks, or fallback content paths that the error state triggers or links to.",
        "A retry handler that merely dismisses the error without re-invoking the AI call or providing fallback content does NOT satisfy the requirement.",
        "Graceful degradation includes: showing cached/previous output, offering a manual fallback path, or navigating the user to an alternative action.",
        "Do not re-check static presence of the error component (that is the Track 3.7 static rule's job); focus only on whether recovery is wired and a path forward exists.",
        "If a retry or regenerate handler is demonstrably wired to the AI call, cite it as proof and do not flag.",
      ],
      guidelineIds: GUIDELINE_TRACEABILITY_MAP["recovery-flow-behavioral"]!,
    }),
    guidelines: [...GUIDELINE_TRACEABILITY_MAP["recovery-flow-behavioral"]!],
  },
];

export function getRubricDimensions(): RubricDimension[] {
  return DIMENSIONS.map((d) => ({ ...d, guidelines: [...d.guidelines] }));
}
