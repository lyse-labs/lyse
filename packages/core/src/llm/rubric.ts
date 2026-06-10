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
}): string {
  return [
    `# Dimension: ${parts.title}`,
    `Rule id to attach to every finding: ${parts.ruleId}`,
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
    EVIDENCE_CONTRACT,
  ].join("\n");
}

const DIMENSIONS: RubricDimension[] = [
  {
    key: "human-control-enforced",
    axis: "ai-governance",
    ruleId: "ai-governance/human-control-affordances",
    title: "Human control actually enforced",
    question:
      "Is a human-control affordance (cancel, undo, edit, approve, stop, override) not merely present in the UI but actually wired to the AI action it governs?",
    scale:
      "0 = no control; 1 = control rendered but not wired to any AI call/state; 2 = control wired but bypassable or no confirmed effect; 3 = control wired to the AI action with a confirmed effect (handler cancels/undoes/gates the AI output).",
    evidence:
      "The control element AND the handler/binding (onClick, onCancel, abort signal, mutation gate) that connects it to the AI request, generation, or commit. Cite both the affordance and the wiring; a button with no handler scores low.",
    prompt: buildDimensionPrompt({
      ruleId: "ai-governance/human-control-affordances",
      title: "Human control actually enforced",
      question:
        "Is a human-control affordance (cancel, undo, edit, approve, stop, override) not merely present in the UI but actually wired to the AI action it governs?",
      scale:
        "0 = no control; 1 = control rendered but not wired; 2 = control wired but bypassable; 3 = control wired with confirmed effect.",
      evidence:
        "Cite the affordance element and the handler/binding that connects it to the AI request or output.",
      instructions: [
        "A control with no event handler, or whose handler does not touch the AI request/state, is NOT enforced — flag it.",
        "Look for abort/cancel signals, approval gates before commit, and undo paths that revert AI-written state.",
        "Do not flag controls that are demonstrably wired; cite the wiring line as proof.",
      ],
    }),
    guidelines: [],
  },
  {
    key: "voice-anti-anthropomorphism",
    axis: "ai-governance",
    ruleId: "ai-governance/ai-marker-anti-patterns",
    title: "Voice, tone & anti-anthropomorphism",
    question:
      "Does AI-facing copy avoid anthropomorphic framing (first-person feelings, human identity, false agency) and keep a clear machine voice?",
    scale:
      "0 = strong anthropomorphism (AI presented as a person with feelings/will); 1 = frequent anthropomorphic phrasing; 2 = occasional slips; 3 = consistently machine-honest voice (tool framing, no fake emotion or sentience).",
    evidence:
      "The exact copy string or label: e.g. 'I feel', 'I think you should', 'as your friend', human names presented as the AI's identity, or emotive first-person claims.",
    prompt: buildDimensionPrompt({
      ruleId: "ai-governance/ai-marker-anti-patterns",
      title: "Voice, tone & anti-anthropomorphism",
      question:
        "Does AI-facing copy avoid anthropomorphic framing and keep a clear machine voice?",
      scale:
        "0 = strong anthropomorphism; 1 = frequent; 2 = occasional; 3 = consistently machine-honest.",
      evidence:
        "Cite the exact copy string or label that anthropomorphizes the AI.",
      instructions: [
        "Flag first-person emotion/will ('I feel', 'I want', 'I'm happy to'), claimed sentience, or human identity framing.",
        "Do not flag neutral functional copy ('Generating…', 'AI suggestion') — that is correct machine voice.",
        "Cite the literal string from the source as the snippet.",
      ],
    }),
    guidelines: [],
  },
  {
    key: "explanation-quality",
    axis: "ai-governance",
    ruleId: "ai-governance/explainability-affordance",
    title: "Explanation quality",
    question:
      "Beyond the mere existence of an explainability affordance, does the explanation convey real, specific, actionable reasoning (inputs, confidence, why-this) rather than a generic placeholder?",
    scale:
      "0 = no explanation; 1 = affordance exists but content is empty/generic ('AI generated this'); 2 = some specifics but shallow; 3 = concrete, sourced, actionable explanation (cites inputs, factors, or confidence).",
    evidence:
      "The explanation text/template or the data bound into it. A tooltip/section that renders a constant generic string scores low; cite that string.",
    prompt: buildDimensionPrompt({
      ruleId: "ai-governance/explainability-affordance",
      title: "Explanation quality",
      question:
        "Does the explanation convey real, specific, actionable reasoning rather than a generic placeholder?",
      scale:
        "0 = none; 1 = generic placeholder; 2 = shallow specifics; 3 = concrete and sourced.",
      evidence:
        "Cite the explanation text/template or the data bound into the affordance.",
      instructions: [
        "An affordance that renders a hardcoded generic line ('This was generated by AI') is low quality — flag it.",
        "Reward explanations that surface inputs, factors, sources, or confidence; cite the binding that supplies them.",
        "Judge content quality, not the mere presence of the affordance.",
      ],
    }),
    guidelines: [],
  },
  {
    key: "risk-classification",
    axis: "ai-governance",
    ruleId: "ai-governance/disclaimer-present",
    title: "Risk classification of the AI feature",
    question:
      "Is the AI feature's risk severity correctly classified and matched with proportionate safeguards (disclaimers, confirmations, guardrails) for what it can affect?",
    scale:
      "0 = high-impact AI action with no disclaimer/guardrail; 1 = under-protected for its impact; 2 = some safeguards but not proportionate; 3 = safeguards proportionate to assessed severity.",
    evidence:
      "The AI action's effect surface (writes data, sends messages, makes decisions, handles sensitive content) AND the disclaimer/guardrail (or its absence) near it. Cite the high-impact call and the missing/weak safeguard.",
    prompt: buildDimensionPrompt({
      ruleId: "ai-governance/disclaimer-present",
      title: "Risk classification of the AI feature",
      question:
        "Is the AI feature's risk severity correctly classified and matched with proportionate safeguards?",
      scale:
        "0 = high-impact, no safeguard; 1 = under-protected; 2 = partial; 3 = proportionate.",
      evidence:
        "Cite the AI action's effect surface and the disclaimer/guardrail (or its absence).",
      instructions: [
        "Assess what the AI feature can affect (data writes, outbound messages, financial/health/legal content) and whether safeguards match.",
        "Flag high-impact actions lacking a proportionate disclaimer or confirmation.",
        "Severity of the finding should track the assessed impact: error for high-impact unguarded actions.",
      ],
    }),
    guidelines: [],
  },
  {
    key: "value-gate-judgment",
    axis: "ai-governance",
    ruleId: "ai-governance/value-gate-doc-present",
    title: "Is AI even needed (value gate)",
    question:
      "Does the AI feature pass a value gate — is there a documented justification that AI adds real value here over a deterministic/simpler solution?",
    scale:
      "0 = AI used where a deterministic solution clearly suffices, no justification; 1 = weak/absent justification; 2 = justification present but thin; 3 = clear documented value-gate rationale tied to this feature.",
    evidence:
      "The AI feature invocation AND the value-gate doc/comment justifying it (or its absence). Cite the AI call and the justification text, or the call plus the gap where justification should be.",
    prompt: buildDimensionPrompt({
      ruleId: "ai-governance/value-gate-doc-present",
      title: "Is AI even needed (value gate)",
      question:
        "Is there a documented justification that AI adds real value over a deterministic solution?",
      scale:
        "0 = unjustified AI over a deterministic alternative; 1 = weak; 2 = thin; 3 = clear documented rationale.",
      evidence:
        "Cite the AI feature invocation and the value-gate justification (or the gap).",
      instructions: [
        "Flag AI used for tasks a deterministic rule/regex/lookup would solve, with no documented rationale.",
        "Reward features with an explicit value-gate doc/comment tying AI to a need the deterministic path cannot meet.",
        "Cite the AI invocation as the snippet when justification is absent.",
      ],
    }),
    guidelines: [],
  },
];

export function getRubricDimensions(): RubricDimension[] {
  return DIMENSIONS.map((d) => ({ ...d, guidelines: [...d.guidelines] }));
}
