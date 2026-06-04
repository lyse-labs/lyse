import type { AuditResult, Finding, Severity } from "../types.js";
import { RULE_METADATA, RULES_VERSION } from "../rules/manifest.js";

const SARIF_VERSION = "2.1.0";
const SARIF_SCHEMA = "https://json.schemastore.org/sarif-2.1.0.json";
const TOOL_INFO_URI = "https://github.com/lyse-labs/lyse";

function severityToSarifLevel(severity: Severity): "error" | "warning" | "note" {
  if (severity === "error") return "error";
  if (severity === "warning") return "warning";
  return "note";
}

function ruleDefinitionFromMeta(meta: (typeof RULE_METADATA)[number]) {
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
    },
  };
}

function findingToResult(finding: Finding) {
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
            startLine: Math.max(1, finding.location.line),
            startColumn: Math.max(1, finding.location.column),
          },
        },
      },
    ],
  };
  if (finding.suggestion) {
    result["fixes"] = [
      {
        description: { text: finding.suggestion },
      },
    ];
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
        results: result.findings.map(findingToResult),
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
