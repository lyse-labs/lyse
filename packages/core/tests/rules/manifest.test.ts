import { describe, it, expect } from "vitest";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RULE_MANIFEST_OBJECT, RULE_METADATA, findRuleMeta } from "../../src/rules/manifest.js";
import { ruleObjects } from "../../src/rules/registry.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("RULE_MANIFEST_OBJECT", () => {
  it("has exactly 14 rules", () => {
    expect(RULE_METADATA).toHaveLength(14);
  });

  it("each rule has all required fields", () => {
    for (const r of RULE_METADATA) {
      expect(r.id).toBeTruthy();
      expect(["tokens", "a11y", "components", "stories", "ai-surface"]).toContain(r.axis);
      expect(["error", "warning", "info"]).toContain(r.defaultSeverity);
      expect(r.shortDescription.length).toBeGreaterThan(0);
      expect(r.fullDescription.length).toBeGreaterThan(0);
      expect(r.helpUri).toMatch(/^https?:/);
      expect(r.rationale.length).toBeGreaterThan(0);
      expect(r.examples.length).toBeGreaterThan(0);
    }
  });

  it("validates against lyse-rules.json schema", () => {
    const ajv = new Ajv2020({ strict: false });
    addFormats(ajv);
    const schema = JSON.parse(
      readFileSync(join(__dirname, "../../schemas/v1/lyse-rules.json"), "utf8"),
    );
    const validate = ajv.compile(schema);
    const valid = validate(RULE_MANIFEST_OBJECT);
    if (!valid) console.error(validate.errors);
    expect(valid).toBe(true);
  });

  it("findRuleMeta returns correct rule for known id and undefined for unknown", async () => {
    const { findRuleMeta } = await import("../../src/rules/manifest.js");
    expect(findRuleMeta("tokens/no-hardcoded-color")?.axis).toBe("tokens");
    expect(findRuleMeta("not-real")).toBeUndefined();
  });

  it("every rule in ruleObjects has a registered metadata entry", () => {
    for (const rule of ruleObjects) {
      const meta = findRuleMeta(rule.id);
      expect(meta, `rule ${rule.id} should have meta`).toBeDefined();
      expect(meta!.id).toBe(rule.id);
      expect(meta!.axis).toBe(rule.axis);
    }
  });

  it("rule ids are unique across the registry", () => {
    const ids = RULE_METADATA.map((r) => r.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("each rule's meta carries the full shape (spot check)", () => {
    for (const r of RULE_METADATA) {
      // helpUri must point at the per-rule docs page derived from the filename
      expect(r.helpUri).toContain("/docs/rules/");
      // allowlist must always be an array (possibly empty)
      expect(Array.isArray(r.allowlist)).toBe(true);
      // examples must each carry both good and bad strings
      for (const ex of r.examples) {
        expect(typeof ex.good).toBe("string");
        expect(typeof ex.bad).toBe("string");
        expect(ex.good.length).toBeGreaterThan(0);
        expect(ex.bad.length).toBeGreaterThan(0);
      }
    }
  });
});
