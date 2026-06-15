import { join } from "node:path";
import fg from "fast-glob";
import {
  scanForMarkerComponents,
  safeReadText,
  deriveComponentNameFromPath,
  extractNamesFromSource,
  COMPONENT_GLOB,
  SCAN_IGNORE,
} from "../rules/ai-governance-ai-marker-component-present.js";
import { detectReservedAiTokens } from "../parsers/ai-tokens.js";
import { scanForFeedbackControls } from "../rules/ai-governance-feedback-control-present.js";
import {
  detectNamedLoadingWithText,
  detectAiErrorState,
} from "../rules/ai-governance-ai-loading-error-states.js";
import {
  detectLiveRegion,
  detectAiOutputSurface,
} from "../rules/ai-governance-ai-content-live-region.js";
import type { GovernanceSignals } from "./governance-maturity.js";

/**
 * Extracts the deterministic AI-governance maturity signals from a repo by
 * reusing the governance rules' presence detectors (Track #72 / #155). Covers
 * L0–L3:
 *  - hasReservedAiTokens / hasMarkerComponent  → L1 / L2
 *  - hasInteractionAffordance (loading-error, feedback, live-region) → L3
 * hasGovernanceAffordance (L4) is left false here — those signals are
 * LLM-driven (disclaimer / explainability / human-control) and belong to the
 * conformal tier, not the deterministic pass.
 */
export function extractGovernanceSignals(repoRoot: string): GovernanceSignals {
  const hasMarkerComponent = scanForMarkerComponents(repoRoot).length > 0;
  const hasReservedAiTokens = detectReservedAiTokens(repoRoot).length > 0;
  const hasInteractionAffordance = detectInteractionAffordance(repoRoot);

  return {
    hasMarkerComponent,
    hasReservedAiTokens,
    hasInteractionAffordance,
    hasGovernanceAffordance: false,
  };
}

// Lines worth feeding the semantic maturity judge — AI markers, generative-AI
// tokens, interaction/live-region attributes, governance vocabulary.
const AI_CONTEXT_RE =
  /generative ai|gen-ai|genai|copilot|ai-label|ailabel|aibadge|aria-live|role\s*=\s*["'`](status|alert)|streaming|isGenerating|disclaimer|explainab|responsible ai/i;

/**
 * Gather a bounded, deterministic slice of AI-relevant source lines for the LLM
 * maturity judge (Track #155). Sorted files + deduped lines + a hard cap keep it
 * stable and small. Returns "" when the repo has no AI-relevant content.
 */
export function gatherAiContext(repoRoot: string, maxLines = 200): string {
  let files: string[] = [];
  try {
    files = fg.sync(["**/*.{tsx,jsx,vue,css,scss,json,md,mdx}"], {
      cwd: repoRoot,
      absolute: false,
      dot: false,
      ignore: SCAN_IGNORE,
      onlyFiles: true,
      unique: true,
    });
  } catch {
    return "";
  }

  const lines = new Set<string>();
  for (const rel of files.sort()) {
    if (lines.size >= maxLines) break;
    const src = safeReadText(join(repoRoot, rel));
    if (!src) continue;
    for (const raw of src.split("\n")) {
      if (!AI_CONTEXT_RE.test(raw)) continue;
      lines.add(raw.trim().slice(0, 200));
      if (lines.size >= maxLines) break;
    }
  }
  return [...lines].join("\n");
}

function detectInteractionAffordance(repoRoot: string): boolean {
  // Feedback controls (repo-level, already AI-co-located by the rule).
  if (scanForFeedbackControls(repoRoot).names.length > 0) return true;

  let files: string[] = [];
  try {
    files = fg.sync(COMPONENT_GLOB, {
      cwd: repoRoot,
      absolute: false,
      dot: false,
      ignore: SCAN_IGNORE,
      onlyFiles: true,
      unique: true,
    });
  } catch {
    return false;
  }

  for (const rel of files) {
    const source = safeReadText(join(repoRoot, rel));
    if (!source) continue;

    // AI loading / error state — named component check (path + exported names).
    const candidates = [deriveComponentNameFromPath(rel), ...extractNamesFromSource(source)];
    for (const name of candidates) {
      if (detectNamedLoadingWithText(source, name) || detectAiErrorState(source, name)) {
        return true;
      }
    }

    // AI content live region — a live-region attribute wrapping an AI surface.
    if (detectLiveRegion(source) && detectAiOutputSurface(source, repoRoot)) {
      return true;
    }
  }

  return false;
}
