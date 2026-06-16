import { describe, it, expect } from "vitest";
import { findUnknownRuleIds, disabledRuleIds } from "../../src/config/rules-config.js";
import type { LyseConfig } from "../../src/types.js";

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
