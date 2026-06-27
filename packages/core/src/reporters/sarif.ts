import { createHash } from "node:crypto";
import type { AuditResult, Finding, Severity } from "../types.js";
import { RULE_METADATA, RULES_VERSION } from "../rules/manifest.js";
import { SUB_AXES } from "../reliability/catalogue/sub-axes.js";

const SARIF_VERSION = "2.1.0";
const SARIF_SCHEMA = "https://json.schemastore.org/sarif-2.1.0.json";
const TOOL_INFO_URI = "https://github.com/lyse-labs/lyse";

// Conservative Wilson 95 % lower bound on precision, sourced from the sub-axis
// catalogue. Emitted as `properties.precision` for GitHub code-scanning consumers.
// We emit the lower bound (not the point estimate) to avoid overstating reliability
// for thin samples (e.g. color/shadow have precisionMeasured=1.0 on 4 positives,
// but a Wilson LB of only ~0.51). Omitted entirely for sub-axes with nSamples === 0
// (no in-repo measurement to stand behind).
const PRECISION_BY_RULE_ID: ReadonlyMap<string, number> = new Map(
  SUB_AXES.flatMap((s) =>
    s.nSamples === 0 || s.precisionWilsonLowerBound === null
      ? []
      : s.ruleIds.map((id) => [id, s.precisionWilsonLowerBound!] as const),
  ),
);

function severityToSarifLevel(severity: Severity): "error" | "warning" | "note" {
  if (severity === "error") return "error";
  if (severity === "warning") return "warning";
  return "note";
}

function ruleDefinitionFromMeta(meta: (typeof RULE_METADATA)[number]) {
  const precision = PRECISION_BY_RULE_ID.get(meta.id);
  return {
    id: meta.id,
    name: meta.id.replace(/[/-]/g, "_"),
    shortDescription: { text: meta.shortDescription },
    fullDescription: { text: meta.fullDescription },
    helpUri: meta.helpUri,
    help: {
      text: meta.rationale,
      markdown: meta.rationale,
    },
    defaultConfiguration: {
      level: severityToSarifLevel(meta.defaultSeverity),
    },
    properties: {
      axis: meta.axis,
      tags: [`lyse:${meta.axis}`],
      ...(precision === undefined ? {} : { precision }),
    },
  };
}

function fingerprintFor(finding: Finding): string {
  const startLine = Math.max(1, finding.location.line);
  const canonical = `${finding.ruleId} ${finding.location.file} ${startLine} ${finding.message}`;
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

function findingToResult(finding: Finding, suppressed = false) {
  const startLine = Math.max(1, finding.location.line);
  const startColumn = Math.max(1, finding.location.column);
  const result: Record<string, unknown> = {
    ruleId: finding.ruleId,
    level: severityToSarifLevel(finding.severity),
    message: { text: finding.message },
    locations: [
      {
        physicalLocation: {
          artifactLocation: {
            uri: finding.location.file,
            uriBaseId: "%SRCROOT%",
          },
          region: {
            startLine,
            startColumn,
          },
        },
      },
    ],
    partialFingerprints: {
      "primaryLocationLineHash/v1": fingerprintFor(finding),
    },
  };
  if (finding.suggestion) {
    result["fixes"] = [
      {
        description: { text: finding.suggestion },
      },
    ];
  }
  // Inline `lyse-disable` directives map to SARIF in-source suppressions so
  // GitHub code-scanning shows the finding as dismissed (kept for trend data)
  // rather than silently re-surfacing it on the next run.
  if (suppressed) {
    result["suppressions"] = [{ kind: "inSource", status: "accepted" }];
  }
  return result;
}

export interface SarifRenderOptions {
  includeTimestamp?: boolean;
}

export function renderSarif(result: AuditResult, options: SarifRenderOptions = {}): string {
  // Include ALL rules in the tool driver (so GitHub Security tab knows the full rule set),
  // not just the ones with findings.
  const rules = RULE_METADATA.map(ruleDefinitionFromMeta);

  const sarif = {
    $schema: SARIF_SCHEMA,
    version: SARIF_VERSION,
    runs: [
      {
        tool: {
          driver: {
            name: "Lyse",
            version: result.toolVersion,
            semanticVersion: result.toolVersion,
            informationUri: TOOL_INFO_URI,
            organization: "lyse-labs",
            rules,
            properties: {
              "lyse.scoringVersion": result.scoringVersion,
            },
          },
        },
        results: [
          ...result.findings.map((f) => findingToResult(f)),
          ...(result.suppressedFindings ?? []).map((f) => findingToResult(f, true)),
        ],
        invocations: [
          {
            executionSuccessful: true,
            ...(options.includeTimestamp && result.timestamp
              ? { startTimeUtc: result.timestamp, endTimeUtc: result.timestamp }
              : {}),
          },
        ],
        originalUriBaseIds: {
          "%SRCROOT%": { uri: "file://" + result.repoRoot + "/" },
        },
        properties: {
          lyse: {
            health_score: result.finalScore,
            grade: result.grade?.grade ?? null,
            grade_auto_failed: result.grade?.autoFailed ?? false,
            axes: result.axes,
            stack: result.stack,
            rules_version: RULES_VERSION,
            scoring_version: result.scoringVersion,
          },
        },
      },
    ],
  };

  return JSON.stringify(sarif, null, 2) + "\n";
}
