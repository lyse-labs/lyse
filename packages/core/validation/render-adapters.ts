import { withChromium } from "../src/render/browser.js";
import { buildDtcgCanonicalMap, cssVarToTokenPath } from "../src/render/dtcg-canonical-map.js";
import { probeComputedTokens } from "../src/render/token-probe.js";
import { detectModeSelectors } from "../src/render/token-source-map.js";
import { detectRenderDrift } from "../src/rules/tokens-rendered-token-fidelity.js";
import { emptyMatrix, addObservation, youdensJ } from "./score.js";
import type { OracleAdapter, RuleScore } from "./types.js";

// Canonical map: DTCG JSON with color/bg = #ffffff.
// cssVarToTokenPath("--color-bg") → "color/bg", so probed readings for
// "--color-bg" will be compared against "#ffffff" in the canonical map.
const DTCG_JSON = { color: { bg: { $value: "#ffffff" } } };
const CANONICAL_MAP = buildDtcgCanonicalMap(DTCG_JSON);

// Clean fixture: single :root declaration — browser computes #ffffff for
// --color-bg, which matches the canonical #ffffff → TN (not flagged).
const CLEAN_CSS = `:root { --color-bg: #ffffff; }`;

// Drift fixture (var-indirection): --brand is set to #ff0000 and --color-bg
// is set to var(--brand). The browser resolves var() at computed-style time,
// so getPropertyValue("--color-bg") returns "#ff0000" — different from the
// canonical "#ffffff". Static analysis cannot see this mismatch because the
// source declaration is syntactically correct; only a real browser reveals it.
//
// Empirically verified: Chromium resolves var() references for custom
// properties, so getPropertyValue returns the computed value "#ff0000",
// not the raw "var(--brand)".
const DRIFT_CSS = `:root { --brand: #ff0000; --color-bg: var(--brand); }`;

async function probe(css: string): Promise<ReturnType<typeof detectRenderDrift>> {
  const readings = await withChromium((page) =>
    probeComputedTokens(page, css, ["--color-bg"], detectModeSelectors(css)),
  );
  return detectRenderDrift(CANONICAL_MAP, readings, cssVarToTokenPath);
}

/**
 * Execution-oracle for tokens/rendered-token-fidelity.
 *
 * Drives two HTML fixtures through real Chromium to obtain computed
 * custom-property values, then runs detectRenderDrift to classify each:
 *
 *   TN — CLEAN_CSS: browser computes #ffffff for --color-bg, matches
 *        canonical → not flagged (label=false, predicted=false).
 *   TP — DRIFT_CSS: browser resolves var(--brand) to #ff0000, which
 *        differs from canonical #ffffff → flagged (label=true, predicted=true).
 *
 * The var-indirection drift is genuinely static-invisible: the source
 * declaration is syntactically valid; only the browser-computed value
 * reveals the mismatch. This is the exact failure mode the rule is designed
 * to catch (design→CSS drift via cascade/override/alias).
 *
 * Throws RenderUnavailableError when Playwright/Chromium is absent; callers
 * (tests) catch this and skip.
 */
export async function evaluateRenderAdapter(): Promise<RuleScore> {
  let matrix = emptyMatrix();

  // TN: clean fixture — computed #ffffff matches canonical #ffffff → not flagged.
  const cleanFindings = await probe(CLEAN_CSS);
  matrix = addObservation(matrix, false, cleanFindings.length > 0);

  // TP: drift fixture — computed #ff0000 ≠ canonical #ffffff → flagged.
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
