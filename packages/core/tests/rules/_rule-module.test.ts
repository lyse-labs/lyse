import { describe, it, expect } from "vitest";
import { createLyseRule } from "../../src/rules/_rule-module.js";
import type {
  Rule,
  RuleContext,
  ParsedFiles,
  RuleEvalResult,
  Finding,
  ClassifyContext,
  Confidence,
  CodemodContext,
  CodemodResult,
} from "../../src/types.js";

const emptyCtx: RuleContext = {
  repoRoot: "/tmp/repo",
  tokens: null,
  componentsModule: null,
  componentInventory: [],
  storyIndex: null,
  excludePaths: [],
};

const emptyFiles: ParsedFiles = { ts: [], css: [], cssInJs: [] };

describe("rules/_rule-module", () => {
  it("createLyseRule produces a Rule with id, axis, and evaluate", () => {
    const rule = createLyseRule({
      meta: {
        axis: "tokens",
        defaultSeverity: "warning",
        lyseRuleId: "test/noop",
        docs: {
          shortDescription: "No-op rule used to validate the adapter",
          helpUri: "https://example.invalid/rules/test/noop",
        },
        messages: {
          noop: "Should never be reported.",
        },
      },
      defaultOptions: [],
      create: () => ({
        async evaluate(_c, _f): Promise<RuleEvalResult> {
          return { findings: [], opportunities: 0 };
        },
      }),
    });

    expect(rule.id).toBe("test/noop");
    expect(rule.axis).toBe("tokens");
    expect(typeof rule.evaluate).toBe("function");
    expect(rule.classifyConfidence).toBeUndefined();
    expect(rule.applyCodemod).toBeUndefined();
  });

  it("evaluate() returns the expected empty result", async () => {
    const rule = createLyseRule({
      meta: {
        axis: "components",
        defaultSeverity: "info",
        lyseRuleId: "test/noop",
        docs: { shortDescription: "noop", helpUri: "https://example.invalid" },
        messages: { noop: "noop" },
      },
      defaultOptions: [],
      create: () => ({
        async evaluate(): Promise<RuleEvalResult> {
          return { findings: [], opportunities: 0 };
        },
      }),
    });

    const result = await rule.evaluate(emptyCtx, emptyFiles);
    expect(result).toEqual({ findings: [], opportunities: 0 });
  });

  it("findings parity with an equivalent legacy Rule object", async () => {
    const sharedEvaluate = async (
      _ctx: RuleContext,
      _files: ParsedFiles,
    ): Promise<RuleEvalResult> => {
      const findings: Finding[] = [
        {
          ruleId: "test/sample",
          axis: "tokens",
          severity: "warning",
          location: { file: "src/a.ts", line: 1, column: 1 },
          message: "sample finding",
        },
      ];
      return { findings, opportunities: 3 };
    };

    const legacy: Rule = {
      id: "test/sample",
      axis: "tokens",
      evaluate: sharedEvaluate,
    };

    const modern = createLyseRule({
      meta: {
        axis: "tokens",
        defaultSeverity: "warning",
        lyseRuleId: "test/sample",
        docs: { shortDescription: "sample", helpUri: "https://example.invalid" },
        messages: { sample: "sample finding" },
      },
      defaultOptions: [],
      create: () => ({ evaluate: sharedEvaluate }),
    });

    const legacyResult = await legacy.evaluate(emptyCtx, emptyFiles);
    const modernResult = await modern.evaluate(emptyCtx, emptyFiles);
    expect(modernResult).toEqual(legacyResult);
    expect(modern.id).toBe(legacy.id);
    expect(modern.axis).toBe(legacy.axis);
  });

  it("optional classifyConfidence and applyCodemod are forwarded when present", () => {
    const classifyConfidence = (_f: Finding, _c: ClassifyContext): Confidence => "high";
    const applyCodemod = (_f: Finding, _c: CodemodContext): CodemodResult => ({
      diff: "",
      importsAdded: [],
      confidence: "high",
    });

    const both = createLyseRule({
      meta: {
        axis: "a11y",
        defaultSeverity: "error",
        lyseRuleId: "test/both",
        docs: { shortDescription: "x", helpUri: "https://example.invalid" },
        messages: { x: "x" },
      },
      defaultOptions: [],
      create: () => ({
        async evaluate(): Promise<RuleEvalResult> {
          return { findings: [], opportunities: 0 };
        },
      }),
      classifyConfidence,
      applyCodemod,
    });

    expect(both.classifyConfidence).toBe(classifyConfidence);
    expect(both.applyCodemod).toBe(applyCodemod);

    const neither = createLyseRule({
      meta: {
        axis: "a11y",
        defaultSeverity: "error",
        lyseRuleId: "test/neither",
        docs: { shortDescription: "x", helpUri: "https://example.invalid" },
        messages: { x: "x" },
      },
      defaultOptions: [],
      create: () => ({
        async evaluate(): Promise<RuleEvalResult> {
          return { findings: [], opportunities: 0 };
        },
      }),
    });

    expect(neither.classifyConfidence).toBeUndefined();
    expect(neither.applyCodemod).toBeUndefined();
    expect("classifyConfidence" in neither).toBe(false);
    expect("applyCodemod" in neither).toBe(false);
  });

  it("accepts and discards docs/messages/defaultOptions metadata without runtime side-effects", () => {
    const rule = createLyseRule({
      meta: {
        axis: "tokens",
        defaultSeverity: "warning",
        lyseRuleId: "test/metadata",
        docs: { shortDescription: "with meta", helpUri: "https://example.invalid" },
        messages: { a: "a", b: "b" },
      },
      defaultOptions: [{ threshold: 5 }] as const,
      create: () => ({
        async evaluate(): Promise<RuleEvalResult> {
          return { findings: [], opportunities: 0 };
        },
      }),
    });

    expect(Object.keys(rule).sort()).toEqual(["axis", "evaluate", "id"]);
  });
});
