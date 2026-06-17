import { describe, it, expect } from "vitest";
import {
  findUnknownRuleIds,
  disabledRuleIds,
  applySeverityOverrides,
} from "../../src/config/rules-config.js";
import type { Finding, LyseConfig } from "../../src/types.js";

function finding(ruleId: string, severity: Finding["severity"]): Finding {
  return {
    ruleId,
    axis: "tokens",
    severity,
    location: { file: "a.tsx", line: 1, column: 1 },
    message: "m",
  };
}

const known = new Set(["tokens/no-hardcoded-color", "stories/coverage", "custom/my-rule"]);

describe("findUnknownRuleIds", () => {
  it("returns [] when no rules block is present", () => {
    expect(findUnknownRuleIds({}, known)).toEqual([]);
  });

  it("returns [] when every configured rule id is known", () => {
    const config: LyseConfig = {
      rules: { "stories/coverage": "off", "custom/my-rule": { severity: "error" } },
    };
    expect(findUnknownRuleIds(config, known)).toEqual([]);
  });

  it("returns unknown rule ids, sorted", () => {
    const config: LyseConfig = {
      rules: { "zzz/typo": "off", "aaa/nope": "off", "stories/coverage": "off" },
    };
    expect(findUnknownRuleIds(config, known)).toEqual(["aaa/nope", "zzz/typo"]);
  });
});

describe("disabledRuleIds", () => {
  it("treats the `off` string literal as disabled", () => {
    const config: LyseConfig = { rules: { "stories/coverage": "off" } };
    expect(disabledRuleIds(config)).toEqual(new Set(["stories/coverage"]));
  });

  it("treats `{ severity: 'off' }` as disabled", () => {
    const config: LyseConfig = { rules: { "tokens/no-hardcoded-color": { severity: "off" } } };
    expect(disabledRuleIds(config)).toEqual(new Set(["tokens/no-hardcoded-color"]));
  });

  it("does not disable a rule whose severity is overridden to a real level", () => {
    const config: LyseConfig = { rules: { "tokens/no-hardcoded-color": { severity: "error" } } };
    expect(disabledRuleIds(config)).toEqual(new Set());
  });

  it("does not disable a rule that only sets options", () => {
    const config: LyseConfig = { rules: { "tokens/no-hardcoded-color": { tolerance: 8 } } };
    expect(disabledRuleIds(config)).toEqual(new Set());
  });

  it("returns an empty set when no rules block is present", () => {
    expect(disabledRuleIds({})).toEqual(new Set());
  });
});

describe("applySeverityOverrides", () => {
  it("remaps a finding's severity to the configured level", () => {
    const config: LyseConfig = { rules: { "tokens/no-hardcoded-color": { severity: "error" } } };
    const out = applySeverityOverrides([finding("tokens/no-hardcoded-color", "warning")], config);
    expect(out[0]!.severity).toBe("error");
  });

  it("leaves findings without an override untouched", () => {
    const config: LyseConfig = { rules: { "tokens/no-hardcoded-color": { severity: "error" } } };
    const out = applySeverityOverrides([finding("stories/coverage", "info")], config);
    expect(out[0]!.severity).toBe("info");
  });

  it("ignores `off` (handled by disabledRuleIds, never reaches here)", () => {
    const config: LyseConfig = { rules: { "tokens/no-hardcoded-color": { severity: "off" } } };
    const out = applySeverityOverrides([finding("tokens/no-hardcoded-color", "warning")], config);
    expect(out[0]!.severity).toBe("warning");
  });

  it("ignores the `off` string-literal entry", () => {
    const config: LyseConfig = { rules: { "tokens/no-hardcoded-color": "off" } };
    const out = applySeverityOverrides([finding("tokens/no-hardcoded-color", "warning")], config);
    expect(out[0]!.severity).toBe("warning");
  });

  it("returns the same array reference when no rules block is present (no-op fast path)", () => {
    const input = [finding("tokens/no-hardcoded-color", "warning")];
    expect(applySeverityOverrides(input, {})).toBe(input);
  });

  it("does not mutate the input findings", () => {
    const config: LyseConfig = { rules: { "tokens/no-hardcoded-color": { severity: "error" } } };
    const input = [finding("tokens/no-hardcoded-color", "warning")];
    applySeverityOverrides(input, config);
    expect(input[0]!.severity).toBe("warning");
  });
});
