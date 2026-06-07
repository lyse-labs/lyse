import { readFile } from "node:fs/promises";
import { join, sep } from "node:path";
import type { AxisName, Finding, Severity } from "../types.js";
import type { RuleId } from "../types.js";

export interface ProposedFinding {
  ruleId: RuleId;
  axis: AxisName;
  severity: Severity;
  file: string;
  line: number;
  column: number;
  snippet: string;
  message: string;
  suggestion?: string;
}

export interface ValidationResult {
  findings: Finding[];
  droppedHallucinations: number;
}

export async function validateProposedFindings(
  proposed: ProposedFinding[],
  repoRoot: string,
): Promise<ValidationResult> {
  const findings: Finding[] = [];
  let droppedHallucinations = 0;

  for (const p of proposed) {
    const absPath = join(repoRoot, p.file);
    if (!absPath.startsWith(repoRoot + sep) && absPath !== repoRoot) {
      droppedHallucinations++;
      continue;
    }
    let content: string;
    try {
      content = await readFile(absPath, "utf8");
    } catch {
      droppedHallucinations++;
      continue;
    }

    if (!content.includes(p.snippet)) {
      droppedHallucinations++;
      continue;
    }

    const finding: Finding = {
      ruleId: p.ruleId,
      axis: p.axis,
      severity: p.severity,
      location: { file: p.file, line: p.line, column: p.column },
      message: p.message,
      ...(p.suggestion !== undefined && { suggestion: p.suggestion }),
    };
    findings.push(finding);
  }

  return { findings, droppedHallucinations };
}
