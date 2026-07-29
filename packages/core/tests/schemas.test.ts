import { describe, it, expect } from "vitest";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderJson } from "../src/reporters/json.js";
import { auditDirectory } from "../src/commands/audit-pipeline.js";
import { buildGraphForRoot } from "../src/graph/build-io.js";
import { buildManifest } from "../src/manifest/build.js";
import { serializeManifest } from "../src/manifest/serialize.js";
import type { AuditResult } from "../src/types.js";
import type { DesignSystemGraph } from "../src/graph/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMAS_DIR = join(__dirname, "../schemas/v1");
const SCHEMAS_V3_DIR = join(__dirname, "../schemas/v3");

// fixtures/full-ds is under packages/core/ — tests/ → .. → core/, then fixtures/full-ds.
const FULL_DS = join(import.meta.dirname, "..", "fixtures", "full-ds");

/** Create a fresh Ajv instance so schema IDs don't collide between tests. */
function makeAjv(): Ajv2020 {
  const a = new Ajv2020({ strict: false, allErrors: true });
  addFormats(a);
  return a;
}

describe("JSON Schemas v1 — Draft 2020-12 validity", () => {
  const files = readdirSync(SCHEMAS_DIR);

  it("ships exactly 5 schemas", () => {
    expect(files).toHaveLength(5);
  });

  it.each(files)("%s compiles without errors", (file) => {
    const schema = JSON.parse(readFileSync(join(SCHEMAS_DIR, file), "utf8"));
    expect(() => makeAjv().compile(schema)).not.toThrow();
  });

  // These 4 schemas predate lyse-manifest.json and keep a pre-existing broken
  // $id prefix: there is no root schemas/ directory on main (only
  // packages/core/schemas/), so their plain "schemas/v1/…" pattern 404s — see
  // docs/architecture/manifest.md §3. Fixing them is a separate, out-of-scope
  // cleanup (packages/core/src/graph/persist.ts, reporters/json.ts). New v1
  // schemas are NOT expected to need this exception — they get the correct,
  // real repo-path prefix by default below.
  const LEGACY_BROKEN_ID_PREFIX_FILES = new Set([
    "lyse-config.json",
    "lyse-event.json",
    "lyse-result.json",
    "lyse-rules.json",
  ]);

  it.each(files)("%s has $id and $schema", (file) => {
    const schema = JSON.parse(readFileSync(join(SCHEMAS_DIR, file), "utf8"));
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    const expectedPrefix = LEGACY_BROKEN_ID_PREFIX_FILES.has(file)
      ? "schemas/v1"
      : "packages/core/schemas/v1";
    const idPattern = new RegExp(`^https://github\\.com/lyse-labs/lyse/raw/main/${expectedPrefix}/.+\\.json$`);
    expect(schema.$id).toMatch(idPattern);
  });
});

describe("lyse-result.json validates real audit output", () => {
  const schema = JSON.parse(readFileSync(join(SCHEMAS_DIR, "lyse-result.json"), "utf8"));

  it("validates a typical AuditResult after deterministic render", () => {
    const validate = makeAjv().compile(schema);

    const sample: AuditResult = {
      schemaVersion: 2, rulesVersion: "0.1.0", toolVersion: "0.0.1", scoringVersion: "scoring-v1.1",
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
      schemaVersion: 2, rulesVersion: "0.1.0", toolVersion: "0.0.1", scoringVersion: "scoring-v1.1",
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
      $schema: "x", schemaVersion: 2, rulesVersion: "0.1.0", toolVersion: "0.0.1", scoringVersion: "scoring-v1.1",
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

describe("JSON Schemas v3 — Draft 2020-12 validity", () => {
  const files = readdirSync(SCHEMAS_V3_DIR);

  it("ships exactly 1 schema", () => {
    expect(files).toHaveLength(1);
  });

  it.each(files)("%s compiles without errors", (file) => {
    const schema = JSON.parse(readFileSync(join(SCHEMAS_V3_DIR, file), "utf8"));
    expect(() => makeAjv().compile(schema)).not.toThrow();
  });

  it.each(files)("%s has $id and $schema", (file) => {
    const schema = JSON.parse(readFileSync(join(SCHEMAS_V3_DIR, file), "utf8"));
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.$id).toMatch(/^https:\/\/github\.com\/lyse-labs\/lyse\/raw\/main\/schemas\/v3\/.+\.json$/);
  });
});

describe("lyse-result.json (v3) validates a v3 AuditResult", () => {
  const schema = JSON.parse(readFileSync(join(SCHEMAS_V3_DIR, "lyse-result.json"), "utf8"));

  it("validates a v3 AuditResult with a numeric axis, an N/A axis, and ai-governance", () => {
    const validate = makeAjv().compile(schema);

    const sample: AuditResult = {
      schemaVersion: 3, rulesVersion: "0.1.0", toolVersion: "0.0.1", scoringVersion: "scoring-v3",
      repoRoot: "/r", timestamp: "2026-07-19T10:00:00Z", stack: ["react"],
      finalScore: 62,
      axes: [
        { axis: "tokens", score: 62, findings: 3, opportunities: 40 },
        { axis: "stories", score: "N/A", findings: 0, opportunities: 0 },
        { axis: "ai-governance", score: 80, findings: 1, opportunities: 12 },
      ],
      findings: [{
        ruleId: "ai-governance/no-unmarked-ai-output", axis: "ai-governance", severity: "warning",
        location: { file: "a.tsx", line: 1, column: 1 }, message: "hi",
      }],
    };
    const rendered = JSON.parse(renderJson(sample));
    const valid = validate(rendered);
    if (!valid) console.error(validate.errors);
    expect(valid).toBe(true);
    expect(rendered.$schema).toContain("schemas/v3/lyse-result.json");
  });

  it("rejects a v3 axis carrying a v2-only rateScore field", () => {
    const validate = makeAjv().compile(schema);
    const bad = {
      $schema: "x", schemaVersion: 3, rulesVersion: "0.1.0", toolVersion: "0.0.1", scoringVersion: "scoring-v3",
      repoRoot: "/r", stack: [], finalScore: 50,
      axes: [{ axis: "tokens", score: 50, findings: 1, opportunities: 2, rateScore: 50 }],
      findings: [],
    };
    expect(validate(bad)).toBe(false);
  });
});

describe("lyse-result schemas validate REAL audit output (not just hand-built samples)", () => {
  // Regression guard: real findings can carry `fixGroup` (and `llmJudgement`)
  // beyond the 8 fields the hand-built samples above exercise. A rendered
  // AuditResult must validate against the very `$schema` URL it stamps.
  it("validates real v3 audit output from fixtures/full-ds, including fixGroup-bearing findings", async () => {
    const schema = JSON.parse(readFileSync(join(SCHEMAS_V3_DIR, "lyse-result.json"), "utf8"));
    const validate = makeAjv().compile(schema);

    const { result } = await auditDirectory(FULL_DS, { staticOnly: true });
    const rendered = JSON.parse(renderJson(result));
    const valid = validate(rendered);
    if (!valid) console.error(validate.errors);
    expect(valid).toBe(true);

    // Sanity check: the fixture must actually exercise fixGroup, or this
    // assertion wouldn't have caught the original bug.
    expect(result.findings.some((f) => f.fixGroup !== undefined)).toBe(true);
  });

  it("validates real v1 (v2 formula) audit output from fixtures/full-ds, including fixGroup-bearing findings", async () => {
    const schema = JSON.parse(readFileSync(join(SCHEMAS_DIR, "lyse-result.json"), "utf8"));
    const validate = makeAjv().compile(schema);

    const { result } = await auditDirectory(FULL_DS, { staticOnly: true, scoreModel: "v2" });
    const rendered = JSON.parse(renderJson(result));
    const valid = validate(rendered);
    if (!valid) console.error(validate.errors);
    expect(valid).toBe(true);

    expect(result.findings.some((f) => f.fixGroup !== undefined)).toBe(true);
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

describe("lyse-manifest.json validates a DsManifest", () => {
  const schema = JSON.parse(readFileSync(join(SCHEMAS_DIR, "lyse-manifest.json"), "utf8"));

  // Exercises every field and both the populated and null/empty branch of each
  // optional-normalized shape (ManifestProp.default/type/variants, a null
  // component `file`, a degraded extraction entry alongside an ok one, a
  // conflict) — not just the trivial empty-graph shape.
  function sampleGraph(): DesignSystemGraph {
    return {
      schemaVersion: 1,
      tokens: [
        { id: "color.brand", axis: "colors", rawValue: "#3b82f6", source: "dtcg" },
        { id: "space.4", axis: "spacing", rawValue: "16px", source: "tailwind-v4" },
      ],
      components: [
        {
          name: "Button",
          file: "src/Button.tsx",
          module: "@acme/ds",
          exportKind: "named",
          usageCount: 12,
          props: [
            {
              name: "variant",
              typeText: '"primary" | "secondary"',
              isOptional: true,
              isVariantUnion: true,
              variants: ["primary", "secondary"],
            },
            { name: "id" },
          ],
          isDsComponent: true,
          storyRefs: ["Button.stories"],
          detection: "module-config",
        },
        {
          name: "Icon",
          file: null,
          module: "@acme/ds",
          exportKind: "default",
          usageCount: 0,
          props: [],
          isDsComponent: false,
          storyRefs: [],
          detection: "ds-self",
        },
      ],
      stories: [],
      usage: [{ file: "src/App.tsx", kind: "imports-ds-module", count: 3 }],
      zones: {
        byFile: {
          "src/App.tsx": "app",
          "src/Button.tsx": "ds-source",
          "src/Icon.stories.tsx": "story",
        },
      },
      extraction: {
        entries: [
          { extractor: "stories", status: "degraded", evidence: { storyFiles: 1 }, remediation: "run 'lyse init'" },
          { extractor: "tokens", status: "ok", evidence: { tokenCount: 2 }, remediation: null },
        ],
        conflicts: [
          {
            axis: "colors",
            value: "#3b82f6",
            tokenIds: ["color.brand", "color.primary"],
            sources: ["dtcg", "css-custom-property"],
          },
        ],
      },
    };
  }

  it("validates a comprehensive hand-built manifest (every field, null and populated branches)", () => {
    const validate = makeAjv().compile(schema);
    const manifest = buildManifest(sampleGraph(), { version: "1.2.3" });
    const rendered = JSON.parse(serializeManifest(manifest));
    const valid = validate(rendered);
    if (!valid) console.error(validate.errors);
    expect(valid).toBe(true);
  });

  it("rejects a manifest carrying an unknown top-level field (additionalProperties: false)", () => {
    const validate = makeAjv().compile(schema);
    const manifest = buildManifest(sampleGraph(), { version: "1.2.3" });
    const rendered = JSON.parse(serializeManifest(manifest)) as Record<string, unknown>;
    rendered["extraTopLevelField"] = "leak";
    expect(validate(rendered)).toBe(false);
  });

  it("accepts a token carrying a not-yet-known axis (open value space — §4 forward-compat)", () => {
    // `axis` is deliberately `type: "string"` rather than a closed `enum` in the
    // schema (docs/architecture/manifest.md §4), so a future Lyse version can add
    // a new TokenAxis and the resulting manifest still validates against this
    // SAME pinned v1 schema — no schemaVersion bump, no rejected manifest.
    const validate = makeAjv().compile(schema);
    const manifest = buildManifest(sampleGraph(), { version: "1.2.3" });
    const rendered = JSON.parse(serializeManifest(manifest)) as { tokens: Array<Record<string, unknown>> };
    const token = rendered.tokens[0];
    if (!token) throw new Error("expected sampleGraph() to produce at least one token");
    token["axis"] = "not-a-real-axis-yet";
    const valid = validate(rendered);
    if (!valid) console.error(validate.errors);
    expect(valid).toBe(true);
  });

  it("still rejects a token whose axis isn't a string (the open value space is not unbounded)", () => {
    const validate = makeAjv().compile(schema);
    const manifest = buildManifest(sampleGraph(), { version: "1.2.3" });
    const rendered = JSON.parse(serializeManifest(manifest)) as { tokens: Array<Record<string, unknown>> };
    const token = rendered.tokens[0];
    if (!token) throw new Error("expected sampleGraph() to produce at least one token");
    token["axis"] = 42;
    expect(validate(rendered)).toBe(false);
  });

  it("accepts a token carrying a not-yet-known source (open value space — §4 forward-compat)", () => {
    // `source` is deliberately `type: "string"` rather than a closed `enum` in the
    // schema (docs/architecture/manifest.md §4), so a future Lyse version can add
    // a new TokenSource and the resulting manifest still validates against this
    // SAME pinned v1 schema — no schemaVersion bump, no rejected manifest.
    const validate = makeAjv().compile(schema);
    const manifest = buildManifest(sampleGraph(), { version: "1.2.3" });
    const rendered = JSON.parse(serializeManifest(manifest)) as { tokens: Array<Record<string, unknown>> };
    const token = rendered.tokens[0];
    if (!token) throw new Error("expected sampleGraph() to produce at least one token");
    token["source"] = "not-a-real-source-yet";
    const valid = validate(rendered);
    if (!valid) console.error(validate.errors);
    expect(valid).toBe(true);
  });

  it("accepts a component carrying a not-yet-known detection method (open value space — §4 forward-compat)", () => {
    // `detection` is deliberately `type: "string"` rather than a closed `enum` in
    // the schema (docs/architecture/manifest.md §4), so a future Lyse version can
    // add a new ComponentDetection and the resulting manifest still validates
    // against this SAME pinned v1 schema — no schemaVersion bump, no rejected
    // manifest.
    const validate = makeAjv().compile(schema);
    const manifest = buildManifest(sampleGraph(), { version: "1.2.3" });
    const rendered = JSON.parse(serializeManifest(manifest)) as { components: Array<Record<string, unknown>> };
    const component = rendered.components[0];
    if (!component) throw new Error("expected sampleGraph() to produce at least one component");
    component["detection"] = "not-a-real-detection-yet";
    const valid = validate(rendered);
    if (!valid) console.error(validate.errors);
    expect(valid).toBe(true);
  });

  it("accepts a usage entry carrying a not-yet-known kind (open value space — §4 forward-compat)", () => {
    // `kind` is deliberately `type: "string"` rather than a closed `enum` in the
    // schema (docs/architecture/manifest.md §4), so a future Lyse version can add
    // a new UsageEdgeKind and the resulting manifest still validates against this
    // SAME pinned v1 schema — no schemaVersion bump, no rejected manifest.
    const validate = makeAjv().compile(schema);
    const manifest = buildManifest(sampleGraph(), { version: "1.2.3" });
    const rendered = JSON.parse(serializeManifest(manifest)) as { usage: Array<Record<string, unknown>> };
    const usageEntry = rendered.usage[0];
    if (!usageEntry) throw new Error("expected sampleGraph() to produce at least one usage entry");
    usageEntry["kind"] = "not-a-real-kind-yet";
    const valid = validate(rendered);
    if (!valid) console.error(validate.errors);
    expect(valid).toBe(true);
  });

  it("accepts a manifest carrying a new zone key with a non-negative integer count (open value space — §4 forward-compat)", () => {
    // `zones` accepts additional properties beyond its 7 required keys
    // (docs/architecture/manifest.md §4), so a future Lyse version can add a new
    // zone kind and the resulting manifest still validates against this SAME
    // pinned v1 schema — no schemaVersion bump, no rejected manifest.
    const validate = makeAjv().compile(schema);
    const manifest = buildManifest(sampleGraph(), { version: "1.2.3" });
    const rendered = JSON.parse(serializeManifest(manifest)) as { zones: Record<string, unknown> };
    rendered.zones["not-a-real-zone-kind-yet"] = 3;
    const valid = validate(rendered);
    if (!valid) console.error(validate.errors);
    expect(valid).toBe(true);
  });

  it("rejects a new zone key whose count is a string (the open value space still requires a non-negative integer)", () => {
    // The residual constraint worth pinning: `zones`' additionalProperties schema
    // is `{ type: "integer", minimum: 0 }`, not an unbounded `true` — a new zone
    // key still has to carry a genuine non-negative integer count.
    const validate = makeAjv().compile(schema);
    const manifest = buildManifest(sampleGraph(), { version: "1.2.3" });
    const rendered = JSON.parse(serializeManifest(manifest)) as { zones: Record<string, unknown> };
    rendered.zones["not-a-real-zone-kind-yet"] = "3";
    expect(validate(rendered)).toBe(false);
  });

  it("rejects a new zone key whose count is negative (the open value space still requires a non-negative integer)", () => {
    const validate = makeAjv().compile(schema);
    const manifest = buildManifest(sampleGraph(), { version: "1.2.3" });
    const rendered = JSON.parse(serializeManifest(manifest)) as { zones: Record<string, unknown> };
    rendered.zones["not-a-real-zone-kind-yet"] = -1;
    expect(validate(rendered)).toBe(false);
  });

  it("validates a real manifest built from fixtures/full-ds (not just a hand-built sample)", async () => {
    const validate = makeAjv().compile(schema);
    const realGraph = await buildGraphForRoot(FULL_DS);
    const manifest = buildManifest(realGraph, { version: "1.2.3" });
    const rendered = JSON.parse(serializeManifest(manifest));
    const valid = validate(rendered);
    if (!valid) console.error(validate.errors);
    expect(valid).toBe(true);
  });
});
