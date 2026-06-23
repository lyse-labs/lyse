import { describe, it, expect } from "vitest";
import { llmsTxtAdapter } from "../../../validation/adapters/ai-surface-llms-txt-structure.js";
import { evaluateAdapter } from "../../../validation/run-adapter.js";

describe("llmsTxtAdapter end-to-end (real static audit)", () => {
  it("a well-formed llms.txt is not flagged, and removing it / breaking structure is", async () => {
    const score = await evaluateAdapter(llmsTxtAdapter);
    expect(score.matrix.fp).toBe(0);   // clean llms.txt passes
    expect(score.matrix.fn).toBe(0);   // every structural break is caught
  });
}, 60_000);
