import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { detectReservedAiTokens } from "../../src/parsers/ai-tokens.js";

// Recall-validation corpus (#139 / #71): real, vendored, attributed slices of
// OSS design systems with verified AI-governance tokens. A deliberate mix of
// the SCSS-compiled "hard" case (Carbon — tokens live in source only as
// `theme.$ai-*`; `--cds-ai-*` is compile-only) and the literal "easy" case
// (Cloudscape — `$*-gen-ai`), plus a negative control for precision.
const corpusDir = (name: string): string =>
  fileURLToPath(new URL(`../fixtures/recall-corpus/${name}`, import.meta.url));

describe("AI-token detection recall against real OSS design systems (#139)", () => {
  it("detects IBM Carbon's AI tokens (SCSS source + compiled CSS)", () => {
    const found = detectReservedAiTokens(corpusDir("carbon"));
    // `ai-aura-*` is the AI-distinctive signature that clears the precision gate.
    expect(found.some((t) => /ai-aura/.test(t))).toBe(true);
    // both the SCSS-source form ($ai-*) and the compiled-CSS form (--cds-ai-*) are caught
    expect(found.some((t) => t.startsWith("$ai-aura"))).toBe(true);
    expect(found.some((t) => t.startsWith("--cds-ai-aura"))).toBe(true);
  });

  it("detects AWS Cloudscape's gen-ai tokens (literal SCSS)", () => {
    const found = detectReservedAiTokens(corpusDir("cloudscape"));
    expect(found.some((t) => /gen-ai/.test(t))).toBe(true);
  });

  it("precision control: a non-AI DS (Mantine ActionIcon vars + Primer) yields no detections", () => {
    expect(detectReservedAiTokens(corpusDir("negative"))).toEqual([]);
  });

  it("recall summary: every AI-positive DS in the corpus is detected", () => {
    const positives = ["carbon", "cloudscape"];
    const detectedCount = positives.filter((d) => detectReservedAiTokens(corpusDir(d)).length > 0).length;
    expect(detectedCount / positives.length).toBeGreaterThanOrEqual(0.9);
  });
});
