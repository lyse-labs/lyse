import { describe, it, expect } from "vitest";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { safeParseLyseConfig } from "../../src/config/schema.js";

// The published JSON schema (schemas/v1/lyse-config.json) must agree with the
// zod contract (LyseConfigSchema) on a battery of representative configs.
// This is the anti-drift guard: a field added to one but not the other makes
// these cases disagree and fails the build. It deliberately exercises the
// fields that previously drifted — scoring, i18n, the rules "off"/severity/
// tolerance/disable union, and the full llm provider/connector enums — which
// the old schema false-rejected.

const __dirname = dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(
  readFileSync(join(__dirname, "../../schemas/v1/lyse-config.json"), "utf8"),
);

function makeValidator(): (data: unknown) => boolean {
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  const v = ajv.compile(schema);
  return (data: unknown) => v(data) === true;
}

const VALID: ReadonlyArray<[string, unknown]> = [
  ["empty", {}],
  ["designSystem full", { designSystem: { componentsModule: "@org/ui", elements: { Button: "Button" }, excludePaths: ["legacy/**"] } }],
  ["rules off literal", { rules: { "stories/coverage": "off" } }],
  ["rules severity", { rules: { "tokens/no-hardcoded-color": { severity: "warning" } } }],
  ["rules tolerance", { rules: { "tokens/no-hardcoded-color": { tolerance: 5 } } }],
  ["rules disable", { rules: { "a11y/essentials": { disable: ["alt-text"] } } }],
  ["scoring grace window", { scoring: { aiGovernanceGraceWindow: 3 } }],
  ["i18n locales + vocabulary", { i18n: { locales: ["fr"], vocabulary: { aiNouns: ["assistant"], disclaimerPhrases: ["beta"], controlLabels: ["undo"], gatePhrases: ["confirm"], loadingPhrases: ["thinking"] } } }],
  ["llm provider agent-cli", { llm: { provider: "agent-cli", connector: "agent-cli" } }],
  ["llm provider none (deprecated but accepted)", { llm: { provider: "none" } }],
  ["llm full", { llm: { provider: "anthropic", model: "claude", endpoint: "https://x", connector: "direct-api-key", costCapUsd: 1, cacheMaxAgeDays: 7, staticOnly: false } }],
];

const INVALID: ReadonlyArray<[string, unknown]> = [
  ["bad rule severity", { rules: { "x/y": { severity: "fatal" } } }],
  ["bad llm provider", { llm: { provider: "gemini" } }],
  ["bad llm connector", { llm: { connector: "smoke-signals" } }],
  ["costCapUsd not positive", { llm: { costCapUsd: 0 } }],
  ["grace window below min", { scoring: { aiGovernanceGraceWindow: 0 } }],
  ["tolerance wrong type", { rules: { "x/y": { tolerance: "lots" } } }],
];

describe("lyse-config.json ↔ zod contract parity", () => {
  const validateJson = makeValidator();

  it.each(VALID)("accepts (both): %s", (_name, cfg) => {
    expect(safeParseLyseConfig(cfg).ok, "zod").toBe(true);
    expect(validateJson(cfg), "json-schema").toBe(true);
  });

  it.each(INVALID)("rejects (both): %s", (_name, cfg) => {
    expect(safeParseLyseConfig(cfg).ok, "zod").toBe(false);
    expect(validateJson(cfg), "json-schema").toBe(false);
  });
});
