import { describe, it, expect } from "vitest";
import { evaluateAdapter } from "../../validation/run-adapter.js";
import {
  dtcgConformanceAdapter,
  deprecatedTokenUsageAdapter,
  themeModesAdapter,
  cssCustomPropertyExportAdapter,
  responsiveBreakpointsAdapter,
  containerQueryAdapter,
} from "../../validation/tokens-structural-adapters.js";
import { mediaQueryAdapter } from "../../validation/adapters/tokens-no-hardcoded-media-query.js";

describe("tokens structural adapters end-to-end", () => {
  it("dtcg-conformance: clean passes, injected violations caught (fn=0, fp=0)", async () => {
    const score = await evaluateAdapter(dtcgConformanceAdapter);
    expect(score.matrix.fn).toBe(0);
    expect(score.matrix.fp).toBe(0);
  }, 60_000);

  it("deprecated-token-usage: clean passes, alias-to-deprecated caught (fn=0, fp=0)", async () => {
    const score = await evaluateAdapter(deprecatedTokenUsageAdapter);
    expect(score.matrix.fn).toBe(0);
    expect(score.matrix.fp).toBe(0);
  }, 60_000);

  it("theme-modes-present: .dark class passes, no-mode fixture caught (fn=0, fp=0)", async () => {
    const score = await evaluateAdapter(themeModesAdapter);
    expect(score.matrix.fn).toBe(0);
    expect(score.matrix.fp).toBe(0);
  }, 60_000);

  it("css-custom-property-export: custom prop passes, no-prop fixture caught (fn=0, fp=0)", async () => {
    const score = await evaluateAdapter(cssCustomPropertyExportAdapter);
    expect(score.matrix.fn).toBe(0);
    expect(score.matrix.fp).toBe(0);
  }, 60_000);

  it("responsive-breakpoints: bp var passes, no-scale caught (fn=0, fp=0)", async () => {
    const score = await evaluateAdapter(responsiveBreakpointsAdapter);
    expect(score.matrix.fn).toBe(0);
    expect(score.matrix.fp).toBe(0);
  }, 60_000);

  it("container-query: container-type passes, no-context caught (fn=0, fp=0)", async () => {
    const score = await evaluateAdapter(containerQueryAdapter);
    expect(score.matrix.fn).toBe(0);
    expect(score.matrix.fp).toBe(0);
  }, 60_000);

  it("no-hardcoded-media-query: @media print passes, px literals caught (fn=0, fp=0)", async () => {
    const score = await evaluateAdapter(mediaQueryAdapter);
    expect(score.matrix.fn).toBe(0);
    expect(score.matrix.fp).toBe(0);
  }, 60_000);
});
