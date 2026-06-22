import { withChromium } from "../src/render/browser.js";
import { probeComputedTokens } from "../src/render/token-probe.js";
import { detectModeSelectors } from "../src/render/token-source-map.js";
import { detectRenderDrift } from "../src/rules/tokens-rendered-token-fidelity.js";
import { emptyMatrix, addObservation, youdensJ } from "./score.js";
import type { OracleAdapter, RuleScore } from "./types.js";

// Clean fixture: single canonical declaration — computed value matches source.
const CLEAN_CSS = `:root { --color-bg: #ffffff; }`;

// Drift fixture: a later :root block overrides the token.
// The browser cascade resolves to #ff0000 (later decl wins), while the
// canonical source (CLEAN_CSS) declares #ffffff — detectRenderDrift sees
// the mismatch and emits a warning.
const DRIFT_CSS = `:root { --color-bg: #ffffff; } :root { --color-bg: #ff0000; }`;

async function probe(renderedCss: string): Promise<ReturnType<typeof detectRenderDrift>> {
  const readings = await withChromium((page) =>
    probeComputedTokens(page, renderedCss, ["--color-bg"], detectModeSelectors(renderedCss)),
  );
  // Canonical source is always the clean single-declaration CSS so that the
  // drift case (DRIFT_CSS) produces a genuine mismatch vs the source map.
  return detectRenderDrift(CLEAN_CSS, readings);
}

/**
 * Execution-oracle for tokens/rendered-token-fidelity.
 *
 * Constructs two HTML fixtures and drives them through the real Chromium
 * browser to obtain computed custom-property values, then runs detectRenderDrift
 * to classify each observation:
 *
 *   TN — CLEAN_CSS: computed #ffffff matches canonical #ffffff → not flagged.
 *   TP — DRIFT_CSS: computed #ff0000 differs from canonical #ffffff → flagged.
 *
 * Throws RenderUnavailableError when Playwright/Chromium is absent; callers
 * (tests) catch this and skip.
 */
export async function evaluateRenderAdapter(): Promise<RuleScore> {
  let matrix = emptyMatrix();

  // TN: clean fixture — no drift expected, must not be flagged (label=false).
  const cleanFindings = await probe(CLEAN_CSS);
  matrix = addObservation(matrix, false, cleanFindings.length > 0);

  // TP: drift fixture — override drift expected, must be flagged (label=true).
  const driftFindings = await probe(DRIFT_CSS);
  matrix = addObservation(matrix, true, driftFindings.length > 0);

  return {
    ruleId: "tokens/rendered-token-fidelity",
    oracleKind: "execution",
    matrix,
    youdensJ: youdensJ(matrix),
    metamorphicInconsistencies: [],
    mutationsRun: 1,
  };
}

/**
 * Execution adapters run via evaluateRenderAdapter() in their own test lane,
 * not through the static evaluateAdapter() runner (which has no browser).
 * This array stays empty so the static overnight run (validate:autonomous)
 * does not acquire a Chromium dependency.
 */
export const renderAdapters: OracleAdapter[] = [];
