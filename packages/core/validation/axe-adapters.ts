import { withChromium } from "../src/render/browser.js";
import { injectAndRunAxe } from "../src/render/axe-runner.js";
import { detectAxeFindings } from "../src/rules/a11y-runtime-axe.js";
import { emptyMatrix, addObservation, youdensJ } from "./score.js";
import type { RuleScore } from "./types.js";

// Constrain axe to a single rule so the construction labels are exact and
// deterministic (axe's full ruleset would also flag missing <title>, etc.).
const IMAGE_ALT_ONLY = { runOnly: { type: "rule", values: ["image-alt"] } };

// TN: img has alt → no image-alt violation → not flagged.
const CLEAN_HTML = `<!doctype html><html lang="en"><head><title>t</title></head><body><img src="x.png" alt="a logo"></body></html>`;
// TP: img has no alt → image-alt violation → flagged.
const VIOLATION_HTML = `<!doctype html><html lang="en"><head><title>t</title></head><body><img src="x.png"></body></html>`;

async function probe(html: string): Promise<ReturnType<typeof detectAxeFindings>> {
  const violations = await withChromium(async (page) => {
    await page.setContent(html);
    return injectAndRunAxe(page, IMAGE_ALT_ONLY);
  });
  return detectAxeFindings(violations);
}

/**
 * Execution-oracle for a11y/runtime-axe. Drives a known-violation DOM and a
 * clean DOM through real Chromium + axe-core, then runs detectAxeFindings to
 * classify each (TP/TN). Throws RenderUnavailableError when Chromium is absent;
 * callers (tests) catch and skip. Runs in the render lane, not the static runner.
 */
export async function evaluateAxeAdapter(): Promise<RuleScore> {
  let matrix = emptyMatrix();

  const clean = await probe(CLEAN_HTML);
  matrix = addObservation(matrix, false, clean.length > 0);

  const bad = await probe(VIOLATION_HTML);
  matrix = addObservation(matrix, true, bad.length > 0);

  return {
    ruleId: "a11y/runtime-axe",
    oracleKind: "execution",
    matrix,
    youdensJ: youdensJ(matrix),
    metamorphicInconsistencies: [],
    mutationsRun: 1,
  };
}
