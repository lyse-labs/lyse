import { describe, it, expect } from "vitest";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderJson } from "../src/reporters/json.js";
import type { AuditResult } from "../src/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMAS_DIR = join(__dirname, "../schemas/v1");

/** Create a fresh Ajv instance so schema IDs don't collide between tests. */
function makeAjv(): Ajv2020 {
  const a = new Ajv2020({ strict: false, allErrors: true });
  addFormats(a);
  return a;
}

describe("JSON Schemas v1 — Draft 2020-12 validity", () => {
  const files = readdirSync(SCHEMAS_DIR);

  it("ships exactly 4 schemas", () => {
    expect(files).toHaveLength(4);
  });

  it.each(files)("%s compiles without errors", (file) => {
    const schema = JSON.parse(readFileSync(join(SCHEMAS_DIR, file), "utf8"));
    expect(() => makeAjv().compile(schema)).not.toThrow();
  });

  it.each(files)("%s has $id and $schema", (file) => {
    const schema = JSON.parse(readFileSync(join(SCHEMAS_DIR, file), "utf8"));
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.$id).toMatch(/^https:\/\/github\.com\/lyse-labs\/lyse\/raw\/main\/schemas\/v1\/.+\.json$/);
  });
});

describe("lyse-result.json validates real audit output", () => {
  const schema = JSON.parse(readFileSync(join(SCHEMAS_DIR, "lyse-result.json"), "utf8"));

  it("validates a typical AuditResult after deterministic render", () => {
    const validate = makeAjv().compile(schema);

    const sample: AuditResult = {
      schemaVersion: 2, rulesVersion: "0.1.0", toolVersion: "0.0.1", scoringVersion: "scoring-v1",
      repoRoot: "/r", timestamp: "2026-05-15T10:00:00Z", stack: ["react"],
      finalScore: 50,
      axes: [{ axis: "tokens", score: 50, findings: 1, opportunities: 2 }],
      findings: [{
        ruleId: "tokens/no-hardcoded-color", axis: "tokens", severity: "warning",
        location: { file: "a.tsx", line: 1, column: 1 }, message: "hi",
      }],
    };
    const rendered = JSON.parse(renderJson(sample));
    const valid = validate(rendered);
    if (!valid) console.error(validate.errors);
    expect(valid).toBe(true);
  });

  it("validates an AuditResult with N/A axis score and finalScore N/A", () => {
    const validate = makeAjv().compile(schema);
    const sample: AuditResult = {
      schemaVersion: 2, rulesVersion: "0.1.0", toolVersion: "0.0.1", scoringVersion: "scoring-v1",
      repoRoot: "/r", timestamp: "", stack: [],
      finalScore: "N/A",
      axes: [{ axis: "stories", score: "N/A", findings: 0, opportunities: 0 }],
      findings: [],
    };
    const rendered = JSON.parse(renderJson(sample));
    expect(validate(rendered)).toBe(true);
  });

  it("rejects an AuditResult with extra fields in finding", () => {
    const validate = makeAjv().compile(schema);
    const bad = {
      $schema: "x", schemaVersion: 2, rulesVersion: "0.1.0", toolVersion: "0.0.1", scoringVersion: "scoring-v1",
      repoRoot: "/r", stack: [], finalScore: 50, axes: [],
      findings: [{
        ruleId: "x", axis: "tokens", severity: "warning",
        location: { file: "x", line: 1, column: 1 }, message: "x",
        extraNonsenseField: "leak",
      }],
    };
    expect(validate(bad)).toBe(false);
  });
});

describe("lyse-event.json validates a sample event", () => {
  const schema = JSON.parse(readFileSync(join(SCHEMAS_DIR, "lyse-event.json"), "utf8"));

  it("validates audit.completed event", () => {
    const validate = makeAjv().compile(schema);
    const event = {
      schema_version: "1.0.0",
      event_id: "01HXYZ0123456789ABCDEFGHIJ",
      event_type: "audit.completed",
      ts: "2026-05-15T10:00:00Z",
      session_id: "01HXYZ0123456789ABCDEFGHIJ",
      repo_bucket: "a3f9c1e8b2d04567",
      sdk_version: "0.1.0",
      rules_version: "0.1.0",
      stack: { framework: "react", ds_detected: "tailwind-v4" },
      audit: { duration_ms: 8341, score: 43, axes: { tokens: 31 }, violations: { error: 0, warning: 433, info: 0 } },
    };
    expect(validate(event)).toBe(true);
  });
});
