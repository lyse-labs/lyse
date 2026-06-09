import { readFile, realpath } from "node:fs/promises";
import { join, sep } from "node:path";
import type { AxisName, Finding, Severity } from "../types.js";
import type { RuleId } from "../types.js";
import { ruleMap } from "../rules/registry.js";

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

const MIN_SNIPPET_LENGTH = 10;
const LINE_PROXIMITY_TOLERANCE = 5;

export async function validateProposedFindings(
  proposed: ProposedFinding[],
  repoRoot: string,
): Promise<ValidationResult> {
  const findings: Finding[] = [];
  let droppedHallucinations = 0;

  let resolvedRoot: string;
  try {
    resolvedRoot = await realpath(repoRoot);
  } catch {
    return { findings: [], droppedHallucinations: proposed.length };
  }

  for (const p of proposed) {
    if (!ruleMap.has(p.ruleId)) {
      droppedHallucinations++;
      continue;
    }

    if (p.snippet.length < MIN_SNIPPET_LENGTH) {
      droppedHallucinations++;
      continue;
    }

    const absPath = join(resolvedRoot, p.file);
    if (!absPath.startsWith(resolvedRoot + sep) && absPath !== resolvedRoot) {
      droppedHallucinations++;
      continue;
    }

    // Defense in depth against symlinks pointing outside the repo
    let realAbs: string;
    try {
      realAbs = await realpath(absPath);
    } catch {
      droppedHallucinations++;
      continue;
    }
    if (!realAbs.startsWith(resolvedRoot + sep) && realAbs !== resolvedRoot) {
      droppedHallucinations++;
      continue;
    }

    let content: string;
    try {
      content = await readFile(realAbs, "utf8");
    } catch {
      droppedHallucinations++;
      continue;
    }

    const lines = content.split("\n");
    const targetLine = Math.max(1, Math.min(p.line, lines.length));
    const windowStart = Math.max(0, targetLine - 1 - LINE_PROXIMITY_TOLERANCE);
    const windowEnd = Math.min(lines.length, targetLine - 1 + LINE_PROXIMITY_TOLERANCE + 1);
    const windowContent = lines.slice(windowStart, windowEnd).join("\n");
    if (!windowContent.includes(p.snippet)) {
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

  findings.sort((a, b) => {
    const fa = a.location.file;
    const fb = b.location.file;
    if (fa !== fb) return fa < fb ? -1 : 1;
    if (a.location.line !== b.location.line) return a.location.line - b.location.line;
    return a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0;
  });

  return { findings, droppedHallucinations };
}
